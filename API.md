# MC Launcher Core API 文档

Minecraft 启动器核心库，提供一键启动、版本管理、认证、Java 自动检测等功能。

## 快速开始

```javascript
import { MCLauncher } from 'mc-launcher-core';

const launcher = new MCLauncher({
    gameDirectory: './minecraft',
    enableDebug: true
});

// 一键启动
const proc = await launcher.quickLaunch({
    version: '1.20.1',
    username: 'Player1',
    authType: 'offline',  // 'offline' | 'microsoft' | 'mojang'
    memory: '2G'
});

proc.on('close', (code) => {
    console.log(`游戏退出，代码: ${code}`);
    launcher.cleanup();
});
```

## MCLauncher

### 构造函数

```javascript
new MCLauncher(options)
```

| 参数 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `gameDirectory` | string | `'./minecraft'` | 游戏目录 |
| `javaPath` | string | `'java'` | Java 路径（不指定时自动检测） |
| `version` | string | `'latest'` | 默认版本 |
| `memory` | string | `'2G'` | JVM 内存 |
| `windowWidth` | number | `854` | 窗口宽度 |
| `windowHeight` | number | `480` | 窗口高度 |
| `enableMods` | boolean | `false` | 启用 Mod 支持 |
| `enableDebug` | boolean | `false` | 启用调试日志 |

### 方法

#### `quickLaunch(options)` — 一键启动

自动完成：认证 → 检查/安装版本 → Java 检测 → 准备 → 启动

```javascript
const proc = await launcher.quickLaunch({
    version: '1.20.1',
    username: 'Player1',
    authType: 'offline',
    memory: '2G',
    windowWidth: 1280,
    windowHeight: 720
});
```

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `version` | string | 是 | 游戏版本 |
| `username` | string | 否 | 玩家用户名（默认 `'Player'`） |
| `authType` | string | 否 | 认证方式（默认 `'offline'`） |
| `accessToken` | string | 否 | Microsoft 令牌（`authType='microsoft'` 时） |
| `password` | string | 否 | Mojang 密码（`authType='mojang'` 时） |
| `memory` | string | 否 | 内存大小 |

**返回**: `Promise<ChildProcess>` 游戏进程

---

#### `offlineLogin(username)` — 离线登录

```javascript
const profile = await launcher.offlineLogin('Player1');
```

**返回**: `Promise<Object>` 用户配置文件

---

#### `launch(options)` — 启动游戏

需要先调用认证方法。

```javascript
await launcher.offlineLogin('Player1');
const proc = await launcher.launch();
```

**返回**: `Promise<ChildProcess>` 游戏进程

---

#### `prepareLaunch()` — 准备启动环境

自动检查版本完整性、检测 Java、生成启动参数。

```javascript
const launchArgs = await launcher.prepareLaunch();
console.log('主类:', launchArgs.mainClass);
console.log('参数:', launchArgs.args);
```

**返回**: `Promise<Object>` 启动参数

---

#### `getAvailableVersions()` — 获取可用版本

```javascript
const versions = await launcher.getAvailableVersions();
// [{ id: '1.20.1', type: 'release', isInstalled: true }, ...]
```

---

#### `installVersion(versionId)` — 安装版本

```javascript
await launcher.installVersion('1.20.1');
```

---

#### `cleanup()` — 清理资源

```javascript
launcher.cleanup();
```

## 认证

### OfflineAuth

```javascript
import { OfflineAuth } from 'mc-launcher-core';

const auth = new OfflineAuth({ enableDebug: true });
const profile = await auth.authenticate('Player1');
```

### MicrosoftAuth

```javascript
import { MicrosoftAuth } from 'mc-launcher-core';

const auth = new MicrosoftAuth({ enableDebug: true });
const profile = await auth.authenticate(accessToken);
```

### MojangAuth

```javascript
import { MojangAuth } from 'mc-launcher-core';

const auth = new MojangAuth({ enableDebug: true });
const profile = await auth.authenticate(username, password);
```

## 版本管理

### VersionManager

```javascript
import { VersionManager } from 'mc-launcher-core';

const vm = new VersionManager('./minecraft');

// 获取版本列表
const versions = await vm.getVersions();

// 检查是否已安装
const installed = await vm.isInstalled('1.20.1');

// 验证文件完整性
const integrity = await vm.verifyIntegrity('1.20.1');
// { complete: false, missing: ['libraries/com.google.code.gson:gson'] }

// 安装版本
await vm.install('1.20.1');

// 生成启动参数
const args = await vm.generateLaunchArgs({
    version: '1.20.1',
    profile: { username: 'Player1', uuid: '...' },
    gameDirectory: './minecraft',
    memory: '2G'
});
```

## Java 自动检测

```javascript
import { findJava, detectJavaVersions, getJavaVersion } from 'mc-launcher-core';

// 扫描系统中所有 Java 安装
const javas = await detectJavaVersions();
// [{ path: 'C:\\Program Files\\Java\\jdk-17\\bin\\java.exe', version: 17 }, ...]

// 根据需要的版本查找
const javaPath = await findJava(17);
// 'C:\\Program Files\\Java\\jdk-17\\bin\\java.exe'

// 获取指定 Java 的版本号
const version = await getJavaVersion('java');
// 11
```

## 日志系统

```javascript
import { Logger, LogLevel } from 'mc-launcher-core';

const logger = new Logger(true); // 启用调试

// 分级日志
logger.error('错误消息', errorObject);
logger.warn('警告消息', { context: 'data' });
logger.info('信息消息');
logger.debug('调试消息');

// 设置级别
logger.setLevel('WARN'); // 只输出 WARN 和 ERROR

// 监听日志事件（供 UI 对接）
const unsubscribe = logger.onLog((entry) => {
    // entry: { timestamp, level, message, data, pid }
    console.log(`[${entry.level}] ${entry.message}`);
});
// 取消监听
unsubscribe();

// 文件日志
logger.enableFileLogging('./logs/launcher.log');
logger.disableFileLogging();

// 子日志器（带前缀）
const childLogger = logger.createChild('VersionManager');
childLogger.info('Loading versions'); // [VersionManager] Loading versions
```

## 事件处理

### 游戏进程事件

```javascript
const proc = await launcher.quickLaunch({ version: '1.20.1', username: 'Player1' });

// 游戏输出
proc.stdout.on('data', (data) => {
    console.log(`[Game] ${data}`);
});

proc.stderr.on('data', (data) => {
    console.error(`[Game Error] ${data}`);
});

// 游戏退出
proc.on('close', (code) => {
    console.log(`游戏退出，代码: ${code}`);
    launcher.cleanup();
});

// 启动错误
proc.on('error', (err) => {
    console.error('启动失败:', err);
});
```

### 日志监听

```javascript
launcher.logger.onLog((entry) => {
    if (entry.level === 'ERROR') {
        // 在 UI 上显示错误
        showErrorToast(entry.message);
    }
});
```

## 完整示例

```javascript
import { MCLauncher } from 'mc-launcher-core';

async function main() {
    const launcher = new MCLauncher({
        gameDirectory: 'C:\\Users\\user\\AppData\\Roaming\\.minecraft',
        enableDebug: true
    });

    // 监听日志
    launcher.logger.onLog((entry) => {
        if (entry.level === 'ERROR') {
            console.error(`[${entry.level}] ${entry.message}`);
        }
    });

    try {
        const proc = await launcher.quickLaunch({
            version: '1.20.1',
            username: 'Player1',
            authType: 'offline',
            memory: '4G',
            windowWidth: 1920,
            windowHeight: 1080
        });

        proc.stdout.on('data', (d) => process.stdout.write(d));
        proc.stderr.on('data', (d) => process.stderr.write(d));

        proc.on('close', (code) => {
            console.log(`\n游戏退出，代码: ${code}`);
            launcher.cleanup();
            process.exit(code ?? 0);
        });
    } catch (err) {
        console.error('启动失败:', err);
        process.exit(1);
    }
}

main();
```

## 兼容性

| 版本范围 | 格式 | Java | 状态 |
|---|---|---|---|
| 1.7.10 及更早 | `minecraftArguments` | Java 8 | 代码覆盖 |
| 1.8 - 1.12.2 | `minecraftArguments` | Java 8 | ✅ 实测通过 |
| 1.13 - 1.16.5 | `arguments.game` | Java 8/11 | 代码覆盖 |
| 1.17 - 1.20.4 | `arguments.game` | Java 17 | 代码覆盖 |
| 1.20.5 - 1.21.x | `arguments.game` | Java 21 | ✅ 实测通过 |
| Forge | `inheritsFrom` | 同原版 | 代码覆盖 |
