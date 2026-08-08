import { execFile } from 'child_process';
import { promisify } from 'util';
import { access, readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { platform, homedir } from 'os';

const execFileAsync = promisify(execFile);
const isWin = platform() === 'win32';
const isMac = platform() === 'darwin';

let detectedJavaVersions = null;
const CACHE_FILE = join(homedir(), '.infinite-mc', 'java_cache.json');
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

const SEARCH_DIRS = isWin ? [
    'C:\\Program Files\\Java',
    'C:\\Program Files (x86)\\Java',
    'C:\\Program Files\\Microsoft',
    'C:\\Program Files\\Eclipse Adoptium',
    'C:\\Program Files\\Amazon Corretto',
    'C:\\Program Files\\Zulu',
    'C:\\Program Files\\BellSoft',
    'C:\\Program Files\\GraalVM'
] : isMac ? ['/Library/Java/JavaVirtualMachines'] : ['/usr/lib/jvm', '/usr/java'];

function javaPathInDir(searchDir, entry) {
    if (isWin) return join(searchDir, entry, 'bin', 'java.exe');
    if (isMac) return join(searchDir, entry, 'Contents', 'Home', 'bin', 'java');
    return join(searchDir, entry, 'bin', 'java');
}

export async function getJavaVersion(javaPath) {
    try {
        const { stderr, stdout } = await execFileAsync(javaPath, ['-version']);
        const output = (stderr || stdout).toString();
        // Java 8: version "1.8.0_421"；Java 9+: version "17.0.1"
        const m = /version "(?:1\.)?(\d+)/.exec(output);
        if (m) return parseInt(m[1]);
    } catch {}
    return null;
}

export async function detectJavaVersions(forceRefresh = false) {
    if (detectedJavaVersions && !forceRefresh) return detectedJavaVersions;

    // 尝试从文件缓存读取
    if (!forceRefresh) {
        try {
            const cache = JSON.parse(await readFile(CACHE_FILE, 'utf8'));
            if (cache.timestamp && Date.now() - cache.timestamp < CACHE_TTL) {
                // 验证缓存中的路径仍然存在
                const valid = await Promise.all(
                    cache.versions.map(async j => {
                        try { await access(j.path); return j; } catch { return null; }
                    })
                );
                detectedJavaVersions = valid.filter(Boolean);
                if (detectedJavaVersions.length > 0) return detectedJavaVersions;
            }
        } catch {}
    }

    const results = [];
    const checked = new Set();

    // 1. PATH 中的 java
    const pathJava = isWin ? 'java.exe' : 'java';
    const pathVersion = await getJavaVersion(pathJava);
    if (pathVersion) {
        results.push({ path: pathJava, version: pathVersion });
        checked.add(pathJava);
    }

    // 2. 常见安装路径
    for (const dir of SEARCH_DIRS) {
        try {
            for (const entry of await readdir(dir)) {
                const javaPath = javaPathInDir(dir, entry);
                if (checked.has(javaPath)) continue;
                try {
                    await access(javaPath);
                    const version = await getJavaVersion(javaPath);
                    if (version) {
                        results.push({ path: javaPath, version });
                        checked.add(javaPath);
                    }
                } catch {}
            }
        } catch {}
    }

    detectedJavaVersions = results;

    // 写入文件缓存
    try {
        await mkdir(dirname(CACHE_FILE), { recursive: true });
        await writeFile(CACHE_FILE, JSON.stringify({ timestamp: Date.now(), versions: results }));
    } catch {}

    return results;
}

// 策略：优先完全匹配 → 找 >= 要求的最低版本（避免高版本跑老游戏）
export async function findJava(requiredVersion = 8, options = {}) {
    const versions = await detectJavaVersions();

    const exact = versions.find(j => j.version === requiredVersion);
    if (exact) return exact.path;

    if (!options.exact) {
        const higher = versions
            .filter(j => j.version >= requiredVersion)
            .sort((a, b) => a.version - b.version);
        if (higher.length > 0) return higher[0].path;
    }

    return null;
}

export function clearJavaCache() {
    detectedJavaVersions = null;
}

export default { getJavaVersion, detectJavaVersions, findJava, clearJavaCache };
