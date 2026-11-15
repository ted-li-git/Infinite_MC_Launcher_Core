import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * MCServer - Minecraft 服务端启动与管理类
 *
 * 功能：
 * - 启动/停止本地 MC 服务端进程
 * - 状态机：stopped | starting | running | stopping
 * - 按行解析服务端输出，emit('log') / 检测 ready / 跟踪玩家进出
 * - 支持自动重启（autoRestart / restartDelay / maxRestarts）
 *
 * 事件：
 * - log(line)         服务端每行输出（stdout/stderr）
 * - ready()           服务端进入 running（检测到 "Done (" 或 "For help, type"）
 * - playerJoin(name)  玩家加入
 * - playerLeave(name) 玩家离开
 * - error(err)        进程错误
 * - crash({code})     非主动退出且超过 maxRestarts 次自动重启
 */
export class MCServer extends EventEmitter {
    /**
     * @param {object} options
     * @param {string} options.serverJar 服务端 jar 路径（必填）
     * @param {string} [options.javaPath='java'] java 可执行文件路径
     * @param {string} [options.maxMemory='2G'] 最大内存
     * @param {string} [options.minMemory='1G'] 最小内存
     * @param {boolean} [options.gui=false] 是否启用服务端 GUI（false 时追加 nogui）
     * @param {boolean} [options.eula=true] 是否自动写入 eula.txt（eula=true）
     * @param {boolean} [options.autoRestart=false] 非主动退出时是否自动重启
     * @param {number} [options.restartDelay=5000] 自动重启延迟（ms）
     * @param {number} [options.maxRestarts=3] 最大自动重启次数
     * @param {object} [options.logger] 项目 Logger 实例（可选，缺省静默）
     */
    constructor(options = {}) {
        super();
        if (!options.serverJar) {
            throw new Error('MCServer: 缺少必填参数 serverJar');
        }
        this.serverJar = options.serverJar;
        this.javaPath = options.javaPath || 'java';
        this.maxMemory = options.maxMemory || '2G';
        this.minMemory = options.minMemory || '1G';
        this.gui = options.gui ?? false;
        this.eula = options.eula ?? true;
        this.autoRestart = options.autoRestart ?? false;
        this.restartDelay = options.restartDelay ?? 5000;
        this.maxRestarts = options.maxRestarts ?? 3;
        this.logger = options.logger || null;

        /** @type {'stopped'|'starting'|'running'|'stopping'} */
        this.status = 'stopped';
        /** @type {Set<string>} 在线玩家列表 */
        this.players = new Set();
        /** @type {import('child_process').ChildProcess|null} */
        this.process = null;
        /** 自动重启计数（成功进入 running 后重置） */
        this.restartCount = 0;

        this._runningSince = 0;      // 进入 running 的时间戳（用于 uptime）
        this._intentionalStop = false; // 是否为主动 stop（主动停止不触发自动重启）
        this._stdoutBuf = '';        // stdout 半行缓冲（跨 chunk 拼接）
        this._stderrBuf = '';        // stderr 半行缓冲
        this._restartTimer = null;   // 自动重启定时器
    }

    /**
     * 启动服务端进程。已在运行/启动中时直接返回 this。
     * @returns {MCServer}
     */
    start() {
        if (this.status !== 'stopped') return this;
        this.status = 'starting';
        this._intentionalStop = false;

        const jarPath = path.resolve(this.serverJar);
        const serverDir = path.dirname(jarPath);

        if (this.eula) {
            // 自动同意 EULA：在 serverJar 所在目录写入 eula.txt
            fs.writeFile(path.join(serverDir, 'eula.txt'), '# 由 MCServer 自动生成（eula: true）\neula=true\n', 'utf8')
                .then(() => this._spawnServer(jarPath, serverDir))
                .catch((err) => {
                    this.status = 'stopped';
                    this.emit('error', err);
                });
        } else {
            this._spawnServer(jarPath, serverDir);
        }
        return this;
    }

    /**
     * 向服务端 stdin 发送命令。
     * @param {string} command 控制台命令（如 'say Hello'）
     * @returns {MCServer}
     * @throws {Error} 服务端未运行时抛出
     */
    send(command) {
        if (this.status !== 'running' || !this.process || !this.process.stdin.writable) {
            throw new Error(`MCServer: 无法发送命令，服务端未运行（当前状态: ${this.status}）`);
        }
        this.process.stdin.write(command.trim() + '\n');
        return this;
    }

    /**
     * 停止服务端：先发送 stop 命令，超时后强制 kill。
     * @param {number} [timeoutMs=10000] 等待优雅退出的超时时间
     * @returns {Promise<void>} 进程退出后 resolve
     */
    stop(timeoutMs = 10000) {
        this._intentionalStop = true;
        // 取消挂起的自动重启
        if (this._restartTimer) {
            clearTimeout(this._restartTimer);
            this._restartTimer = null;
        }
        const proc = this.process;
        if (!proc || this.status === 'stopped') return Promise.resolve();

        // starting 阶段 send 会抛错，忽略后直接走超时强杀流程
        try { this.send('stop'); } catch { /* 尚未进入 running */ }
        this.status = 'stopping';

        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                try { proc.kill(); } catch { /* 进程可能已退出 */ }
            }, timeoutMs);
            proc.once('exit', () => {
                clearTimeout(timer);
                resolve();
            });
        });
    }

    /** @returns {string[]} 当前在线玩家名数组 */
    getPlayers() {
        return [...this.players];
    }

    /**
     * 获取服务端状态快照。
     * @returns {{status: string, players: string[], uptime: number, pid: number|null, restartCount: number}}
     */
    getStatus() {
        return {
            status: this.status,
            players: this.getPlayers(),
            uptime: this.status === 'running' && this._runningSince ? Date.now() - this._runningSince : 0,
            pid: this.process ? this.process.pid : null,
            restartCount: this.restartCount
        };
    }

    /** 实际 spawn java 进程并接管其输出 */
    _spawnServer(jarPath, serverDir) {
        const args = [`-Xmx${this.maxMemory}`, `-Xms${this.minMemory}`, '-jar', jarPath];
        if (!this.gui) args.push('nogui');

        this.logger?.debug(`启动服务端: ${this.javaPath} ${args.join(' ')} (cwd: ${serverDir})`);

        let proc;
        try {
            proc = spawn(this.javaPath, args, { cwd: serverDir });
        } catch (err) {
            this.status = 'stopped';
            this.emit('error', err);
            return;
        }
        this.process = proc;
        this._stdoutBuf = '';
        this._stderrBuf = '';

        proc.stdout.on('data', (chunk) => this._feedOutput(chunk, 'stdout'));
        proc.stderr.on('data', (chunk) => this._feedOutput(chunk, 'stderr'));

        proc.on('error', (err) => {
            this.status = 'stopped';
            this.process = null;
            this.emit('error', err);
        });

        proc.on('exit', (code) => this._onExit(code));
    }

    /** 将输出 chunk 追加到对应缓冲，并按行切分（处理跨 chunk 的半行） */
    _feedOutput(chunk, which) {
        const bufKey = which === 'stderr' ? '_stderrBuf' : '_stdoutBuf';
        this[bufKey] += chunk.toString();
        let idx;
        while ((idx = this[bufKey].indexOf('\n')) !== -1) {
            let line = this[bufKey].slice(0, idx);
            this[bufKey] = this[bufKey].slice(idx + 1);
            if (line.endsWith('\r')) line = line.slice(0, -1);
            this._handleLine(line);
        }
    }

    /** 处理一行输出：emit('log')、ready 检测、玩家进出解析 */
    _handleLine(line) {
        this.emit('log', line);

        // ready 检测：服务端启动完成的标志输出
        if (this.status === 'starting' && (line.includes('Done (') || line.includes('For help, type'))) {
            this.status = 'running';
            this._runningSince = Date.now();
            this.restartCount = 0; // 成功进入 running，重置重启计数
            this.logger?.info('服务端已就绪');
            this.emit('ready');
        }

        this._parsePlayerLine(line);
    }

    /** 解析玩家 join/leave（聊天行 <name> ... 不算 join） */
    _parsePlayerLine(line) {
        if (/<\w{1,16}>/.test(line)) return; // 聊天消息行，跳过
        const m = line.match(/(\w{1,16}) (joined|left) the game/);
        if (!m) return;
        const [, name, action] = m;
        if (action === 'joined') {
            if (!this.players.has(name)) {
                this.players.add(name);
                this.emit('playerJoin', name);
            }
        } else {
            if (this.players.delete(name)) {
                this.emit('playerLeave', name);
            }
        }
    }

    /** 进程退出处理：状态归位 + 自动重启逻辑 */
    _onExit(code) {
        // 冲刷残余半行缓冲
        if (this._stdoutBuf) { this._handleLine(this._stdoutBuf); this._stdoutBuf = ''; }
        if (this._stderrBuf) { this._handleLine(this._stderrBuf); this._stderrBuf = ''; }

        this.process = null;
        this.players.clear();
        this.status = 'stopped';
        this._runningSince = 0;
        this.logger?.info(`服务端进程退出，退出码: ${code}`);

        // 主动 stop() 不触发自动重启
        if (this._intentionalStop) return;
        if (!this.autoRestart) return;

        if (this.restartCount >= this.maxRestarts) {
            this.logger?.error(`服务端连续崩溃，已达最大重启次数（${this.maxRestarts}）`);
            this.emit('crash', { code });
            return;
        }
        this.restartCount++;
        this.logger?.warn(`服务端意外退出，${this.restartDelay}ms 后自动重启（第 ${this.restartCount}/${this.maxRestarts} 次）`);
        this._restartTimer = setTimeout(() => {
            this._restartTimer = null;
            // 延迟期间用户可能主动 stop()，再次确认
            if (!this._intentionalStop && this.status === 'stopped') this.start();
        }, this.restartDelay);
    }
}

export default MCServer;
