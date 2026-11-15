import { OfflineAuth } from '../auth/offline.js';
import { MicrosoftAuth } from '../auth/microsoft.js';
import { MojangAuth } from '../auth/mojang.js';
import { ThirdPartyAuth } from '../auth/thirdparty.js';
import { VersionManager } from '../game/version.js';
import { AssetManager } from '../game/assets.js';
import { ModManager } from '../mods/manager.js';
import { Logger } from '../utils/logger.js';
import { saveConfig, loadConfig } from '../utils/config.js';
import { join } from 'path';
import { totalmem } from 'os';
import { promises as fs } from 'fs';

export class MCLauncher {
    constructor(options = {}) {
        this.options = {
            gameDirectory: './minecraft',
            javaPath: 'java',
            version: 'latest',
            memory: '2G',
            windowWidth: 854,
            windowHeight: 480,
            enableMods: false,
            enableDebug: false,
            logLevel: null,
            instanceDir: null,
            consoleLog: false,    // 默认不输出到控制台
            logFile: null,        // 默认自动生成
            ...options
        };

        // 日志文件路径：默认 <gameDirectory>/logs/launcher.log
        const logFile = this.options.logFile || join(this.options.gameDirectory, 'logs', 'launcher.log');
        this.logger = new Logger(this.options.enableDebug, {
            logFile,
            console: this.options.consoleLog
        });
        if (this.options.logLevel) this.logger.setLevel(this.options.logLevel);
        this.auth = null;
        this.profile = null;

        this.versionManager = new VersionManager(this.options.gameDirectory);
        this.versionManager.logger = this.logger.createChild('VersionManager');
        this.assetManager = new AssetManager(this.options.gameDirectory);
        this.assetManager.logger = this.logger.createChild('AssetManager');
        this.modManager = new ModManager(this);

        this.config = loadConfig(this.options.gameDirectory);
        this.logger.info('Infinite MC Launcher initialized', this.options);
    }

    async _login(AuthClass, label, ...args) {
        this.logger.info(`${label} login attempt`);
        this.auth = new AuthClass();
        this.profile = await this.auth.authenticate(...args);
        this.logger.info(`${label} login successful`, this.profile);
        this.saveProfile();
        return this.profile;
    }

    offlineLogin(username) { return this._login(OfflineAuth, 'Offline', username); }
    microsoftLogin(accessToken) { return this._login(MicrosoftAuth, 'Microsoft', accessToken); }
    mojangLogin(username, password) { return this._login(MojangAuth, 'Mojang', username, password); }

    /**
     * 第三方 Yggdrasil 登录（LittleSkin / BlessingSkin / 自定义皮肤站通用）
     *
     * 用法一：使用内置预设
     *   launcher.thirdPartyLogin({ preset: 'littleskin', username, password })
     *   preset 可选：littleskin / blessskin / unionpass
     *
     * 用法二：自定义站点
     *   launcher.thirdPartyLogin({ authBase: 'https://your-skin.site/api/yggdrasil', username, password })
     *
     * 用法三：已有 accessToken 直接复用
     *   launcher.thirdPartyLogin({ preset: 'littleskin', accessToken, clientToken })
     */
    async thirdPartyLogin(options) {
        this.logger.info('Third-party login attempt', {
            preset: options?.preset,
            authBase: options?.authBase,
            username: options?.username
        });
        const { preset, authBase, profileBase, siteName, username, password, accessToken, clientToken, ...rest } = options || {};
        this.auth = new ThirdPartyAuth({ preset, authBase, profileBase, siteName, clientToken, ...rest });
        const arg = accessToken && !username
            ? { accessToken, clientToken: clientToken || this.auth.clientToken }
            : { username, password };
        this.profile = await this.auth.authenticate(arg);
        this.logger.info('Third-party login successful', {
            site: this.profile.siteName,
            username: this.profile.username,
            uuid: this.profile.uuid
        });
        this.saveProfile();
        return this.profile;
    }

    saveProfile() {
        if (!this.profile) return;
        this.config.lastProfile = this.profile;
        saveConfig(this.options.gameDirectory, this.config).catch(err => this.logger.warn('Failed to save config:', err.message));
        this.logger.info('Profile saved');
    }

    async getAvailableVersions() {
        const versions = await this.versionManager.getVersions();
        this.logger.info(`Found ${versions.length} available versions`);
        return versions;
    }

    async installVersion(version) {
        this.logger.info(`Installing version: ${version}`);
        const result = await this.versionManager.install(version);
        // Fabric 简写别名安装后真实 id 是 fabric-loader-<mc>-<loader>，资源索引挂在父版本上
        const assetVersionId = result.versionId || version;
        await this.assetManager.downloadAssets(assetVersionId);
        this.logger.info('Version installation completed', result);
        return result;
    }

    async prepareLaunch() {
        if (!this.profile) throw new Error('User not authenticated');

        // 统一规范化版本名：'latest' → 最新正式版；Fabric 简写别名 → fabric-loader-<mc>-<loader>
        const version = await this.versionManager.resolveVersionId(this.options.version);

        this.logger.info(`Preparing launch for version: ${version}`);

        if (!(await this.versionManager.isInstalled(version))) {
            await this.installVersion(version);
        } else {
            const integrity = await this.versionManager.verifyIntegrity(version);
            if (!integrity.complete) {
                this.logger.warn(`Missing files detected, reinstalling: ${integrity.missing.join(', ')}`);
                await this.installVersion(version);
            }
        }

        // 内存自动分配：memory 为 'auto' 时按系统总内存的 1/4 分配（1G ~ 8G 之间）
        this.options.memory = this._resolveMemory(this.options.memory);

        const launchArgs = await this.versionManager.generateLaunchArgs({
            version,
            profile: this.profile,
            gameDirectory: this.options.gameDirectory,
            instanceDir: this.options.instanceDir,
            memory: this.options.memory,
            windowWidth: this.options.windowWidth,
            windowHeight: this.options.windowHeight
        });

        await this._checkJavaVersion(launchArgs.versionData, version);

        if (this.options.enableMods) {
            launchArgs.args = [...launchArgs.args, ...await this.modManager.getLaunchArgs()];
        }

        // 直连服务器参数
        if (this.options.server) {
            launchArgs.args.push('--server', this.options.server);
            if (this.options.serverPort) {
                launchArgs.args.push('--port', String(this.options.serverPort));
            }
        }

        this.logger.info('Launch preparation completed', launchArgs);
        return launchArgs;
    }

    async _checkJavaVersion(versionData, versionId) {
        try {
            const { getJavaVersion, findJava, getRequiredJavaVersion } = await import('../utils/java.js');
            const requiredMajor = getRequiredJavaVersion(versionData, versionId);
            const currentVersion = await getJavaVersion(this.options.javaPath);
            if (currentVersion === null) {
                this.logger.warn('Could not determine Java version, skipping check');
                return;
            }
            if (currentVersion >= requiredMajor) {
                this.logger.info(`Java version OK: ${currentVersion} (requires ${requiredMajor}+)`);
                return;
            }
            // 版本不匹配，自动检测合适的 Java
            this.logger.warn(`Java version mismatch: requires ${requiredMajor}+, current is ${currentVersion}. Auto-detecting...`);
            const foundJava = await findJava(requiredMajor);
            if (foundJava) {
                this.logger.info(`Auto-detected Java ${requiredMajor}: ${foundJava}`);
                this.options.javaPath = foundJava;
            } else {
                this.logger.error(`No suitable Java ${requiredMajor}+ found. Game may crash.`);
            }
        } catch (err) {
            this.logger.warn('Could not determine Java version:', err.message);
        }
    }

    // 解析内存配置：'auto' 时按系统总内存的 1/4 分配，限制在 1G ~ 8G
    _resolveMemory(memory) {
        if (memory !== 'auto') return memory;
        const totalGB = totalmem() / (1024 ** 3);
        const allocGB = Math.min(8, Math.max(1, Math.floor(totalGB / 4)));
        this.logger.info(`Auto memory allocation: system ${totalGB.toFixed(1)}G total, allocating ${allocGB}G`);
        return `${allocGB}G`;
    }

    // 游戏崩溃时提取日志尾部与最新崩溃报告，便于定位问题
    async _extractCrashInfo(gameDir) {
        const info = { latestLogTail: null, crashReport: null, crashReportPath: null };
        try {
            const latestLog = await fs.readFile(join(gameDir, 'logs', 'latest.log'), 'utf8');
            info.latestLogTail = latestLog.trimEnd().split('\n').slice(-40).join('\n');
        } catch { /* 日志不存在则跳过 */ }
        try {
            const crashDir = join(gameDir, 'crash-reports');
            const files = (await fs.readdir(crashDir)).filter(f => f.startsWith('crash-') && f.endsWith('.txt'));
            if (files.length > 0) {
                const withMtime = await Promise.all(files.map(async f => ({
                    name: f,
                    mtime: (await fs.stat(join(crashDir, f))).mtimeMs
                })));
                withMtime.sort((a, b) => b.mtime - a.mtime);
                info.crashReportPath = join(crashDir, withMtime[0].name);
                const content = await fs.readFile(info.crashReportPath, 'utf8');
                info.crashReport = content.split('\n').slice(0, 30).join('\n');
            }
        } catch { /* 崩溃报告目录不存在则跳过 */ }
        return info;
    }

    async launch(options = {}) {
        this.logger.info('Starting game launch', { ...this.options, ...options });
        const launchArgs = await this.prepareLaunch();
        const launchOptions = { ...this.options, ...options };

        const { spawn } = await import('child_process');
        const gameProcess = spawn(this.options.javaPath, launchArgs.args, {
            cwd: launchOptions.gameDirectory,
            stdio: ['pipe', 'pipe', 'pipe'],
            detached: false
        });

        gameProcess.stdout.on('data', data => this.logger.debug('Game stdout:', data.toString()));
        gameProcess.stderr.on('data', data => this.logger.warn('Game stderr:', data.toString()));
        gameProcess.on('close', async code => {
            this.logger.info(`Game process exited with code ${code}`);
            if (code !== 0) {
                const crashInfo = await this._extractCrashInfo(launchOptions.gameDirectory);
                if (crashInfo.crashReportPath) {
                    this.logger.error(`Crash report: ${crashInfo.crashReportPath}`);
                    this.logger.error(`Crash report head:\n${crashInfo.crashReport}`);
                }
                if (crashInfo.latestLogTail) {
                    this.logger.error(`latest.log tail:\n${crashInfo.latestLogTail}`);
                }
            }
        });
        gameProcess.on('error', error => this.logger.error('Game process error:', error));

        this.logger.info('Game launched successfully');
        return gameProcess;
    }

    async quickLaunch(options = {}) {
        const { version, username = 'Player', authType = 'offline', accessToken, password,
                preset, authBase, profileBase, siteName, clientToken, ...rest } = options;
        this.logger.info(`Quick launch: version=${version || this.options.version}, auth=${authType}, user=${username}`);

        // 1. 认证
        if (authType === 'offline') {
            await this.offlineLogin(username);
        } else if (authType === 'microsoft') {
            if (!accessToken) throw new Error('Microsoft auth requires accessToken');
            await this.microsoftLogin(accessToken);
        } else if (authType === 'mojang') {
            if (!username || !password) throw new Error('Mojang auth requires username and password');
            await this.mojangLogin(username, password);
        } else if (authType === 'third-party' || authType === 'thirdParty' || authType === 'littleskin') {
            await this.thirdPartyLogin({
                preset: preset || (authType === 'littleskin' ? 'littleskin' : undefined),
                authBase, profileBase, siteName,
                username, password, accessToken, clientToken
            });
        } else {
            throw new Error(`Unknown auth type: ${authType}. Supported: offline, microsoft, mojang, third-party, littleskin`);
        }

        // 2. 更新启动选项
        if (version) this.options.version = version;
        Object.assign(this.options, rest);

        // 3. 启动（内部自动检查版本、检测 Java、准备参数）
        return this.launch();
    }

    getStatus() {
        return {
            authenticated: !!this.profile,
            profile: this.profile,
            options: this.options,
            config: this.config,
            versionManager: this.versionManager.getStatus(),
            assetManager: this.assetManager.getStatus()
        };
    }

    cleanup() {
        this.logger.info('Cleaning up resources');
        this.auth = null;
        this.profile = null;
    }
}
