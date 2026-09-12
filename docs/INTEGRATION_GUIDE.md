# Infinite MC Launcher Core 集成指南

## 概述

Infinite MC Launcher Core 是一个功能完整的 Minecraft 启动模块，支持离线登录、Microsoft 正版登录、第三方 Yggdrasil 登录（LittleSkin / BlessingSkin / UnionPass / 自定义皮肤站），以及客户端直连服务器、Mod 管理、资源下载、完整性校验等。本指南将帮助你快速集成到你的项目中。

当前版本：`v1.0.6-beta.4`（支持 Minecraft 1.0 ~ 1.21.11 全版本 + 快照，原版 / Forge / NeoForge / Fabric）

## 集成方式

### 1. 通过 GitHub 安装（推荐）

```bash
npm install github:ted-li-git/Infinite_MC_Launcher_Core
# 或指定 tag
npm install github:ted-li-git/Infinite_MC_Launcher_Core#v1.0.6-beta.4
```

```javascript
import { MCLauncher } from 'infinite-mc-core';

const launcher = new MCLauncher({
    gameDirectory: './minecraft',
    version: '1.20.1'
});
```

### 2. 通过 Git 子模块集成

```bash
# 添加为子模块
git submodule add https://github.com/ted-li-git/Infinite_MC_Launcher_Core.git libs/infinite-mc-core

# 更新子模块
git submodule update --init --recursive
```

### 3. 通过 CDN 使用（UMD）

构建产物 `dist/mc-launcher.min.js` 可直接用 `<script>` 标签引入：

```html
<script src="./dist/mc-launcher.min.js"></script>
<script>
    const { MCLauncher } = window.MCLauncherCore;

    const launcher = new MCLauncher({
        gameDirectory: './minecraft',
        version: '1.20.1'
    });
</script>
```

## 快速开始

### 基本使用（离线登录）

```javascript
import { MCLauncher } from 'infinite-mc-core';

async function basicLaunch() {
    // 1. 创建启动器
    const launcher = new MCLauncher({
        gameDirectory: './minecraft',
        javaPath: 'java',
        version: '1.20.1',
        memory: '2G'
    });

    // 2. 离线登录
    await launcher.offlineLogin('MyPlayerName');

    // 3. 安装游戏（如果需要）
    await launcher.installVersion('1.20.1');

    // 4. 启动游戏
    const gameProcess = await launcher.launch();

    // 5. 监听游戏进程
    gameProcess.on('close', (code) => {
        console.log(`游戏退出，代码: ${code}`);
    });
}
```

### 一键启动（推荐）：quickLaunch

`quickLaunch()` 把 **Java 检测 → 版本安装 → 完整性校验 → 认证 → 启动** 全部合并成一步调用，是最简单的启动方式：

```javascript
import { MCLauncher } from 'infinite-mc-core';

async function oneClickLaunch() {
    const launcher = new MCLauncher({
        gameDirectory: './minecraft',
        version: '1.20.1',
        memory: '4G'
    });

    // authType = offline | microsoft | mojang | third-party | littleskin
    const { process: gameProcess, profile } = await launcher.quickLaunch({
        authType: 'offline',
        username: 'MyPlayer',
        // 客户端直连服务器（可选）
        // server: 'mc.hypixel.net',
        // serverPort: 25565,
    });

    console.log('已登录：', profile.username);
    gameProcess.on('close', (code) => console.log('退出码:', code));
}
```

### Microsoft 正版登录

> 注意：MicrosoftAuth 需要先 `new MicrosoftAuth()`，再调用其方法；`launcher.microsoftAuth` 属性**不存在**，请使用 `new` 方式或直接用 `microsoftLogin()`。

```javascript
import { MCLauncher, MicrosoftAuth } from 'infinite-mc-core';

async function microsoftLogin() {
    const launcher = new MCLauncher({
        gameDirectory: './minecraft'
    });

    // 方法1：设备流（需要用户在浏览器打开链接输入代码）
    const msAuth = new MicrosoftAuth();
    const deviceFlow = await msAuth.startDeviceFlow();
    console.log('请访问:', deviceFlow.verificationUriComplete);
    console.log('设备代码:', deviceFlow.userCode);

    // 等待用户授权完成
    const profile = await launcher.microsoftLogin();

    // 方法2：使用现有 accessToken
    // const profile = await launcher.microsoftLogin('existing_access_token');
}
```

### 第三方登录（LittleSkin / BlessingSkin / UnionPass）

核心库内置了 3 个常用皮肤站预设，也支持完全自定义 authBase / profileBase。

```javascript
import { MCLauncher, ThirdPartyAuth, PRESET_SITES } from 'infinite-mc-core';

async function littleSkinLogin() {
    const launcher = new MCLauncher({ gameDirectory: './minecraft', version: '1.20.1' });

    // ===== 方式 A：账密登录（LittleSkin 预设） =====
    const profile1 = await launcher.thirdPartyLogin({
        preset: 'littleskin',        // 内置预设：littleskin | blessskin | unionpass
        username: 'my_account',
        password: 'my_password',
    });

    // ===== 方式 B：用已有 accessToken 登录（自定义皮肤站） =====
    const profile2 = await launcher.thirdPartyLogin({
        authBase: 'https://your-skin-site.com/api/yggdrasil',   // Yggdrasil 认证地址
        profileBase: 'https://your-skin-site.com/api/yggdrasil',// sessionserver 地址（可省略，默认=authBase）
        siteName: '我的皮肤站',
        username: 'Player',        // 必须和 accessToken 对应账号一致
        accessToken: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        clientToken: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',         // 可选，省略会随机生成
    });

    // ===== 方式 C：使用 quickLaunch 一步启动（推荐） =====
    await launcher.quickLaunch({
        authType: 'littleskin',    // 或 'third-party' + 自己填 authBase
        username: 'my_account',
        password: 'my_password',
        // preset: 'blessskin',     // third-party 模式下指定预设
        // authBase: '...',         // 或自定义地址
    });
}
```

内置预设列表（`PRESET_SITES`）：

| preset 值 | 站点 | authBase |
|---|---|---|
| `littleskin` | LittleSkin | `https://mcskin.littleservice.cn/api/yggdrasil` |
| `blessskin` | BlessingSkin | `https://skin.prinzeugen.net/api/yggdrasil` |
| `unionpass` | UnionPass | `https://auth.mc-user.com:233` |

### 客户端直连服务器

启动客户端时自动跳过主菜单，直接进入指定服务器（使用 Minecraft 原生 `--server` / `--port` 参数）：

```javascript
import { MCLauncher } from 'infinite-mc-core';

const launcher = new MCLauncher({
    gameDirectory: './minecraft',
    version: '1.20.1',
    server: 'mc.hypixel.net',       // 服务器地址
    serverPort: 25565,              // 可选，默认 25565
});

await launcher.offlineLogin('Player');
const proc = await launcher.launch(); // 启动后会自动连服务器
```

## 核心功能

### 认证模块

#### 离线登录

```javascript
// 基本离线登录（生成随机 UUID）
const profile = await launcher.offlineLogin('PlayerName');

// 完整配置文件创建（离线认证工具类）
const fullProfile = await launcher.offlineAuth.createFullProfile('PlayerName', {
    language: 'zh_cn',
    renderDistance: 12,
    difficulty: 'hard'
});
```

#### Microsoft 登录

```javascript
import { MicrosoftAuth } from 'infinite-mc-core';

// 设备流认证
const msAuth = new MicrosoftAuth();
const deviceFlow = await msAuth.startDeviceFlow();

// 检查授权状态（轮询）
const tokenData = await msAuth.checkDeviceAuthorization(deviceFlow.deviceCode);

// 通过 launcher 完成 Microsoft 全链路认证
const profile = await launcher.microsoftLogin();
```

#### 第三方登录（Yggdrasil）

```javascript
import { ThirdPartyAuth } from 'infinite-mc-core';

// 直接实例化 ThirdPartyAuth 进行细粒度操作
const tpAuth = new ThirdPartyAuth({
    preset: 'littleskin',
    clientToken: '可选的32位hex'
});

// 账密
const authResult = await tpAuth.authenticate({ username: 'xxx', password: 'yyy' });

// 校验 token 是否有效
const valid = await tpAuth.validate(authResult.accessToken, authResult.clientToken);

// 刷新 token
const refreshed = await tpAuth.refresh(authResult.accessToken, authResult.clientToken);

// 登出（账密）
await tpAuth.signout('xxx', 'yyy');

// 失效 token
await tpAuth.invalidate(authResult.accessToken, authResult.clientToken);
```

### 游戏管理

#### 版本管理

```javascript
// 获取所有可用版本
const versions = await launcher.getAvailableVersions();

// 获取最新正式版/快照
const latestRelease = await launcher.versionManager.getLatestVersion('release');
const latestSnapshot = await launcher.versionManager.getLatestVersion('snapshot');

// 安装特定版本（自动下载 client.jar + libraries + assets）
await launcher.installVersion('1.20.1');

// 安装 Forge/NeoForge 等加载器版本（版本名写 xxx-Forge_yyy）
await launcher.installVersion('1.20.1-Forge_47.2.0');

// ✨ 安装 Fabric（v1.0.6-beta.4 起自动下载，无需 installer）
await launcher.installVersion('1.20.1-Fabric');                // 最新稳定 Loader
await launcher.installVersion('1.20.1-Fabric_0.16.10');       // 指定 Loader
await launcher.installVersion('fabric-loader-0.16.10-1.20.1'); // 官方标准名（Loader 在前）

// 检查版本是否已安装
const isInstalled = await launcher.versionManager.isInstalled('1.20.1');

// 查询某 MC 版本可用的 Fabric Loader 列表
const fabricLoaders = await launcher.versionManager.getFabricLoaders('1.20.1');
// → [{ version: '0.16.10', stable: true }, ...]
```

**Fabric 版本名三种写法：**

| 写法 | 示例 | 说明 |
|---|---|---|
| 简写（自动 Loader） | `1.20.1-Fabric` | 自动选最新稳定版 Loader，最省心 |
| 简写（指定 Loader） | `1.20.1-Fabric_0.16.10` | 锁定 Loader 版本 |
| 官方标准格式 | `fabric-loader-0.16.10-1.20.1` | ⚠️ Loader 版本在前、游戏版本在后 |

Fabric 通过 [Meta API](https://meta.fabricmc.net/) 自动完成：拉取 profile JSON → 落盘版本目录 → 自动安装父原版 → 下载 fabric-loader/intermediary/mixin/asm 等库 → 启动时合并父版本并把 mainClass 换成 `KnotClient`。支持 MC **1.14+**（含快照）。

#### 游戏启动

```javascript
// 基础启动
const gameProcess = await launcher.launch();

// 自定义启动参数
const gameProcess = await launcher.launch({
    windowWidth: 1280,
    windowHeight: 720,
    memory: '4G',
    javaArgs: '-XX:+UseG1GC -XX:MaxGCPauseMillis=50',
    server: 'play.example.com',      // 启动后直连
    serverPort: 25565,
});
```

#### 完整性校验

启动前自动检查 JSON、client.jar、所有 libraries，缺失或损坏则自动重新下载：

```javascript
const ok = await launcher.checkIntegrity('1.20.1');
console.log('完整性:', ok ? '通过' : '已修复');
```

### Mod 管理

```javascript
// 扫描已安装的 mod
const mods = await launcher.modManager.scanInstalledMods();

// 安装 mod
await launcher.modManager.installMod('./path/to/mod.jar', { overwrite: true });

// 启用/禁用 mod
await launcher.modManager.toggleMod('fabric-api', true);   // 启用
await launcher.modManager.toggleMod('optifine', false);    // 禁用

// 批量操作
await launcher.modManager.batchOperation(['mod1', 'mod2'], 'disable');
```

## 配置选项

### MCLauncher 构造参数

```javascript
const options = {
    // ===== 必需 =====
    gameDirectory: './minecraft',          // 游戏根目录（libraries/assets 放这里）

    // ===== 常用 =====
    javaPath: 'java',                     // Java 可执行文件路径（省略则自动检测）
    version: 'latest',                    // 游戏版本（默认 latest release）
    memory: '2G',                         // 分配内存（默认 2G）
    windowWidth: 854,                     // 窗口宽度
    windowHeight: 480,                    // 窗口高度
    instanceDir: './instance_skyblock',   // 独立实例目录（mods/saves/config 单独放）

    // ===== 认证 =====
    authType: 'offline',                  // offline / microsoft / mojang / third-party / littleskin
    server: 'mc.example.com',             // 启动后直连服务器
    serverPort: 25565,                    // 服务器端口

    // ===== 开关 =====
    enableMods: true,                     // 是否启用 mod 支持
    enableDebug: false,                   // 调试模式（额外日志）
    noLegacyFix: false,                   // 禁用远古版本兼容性补丁

    // ===== 高级 =====
    javaArgs: '-XX:+UseG1GC',             // 自定义 JVM 参数
    customLauncherName: 'My Launcher',    // 自定义启动器名称
    customLauncherVersion: '1.0.0',       // 自定义启动器版本
    extraJVMArgs: [],                     // 额外 JVM 参数数组
    extraMCArgs: [],                      // 额外 Minecraft 参数数组
};
```

## 错误处理

```javascript
try {
    await launcher.quickLaunch({
        authType: 'littleskin',
        username: 'Player',
        password: 'xxx'
    });
} catch (error) {
    console.error('启动失败:', error.message);

    if (error.message.includes('authentication') || error.code === 'AUTH_FAILED') {
        console.error('认证失败，请检查账号密码 / token 有效性');
    } else if (error.message.includes('download') || error.code === 'DOWNLOAD_FAILED') {
        console.error('下载失败，请检查网络连接或代理');
    } else if (error.message.includes('java') || error.code === 'JAVA_NOT_FOUND') {
        console.error('Java 环境问题，请检查 Java 安装或手动指定 javaPath');
    } else if (error.code === 'VERSION_NOT_FOUND') {
        console.error('版本不存在或未安装');
    } else {
        console.error('未知错误:', error);
    }
}
```

## 事件监听

```javascript
const { process: gameProcess } = await launcher.quickLaunch({ authType: 'offline', username: 'P' });

// 标准输出 / 错误输出
gameProcess.stdout.on('data', (data) => {
    console.log('[游戏输出]', data.toString());
});
gameProcess.stderr.on('data', (data) => {
    console.error('[游戏错误]', data.toString());
});

// 进程事件
gameProcess.on('close', (code) => {
    console.log(`游戏进程退出，代码: ${code}`);
});
gameProcess.on('error', (error) => {
    console.error('进程错误:', error);
});
```

## 进阶用法

### 独立实例目录（多版本共存）

`instanceDir` 让 mods/saves/config 单独放在实例目录，而 libraries/assets 共享：

```javascript
const launcher = new MCLauncher({
    gameDirectory: './.minecraft',            // 共享资源（libraries / assets / versions）
    instanceDir: './instances/skyfactory_4',  // 本实例独有（mods / saves / config / resourcepacks）
    version: '1.20.1-Forge_47.2.0',
});
await launcher.offlineLogin('Player');
await launcher.launch();
```

### 自定义认证提供者

```javascript
import { MCLauncher, OfflineAuth } from 'infinite-mc-core';

class CustomAuth extends OfflineAuth {
    async authenticate(username) {
        // 自定义认证逻辑（调用自己的后端）
        const uuid = this.generateCustomUUID(username);
        return {
            type: 'custom',
            username,
            uuid,
            displayName: username,
            accessToken: 'custom-token-' + Date.now(),
            customProperty: 'value'
        };
    }

    generateCustomUUID(username) {
        // 自定义 UUID 生成逻辑
        return '00000000-0000-0000-0000-' + username.padEnd(12, '0').slice(0, 12);
    }
}

const launcher = new MCLauncher();
launcher.auth = new CustomAuth();
```

### 集成到 GUI 应用（Electron 示例）

```javascript
const { app, BrowserWindow, ipcMain } = require('electron');
const { MCLauncher } = require('infinite-mc-core');

let launcher;

ipcMain.handle('launch-game', async (event, options) => {
    launcher = new MCLauncher(options);

    try {
        // 推荐用 quickLaunch 一步到位
        const { process: proc, profile } = await launcher.quickLaunch(options);
        return { success: true, pid: proc.pid, profile };
    } catch (error) {
        return { success: false, error: error.message, code: error.code };
    }
});

ipcMain.handle('stop-game', () => {
    if (launcher && launcher.gameProcess) {
        launcher.gameProcess.kill();
    }
});
```

## 最佳实践

### 1. 错误处理

```javascript
try {
    await launcher.quickLaunch({ ...opts });
} catch (error) {
    // 记录错误日志
    console.error('[Launcher] 启动失败', error);

    // 恢复状态（清理临时文件）
    if (launcher.cleanup) await launcher.cleanup();
}
```

### 2. Java 版本自动检测

核心库会按 Minecraft 版本自动推断所需 Java 版本并扫描常见安装目录：

```javascript
import { JavaDetector, getRequiredJavaVersion } from 'infinite-mc-core';

const required = getRequiredJavaVersion('1.21.1');     // 返回 21（主版本号）
const required2 = getRequiredJavaVersion('26w4a');     // 快照也支持

// 手动检测
const detector = new JavaDetector();
const javaHome = await detector.detect(21);            // 找 Java 21
```

### 3. 配置持久化

```javascript
// 保存用户配置
function saveUserConfig(config) {
    require('fs').writeFileSync('./config.json', JSON.stringify(config, null, 2));
}

// 加载（含默认值回退）
function loadUserConfig() {
    try {
        return JSON.parse(require('fs').readFileSync('./config.json', 'utf8'));
    } catch {
        return {
            gameDirectory: './.minecraft',
            version: '1.20.1',
            memory: '2G',
            authType: 'offline',
        };
    }
}
```

## 常见问题

### Q1: 如何解决 "Java not found" 错误？

A: 确保正确安装并手动指定 javaPath：

```javascript
// Windows
javaPath: 'C:\\Program Files\\Java\\jdk-17\\bin\\java.exe'
// 或 Microsoft OpenJDK：
javaPath: 'C:\\Program Files\\Microsoft\\jdk-21.0.3.9-hotspot\\bin\\java.exe'

// Mac/Linux
javaPath: '/usr/bin/java'
// 或 Semeru (IBM OpenJ9)：
javaPath: '/usr/lib/jvm/semeru-17-openj9-amd64/bin/java'
```

### Q2: 如何处理网络下载失败？

A: 重试 + 断点续传（asset 下载默认 8 并发并跳过已存在文件）：

```javascript
const launcher = new MCLauncher({
    gameDirectory: './minecraft',
    // 如需 HTTP 代理可在系统环境变量设置 HTTP_PROXY / HTTPS_PROXY
});
```

### Q3: 如何支持旧版本 Minecraft（1.7.10、1.12.2、1.0 等）？

A: 核心库会自动根据版本号推断 Java。如果需要手动指定：

```javascript
const launcher = new MCLauncher({
    version: '1.7.10',
    javaPath: 'java8',   // 1.0 ~ 1.16.5 建议 Java 8
});

const launcher2 = new MCLauncher({
    version: '1.12.2-Forge_14.23.5.2860',
    javaPath: 'java8',
});
```

### Q4: 第三方皮肤站登录失败怎么办？

A: 按顺序排查：

1. **账密是否正确**：先去皮肤站网页登录确认账号密码。
2. **authBase 地址**：必须带 `/api/yggdrasil`（BlessingSkin 标准路径），末尾不要多斜杠。
3. **HTTPS**：大部分皮肤站要求 HTTPS，不要写 HTTP。
4. **LittleSkin 专用**：如果是 LittleSkin，直接 `preset: 'littleskin'` 即可，不要手动填地址。
5. **UnionPass**：认证和 profile 都是同一个 host（`https://auth.mc-user.com:233`），不需要加路径。

### Q5: quickLaunch 和自己手动调用 offlineLogin + installVersion + launch 有什么区别？

A: quickLaunch 多做了：**自动 Java 检测**、**版本安装前检查**、**完整性校验修复**、**根据 authType 自动选择登录方法**、**异常上下文封装**。一般情况推荐用 quickLaunch。

### Q6: Fabric 和 Forge 什么区别？怎么选？Fabric 支持 1.12.2 吗？

A:
- **Fabric**：轻量、更新快（快照版当天就能用）、API 简洁，适合新版本和快照；Mod 需要下载标注 Fabric 的版本，且大多数依赖 **Fabric API** 前置。
- **Forge/NeoForge**：功能重、Mod 生态庞大（尤其老版本），1.12.2/1.7.10 等经典整合包基本只有 Forge。
- Fabric 官方只支持 **Minecraft 1.14+**；1.12.2 及更早请用 Forge。
- 两者 Mod 互不通用，版本名也不同：Fabric 写 `1.20.1-Fabric`，Forge 写 `1.20.1-Forge_47.x`。

## 性能优化

### 1. 缓存策略

- 版本 JSON 默认内存缓存（`Map`），避免重复解析。
- Java 检测结果缓存到 `~/.infinite-mc/java_cache.json`（24 小时 TTL）。
- Asset 下载默认跳过已存在文件。

```javascript
// 清理资源缓存
await launcher.assetManager.clearCache();
```

### 2. 完整性校验并行化

`checkIntegrity()` 内部是 16 并发批量校验，先比较文件大小，只有 size 匹配才做 SHA1，所以对大型版本（>100MB libraries）也很快。

## 安全注意事项

1. **第三方 accessToken / 密码**：不要硬编码或明文写入日志，使用系统凭据管理器或加密存储。
2. **Microsoft 令牌**：`refresh_token` 可长期使用，务必加密保存。
3. **输入验证**：`version`、`server`、`javaPath` 等用户可控参数要做白名单或路径合法性校验。
4. **沙盒目录**：如果游戏目录在受保护路径（如 `%USERPROFILE%\AppData\Local\Packages\Microsoft.MinecraftUWP_8wekyb3d8bbwe`），请确保运行时具有写权限。

## 扩展开发

### 添加新的第三方皮肤站预设

在 `src/auth/thirdparty.js` 的 `PRESET_SITES` 中新增条目即可：

```javascript
// 内置预设结构示例：
{
  littleskin: {
    authBase: 'https://mcskin.littleservice.cn/api/yggdrasil',
    profileBase: 'https://mcskin.littleservice.cn/api/yggdrasil',
    siteName: 'LittleSkin',
  }
}
```

## 支持与贡献

- 报告问题：[GitHub Issues](https://github.com/ted-li-git/Infinite_MC_Launcher_Core/issues)
- 贡献代码：提交 Pull Request
- 文档改进：更新仓库中的 `*.md` 文件
- 功能建议：提交 Feature Request

## 许可证

MIT License — 查看 LICENSE 文件了解详情。
