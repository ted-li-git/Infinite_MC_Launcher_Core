#!/usr/bin/env node

import { MCLauncher, detectJavaVersions } from './src/index.js';
import { createInterface } from 'readline';

function parseArgs(argv) {
    const args = argv.slice(2);
    const command = args[0];
    const options = {};
    for (let i = 1; i < args.length; i++) {
        const arg = args[i];
        if (!arg.startsWith('--')) continue;
        const key = arg.slice(2);
        const next = args[i + 1];
        if (next && !next.startsWith('--')) {
            options[key] = next;
            i++;
        } else {
            options[key] = true;
        }
    }
    return { command, options };
}

function coerceOptions(options) {
    const result = { ...options };
    if (result.debug === true) result.enableDebug = true;
    delete result.debug;
    if (result.windowWidth) result.windowWidth = parseInt(result.windowWidth);
    if (result.windowHeight) result.windowHeight = parseInt(result.windowHeight);
    if (result['game-dir']) result.gameDirectory = result['game-dir'];
    if (result['java-path']) result.javaPath = result['java-path'];
    if (result['auth']) result.authType = result['auth'];
    return result;
}

function output(data, useJson) {
    if (useJson) {
        process.stdout.write(JSON.stringify(data) + '\n');
    } else if (typeof data === 'string') {
        console.log(data);
    } else {
        console.log(JSON.stringify(data, null, 2));
    }
}

function outputError(message, useJson) {
    if (useJson) {
        process.stderr.write(JSON.stringify({ success: false, error: message }) + '\n');
    } else {
        console.error(`Error: ${message}`);
    }
}

function createLauncher(options, useJson = false) {
    return new MCLauncher({
        gameDirectory: options.gameDirectory || './minecraft',
        version: options.version,
        enableDebug: options.enableDebug,
        logLevel: useJson ? 'ERROR' : null
    });
}

async function withLauncher(options, useJson, fn) {
    const launcher = createLauncher(options, useJson);
    try {
        return await fn(launcher);
    } finally {
        launcher.cleanup();
    }
}

const requireVersion = options => {
    if (!options.version) throw new Error('--version is required');
};

const handleVersions = (options, useJson) => withLauncher(options, useJson, async l => ({
    success: true,
    versions: await l.getAvailableVersions()
}));

const handleInstall = (options, useJson) => {
    requireVersion(options);
    return withLauncher(options, useJson, async l => {
        await l.installVersion(options.version);
        return { success: true, version: options.version, installed: true };
    });
};

const handleCheck = (options, useJson) => {
    requireVersion(options);
    return withLauncher(options, useJson, async l => {
        const integrity = await l.versionManager.verifyIntegrity(options.version);
        return { success: true, version: options.version, ...integrity };
    });
};

const handleJava = async () => ({ success: true, javas: await detectJavaVersions(true) });

async function handleLogin(options, useJson) {
    const { MicrosoftAuth } = await import('./src/auth/microsoft.js');
    const auth = new MicrosoftAuth();

    // 1. 启动设备流，输出 URL 和 userCode
    const deviceFlow = await auth.startDeviceFlow();
    process.stdout.write(JSON.stringify({
        event: 'device_code',
        url: deviceFlow.verificationUriComplete,
        userCode: deviceFlow.userCode,
        expiresIn: deviceFlow.expiresIn
    }) + '\n');

    // 2. 轮询等待用户授权
    let tokenData = null;
    const startTime = Date.now();
    const timeout = deviceFlow.expiresIn * 1000;
    while (!tokenData && (Date.now() - startTime) < timeout) {
        tokenData = await auth.checkDeviceAuthorization(deviceFlow.deviceCode);
        if (!tokenData) {
            await new Promise(r => setTimeout(r, (deviceFlow.interval || 5) * 1000));
        }
    }
    if (!tokenData) throw new Error('设备代码已过期，请重新登录');

    // 3. 完成认证，返回 Microsoft access token（可用于 launch --access-token）
    const profile = await auth.authenticate(auth.accessToken);
    return {
        success: true,
        username: profile.username,
        uuid: profile.uuid,
        accessToken: auth.accessToken
    };
}

async function handleLaunch(options, useJson) {
    requireVersion(options);
    const launcher = createLauncher(options, useJson);

    launcher.logger.onLog(entry => {
        if (options.stdio) sendEvent('log', entry);
    });

    const proc = await launcher.quickLaunch({
        version: options.version,
        username: options.username || 'Player',
        authType: options.authType || 'offline',
        accessToken: options.accessToken,
        password: options.password,
        memory: options.memory,
        windowWidth: options.windowWidth,
        windowHeight: options.windowHeight
    });

    proc.stdout?.on('data', data => {
        if (options.stdio) sendEvent('game_stdout', data.toString());
        else process.stdout.write(data);
    });

    proc.stderr?.on('data', data => {
        if (options.stdio) sendEvent('game_stderr', data.toString());
        else process.stderr.write(data);
    });

    proc.on('close', code => {
        if (options.stdio) sendEvent('game_exit', { code });
        launcher.cleanup();
    });

    return { success: true, pid: proc.pid, version: options.version };
}

// ========== stdio 模式 ==========

const sendEvent = (event, data) => process.stdout.write(JSON.stringify({ event, data }) + '\n');
const sendResponse = (id, result) => process.stdout.write(JSON.stringify({ id, result }) + '\n');
const sendError = (id, message, code) => process.stdout.write(JSON.stringify({ id, error: { message, code } }) + '\n');

async function handleStdio(options) {
    const launcher = new MCLauncher({
        gameDirectory: options.gameDirectory || './minecraft',
        enableDebug: options.enableDebug,
        logLevel: 'ERROR'
    });

    launcher.logger.onLog(entry => sendEvent('log', entry));

    const rl = createInterface({ input: process.stdin });

    const messageHandlers = {
        async versions() {
            return { versions: await launcher.getAvailableVersions() };
        },
        async install({ version }) {
            await launcher.installVersion(version);
            return { version, installed: true };
        },
        async check({ version }) {
            const integrity = await launcher.versionManager.verifyIntegrity(version);
            return { version, ...integrity };
        },
        async detectJava() {
            return { javas: await detectJavaVersions(true) };
        },
        async launch(params) {
            const proc = await launcher.quickLaunch({
                version: params.version,
                username: params.username || 'Player',
                authType: params.authType || 'offline',
                accessToken: params.accessToken,
                password: params.password,
                memory: params.memory,
                windowWidth: params.windowWidth,
                windowHeight: params.windowHeight
            });
            proc.stdout?.on('data', data => sendEvent('game_stdout', data.toString()));
            proc.stderr?.on('data', data => sendEvent('game_stderr', data.toString()));
            proc.on('close', code => {
                sendEvent('game_exit', { code });
                launcher.cleanup();
            });
            return { pid: proc.pid, version: params.version };
        },
        async setGameDirectory({ gameDirectory }) {
            launcher.options.gameDirectory = gameDirectory;
            launcher.versionManager.gameDirectory = gameDirectory;
            launcher.versionManager.versionsDirectory = await import('path').then(p =>
                p.join(gameDirectory, 'versions'));
            return { gameDirectory };
        }
    };

    sendEvent('ready', { message: 'Infinite MC Launcher stdio mode ready' });

    rl.on('line', line => {
        let msg;
        try {
            msg = JSON.parse(line);
        } catch (err) {
            process.stderr.write(`Invalid JSON: ${err.message}\n`);
            return;
        }
        const handler = messageHandlers[msg.method];
        if (!handler) {
            sendError(msg.id, `Unknown method: ${msg.method}`, 'UNKNOWN_METHOD');
            return;
        }
        Promise.resolve(handler(msg.params || {}))
            .then(result => sendResponse(msg.id, result))
            .catch(err => sendError(msg.id, err.message, err.code || 'INTERNAL_ERROR'));
    });

    return null;
}

async function main() {
    const { command, options: rawOptions } = parseArgs(process.argv);
    const options = coerceOptions(rawOptions);
    const useJson = options.json || false;

    if (command === 'stdio' || options.stdio) {
        await handleStdio(options);
        return;
    }

    try {
        let result;
        switch (command) {
            case 'versions': result = await handleVersions(options, useJson); break;
            case 'install': result = await handleInstall(options, useJson); break;
            case 'launch': result = await handleLaunch(options, useJson); break;
            case 'check': result = await handleCheck(options, useJson); break;
            case 'java': result = await handleJava(); break;
            case 'login': result = await handleLogin(options, useJson); break;
            case 'help':
            case '--help':
            case '-h':
            case undefined:
                showHelp();
                return;
            default:
                outputError(`Unknown command: ${command}`, useJson);
                process.exit(1);
        }
        output(result, useJson);
        if (command === 'launch' && !options.stdio) {
            process.stdin.resume();
        }
    } catch (err) {
        outputError(err.message, useJson);
        process.exit(1);
    }
}

function showHelp() {
    console.log(`
Infinite MC Launcher Core CLI

用法:
  node cli.js <command> [options]

命令:
  install    安装游戏版本
  launch     启动游戏
  versions   列出可用版本
  check      检查版本完整性
  java       检测系统 Java 安装
  login      正版登录（Microsoft 设备流认证）
  stdio      进入 stdio 交互模式（JSON-RPC）

选项:
  --game-dir <path>    游戏目录（默认 ./minecraft）
  --version <id>       游戏版本
  --username <name>    玩家用户名
  --auth <type>        认证方式（offline/microsoft/mojang）
  --memory <size>      内存大小（如 2G）
  --java-path <path>   Java 路径
  --window-width <px>  窗口宽度
  --window-height <px> 窗口高度
  --debug              启用调试日志
  --json               JSON 格式输出
  --stdio              stdio 交互模式

示例:
  node cli.js versions --game-dir ./minecraft --json
  node cli.js install --version 1.20.1
  node cli.js launch --version 1.20.1 --username Player1 --auth offline
  node cli.js java --json
  node cli.js stdio
`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
