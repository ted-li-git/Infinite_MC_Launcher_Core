# Infinite MC Launcher Core API 文档

> v1.0.5-beta.3 | 提供「一键启动 / 版本管理 / 5 种认证 / Java 自动检测 / Mod 管理 / 资源下载 / 日志」完整 API

```
包名：@ted-li-git/infinite-mc-launcher-core
入口：src/index.js
产物：dist/mc-launcher.js (CJS) / dist/mc-launcher.esm.js (ESM) / dist/mc-launcher.min.js (UMD)
```

---

## 快速开始（10 行代码启动游戏）

```javascript
import { MCLauncher } from './src/index.js';
// 或从 npm 包：import { MCLauncher } from '@ted-li-git/infinite-mc-launcher-core';

const launcher = new MCLauncher({
    gameDirectory: './minecraft',
    enableDebug: true
});

// 一键启动：认证 → 安装版本 → 完整性检查 → Java 检测 → 参数生成 → 启动
const proc = await launcher.quickLaunch({
    version: '1.20.1',
    username: 'Player1',
    authType: 'offline',     // offline / microsoft / mojang / third-party / littleskin
    memory: '2G'
});

proc.on('close', (code) => {
    console.log(`游戏退出，code=${code}`);
    launcher.cleanup();
});
```

---

## 一、MCLauncher（核心类）

### 构造函数 `new MCLauncher(options)`

```javascript
const launcher = new MCLauncher({ /* options */ });
```

| 参数 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `gameDirectory` | string | `'./minecraft'` | .minecraft 根目录（libraries/assets/versions 共享） |
| `instanceDir` | string | `null` | 独立实例目录（mods/saves/config 独立，libraries 共享） |
| `javaPath` | string | `'java'` | Java 可执行路径，不指定时自动检测 |
| `version` | string | `'latest'` | 默认游戏版本 |
| `memory` | string | `'2G'` | JVM 最大内存（如 `'512M'`/`'4G'`） |
| `windowWidth` | number | `854` | 窗口宽度像素 |
| `windowHeight` | number | `480` | 窗口高度像素 |
| `enableMods` | boolean | `false` | 是否启用 Mod 管理参数拼接 |
| `enableDebug` | boolean | `false` | 是否启用 DEBUG 级别日志 |
| `logLevel` | string | `null` | 自定义日志级别（`ERROR`/`WARN`/`INFO`/`DEBUG`） |
| `consoleLog` | boolean | `false` | 是否同时输出到控制台（默认只写文件） |
| `logFile` | string | `null` | 日志文件路径（默认 `<gameDir>/logs/launcher.log`） |
| `server` | string | `undefined` | 启动后自动连接的服务器主机 |
| `serverPort` | number | `undefined` | 服务器端口（默认 25565，仅当 `server` 指定时有效） |

### 实例属性（只读）

```javascript
launcher.versionManager;  // VersionManager 实例
launcher.assetManager;    // AssetManager 实例
launcher.modManager;      // ModManager 实例
launcher.config;          // 持久化配置（含 lastProfile）
launcher.profile;         // 当前登录用户 Profile（未登录=null）
launcher.auth;            // 当前认证器实例
launcher.logger;          // Logger 实例（带 onLog 事件）
launcher.options;         // 当前启动器选项（可随时修改）
```

### 实例方法

---

#### 🔑 认证相关

##### `offlineLogin(username) → Promise<Profile>`

离线登录，生成 Offline UUID（与 Java `UUID.nameUUIDFromBytes("OfflinePlayer:<name>")` 一致）

```javascript
const profile = await launcher.offlineLogin('Player1');
```

##### `microsoftLogin(accessToken?) → Promise<Profile>`

微软账户。传 `accessToken` 直接走 Xbox/XSTS；不传则内部自动启动 Device Flow 设备码。

```javascript
// 方式一：已有 token
await launcher.microsoftLogin('your_ms_access_token');

// 方式二：自动设备码（需要 UI 引导用户访问 URL + 输入 userCode）
// 推荐直接用 MicrosoftAuth 类获取设备信息
```

##### `mojangLogin(username, password) → Promise<Profile>`

Mojang 账密（官方端点已弃用；用户名看起来像离线名时自动 fallback 离线 Profile）

##### `✨ thirdPartyLogin(options) → Promise<Profile>` **新增 v1.0.5-beta.3**

第三方 Yggdrasil 登录（LittleSkin / BlessingSkin / 自定义皮肤站通用）。

**参数 options：**

| 字段 | 必填 | 说明 |
|---|---|---|
| `preset` | 二选一 | 内置预设站：`'littleskin'` / `'blessskin'` / `'unionpass'` |
| `authBase` | 二选一 | 自定义 authserver 基址（不用 preset 时必填，如 `https://xxx/api/yggdrasil`） |
| `profileBase` | 否 | sessionserver 基址（默认等于 authBase） |
| `siteName` | 否 | 显示名，用于日志输出 |
| `clientToken` | 否 | 自定义 32 位十六进制 clientToken，省略则随机生成 |
| **方式A**：`username` + `password` | ⭕ | 账密登录（从 authenticate → refresh → sessionserver 拉完整 textures） |
| **方式B**：`accessToken` (+ `clientToken`) | ⭕ | 复用已有 token（validate → refresh → 拉 profile） |

**示例 1：LittleSkin 账密登录**
```javascript
const profile = await launcher.thirdPartyLogin({
    preset: 'littleskin',
    username: 'my_account',
    password: 'my_password'
});
// profile.textures.SKIN.url / profile.textures.CAPE.url 已解析
```

**示例 2：自定义皮肤站**
```javascript
await launcher.thirdPartyLogin({
    authBase: 'https://your-skin.site/api/yggdrasil',
    siteName: '我的皮肤站',
    username: 'xxx',
    password: 'yyy'
});
```

**示例 3：复用已保存的 token**
```javascript
await launcher.thirdPartyLogin({
    preset: 'littleskin',
    accessToken: savedAccessToken,
    clientToken: savedClientToken
});
```

---

#### ⚡ 启动相关

##### `quickLaunch(options) → Promise<ChildProcess>`

**最推荐的启动方式**。自动完成：认证 → 检查/安装版本 → 完整性校验 → Java 版本匹配 → 参数生成 → 启动。

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `version` | string | ✅ | 游戏版本 ID（`'1.12.2'` / `'1.20.1-Forge_47.4.20'` / `'26w4a'` 等） |
| `username` | string | `'Player'` | 玩家名（离线/mojang/第三方账密登录用） |
| `authType` | string | `'offline'` | 认证方式（见下方枚举） |
| `accessToken` | string | 条件必填 | `microsoft`/第三方 token 登录时 |
| `password` | string | 条件必填 | `mojang`/第三方账密登录时 |
| `preset` | string | 条件必填 | `authType='third-party'` 或 `'littleskin'` 时的预设站 |
| `authBase` / `profileBase` / `siteName` / `clientToken` | string | 可选 | 自定义 Yggdrasil 站点参数 |
| `memory` | string | 否 | 覆盖构造器的 JVM 内存 |
| `windowWidth` / `windowHeight` | number | 否 | 覆盖构造器的窗口尺寸 |
| `server` | string | 否 | 启动后自动加入的服务器（host / IP） |
| `serverPort` | number | 否 | 服务器端口，默认 25565 |
| 其他任何 MCLauncher 构造选项 | 任意 | 否 | 会合并到 `this.options` |

**`authType` 枚举：**
| 值 | 含义 | 所需参数 |
|---|---|---|
| `'offline'` | 离线登录（默认） | username |
| `'microsoft'` | 微软正版 | accessToken 或走 Device Flow |
| `'mojang'` | Mojang 账密（已弃用） | username + password |
| `'third-party'` 或 `'thirdParty'` | 自定义 Yggdrasil | preset 或 authBase，再加 (username+password) 或 accessToken |
| `'littleskin'` | LittleSkin 快捷方式（等价 preset=littleskin + authType=third-party） | username+password 或 accessToken |

##### `launch(options?) → Promise<ChildProcess>`

两段式启动：**必须先手动调用任一登录方法**。不会自动检查版本/认证。适合需要细粒度控制的场景。

```javascript
await launcher.offlineLogin('Steve');
const proc = await launcher.launch();
```

##### `prepareLaunch() → Promise<LaunchArgs>`

只准备启动参数，不真正启动。用于 debug 参数拼接结果。

```javascript
const launchArgs = await launcher.prepareLaunch();
console.log('主类:', launchArgs.mainClass);
console.log('args 数量:', launchArgs.args.length);
// 结构：{ mainClass, classpath, versionData, args: string[] }
```

---

#### 📦 版本相关

##### `getAvailableVersions() → Promise<Version[]>`

获取 Mojang 官方 manifest 合并本地目录的版本列表。

##### `installVersion(versionId) → Promise<Object>`

下载并安装版本（version.json → client.jar → libraries → natives → assets）。已安装会跳过。

##### `cleanup() → void`

清空内部 `auth`/`profile` 引用（进程不会被 kill）。

---

#### 📊 状态

##### `getStatus() → Object`

```javascript
{
  authenticated: boolean,
  profile: Profile | null,
  options: MCLauncherOptions,
  config: PersistedConfig,
  versionManager: Object,
  assetManager: Object
}
```

---

## 二、认证类（可直接使用）

### `OfflineAuth`

```javascript
import { OfflineAuth } from './src/index.js';
const auth = new OfflineAuth();
const profile = await auth.authenticate('Player1');

// 附加工具
auth.validateUsername(name);                     // 合法用户名检查
await auth.checkUsernameAvailability(name);       // 离线永远返回 true
auth.generateSkinConfig({ skinURL, capeURL });    // 生成皮肤结构
await auth.createFullProfile(name, options);      // 带游戏设置和权限的完整 Profile
await auth.batchCreateProfiles([name1, name2]);   // 批量创建离线 Profile
```

### `MicrosoftAuth`

```javascript
import { MicrosoftAuth } from './src/index.js';
const auth = new MicrosoftAuth({ enableDebug: true });

// 1. 启动 Device Flow（返回 verificationUriComplete + userCode 显示给用户）
const df = await auth.startDeviceFlow();

// 2. 轮询设备授权（每次 interval 秒，直到 timeout 过期）
let token = null;
while (!token) {
    token = await auth.checkDeviceAuthorization(df.deviceCode);
    if (!token) await new Promise(r => setTimeout(r, df.interval * 1000));
}

// 3. 完整认证 → Profile
const profile = await auth.authenticate(auth.accessToken);
```

其他方法：`refreshAccessToken(refreshToken)`、`validateToken(accessToken)`、`logout()`。

### `MojangAuth`

```javascript
import { MojangAuth } from './src/index.js';
const auth = new MojangAuth();
const profile = await auth.authenticate(email, password); // 用户名非邮箱→离线兼容
```

其他方法：`refresh(accessToken, clientToken)`、`validate(accessToken, clientToken)`。

### ✨ `ThirdPartyAuth` **新增 v1.0.5-beta.3**

```javascript
import { ThirdPartyAuth, PRESET_SITES } from './src/index.js';

// 支持的预设
console.log(PRESET_SITES.littleskin); // { name, authBase, profileBase }

// 构造（3 种方式选一种）
const a = new ThirdPartyAuth({ preset: 'littleskin' });
const b = new ThirdPartyAuth({ authBase: 'https://自定义...' });
const c = new ThirdPartyAuth({ authBase: '...', profileBase: '...独立 sessionserver' });

// 账密登录
const p1 = await a.authenticate({ username: 'xx', password: 'yy' });

// Token 登录（accessToken 有效时直接复用）
const p2 = await a.authenticate({ accessToken: saved, clientToken: saved });

// API 方法
await a.validate(accessToken, clientToken);   // → boolean
await a.refresh(accessToken, clientToken);    // → 新 token 对象
await a.signout(username, password);          // 账密强制吊销此账号全部 token
await a.invalidate(accessToken, clientToken); // 主动吊销当前 token
await a.logout();                             // 本地清空（不联网）
```

返回 Profile 统一字段：
```javascript
{
  type: 'third-party',
  preset: 'littleskin' | null,
  siteName: 'LittleSkin',
  authBase: 'https://...',
  profileBase: 'https://...',
  username, uuid, displayName,
  properties: [{ name: 'textures', value: 'base64...', signature: '...' }],
  textures: { timestamp, profileId, profileName, textures: { SKIN, CAPE } },
  accessToken, clientToken,
  isLegacy: false, isPremium: true
}
```

---

## 三、VersionManager（版本管理）

```javascript
import { VersionManager } from './src/index.js';
const vm = new VersionManager('./minecraft');

vm.logger = /* your Logger */;

await vm.getVersions();                           // 清单
await vm.getLatestVersion('release');             // 最新正式版
await vm.getLocalVersions();                      // 本地已装版本
await vm.isInstalled('1.20.1');                    // 是否已安装
await vm.install('1.20.1');                        // 安装（含下载）
await vm.verifyIntegrity('1.20.1');                // 完整性校验 { complete, missing, corrupted }
await vm.generateLaunchArgs({ version, profile, ... }); // 启动参数
await vm.buildGameArgs(versionData, profile, vars);     // 单独构建游戏参数
await vm.buildJVMArgs(versionData, vars);               // 单独构建 JVM 参数
await vm.buildClassPath(versionData, versionId);         // classpath 字符串
await vm.extractNatives(versionData, versionId);         // natives 解压
await vm.mergeParentVersion(child);                      // inheritsFrom 递归合并
VersionManager.getRequiredJavaVersion(vData, vId);       // 静态：版本→Java主版本号
```

---

## 四、Java 工具

```javascript
import {
  getJavaVersion,       // (path) → number|null    探测单个 Java 的主版本
  findJava,             // (requiredMajor) → string|null  找到匹配的 Java 路径
  detectJavaVersions,   // (detailed=false) → Array<{path,version,arch,...}>
  getRequiredJavaVersion // (versionData, versionId) → number  按 MC 版本得 Java 要求
} from './src/index.js';
```

示例：
```javascript
await detectJavaVersions(true);  // 列出电脑上全部 Java
await findJava(8);               // 找到 ≥Java 8 的最合适版本（优先完全=8）
await getJavaVersion('java');    // 17 / 21 / 8 ...
getRequiredJavaVersion(null, '1.12.2');     // → 8
getRequiredJavaVersion(null, '26w4a');       // → 21  (YYwWWx 自动识别)
getRequiredJavaVersion({ javaVersion: { majorVersion: 17 } });  // → 17  (JSON 优先)
```

---

## 五、AssetManager（资源下载/校验）

```javascript
import { AssetManager } from './src/index.js';
const am = new AssetManager('./minecraft');

await am.downloadAssets('1.20.1');                     // 下载所有资源对象（8并发，跳过已存）
await am.verifyAssets('1.20.1');                       // SHA1 校验
am.getStatus();                                        // 下载状态
```

---

## 六、ModManager（模组管理）

```javascript
import { ModManager } from './src/index.js';
const mm = new ModManager(launcherInstance);

await mm.scanInstalledMods();          // 扫描 mods/
await mm.installMod('./mod.jar', { overwrite });
await mm.removeMod('mod.jar');
await mm.enableMod('mod.jar');
await mm.disableMod('mod.jar');        // 加 .disabled 后缀
await mm.batchOperation(['a.jar','b.jar'], 'enable' | 'disable' | 'remove');
await mm.checkEnvironment();
await mm.getLaunchArgs();              // [enableMods=true 时被 launcher 拼入 args]
await mm.cleanupCache();               // 7 天以上缓存
```

---

## 七、Logger（日志系统）

```javascript
import { Logger, LogLevel } from './src/index.js';

const logger = new Logger(enableDebug, {
  logFile: './logs/launcher.log',    // 默认
  console: false                     // 是否控制台输出
});

// 分级输出
logger.error('错误', errorObj);
logger.warn('警告', context);
logger.info('信息');
logger.debug('调试');
logger.perf('db_query', 345);        // 性能日志：按耗时自动分 DEBUG/INFO/WARN

// 级别控制
logger.setLevel('WARN');              // 只显示 WARN 和 ERROR

// 监听（UI 对接用）
const unsub = logger.onLog(({ timestamp, level, message, data, pid }) => { ... });
unsub();  // 取消监听

// 子 Logger
const child = logger.createChild('VersionManager');
child.info('xxx');  // [VersionManager] xxx

// 语义化日志
logger.http('GET /versions', 200);
logger.auth('Microsoft login OK', username);
logger.launch('Starting 1.20.1', pid);

// 全局单例
const g = Logger.getLogger();
Logger.setLogger(customInstance);
```

---

## 八、完整示例：LittleSkin + 直连服务器

```javascript
import { MCLauncher } from './src/index.js';

const launcher = new MCLauncher({
    gameDirectory: 'C:\\Users\\我\\AppData\\Roaming\\.minecraft',
    enableDebug: false
});

try {
    const proc = await launcher.quickLaunch({
        version: '1.20.1',
        authType: 'littleskin',
        username: '我的LittleSkin账号',
        password: '我的密码',
        memory: '4G',
        windowWidth: 1920,
        windowHeight: 1080,
        server: 'mc.example.com',        // 启动后自动加入服
        serverPort: 25565
    });

    proc.stdout.on('data', d => process.stdout.write(d));
    proc.stderr.on('data', d => process.stderr.write(d));
    proc.on('close', code => {
        console.log('游戏退出:', code);
        launcher.cleanup();
        process.exit(code ?? 0);
    });
} catch (err) {
    console.error('启动失败:', err);
    process.exit(1);
}
```

---

## 九、兼容性矩阵

| Minecraft 版本 | 格式 | Java | Mod 加载器 | 状态 |
|---|---|---|---|---|
| 1.0 ~ 1.6.4 | `minecraftArguments` 字符串 | Java 6 | 极少量旧 Forge | ✅ 代码覆盖（legacy resources/） |
| 1.7 ~ 1.12.1 | `minecraftArguments` 字符串 | Java 8 | Forge 1.7.10+ | ✅ 代码覆盖 |
| 1.12.2 ~ 1.16.5 | `minecraftArguments` + 部分 arguments | Java 8 | Forge 主流 | ✅ 实测通过 |
| 1.17 ~ 1.17.1 | `arguments.jvm/game` | Java 16 | Forge | ✅ |
| 1.18 ~ 1.20.4 | `arguments.jvm/game` | Java 17 | Forge / NeoForge 1.20.1 | ✅ |
| 1.20.5 ~ 26.x.x（最新） | `arguments` + 新变量 | Java 21 | NeoForge 主流 | ✅ |
| 快照 16w*~20w* | 同对应正式版 | Java 8 | 随对应版 | ✅ YYwWWx 正则 |
| 快照 21w* | 同 1.17 | Java 16 | 随对应版 | ✅ |
| 快照 22w*~23w* | 同 1.18~1.20 | Java 17 | 随对应版 | ✅ |
| 快照 24w*+ | 同最新 | Java 21 | 随对应版 | ✅ |
| Pre-release / RC (`1.x-pre1` / `1.x-rc1`) | 同对应正式版 | 同对应版 | 同对应版 | ✅ |
| Forge（inheritsFrom 链） | 继承父版本结构 | 同父版 | ✅ |
| NeoForge（inheritsFrom 链） | 同父版 + library_directory 变量 | 同父版 | ✅ |
| Fabric（inheritsFrom 链） | 同父版 | 同父版 | ⚠️ 通用继承机制可用，Fabric repo 未自动识别 |
