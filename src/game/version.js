import { Logger } from '../utils/logger.js';
import fetch from 'node-fetch';
import { promises as fs } from 'fs';
import path from 'path';

const OS_NAME = { win32: 'windows', darwin: 'osx' }[process.platform] || 'linux';
const MANIFEST_URL = 'https://launchermeta.mojang.com/mc/game/version_manifest.json';
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
        const jarVersionId = versionData.inheritsFrom || versionId;
        checks.push({ path: path.join(this.versionsDirectory, jarVersionId, `${jarVersionId}.jar`), name: `versions/${jarVersionId}/${jarVersionId}.jar` });

        for (const library of versionData.libraries || []) {
            if (library.rules && !this.evaluateRules(library.rules)) continue;
            if (library.downloads?.artifact || library.name) {
                checks.push({ path: this.getLibraryPath(library), name: `libraries/${library.name}` });
            }
        }

        // 分批并行检查（每批 16 个）
        const BATCH = 16;
        for (let i = 0; i < checks.length; i += BATCH) {
            const batch = checks.slice(i, i + BATCH);
            const results = await Promise.all(batch.map(async c => {
                try { await fs.access(c.path); return null; }
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
        const repo = this._getMavenRepo(library.name);
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
            if (library.downloads?.artifact) {
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

        let mergedArguments = childData.arguments || parentData.arguments;
        if (childData.arguments && parentData.arguments) {
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
        const jarVersionId = versionData.inheritsFrom || versionId;
        const entries = [path.join(this.versionsDirectory, jarVersionId, `${jarVersionId}.jar`)];

        // 收集需要检查的库
        const toCheck = [];
        for (const library of versionData.libraries || []) {
            if (library.rules && !this.evaluateRules(library.rules)) continue;
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
            clientid: '',
            auth_xuid: '',
            user_type: profile.type === 'microsoft' ? 'msa' : 'mojang',
            version_name: options.version,
            game_directory: options.instanceDir || options.gameDirectory,
            assets_root: path.join(options.gameDirectory, 'assets'),
            assets_index_name: versionData.assetIndex?.id || versionData.assets || 'pre-1.6',
            user_properties: '{}',
            resolution_width: options.windowWidth || 854,
            resolution_height: options.windowHeight || 480
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
            // 老版本格式（1.12.2 及更早）手动添加 natives 和 classpath
            jvmArgs.push(`-Djava.library.path=${this.nativesDirectory}`, '-cp', classpath);
        }
        return jvmArgs;
    }

    buildGameArgs(versionData, options) {
        const profile = options.profile || {};
        const gameArguments = versionData.arguments?.game || versionData.minecraftArguments?.split(' ') || [];
        const features = {
            is_demo: options.demo || false,
            has_custom_resolution: !!(options.windowWidth && options.windowHeight)
        };
        const vars = this._buildVars(versionData, options, null, profile);
        return this._processArgs(gameArguments, vars, features);
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
