import { execFile } from 'child_process';
import { promisify } from 'util';
import { access, readdir } from 'fs/promises';
import { join } from 'path';
import { platform } from 'os';

const execFileAsync = promisify(execFile);
const isWin = platform() === 'win32';
const isMac = platform() === 'darwin';

let detectedJavaVersions = null;

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
