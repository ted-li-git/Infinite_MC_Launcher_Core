import { Logger } from '../utils/logger.js';
import fetch from 'node-fetch';
import { promises as fs } from 'fs';
import path from 'path';

const OS_NAME = { win32: 'windows', darwin: 'osx' }[process.platform] || 'linux';
const MANIFEST_URL = 'https://launchermeta.mojang.com/mc/game/version_manifest.json';
const FABRIC_META_URL = 'https://meta.fabricmc.net/v2';
const QUILT_META_URL = 'https://meta.quiltmc.org/v3';
const NEOFORGE_MAVEN_URL = 'https://maven.neoforged.net/releases';
const FORGE_MAVEN_URL = 'https://maven.minecraftforge.net/releases';
const LAUNCHER_NAME = 'Infinite MC Launcher Core';
const LAUNCHER_VERSION = '1.0.0';

export class VersionManager {
    constructor(gameDirectory) {
        this.logger = new Logger();
        this.gameDirectory = gameDirectory;
        this.versionsDirectory = path.join(gameDirectory, 'versions');
        this.librariesDirectory = path.join(gameDirectory, 'libraries');
        this.nativesDirectory = path.join(gameDirectory, 'natives');
        this.ensureDirectories().catch(err => this.logger.warn('Directories creation skipped:', err.message));
        this.versionsCache = null;
        this.lastFetchTime = null;
        this._versionJsonCache = new Map(); // 版本 JSON 内存缓存
        this._fabricLoaderCache = new Map(); // Fabric loader 列表缓存（gameVersion -> {list, time}）
        this._quiltLoaderCache = new Map(); // Quilt loader 列表缓存
        this._mavenVersionCache = new Map(); // Forge/NeoForge maven metadata 缓存
    }

    async ensureDirectories() {
        const dirs = [
            this.gameDirectory, this.versionsDirectory, this.librariesDirectory, this.nativesDirectory,
            path.join(this.gameDirectory, 'assets'),
            path.join(this.gameDirectory, 'logs'),
            path.join(this.gameDirectory, 'saves'),
            path.join(this.gameDirectory, 'resourcepacks')
        ];
        await Promise.all(dirs.map(d => fs.mkdir(d, { recursive: true })));
    }

    async _exists(p) {
        try { await fs.access(p); return true; } catch { return false; }
    }

    _cacheValid() {
        return this.versionsCache && this.lastFetchTime && Date.now() - this.lastFetchTime < 5 * 60 * 1000;
    }

    async getVersions() {
        if (this._cacheValid()) {
            this.logger.debug('Using cached versions');
            return this.versionsCache;
        }
        this.logger.info('Fetching available versions');
        try {
            const response = await fetch(MANIFEST_URL);
            if (!response.ok) throw new Error(`Failed to fetch version manifest: ${response.statusText}`);
            const manifest = await response.json();
            const versions = await Promise.all(manifest.versions.map(async v => ({
                id: v.id, type: v.type, releaseTime: v.releaseTime, url: v.url,
                isInstalled: await this.isInstalled(v.id)
            })));
            this.versionsCache = versions;
            this.lastFetchTime = Date.now();
            this.logger.info(`Found ${versions.length} versions`);
            return versions;
        } catch (error) {
            this.logger.error('Failed to get versions', error);
            const localVersions = await this.getLocalVersions();
            this.logger.info(`Returning ${localVersions.length} local versions as fallback`);
            return localVersions;
        }
    }

    async getLocalVersions() {
        this.logger.debug('Getting local installed versions');
        const versions = [];
        let versionDirs = [];
        try { versionDirs = await fs.readdir(this.versionsDirectory); } catch { /* no versions dir */ }
        for (const versionId of versionDirs) {
            const jsonPath = path.join(this.versionsDirectory, versionId, `${versionId}.json`);
            if (!(await this._exists(jsonPath))) continue;
            try {
                const data = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
                versions.push({
                    id: versionId,
                    type: data.type || 'release',
                    releaseTime: data.releaseTime || new Date().toISOString(),
                    url: jsonPath,
                    isInstalled: true,
                    local: true
                });
            } catch { /* skip invalid version json */ }
        }
        this.logger.debug(`Found ${versions.length} local versions`);
        return versions;
    }

    async getLatestVersion(type = 'release') {
        this.logger.info(`Getting latest ${type} version`);
        const response = await fetch(MANIFEST_URL);
        if (!response.ok) throw new Error(`Failed to fetch version manifest: ${response.statusText}`);
        const latest = (await response.json()).latest[type];
        this.logger.info(`Latest ${type} version: ${latest}`);
        return latest;
    }

    async isInstalled(versionId) {
        const installed = await this._exists(path.join(this.versionsDirectory, versionId, `${versionId}.json`));
        this.logger.debug(`Version ${versionId} is ${installed ? '' : 'not '}installed`);
        return installed;
    }

    async verifyIntegrity(versionId) {
        const missing = [];
        const versionPath = path.join(this.versionsDirectory, versionId);
        const jsonPath = path.join(versionPath, `${versionId}.json`);

        if (!(await this._exists(jsonPath))) {
            missing.push(`versions/${versionId}/${versionId}.json`);
            return { complete: false, missing };
        }

        let versionData;
        try {
            versionData = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
        } catch {
            missing.push(`versions/${versionId}/${versionId}.json (invalid)`);
            return { complete: false, missing };
        }

        // 收集需要检查的文件
        const checks = [];
        const jarVersionId = versionData.inheritsFrom || versionData.jar || versionId;
        checks.push({ path: path.join(this.versionsDirectory, jarVersionId, `${jarVersionId}.jar`), name: `versions/${jarVersionId}/${jarVersionId}.jar` });

        for (const library of versionData.libraries || []) {
            if (library.rules && !this.evaluateRules(library.rules)) continue;
            if (library.clientreq === false) continue; // 老 Forge 格式：非客户端必需库
            if (library.downloads?.artifact || library.name) {
                checks.push({
                    path: this.getLibraryPath(library),
                    name: `libraries/${library.name}`,
                    size: library.downloads?.artifact?.size
                });
            }
        }

        // 分批并行检查（每批 16 个）；有 size 信息时先对比大小，不匹配视为损坏并删除以便重装时重新下载
        const BATCH = 16;
        for (let i = 0; i < checks.length; i += BATCH) {
            const batch = checks.slice(i, i + BATCH);
            const results = await Promise.all(batch.map(async c => {
                try {
                    if (c.size != null) {
                        const stat = await fs.stat(c.path);
                        if (stat.size !== c.size) {
                            await fs.unlink(c.path).catch(() => {});
                            return c.name;
                        }
                    } else {
                        await fs.access(c.path);
                    }
                    return null;
                }
                catch { return c.name; }
            }));
            for (const r of results) if (r) missing.push(r);
        }

        this.logger.debug(`Integrity check for ${versionId}: ${missing.length === 0 ? 'OK' : `${missing.length} missing`}`);
        return { complete: missing.length === 0, missing };
    }

    async downloadVersion(versionUrl, versionId) {
        this.logger.info(`Downloading version ${versionId}`);
        const response = await fetch(versionUrl);
        if (!response.ok) throw new Error(`Failed to download version JSON: ${response.statusText}`);
        const versionData = await response.json();

        const versionPath = path.join(this.versionsDirectory, versionId);
        await fs.mkdir(versionPath, { recursive: true });
        await fs.writeFile(path.join(versionPath, `${versionId}.json`), JSON.stringify(versionData, null, 2));

        this.logger.info(`Downloading client jar for ${versionId}`);
        const jarResponse = await fetch(versionData.downloads.client.url);
        if (!jarResponse.ok) throw new Error(`Failed to download client jar: ${jarResponse.statusText}`);
        await fs.writeFile(path.join(versionPath, `${versionId}.jar`), Buffer.from(await jarResponse.arrayBuffer()));

        this.logger.info(`Version ${versionId} downloaded successfully`);
        return versionData;
    }

    async downloadLibrary(library) {
        const libraryPath = this.getLibraryPath(library);
        if (await this._exists(libraryPath)) {
            this.logger.debug(`Library already exists: ${library.name}`);
            return libraryPath;
        }
        this.logger.info(`Downloading library: ${library.name}`);
        await fs.mkdir(path.dirname(libraryPath), { recursive: true });
        const url = this.getLibraryUrl(library);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to download library ${library.name}: ${response.statusText} (url: ${url})`);
        await fs.writeFile(libraryPath, Buffer.from(await response.arrayBuffer()));

        const expectedSha1 = library.downloads?.artifact?.sha1;
        if (expectedSha1 && (await this.calculateSHA1(libraryPath)) !== expectedSha1) {
            throw new Error(`SHA1 mismatch for library ${library.name}`);
        }
        this.logger.debug(`Library downloaded: ${library.name}`);
        return libraryPath;
    }

    _parseLibName(library) {
        const [groupId, artifactId, version, classifier = ''] = library.name.split(':');
        const baseParts = [...groupId.split('.'), artifactId, version];
        const fileName = `${artifactId}-${version}${classifier ? '-' + classifier : ''}.jar`;
        return { baseParts, fileName };
    }

    getLibraryPath(library) {
        if (library.downloads?.artifact?.path) {
            return path.join(this.librariesDirectory, library.downloads.artifact.path);
        }
        const { baseParts, fileName } = this._parseLibName(library);
        return path.join(this.librariesDirectory, ...baseParts, fileName);
    }

    getLibraryUrl(library) {
        if (library.downloads?.artifact?.url) {
            return library.downloads.artifact.url;
        }
        const { baseParts, fileName } = this._parseLibName(library);
        // Fabric / 新版 Forge 的 JSON 中每个库自带 maven 仓库地址（可能带尾部斜杠）
        let repo = (library.url ? library.url.replace(/\/+$/, '') : null) || this._getMavenRepo(library.name);
        // 老 Forge（如 1.12.2）JSON 中的 files.minecraftforge.net/maven 已失效，重写到新 maven 仓库
        repo = repo.replace(/^https?:\/\/files\.minecraftforge\.net\/maven/i, FORGE_MAVEN_URL);
        return [repo, ...baseParts, fileName].join('/');
    }

    _getMavenRepo(libName) {
        if (libName.startsWith('net.neoforged')) return 'https://maven.neoforged.net/releases';
        if (libName.startsWith('net.minecraftforge')) return 'https://maven.minecraftforge.net/releases';
        if (libName.startsWith('org.lwjgl')) return 'https://libraries.lwjgl.org';
        if (libName.startsWith('cpw.mods')) return 'https://maven.minecraftforge.net/releases';
        if (libName.startsWith('net.fabricmc')) return 'https://maven.fabricmc.net';
        return 'https://libraries.minecraft.net';
    }

    async calculateSHA1(filePath) {
        const { createHash } = await import('crypto');
        return createHash('sha1').update(await fs.readFile(filePath)).digest('hex');
    }

    async install(versionId) {
        this.logger.info(`Installing version ${versionId}`);
        if (await this.isInstalled(versionId)) {
            this.logger.info(`Version ${versionId} is already installed`);
            return { versionId, alreadyInstalled: true };
        }

        // Fabric 版本路由（fabric-loader-<loader>-<mc> 或 <mc>-Fabric[_loader]）
        const fabricInfo = this._parseFabricVersion(versionId);
        if (fabricInfo) {
            return this.installFabric(fabricInfo.gameVersion, fabricInfo.loaderVersion);
        }
        // Quilt 版本路由（quilt-loader-<loader>-<mc> 或 <mc>-Quilt[_loader]）
        const quiltInfo = this._parseQuiltVersion(versionId);
        if (quiltInfo) {
            return this.installQuilt(quiltInfo.gameVersion, quiltInfo.loaderVersion);
        }
        // NeoForge 版本路由（neoforge-<ver> 或 <mc>-NeoForge[_ver]）
        const neoInfo = this._parseNeoForgeVersion(versionId);
        if (neoInfo) {
            return this.installNeoForge(neoInfo.gameVersion, neoInfo.loaderVersion);
        }
        // Forge 版本路由（<mc>-forge-<ver> 或 <mc>-Forge[_ver]）
        const forgeInfo = this._parseForgeVersion(versionId);
        if (forgeInfo) {
            return this.installForge(forgeInfo.gameVersion, forgeInfo.loaderVersion);
        }

        const versionInfo = (await this.getVersions()).find(v => v.id === versionId);
        if (!versionInfo) throw new Error(`Version ${versionId} not found`);

        const versionData = await this.downloadVersion(versionInfo.url, versionId);
        this.logger.info(`Downloading libraries for ${versionId}`);

        const libraries = versionData.libraries || [];
        for (const library of libraries) {
            if (library.rules && !this.evaluateRules(library.rules)) {
                this.logger.debug(`Library ${library.name} not allowed for current platform, skipping`);
                continue;
            }
            if (library.clientreq === false) continue; // 老 Forge 格式：非客户端必需库
            // downloads.artifact（Mojang 格式）或纯 maven name（Fabric / 老版本格式）都需要下载
            if (library.downloads?.artifact || library.name) {
                await this.downloadLibrary(library);
            }
            if (library.downloads?.classifiers && library.natives) {
                const classifierKey = library.natives[this.getPlatform()];
                const nativeArtifact = library.downloads.classifiers[classifierKey];
                if (nativeArtifact) {
                    await this.downloadLibrary({ ...library, downloads: { artifact: nativeArtifact } });
                }
            }
        }

        this.logger.info(`Version ${versionId} installed successfully`);
        return { versionId, alreadyInstalled: false, librariesCount: libraries.length, timestamp: new Date().toISOString() };
    }

    // ==================== Fabric 支持 ====================

    /**
     * 识别 Fabric 版本名
     * 支持：
     *   官方标准格式 fabric-loader-<loader版本>-<游戏版本>  如 fabric-loader-0.16.10-1.20.1
     *   简写格式 <游戏版本>-Fabric[_<loader版本>]          如 1.20.1-Fabric / 1.20.1-Fabric_0.16.10
     * @returns {{gameVersion:string, loaderVersion:string|null, alias:boolean}|null}
     */
    _parseFabricVersion(versionId) {
        if (!versionId || typeof versionId !== 'string') return null;
        // 官方 profile JSON 的 id 段顺序是 loader 在前、游戏版本在后（以 meta.fabricmc.net 实际返回为准）
        let m = /^fabric-loader-(\d+\.\d+(?:\.\d+)?(?:[.-][\w.+-]*)?)-(.+)$/.exec(versionId);
        if (m) return { gameVersion: m[2], loaderVersion: m[1], alias: false };
        m = /^(.+)-Fabric(?:[_-]([\w.+-]+))?$/i.exec(versionId);
        if (m) return { gameVersion: m[1], loaderVersion: m[2] || null, alias: true };
        return null;
    }

    /**
     * 把用户给的版本名规范化为真实的版本目录 id
     * - 'latest' → 最新正式版
     * - Fabric 简写别名 → fabric-loader-<loader>-<mc>（省略 loader 时查询最新）
     * - Quilt 简写别名 → quilt-loader-<loader>-<mc>
     * - NeoForge 简写别名 → neoforge-<ver>
     * - Forge 简写别名 → <mc>-forge-<ver>
     * - 其他（原版 / 标准 id）原样返回
     */
    async resolveVersionId(versionId) {
        if (!versionId || versionId === 'latest') {
            return this.getLatestVersion('release');
        }
        const fabric = this._parseFabricVersion(versionId);
        if (fabric?.alias) {
            const loader = fabric.loaderVersion || await this.getLatestFabricLoader(fabric.gameVersion);
            return `fabric-loader-${loader}-${fabric.gameVersion}`;
        }
        const quilt = this._parseQuiltVersion(versionId);
        if (quilt?.alias) {
            const loader = quilt.loaderVersion || await this.getLatestQuiltLoader(quilt.gameVersion);
            return `quilt-loader-${loader}-${quilt.gameVersion}`;
        }
        const neo = this._parseNeoForgeVersion(versionId);
        if (neo?.alias) {
            const ver = neo.loaderVersion || await this.getLatestNeoForge(neo.gameVersion);
            return `neoforge-${ver}`;
        }
        const forge = this._parseForgeVersion(versionId);
        if (forge?.alias) {
            const ver = forge.loaderVersion || await this.getLatestForge(forge.gameVersion);
            return `${forge.gameVersion}-forge-${ver}`;
        }
        return versionId;
    }

    /**
     * 查询某游戏版本可用的 Fabric loader 列表（5 分钟内存缓存）
     * @returns {Promise<Array<{version:string, stable:boolean}>>}
     */
    async getFabricLoaders(gameVersion) {
        const cached = this._fabricLoaderCache.get(gameVersion);
        if (cached && Date.now() - cached.time < 5 * 60 * 1000) return cached.list;

        const url = `${FABRIC_META_URL}/versions/loader/${encodeURIComponent(gameVersion)}`;
        this.logger.info(`Fetching Fabric loader list for ${gameVersion}`);
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch Fabric loader list for ${gameVersion}: ${response.status} ${response.statusText}`);
        }
        const raw = await response.json();
        if (!Array.isArray(raw) || raw.length === 0) {
            throw new Error(`No Fabric loader available for Minecraft ${gameVersion}（该版本可能不受 Fabric 支持）`);
        }
        const list = raw
            .filter(item => item?.loader?.version)
            .map(item => ({ version: item.loader.version, stable: !!item.loader.stable }));
        this._fabricLoaderCache.set(gameVersion, { list, time: Date.now() });
        return list;
    }

    /** 查询某游戏版本最新稳定版 Fabric loader（无稳定版时取第一个） */
    async getLatestFabricLoader(gameVersion) {
        const list = await this.getFabricLoaders(gameVersion);
        const picked = list.find(l => l.stable) || list[0];
        this.logger.info(`Latest Fabric loader for ${gameVersion}: ${picked.version}`);
        return picked.version;
    }

    /**
     * 安装 Fabric（自动先确保原版父版本已安装）
     * @param {string} gameVersion 游戏版本，如 1.20.1 / 1.21.4 / 26w4a
     * @param {string|null} loaderVersion loader 版本，null/省略时自动选最新 stable
     */
    async installFabric(gameVersion, loaderVersion = null) {
        const resolvedLoader = loaderVersion || await this.getLatestFabricLoader(gameVersion);
        this.logger.info(`Installing Fabric loader ${resolvedLoader} for ${gameVersion}`);

        // 1. 拉取 Fabric 官方 profile JSON（标准 Mojang 版本 JSON 格式，带 inheritsFrom）
        const profileUrl = `${FABRIC_META_URL}/versions/loader/${encodeURIComponent(gameVersion)}/${encodeURIComponent(resolvedLoader)}/profile/json`;
        const response = await fetch(profileUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch Fabric profile (${gameVersion}/${resolvedLoader}): ${response.status} ${response.statusText}`);
        }
        const profile = await response.json();
        const versionId = profile.id || `fabric-loader-${resolvedLoader}-${gameVersion}`;

        // 2. 保存版本 JSON（目录名/id 与官方启动器一致：fabric-loader-<mc>-<loader>）
        const versionPath = path.join(this.versionsDirectory, versionId);
        await fs.mkdir(versionPath, { recursive: true });
        await fs.writeFile(path.join(versionPath, `${versionId}.json`), JSON.stringify(profile, null, 2));

        // 3. 确保父原版已安装（client.jar / 原版 libraries / natives 都来自父版本）
        if (!(await this.isInstalled(gameVersion))) {
            this.logger.info(`Fabric requires vanilla ${gameVersion}, installing parent version first`);
            await this.install(gameVersion);
        }

        // 4. 下载 Fabric 自己的 libraries（fabric-loader / intermediary / mixin / asm 等）
        const fabricLibraries = profile.libraries || [];
        for (const library of fabricLibraries) {
            if (library.rules && !this.evaluateRules(library.rules)) continue;
            if (library.downloads?.artifact || library.name) {
                await this.downloadLibrary(library);
            }
        }

        this.logger.info(`Fabric ${versionId} installed successfully (${fabricLibraries.length} libraries)`);
        return {
            versionId,
            alreadyInstalled: false,
            gameVersion,
            loaderVersion: resolvedLoader,
            modLoader: 'fabric',
            librariesCount: fabricLibraries.length,
            timestamp: new Date().toISOString()
        };
    }

    // ==================== Quilt 支持 ====================

    /**
     * 识别 Quilt 版本名
     * 支持：
     *   官方标准格式 quilt-loader-<loader版本>-<游戏版本>  如 quilt-loader-0.24.0-1.20.1
     *   简写格式 <游戏版本>-Quilt[_<loader版本>]           如 1.20.1-Quilt / 1.20.1-Quilt_0.24.0
     */
    _parseQuiltVersion(versionId) {
        if (!versionId || typeof versionId !== 'string') return null;
        let m = /^quilt-loader-(\d+\.\d+(?:\.\d+)?(?:[.-][\w.+-]*)?)-(.+)$/.exec(versionId);
        if (m) return { gameVersion: m[2], loaderVersion: m[1], alias: false };
        m = /^(.+)-Quilt(?:[_-]([\w.+-]+))?$/i.exec(versionId);
        if (m) return { gameVersion: m[1], loaderVersion: m[2] || null, alias: true };
        return null;
    }

    /**
     * 查询某游戏版本可用的 Quilt loader 列表（5 分钟内存缓存）
     * 注意：Quilt meta API 返回的列表无序且无 stable 字段（已实测验证）
     * @returns {Promise<Array<{version:string}>>}
     */
    async getQuiltLoaders(gameVersion) {
        const cached = this._quiltLoaderCache.get(gameVersion);
        if (cached && Date.now() - cached.time < 5 * 60 * 1000) return cached.list;

        const url = `${QUILT_META_URL}/versions/loader/${encodeURIComponent(gameVersion)}`;
        this.logger.info(`Fetching Quilt loader list for ${gameVersion}`);
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch Quilt loader list for ${gameVersion}: ${response.status} ${response.statusText}`);
        }
        const raw = await response.json();
        if (!Array.isArray(raw) || raw.length === 0) {
            throw new Error(`No Quilt loader available for Minecraft ${gameVersion}（该版本可能不受 Quilt 支持）`);
        }
        const list = raw.filter(item => item?.loader?.version).map(item => ({ version: item.loader.version }));
        this._quiltLoaderCache.set(gameVersion, { list, time: Date.now() });
        return list;
    }

    /** 简易语义版本比较：a > b 返回正数（忽略 -beta 等后缀） */
    _compareSemver(a, b) {
        const pa = a.split('-')[0].split('.').map(n => parseInt(n) || 0);
        const pb = b.split('-')[0].split('.').map(n => parseInt(n) || 0);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            const d = (pa[i] || 0) - (pb[i] || 0);
            if (d !== 0) return d;
        }
        return 0;
    }

    /** 查询最新 Quilt loader：优先无预发布后缀的最高版本 */
    async getLatestQuiltLoader(gameVersion) {
        const list = await this.getQuiltLoaders(gameVersion);
        const stable = list.filter(l => !l.version.includes('-'));
        const candidates = stable.length > 0 ? stable : list;
        const best = candidates.reduce((a, b) => this._compareSemver(b.version, a.version) > 0 ? b : a);
        this.logger.info(`Latest Quilt loader for ${gameVersion}: ${best.version}`);
        return best.version;
    }

    /**
     * 安装 Quilt（自动先确保原版父版本已安装）
     * @param {string} gameVersion 游戏版本
     * @param {string|null} loaderVersion loader 版本，null/省略时自动选最新
     */
    async installQuilt(gameVersion, loaderVersion = null) {
        const resolvedLoader = loaderVersion || await this.getLatestQuiltLoader(gameVersion);
        this.logger.info(`Installing Quilt loader ${resolvedLoader} for ${gameVersion}`);

        // 1. 拉取 Quilt 官方 profile JSON（标准 Mojang 版本 JSON 格式，带 inheritsFrom）
        const profileUrl = `${QUILT_META_URL}/versions/loader/${encodeURIComponent(gameVersion)}/${encodeURIComponent(resolvedLoader)}/profile/json`;
        const response = await fetch(profileUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch Quilt profile (${gameVersion}/${resolvedLoader}): ${response.status} ${response.statusText}`);
        }
        const profile = await response.json();
        const versionId = profile.id || `quilt-loader-${resolvedLoader}-${gameVersion}`;

        // 2. 保存版本 JSON
        const versionPath = path.join(this.versionsDirectory, versionId);
        await fs.mkdir(versionPath, { recursive: true });
        await fs.writeFile(path.join(versionPath, `${versionId}.json`), JSON.stringify(profile, null, 2));

        // 3. 确保父原版已安装
        if (!(await this.isInstalled(gameVersion))) {
            this.logger.info(`Quilt requires vanilla ${gameVersion}, installing parent version first`);
            await this.install(gameVersion);
        }

        // 4. 下载 Quilt 自己的 libraries
        const quiltLibraries = profile.libraries || [];
        for (const library of quiltLibraries) {
            if (library.rules && !this.evaluateRules(library.rules)) continue;
            if (library.downloads?.artifact || library.name) {
                await this.downloadLibrary(library);
            }
        }

        this.logger.info(`Quilt ${versionId} installed successfully (${quiltLibraries.length} libraries)`);
        return {
            versionId,
            alreadyInstalled: false,
            gameVersion,
            loaderVersion: resolvedLoader,
            modLoader: 'quilt',
            librariesCount: quiltLibraries.length,
            timestamp: new Date().toISOString()
        };
    }

    // ==================== NeoForge 支持 ====================

    /** NeoForge 版本号 → MC 版本：20.4.x → 1.20.4，21.0.x → 1.21，21.1.x → 1.21.1 */
    _neoToMc(neoVersion) {
        const m = /^(\d+)\.(\d+)/.exec(neoVersion);
        if (!m) return null;
        return m[2] === '0' ? `1.${m[1]}` : `1.${m[1]}.${m[2]}`;
    }

    /**
     * 识别 NeoForge 版本名
     * 支持：
     *   官方标准格式 neoforge-<版本>        如 neoforge-21.1.172（installer 生成的目录 id）
     *   简写格式 <游戏版本>-NeoForge[_版本]  如 1.21.1-NeoForge / 1.21.1-NeoForge_21.1.172
     */
    _parseNeoForgeVersion(versionId) {
        if (!versionId || typeof versionId !== 'string') return null;
        let m = /^neoforge-(\d+\.\d+(?:\.\d+)?(?:[-.]beta)?)$/i.exec(versionId);
        if (m) return { gameVersion: this._neoToMc(m[1]), loaderVersion: m[1], alias: false };
        m = /^(.+)-NeoForge(?:[_-]([\w.+-]+))?$/i.exec(versionId);
        if (m) return { gameVersion: m[1], loaderVersion: m[2] || null, alias: true };
        return null;
    }

    /**
     * 查询 NeoForge 可用版本列表（maven-metadata，5 分钟缓存）
     * @param {string|null} gameVersion 指定 MC 版本时过滤
     * @returns {Promise<Array<{version:string, gameVersion:string}>>} 按版本升序
     */
    async getNeoForgeVersions(gameVersion = null) {
        let versions = this._mavenVersionCache.get('neoforge');
        if (!versions || Date.now() - versions.time > 5 * 60 * 1000) {
            const url = `${NEOFORGE_MAVEN_URL}/net/neoforged/neoforge/maven-metadata.xml`;
            this.logger.info('Fetching NeoForge maven metadata');
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch NeoForge maven metadata: ${response.status} ${response.statusText}`);
            }
            const xml = await response.text();
            const list = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map(m => m[1]);
            versions = { list, time: Date.now() };
            this._mavenVersionCache.set('neoforge', versions);
        }
        const mapped = versions.list
            .map(v => ({ version: v, gameVersion: this._neoToMc(v) }))
            .filter(x => x.gameVersion);
        return gameVersion ? mapped.filter(x => x.gameVersion === gameVersion) : mapped;
    }

    /** 查询某 MC 版本最新的 NeoForge 版本（优先非 beta） */
    async getLatestNeoForge(gameVersion) {
        const list = await this.getNeoForgeVersions(gameVersion);
        if (list.length === 0) {
            throw new Error(`No NeoForge available for Minecraft ${gameVersion}（NeoForge 仅支持 1.20.2+）`);
        }
        const stable = list.filter(x => !x.version.includes('beta'));
        const picked = (stable.length > 0 ? stable : list).at(-1);
        this.logger.info(`Latest NeoForge for ${gameVersion}: ${picked.version}`);
        return picked.version;
    }

    /**
     * 安装 NeoForge（通过官方 installer 无头安装）
     * installer 会自动下载依赖并生成 versions/neoforge-<ver>/ 目录（inheritsFrom 指向游戏版本）
     * @param {string} gameVersion 游戏版本（NeoForge 仅支持 1.20.2+）
     * @param {string|null} neoVersion NeoForge 版本，null/省略时自动选最新
     */
    async installNeoForge(gameVersion, neoVersion = null) {
        const resolved = neoVersion || await this.getLatestNeoForge(gameVersion);
        this.logger.info(`Installing NeoForge ${resolved} for ${gameVersion}`);
        const installerUrl = `${NEOFORGE_MAVEN_URL}/net/neoforged/neoforge/${resolved}/neoforge-${resolved}-installer.jar`;
        await this._runModLoaderInstaller(installerUrl, `neoforge-${resolved}-installer.jar`, '--install-client');

        const versionId = `neoforge-${resolved}`;
        if (!(await this.isInstalled(versionId))) {
            throw new Error(`NeoForge installer 执行后未找到版本 ${versionId}，安装可能失败`);
        }
        this.logger.info(`NeoForge ${versionId} installed successfully`);
        return {
            versionId,
            alreadyInstalled: false,
            gameVersion,
            loaderVersion: resolved,
            modLoader: 'neoforge',
            timestamp: new Date().toISOString()
        };
    }

    // ==================== Forge 支持 ====================

    /**
     * 识别 Forge 版本名
     * 支持：
     *   官方标准格式 <游戏版本>-forge-<版本>   如 1.12.2-forge-14.23.5.2860 / 1.20.1-forge-47.2.0
     *   简写格式 <游戏版本>-Forge[_<版本>]     如 1.20.1-Forge / 1.12.2-Forge_14.23.5.2860
     */
    _parseForgeVersion(versionId) {
        if (!versionId || typeof versionId !== 'string') return null;
        let m = /^(.+)-forge-(\d+\.\d+(?:\.\d+)?.*)$/.exec(versionId);
        if (m) return { gameVersion: m[1], loaderVersion: m[2], alias: false };
        m = /^(.+)-Forge(?:[_-]([\w.+-]+))?$/.exec(versionId);
        if (m) return { gameVersion: m[1], loaderVersion: m[2] || null, alias: true };
        return null;
    }

    /**
     * 查询某 MC 版本可用的 Forge 版本列表（maven-metadata，5 分钟缓存）
     * @returns {Promise<string[]>} Forge 版本号（不含 MC 前缀），升序
     */
    async getForgeVersions(gameVersion) {
        let versions = this._mavenVersionCache.get('forge');
        if (!versions || Date.now() - versions.time > 5 * 60 * 1000) {
            const url = `${FORGE_MAVEN_URL}/net/minecraftforge/forge/maven-metadata.xml`;
            this.logger.info('Fetching Forge maven metadata');
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch Forge maven metadata: ${response.status} ${response.statusText}`);
            }
            const xml = await response.text();
            const list = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map(m => m[1]);
            versions = { list, time: Date.now() };
            this._mavenVersionCache.set('forge', versions);
        }
        // maven metadata 中版本形如 1.12.2-14.23.5.2860 / 1.20.1-47.2.0
        const prefix = `${gameVersion}-`;
        return versions.list.filter(v => v.startsWith(prefix)).map(v => v.slice(prefix.length));
    }

    /** 查询某 MC 版本最新的 Forge 版本 */
    async getLatestForge(gameVersion) {
        const list = await this.getForgeVersions(gameVersion);
        if (list.length === 0) {
            throw new Error(`No Forge available for Minecraft ${gameVersion}`);
        }
        const stable = list.filter(v => !/pre|alpha|beta|rc/i.test(v));
        const picked = (stable.length > 0 ? stable : list).at(-1);
        this.logger.info(`Latest Forge for ${gameVersion}: ${picked}`);
        return picked;
    }

    /**
     * 安装 Forge（通过官方 installer 无头安装）
     * 兼容 1.12.2 等老版本（installer 参数为 --installClient）和新版本（--install-client）
     * @param {string} gameVersion 游戏版本
     * @param {string|null} forgeVersion Forge 版本，null/省略时自动选最新
     */
    async installForge(gameVersion, forgeVersion = null) {
        const resolved = forgeVersion || await this.getLatestForge(gameVersion);
        this.logger.info(`Installing Forge ${resolved} for ${gameVersion}`);
        const full = `${gameVersion}-${resolved}`;
        const installerUrl = `${FORGE_MAVEN_URL}/net/minecraftforge/forge/${full}/forge-${full}-installer.jar`;
        // 1.13+ 的 installer 用 --install-client；1.12.2 及更早用驼峰 --installClient
        const clientArg = this._mcVersionAtLeast(gameVersion, 1, 13) ? '--install-client' : '--installClient';
        await this._runModLoaderInstaller(installerUrl, `forge-${full}-installer.jar`, clientArg);

        const versionId = full;
        if (!(await this.isInstalled(versionId))) {
            throw new Error(`Forge installer 执行后未找到版本 ${versionId}，安装可能失败`);
        }
        this.logger.info(`Forge ${versionId} installed successfully`);
        return {
            versionId,
            alreadyInstalled: false,
            gameVersion,
            loaderVersion: resolved,
            modLoader: 'forge',
            timestamp: new Date().toISOString()
        };
    }

    /** MC 版本号比较：version >= major.minor */
    _mcVersionAtLeast(version, major, minor) {
        const m = /^(\d+)\.(\d+)/.exec(version);
        if (!m) return true; // 无法识别时按新版本处理
        const [maj, min] = [parseInt(m[1]), parseInt(m[2])];
        return maj > major || (maj === major && min >= minor);
    }

    /**
     * 下载并用 Java 无头运行 mod loader 官方 installer（Forge / NeoForge 通用）
     * @param {string} installerUrl installer jar 下载地址
     * @param {string} fileName 临时文件名
     * @param {string} clientArg 客户端安装参数（--install-client 或 --installClient）
     */
    async _runModLoaderInstaller(installerUrl, fileName, clientArg) {
        const os = await import('os');
        const { execFile } = await import('child_process');
        const { promisify } = await import('util');
        const { findJava } = await import('../utils/java.js');

        // 1. 下载 installer 到临时目录（已存在则复用）
        const tmpDir = path.join(os.tmpdir(), 'imc-installers');
        await fs.mkdir(tmpDir, { recursive: true });
        const installerPath = path.join(tmpDir, fileName);
        if (!(await this._exists(installerPath))) {
            this.logger.info(`Downloading installer: ${installerUrl}`);
            const response = await fetch(installerUrl);
            if (!response.ok) {
                throw new Error(`Failed to download installer: ${response.status} ${response.statusText} (url: ${installerUrl})`);
            }
            await fs.writeFile(installerPath, Buffer.from(await response.arrayBuffer()));
        }

        // 2. 运行 installer（installer 需要 Java 8+，优先选 Java 17 兼容新老 installer）
        const javaPath = await findJava(17) || await findJava(8) || 'java';
        this.logger.info(`Running installer: ${javaPath} -jar ${fileName} ${clientArg} ${this.gameDirectory}`);
        try {
            await promisify(execFile)(javaPath, ['-jar', installerPath, clientArg, this.gameDirectory], {
                maxBuffer: 16 * 1024 * 1024,
                timeout: 10 * 60 * 1000
            });
        } catch (error) {
            throw new Error(`Mod loader installer 执行失败: ${error.message}`);
        }
    }

    evaluateRules(rules, features = {}) {
        let allow = false;
        for (const rule of rules) {
            const match = (!rule.os || this.checkOSRule(rule.os)) &&
                          (!rule.features || this._checkFeatures(rule.features, features));
            if (match) {
                if (rule.action === 'allow') allow = true;
                else if (rule.action === 'disallow') allow = false;
            }
        }
        return allow;
    }

    _checkFeatures(ruleFeatures, actualFeatures) {
        return Object.entries(ruleFeatures).every(([k, v]) => actualFeatures[k] === v);
    }

    checkOSRule(osRule) {
        if (osRule.name && osRule.name !== this.getPlatform()) return false;
        if (osRule.arch && osRule.arch !== process.arch) return false;
        return true;
    }

    getPlatform() {
        return OS_NAME;
    }

    async generateLaunchArgs(options) {
        this.logger.info(`Generating launch args for version ${options.version}`);
        const versionId = options.version;

        // 使用内存缓存避免重复解析 JSON
        let versionData = this._versionJsonCache.get(versionId);
        if (!versionData) {
            const versionJsonPath = path.join(this.versionsDirectory, versionId, `${versionId}.json`);
            versionData = JSON.parse(await fs.readFile(versionJsonPath, 'utf8'));
            if (versionData.inheritsFrom) {
                versionData = await this._mergeParentVersion(versionData);
            }
            this._versionJsonCache.set(versionId, versionData);
        }

        await this.extractNatives(versionData);
        const classpath = await this.buildClassPath(versionData, versionId);
        const jvmArgs = this.buildJvmArgs(versionData, options, classpath);
        const gameArgs = this.buildGameArgs(versionData, options);

        const args = [...jvmArgs, versionData.mainClass, ...gameArgs];
        const launchArgs = { args, classpath, versionData, timestamp: new Date().toISOString() };
        this.logger.debug('Launch args generated', launchArgs);
        return launchArgs;
    }

    async _mergeParentVersion(childData) {
        const parentId = childData.inheritsFrom;
        this.logger.info(`Merging parent version: ${parentId}`);
        const parentJsonPath = path.join(this.versionsDirectory, parentId, `${parentId}.json`);
        const parentData = JSON.parse(await fs.readFile(parentJsonPath, 'utf8'));

        const childLibraries = childData.libraries || [];
        const parentLibraries = parentData.libraries || [];
        const childLibNames = new Set(childLibraries.map(l => l.name));
        const mergedLibraries = [...childLibraries, ...parentLibraries.filter(l => !childLibNames.has(l.name))];

        // Fabric profile 的 arguments 是空对象 {}，必须视为"未提供"，否则会丢掉父版本的现代 JVM 参数
        const childHasArgs = childData.arguments && Object.keys(childData.arguments).length > 0;
        let mergedArguments = childHasArgs ? childData.arguments : parentData.arguments;
        if (childHasArgs && parentData.arguments) {
            mergedArguments = {
                jvm: [...(parentData.arguments.jvm || []), ...(childData.arguments.jvm || [])],
                game: [...(parentData.arguments.game || []), ...(childData.arguments.game || [])]
            };
        }

        const merged = {
            ...parentData,
            ...childData,
            libraries: mergedLibraries,
            arguments: mergedArguments,
            minecraftArguments: childData.minecraftArguments || parentData.minecraftArguments,
            assetIndex: childData.assetIndex || parentData.assetIndex,
            assets: childData.assets || parentData.assets,
            downloads: parentData.downloads || childData.downloads,
            javaVersion: childData.javaVersion || parentData.javaVersion,
            inheritsFrom: childData.inheritsFrom
        };

        this.logger.info(`Merged ${childLibraries.length} child libs + ${parentLibraries.length} parent libs`);
        return merged;
    }

    async extractNatives(versionData) {
        let nativesDir = this.nativesDirectory;
        try {
            await fs.mkdir(nativesDir, { recursive: true });
        } catch {
            const os = await import('os');
            nativesDir = path.join(os.tmpdir(), `mc-natives-${Date.now()}`);
            await fs.mkdir(nativesDir, { recursive: true });
            this.logger.warn(`Using temp natives directory: ${nativesDir}`);
        }
        this.nativesDirectory = nativesDir;

        // 检查是否已提取过（通过标记文件）
        const markerPath = path.join(nativesDir, '.extracted');
        const libHash = (versionData.libraries || [])
            .filter(l => l.natives)
            .map(l => l.name)
            .join('|');
        try {
            const marker = await fs.readFile(markerPath, 'utf8');
            if (marker === libHash) {
                this.logger.debug('Natives already extracted, skipping');
                return;
            }
        } catch { /* 需要重新提取 */ }

        // 清空旧的 natives 文件
        try {
            for (const file of await fs.readdir(nativesDir)) {
                await fs.unlink(path.join(nativesDir, file));
            }
        } catch { /* 空目录或不存在 */ }

        const platform = this.getPlatform();
        const { execFile } = await import('child_process');
        const { promisify } = await import('util');
        const execFileAsync = promisify(execFile);

        for (const library of versionData.libraries || []) {
            if (!library.natives) continue;
            let nativeKey = library.natives[platform];
            if (!nativeKey) continue;
            nativeKey = nativeKey.replace('${arch}', process.arch === 'x64' ? '64' : '32');

            let nativeJarPath = null;
            if (library.downloads?.classifiers?.[nativeKey]) {
                nativeJarPath = path.join(this.librariesDirectory, library.downloads.classifiers[nativeKey].path);
            } else {
                nativeJarPath = this.getNativeJarPath(library, nativeKey);
            }
            if (!nativeJarPath || !(await this._exists(nativeJarPath))) {
                this.logger.debug(`Native jar not found: ${nativeJarPath}`);
                continue;
            }

            this.logger.debug(`Extracting natives: ${nativeJarPath}`);
            const tarArgs = ['-xf', nativeJarPath, '-C', nativesDir];
            for (const exclude of library.extract?.exclude || []) {
                tarArgs.push(`--exclude=${exclude.endsWith('/') ? exclude + '*' : exclude}`);
            }
            try {
                await execFileAsync('tar', tarArgs);
            } catch (extractError) {
                this.logger.warn(`Failed to extract natives from ${nativeJarPath}: ${extractError.message}`);
            }
        }

        // 写入标记文件
        try { await fs.writeFile(markerPath, libHash); } catch {}
        this.logger.info('Natives extracted successfully');
    }

    getNativeJarPath(library, classifier) {
        const [groupId, artifactId, version] = library.name.split(':');
        if (!version) return null;
        const baseParts = [...groupId.split('.'), artifactId, version];
        return path.join(this.librariesDirectory, ...baseParts, `${artifactId}-${version}-${classifier}.jar`);
    }

    async buildClassPath(versionData, versionId) {
        const jarVersionId = versionData.inheritsFrom || versionData.jar || versionId;
        const entries = [path.join(this.versionsDirectory, jarVersionId, `${jarVersionId}.jar`)];

        // 收集需要检查的库
        const toCheck = [];
        for (const library of versionData.libraries || []) {
            if (library.rules && !this.evaluateRules(library.rules)) continue;
            if (library.clientreq === false) continue; // 老 Forge 格式：非客户端必需库
            if (library.downloads?.artifact) {
                entries.push(this.getLibraryPath(library));
            } else if (library.name) {
                toCheck.push({ path: this.getLibraryPath(library), name: library.name });
            }
        }

        // 并行检查文件存在性
        if (toCheck.length > 0) {
            const results = await Promise.all(
                toCheck.map(async c => {
                    try { await fs.access(c.path); return c.path; }
                    catch { this.logger.debug(`Library not found, skipping: ${c.name}`); return null; }
                })
            );
            for (const r of results) if (r) entries.push(r);
        }

        return entries.join(process.platform === 'win32' ? ';' : ':');
    }

    _buildVars(versionData, options, classpath, profile = {}) {
        const gameDir = options.instanceDir || options.gameDirectory;
        const isLegacyAssets = !versionData.assetIndex || versionData.assets === 'legacy' || versionData.assets === 'pre-1.6';
        return {
            natives_directory: this.nativesDirectory,
            launcher_name: LAUNCHER_NAME,
            launcher_version: LAUNCHER_VERSION,
            classpath,
            library_directory: this.librariesDirectory,
            classpath_separator: process.platform === 'win32' ? ';' : ':',
            auth_player_name: profile.username || 'Player',
            auth_uuid: profile.uuid || '00000000-0000-0000-0000-000000000000',
            auth_access_token: profile.accessToken || 'token',
            auth_session: profile.accessToken || 'token',
            clientid: '',
            auth_xuid: '',
            user_properties: '{}',
            user_type: profile.type === 'microsoft' ? 'msa' : 'mojang',
            version_name: options.version,
            version_type: versionData.type || 'release',
            game_directory: gameDir,
            gameDir,
            assets_root: isLegacyAssets ? path.join(gameDir, 'resources') : path.join(gameDir, 'assets'),
            game_assets: isLegacyAssets ? path.join(gameDir, 'resources') : path.join(gameDir, 'assets/virtual/legacy'),
            assets_index_name: versionData.assetIndex?.id || versionData.assets || 'legacy',
            resolution_width: options.windowWidth || 854,
            resolution_height: options.windowHeight || 480,
            height: options.windowHeight || 480,
            width: options.windowWidth || 854
        };
    }

    _replaceVars(str, vars) {
        return str.replace(/\$\{(\w+)\}/g, (m, key) => vars[key] != null ? String(vars[key]) : m);
    }

    _processArgs(args, vars, features = {}) {
        const result = [];
        for (const arg of args) {
            if (typeof arg === 'string') {
                result.push(this._replaceVars(arg, vars));
            } else if (arg.rules && this.evaluateRules(arg.rules, features)) {
                const values = Array.isArray(arg.value) ? arg.value : [arg.value];
                for (const v of values) {
                    result.push(typeof v === 'string' ? this._replaceVars(v, vars) : v);
                }
            }
        }
        return result;
    }

    buildJvmArgs(versionData, options, classpath) {
        const jvmArgs = [`-Xmx${options.memory || '2G'}`, `-Xms${options.memory || '2G'}`];
        const jvmArguments = versionData.arguments?.jvm;
        if (jvmArguments) {
            const vars = this._buildVars(versionData, options, classpath, options.profile);
            jvmArgs.push(...this._processArgs(jvmArguments, vars));
        } else {
            jvmArgs.push(`-Djava.library.path=${this.nativesDirectory}`, '-cp', classpath);
        }
        return jvmArgs;
    }

    buildGameArgs(versionData, options) {
        const profile = options.profile || {};
        let gameArguments;
        if (versionData.arguments?.game) {
            gameArguments = versionData.arguments.game;
        } else if (typeof versionData.minecraftArguments === 'string') {
            gameArguments = this._splitLegacyArgs(versionData.minecraftArguments);
        } else {
            gameArguments = [];
        }
        const features = {
            is_demo: options.demo || false,
            has_custom_resolution: !!(options.windowWidth && options.windowHeight)
        };
        const vars = this._buildVars(versionData, options, null, profile);
        return this._processArgs(gameArguments, vars, features);
    }

    _splitLegacyArgs(argString) {
        const tokens = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < argString.length; i++) {
            const c = argString[i];
            if (c === '"') { inQuotes = !inQuotes; continue; }
            if (c === ' ' && !inQuotes) {
                if (current) { tokens.push(current); current = ''; }
            } else {
                current += c;
            }
        }
        if (current) tokens.push(current);
        return tokens;
    }

    getStatus() {
        return {
            gameDirectory: this.gameDirectory,
            versionsDirectory: this.versionsDirectory,
            librariesDirectory: this.librariesDirectory,
            nativesDirectory: this.nativesDirectory,
            cacheValid: this._cacheValid()
        };
    }
}
