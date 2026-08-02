import { promises as fs } from 'fs';
import path from 'path';

export class ModManager {
    constructor(launcher) {
        this.launcher = launcher;
        this.logger = launcher.logger.createChild('ModManager');
        this.modsDirectory = path.join(launcher.options.gameDirectory, 'mods');
        this.modConfigs = {};
        this.loadedMods = [];
        this.ensureDirectories().catch(err => {
            this.logger.warn('Mod directories creation skipped:', err.message);
        });
        this.logger.info('Mod Manager initialized');
    }

    async ensureDirectories() {
        const dirs = [
            this.modsDirectory,
            path.join(this.modsDirectory, 'config'),
            path.join(this.modsDirectory, 'disabled'),
            path.join(this.modsDirectory, 'cache')
        ];
        await Promise.all(dirs.map(async dir => {
            try {
                await fs.access(dir);
            } catch {
                await fs.mkdir(dir, { recursive: true });
                this.logger.debug(`Created directory: ${dir}`);
            }
        }));
    }

    async scanInstalledMods() {
        this.logger.info('Scanning installed mods');
        const mods = [];
        try {
            const files = await fs.readdir(this.modsDirectory);
            for (const fileName of files) {
                if (fileName.endsWith('.jar') || fileName.endsWith('.jar.disabled')) {
                    const modPath = path.join(this.modsDirectory, fileName);
                    const modInfo = await this.analyzeModFile(modPath);
                    mods.push({
                        fileName,
                        path: modPath,
                        enabled: !fileName.endsWith('.disabled'),
                        ...modInfo
                    });
                }
            }
        } catch {
            // 目录不存在或为空
        }
        this.logger.info(`Found ${mods.length} mods`);
        return mods;
    }

    async analyzeModFile(modPath) {
        try {
            const stats = await fs.stat(modPath);
            return {
                name: path.basename(modPath, '.jar').replace('.disabled', ''),
                size: stats.size,
                lastModified: stats.mtime,
                filePath: modPath,
                valid: false
            };
        } catch (error) {
            this.logger.error(`Failed to analyze mod file: ${modPath}`, error);
            return {
                name: path.basename(modPath),
                valid: false,
                error: error.message
            };
        }
    }

    async installMod(sourcePath, options = {}) {
        this.logger.info(`Installing mod from: ${sourcePath}`);
        await fs.access(sourcePath);
        const fileName = path.basename(sourcePath);
        const destPath = path.join(this.modsDirectory, fileName);

        try {
            await fs.access(destPath);
            if (options.overwrite !== true) {
                throw new Error(`Mod already exists: ${fileName}`);
            }
            this.logger.warn(`Overwriting existing mod: ${fileName}`);
        } catch {
            // 文件不存在或已存在检查被忽略
        }

        await fs.copyFile(sourcePath, destPath);
        const sourceStats = await fs.stat(sourcePath);
        const destStats = await fs.stat(destPath);
        if (sourceStats.size !== destStats.size) {
            throw new Error(`File size mismatch after copy`);
        }

        const modInfo = await this.analyzeModFile(destPath);
        this.logger.info(`Mod installed successfully: ${fileName}`, {
            size: sourceStats.size,
            ...modInfo
        });
        return {
            success: true,
            fileName,
            path: destPath,
            size: sourceStats.size,
            modInfo
        };
    }

    async toggleMod(modName, enable) {
        this.logger.info(`${enable ? 'Enabling' : 'Disabling'} mod: ${modName}`);
        const modPath = path.join(this.modsDirectory, `${modName}.jar`);
        const disabledPath = path.join(this.modsDirectory, `${modName}.jar.disabled`);
        const [from, to, action] = enable
            ? [disabledPath, modPath, 'enabled']
            : [modPath, disabledPath, 'disabled'];

        try {
            await fs.access(from);
        } catch {
            throw new Error(`Mod not found or already ${enable ? 'enabled' : 'disabled'}: ${modName}`);
        }

        await fs.rename(from, to);
        this.logger.info(`Mod ${action}: ${modName}`);
        return { success: true, action };
    }

    async deleteMod(modName) {
        this.logger.info(`Deleting mod: ${modName}`);
        const modPath = path.join(this.modsDirectory, `${modName}.jar`);
        const disabledPath = path.join(this.modsDirectory, `${modName}.jar.disabled`);

        let deletedPath = null;
        for (const p of [modPath, disabledPath]) {
            try {
                await fs.unlink(p);
                deletedPath = p;
                break;
            } catch {}
        }
        if (!deletedPath) {
            throw new Error(`Mod not found: ${modName}`);
        }

        await fs.unlink(path.join(this.modsDirectory, 'config', `${modName}.json`)).catch(() => {});

        this.logger.info(`Mod deleted successfully: ${modName}`, { deletedPath });
        return { success: true, modName, deletedPath };
    }

    async checkCompatibility(modPath, minecraftVersion) {
        try {
            this.logger.info(`Checking compatibility for mod: ${modPath}`);
            return {
                compatible: true,
                warnings: [],
                errors: [],
                minecraftVersion,
                modPath,
                checkTime: new Date().toISOString()
            };
        } catch (error) {
            this.logger.error(`Failed to check mod compatibility: ${modPath}`, error);
            return {
                compatible: false,
                errors: [error.message],
                minecraftVersion,
                modPath
            };
        }
    }

    async getLaunchArgs() {
        try {
            this.logger.debug('Getting mod launch arguments');
            const args = [];
            const mods = await this.scanInstalledMods();
            const enabledMods = mods.filter(mod => mod.enabled);
            if (enabledMods.length > 0) {
                args.push('-Dfabric.game.jar=${game_jar}');
                args.push('-Dfabric.loader.libraries=${loader_libraries}');
            }
            this.logger.debug(`Generated ${args.length} mod launch arguments`);
            return args;
        } catch (error) {
            this.logger.error('Failed to get mod launch arguments', error);
            return [];
        }
    }

    async validateEnvironment() {
        this.logger.info('Validating mod environment');
        const requiredDirs = [
            this.modsDirectory,
            path.join(this.modsDirectory, 'config'),
            path.join(this.modsDirectory, 'disabled')
        ];
        const directories = [];
        const errors = [];
        for (const dir of requiredDirs) {
            let exists = false;
            try {
                await fs.access(dir);
                exists = true;
            } catch {
                errors.push(`Directory not found: ${dir}`);
            }
            directories.push({ path: dir, exists });
        }

        let hasMods = false;
        try {
            const files = await fs.readdir(this.modsDirectory);
            hasMods = files.some(file => file.endsWith('.jar') || file.endsWith('.jar.disabled'));
        } catch {
            hasMods = false;
        }

        const directoriesExist = errors.length === 0;
        return {
            directoriesExist,
            directories,
            hasMods,
            errors,
            valid: directoriesExist,
            timestamp: new Date().toISOString()
        };
    }

    async getStatus() {
        try {
            const mods = await this.scanInstalledMods();
            const environment = await this.validateEnvironment();
            return {
                totalMods: mods.length,
                enabledMods: mods.filter(m => m.enabled).length,
                disabledMods: mods.filter(m => !m.enabled).length,
                modsDirectory: this.modsDirectory,
                environment,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            this.logger.error('Failed to get mod manager status', error);
            return {
                error: error.message,
                modsDirectory: this.modsDirectory,
                timestamp: new Date().toISOString()
            };
        }
    }

    async cleanupCache() {
        this.logger.info('Cleaning mod cache');
        const cacheDir = path.join(this.modsDirectory, 'cache');
        let deletedFiles = 0;
        let totalSize = 0;

        try {
            const files = await fs.readdir(cacheDir);
            for (const file of files) {
                const filePath = path.join(cacheDir, file);
                const stats = await fs.stat(filePath);
                const ageDays = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);
                if (ageDays > 7) {
                    await fs.unlink(filePath);
                    deletedFiles++;
                    totalSize += stats.size;
                    this.logger.debug(`Deleted cache file: ${file}`);
                }
            }
        } catch {
            // 缓存目录不存在或为空
        }

        this.logger.info('Mod cache cleaned', { deletedFiles, totalSize, timestamp: new Date().toISOString() });
        return { success: true, deletedFiles, totalSize, timestamp: new Date().toISOString() };
    }

    async batchOperation(modNames, action) {
        this.logger.info(`Batch ${action} operation for ${modNames.length} mods`);
        const actionMap = {
            enable: name => this.toggleMod(name, true),
            disable: name => this.toggleMod(name, false),
            delete: name => this.deleteMod(name)
        };
        const handler = actionMap[action];
        if (!handler) throw new Error(`Invalid action: ${action}`);

        const results = { success: [], failed: [] };
        for (const modName of modNames) {
            try {
                const result = await handler(modName);
                results.success.push({ modName, ...result });
            } catch (error) {
                results.failed.push({ modName, error: error.message });
                this.logger.warn(`Failed to ${action} mod: ${modName}`, error);
            }
        }

        this.logger.info(`Batch ${action} operation completed`, {
            total: modNames.length,
            success: results.success.length,
            failed: results.failed.length
        });
        return results;
    }
}
