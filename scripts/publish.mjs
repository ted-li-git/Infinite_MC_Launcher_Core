/**
 * Infinite MC Launcher Core - GitHub Packages 发布脚本
 * 用法:
 *   node scripts/publish.mjs patch   // 1.0.0 -> 1.0.1
 *   node scripts/publish.mjs minor   // 1.0.0 -> 1.1.0
 *   node scripts/publish.mjs major   // 1.0.0 -> 2.0.0
 *   node scripts/publish.mjs 1.2.3   // 指定版本
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const pkgPath = resolve(root, 'package.json');
const changelogPath = resolve(root, 'CHANGELOG.md');

// ── 工具函数 ──────────────────────────────────────

function readPkg() {
    return JSON.parse(readFileSync(pkgPath, 'utf-8'));
}

function writePkg(pkg) {
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 4) + '\n');
}

function bumpVersion(current, type) {
    const [major, minor, patch] = current.split('.').map(Number);
    if (type === 'major') return `${major + 1}.0.0`;
    if (type === 'minor') return `${major}.${minor + 1}.0`;
    if (type === 'patch') return `${major}.${minor}.${patch + 1}`;
    // 直接指定版本号
    if (/^\d+\.\d+\.\d+$/.test(type)) return type;
    throw new Error(`无效的版本类型: ${type}（可用: patch / minor / major / x.y.z）`);
}

function run(cmd, label) {
    console.log(`\n▶ ${label || cmd}`);
    execSync(cmd, { cwd: root, stdio: 'inherit' });
}

function getGitLog(since) {
    const cmd = since
        ? `git log ${since}..HEAD --pretty=format:"%s" --no-merges`
        : `git log --pretty=format:"%s" --no-merges -20`;
    return execSync(cmd, { cwd: root, encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
}

function categorizeCommits(commits) {
    const groups = { feat: [], fix: [], refactor: [], docs: [], chore: [], other: [] };
    const map = { feat: '新功能', fix: '修复', refactor: '重构', docs: '文档', chore: '杂项' };
    for (const msg of commits) {
        const m = msg.match(/^(feat|fix|refactor|docs|chore)(?:\(([^)]+)\))?:\s*(.+)/);
        if (m) {
            const [, type, scope, desc] = m;
            const entry = scope ? `[${scope}] ${desc}` : desc;
            groups[type].push(entry);
        } else {
            groups.other.push(msg);
        }
    }
    return { groups, map };
}

function generateChangelog(version, commits) {
    const { groups, map } = categorizeCommits(commits);
    const date = new Date().toISOString().split('T')[0];
    let section = `## v${version} (${date})\n\n`;

    let hasContent = false;
    for (const [type, label] of Object.entries(map)) {
        if (groups[type].length === 0) continue;
        hasContent = true;
        section += `### ${label}\n`;
        for (const item of groups[type]) {
            section += `- ${item}\n`;
        }
        section += '\n';
    }
    if (groups.other.length > 0) {
        hasContent = true;
        section += `### 其他\n`;
        for (const item of groups.other) {
            section += `- ${item}\n`;
        }
        section += '\n';
    }
    if (!hasContent) {
        section += `- 版本发布\n\n`;
    }
    return section;
}

function prependChangelog(content) {
    let existing = '';
    if (existsSync(changelogPath)) {
        existing = readFileSync(changelogPath, 'utf-8');
    } else {
        existing = '# Changelog\n\n';
    }
    // 在标题后插入新内容
    const headerEnd = existing.indexOf('\n\n');
    if (headerEnd === -1) {
        writeFileSync(changelogPath, `# Changelog\n\n${content}${existing}`);
    } else {
        const header = existing.substring(0, headerEnd + 2);
        const rest = existing.substring(headerEnd + 2);
        writeFileSync(changelogPath, `${header}${content}${rest}`);
    }
}

// ── 主流程 ────────────────────────────────────────

const args = process.argv.slice(2);
const bumpType = args[0] || 'patch';

console.log('═══════════════════════════════════════');
console.log('  Infinite MC Launcher Core - 发布脚本');
console.log('═══════════════════════════════════════');

// 1. 检查工作区干净
const status = execSync('git status --porcelain', { cwd: root, encoding: 'utf-8' }).trim();
if (status) {
    console.error('\n❌ 工作区不干净，请先提交或 stash：');
    console.error(status);
    process.exit(1);
}

// 2. 检查 GitHub Packages 认证
try {
    execSync('npm whoami --registry=https://npm.pkg.github.com', { cwd: root, stdio: 'pipe' });
} catch {
    console.error('\n❌ 未认证 GitHub Packages，请运行:');
    console.error('   npm config set //npm.pkg.github.com/:_authToken <你的GitHub_Token>');
    process.exit(1);
}

// 3. 版本递增
const pkg = readPkg();
const oldVersion = pkg.version;
const newVersion = bumpVersion(oldVersion, bumpType);
console.log(`\n📦 版本: ${oldVersion} → ${newVersion}`);

pkg.version = newVersion;
writePkg(pkg);

// 4. 生成 changelog
const lastTag = (() => {
    try {
        return execSync('git describe --tags --abbrev=0', { cwd: root, encoding: 'utf-8' }).trim();
    } catch {
        return null;
    }
})();
const commits = getGitLog(lastTag);
const changelogSection = generateChangelog(newVersion, commits);
prependChangelog(changelogSection);
console.log(`📝 已更新 CHANGELOG.md`);

// 5. 构建
run('npm run build', '构建 dist/');

// 6. git 提交
run(`git add package.json CHANGELOG.md`, '暂存变更');
run(`git commit -m "release: v${newVersion}"`, `提交 v${newVersion}`);
run(`git tag v${newVersion}`, `打标签 v${newVersion}`);

// 7. 推送
run('git push && git push --tags', '推送 git');

// 8. 发布到 GitHub Packages
run('npm publish', '发布到 GitHub Packages');

console.log('\n═══════════════════════════════════════');
console.log(`  ✅ v${newVersion} 发布成功！`);
console.log(`  📦 https://github.com/ted-li-git/Infinite_MC_Launcher_Core/pkgs/npm/infinite-mc-launcher-core`);
console.log('═══════════════════════════════════════\n');
