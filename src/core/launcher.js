import { OfflineAuth } from '../auth/offline.js';
import { MicrosoftAuth } from '../auth/microsoft.js';
import { MojangAuth } from '../auth/mojang.js';
import { VersionManager } from '../game/version.js';
import { AssetManager } from '../game/assets.js';
import { ModManager } from '../mods/manager.js';
import { ServerManager } from '../servers/manager.js';
import { Logger } from '../utils/logger.js';
import { saveConfig, loadConfig } from '../utils/config.js';
import { join } from 'path';

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
        this.serverManager = new ServerManager(this);

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
        await this.assetManager.downloadAssets(version);
        this.logger.info('Version installation completed', result);
        return result;
    }

    async prepareLaunch() {
        if (!this.profile) throw new Error('User not authenticated');

        const version = this.options.version === 'latest'
            ? await this.versionManager.getLatestVersion()
            : this.options.version;

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

        const launchArgs = await this.versionManager.generateLaunchArgs({
            version,
            profile: this.profile,
            gameDirectory: this.options.gameDirectory,
            instanceDir: this.options.instanceDir,
            memory: this.options.memory,
            windowWidth: this.options.windowWidth,
            windowHeight: this.options.windowHeight
        });

        await this._checkJavaVersion(launchArgs.versionData);

        if (this.options.enableMods) {
            launchArgs.args = [...launchArgs.args, ...await this.modManager.getLaunchArgs()];
        }

        this.logger.info('Launch preparation completed', launchArgs);
        return launchArgs;
    }

    async _checkJavaVersion(versionData) {
        const requiredMajor = versionData.javaVersion?.majorVersion || 8;
        try {
            const { getJavaVersion, findJava } = await import('../utils/java.js');
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
        gameProcess.on('close', code => this.logger.info(`Game process exited with code ${code}`));
        gameProcess.on('error', error => this.logger.error('Game process error:', error));

        this.logger.info('Game launched successfully');
        return gameProcess;
    }

    async quickLaunch(options = {}) {
        const { version, username = 'Player', authType = 'offline', accessToken, password, ...rest } = options;
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
        } else {
            throw new Error(`Unknown auth type: ${authType}`);
        }

        // 2. 更新启动选项
        if (version) this.options.version = version;
        Object.assign(this.options, rest);

        // 3. 启动（内部自动检查版本、检测 Java、准备参数）
        return this.launch();
    }

    async launchServer(serverConfig) {
        this.logger.info('Starting server launch', serverConfig);
        const serverProcess = await this.serverManager.startServer(serverConfig);
        this.logger.info('Server launched successfully');
        return serverProcess;
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
