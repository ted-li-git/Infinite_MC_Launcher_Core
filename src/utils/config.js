import { promises as fs } from 'fs';
import path from 'path';

const CONFIG_FILENAME = 'launcher_config.json';
const DEFAULT_CONFIG = Object.freeze({
    lastProfile: null,
    preferences: {
        language: 'zh_cn',
        autoUpdate: false,
        enableMods: false,
        enableResourcePacks: false
    },
    savedServers: [],
    version: '1.0.0',
    createdAt: null,
    updatedAt: null
});

const cache = new Map();

export function getConfigPath(directory) {
    return path.join(directory, CONFIG_FILENAME);
}

export function getDefaultConfig() {
    const now = new Date().toISOString();
    return {
        ...DEFAULT_CONFIG,
        preferences: { ...DEFAULT_CONFIG.preferences },
        savedServers: [...DEFAULT_CONFIG.savedServers],
        createdAt: now,
        updatedAt: now
    };
}

export function loadConfig(directory, options = {}) {
    if (!directory) return getDefaultConfig();
    if (!options.forceRefresh && cache.has(directory)) return cache.get(directory);

    // 同步返回默认配置，真实文件由 ensureConfigLoaded 异步补齐（构造函数无法 await）
    const cached = getDefaultConfig();
    cache.set(directory, cached);

    _loadConfigAsync(directory).then(realConfig => {
        if (realConfig) cache.set(directory, realConfig);
    }).catch(() => {});

    return cached;
}

async function _loadConfigAsync(directory) {
    try {
        const content = await fs.readFile(getConfigPath(directory), 'utf8');
        const parsed = JSON.parse(content);
        return {
            ...getDefaultConfig(),
            ...parsed,
            preferences: {
                ...DEFAULT_CONFIG.preferences,
                ...(parsed.preferences || {})
            },
            savedServers: Array.isArray(parsed.savedServers) ? parsed.savedServers : []
        };
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error(`[config] Failed to load config from ${directory}: ${error.message}`);
        }
        return null;
    }
}

export async function ensureConfigLoaded(directory) {
    if (!directory) return getDefaultConfig();
    const realConfig = await _loadConfigAsync(directory);
    if (realConfig) {
        cache.set(directory, realConfig);
        return realConfig;
    }
    return cache.get(directory) || getDefaultConfig();
}

export async function saveConfig(directory, config) {
    if (!directory) throw new Error('Directory is required to save config');

    const toSave = { ...config, updatedAt: new Date().toISOString() };
    if (!toSave.createdAt) toSave.createdAt = toSave.updatedAt;
    cache.set(directory, toSave);

    // 原子写：先写 .tmp 再 rename（同卷内原子）
    const configPath = getConfigPath(directory);
    const tmpPath = `${configPath}.tmp`;
    const content = JSON.stringify(toSave, null, 2);

    try {
        await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(tmpPath, content, 'utf8');
        try {
            await fs.rename(tmpPath, configPath);
        } catch {
            // rename 失败（如目标被占用）退化为直接写
            await fs.writeFile(configPath, content, 'utf8');
            try { await fs.unlink(tmpPath); } catch {}
        }
    } catch (error) {
        try { await fs.unlink(tmpPath); } catch {}
        console.error(`[config] Failed to save config to ${directory}: ${error.message}`);
        throw error;
    }
}

export function clearConfigCache(directory) {
    if (directory) cache.delete(directory);
    else cache.clear();
}

export async function resetConfig(directory) {
    const fresh = getDefaultConfig();
    await saveConfig(directory, fresh);
    return fresh;
}

export default {
    getConfigPath,
    getDefaultConfig,
    loadConfig,
    ensureConfigLoaded,
    saveConfig,
    clearConfigCache,
    resetConfig
};
