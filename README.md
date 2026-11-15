# Infinite MC Launcher Core

> MC的世界，永无止境。

Infinite MC Launcher Core（IMCLC）跨平台 Minecraft 启动器核心库，为每一个自研启动器打好最坚固的启动底座。

**当前版本：v1.1.0-beta.5**

- **全版本兼容**：`Minecraft 1.0 → 最新版`（含 1.0/1.2.5/1.7.10 等远古版本、1.12.2-1.21+ 现代版、以及 26w4a 等快照/预发布/RC 版本）
- **Mod 加载器**：Forge（1.7.10-1.20.1）、NeoForge（1.20.1-最新 26.x.x）、**Fabric（✨ 自动安装：Meta API 自动下载 loader/profile/库，写 `1.20.1-Fabric` 即可）**
- **5 种认证方式**：离线 / 微软设备流 / Mojang 账密 / 第三方 Yggdrasil（LittleSkin/BlessingSkin/统一通行证/自定义皮肤站·新支持）
- **Java 自动检测**：自动扫描 Windows/Mac/Linux 常见路径（含 x86 32位目录），按版本自动挑选 Java
- **一键启动**：`quickLaunch` 一行代码完成 认证→安装→完整性检查→Java 检测→参数生成→启动
- **直连服务器**：`--server/--serverPort`，启动游戏后自动跳过主菜单加入服务器
- **跨语言调用**：CLI + stdio JSON-RPC，可用 Node.js / Python / C# / VB.NET / C++ 等任意语言对接

## 使用前注意

**本项目目前为 Beta 版本，部分代码由 AI 辅助撰写，可能存在未发现的 bug。** 核心启动链路已经过多版本实测，建议在开发环境中充分测试，生产环境使用前请做好源码备份。  
欢迎理性反馈问题，开发者会尽快修复。

## 功能特性速查

| 类别 | 功能 | 状态 |
|---|---|---|
| **版本** | 原版 Minecraft 1.0 - 最新版（含 26.x.x） | ✅ |
| | 快照 / 预发布 / RC / 周构建（26w4a 等） | ✅ |
| | 版本在线清单 + 本地目录扫描 | ✅ |
| | 版本安装（JSON/Client.jar/Libraries/Natives/Assets） | ✅ |
| | 完整性校验（16 批并行，缺失自动重装） | ✅ |
| | inheritsFrom 继承合并（Forge/NeoForge/Fabric） | ✅ |
| | Fabric 自动安装（Meta API，简写 `1.20.1-Fabric`） | ✅ |
| | **Quilt 自动安装（简写 `1.20.1-Quilt`）** | ✨ **新增** |
| | **NeoForge 自动安装（简写 `1.21.1-NeoForge`）** | ✨ **新增** |
| | **Forge 自动安装（简写 `1.20.1-Forge`，兼容 1.12.2 老版本）** | ✨ **新增** |
| **Java** | 多路径自动扫描（含 x86 32 位目录） | ✅ |
| | 版本号自动推断（1.x/快照/26.x 新格式） | ✅ |
| | 要求 JVM < 当前 JVM 时，自动搜索降级版本 | ✅ |
| | Java 信息 24h 本地缓存（`java_cache.json`） | ✅ |
| **认证** | 离线登录（Offline UUID V3） | ✅ |
| | 微软账户（Device Flow 设备码 + Xbox/XSTS + Minecraft） | ✅ |
| | Mojang 账密（端点已弃用，fallback 离线兼容 Profile） | ✅ |
| | **第三方 Yggdrasil（LittleSkin/BlessingSkin/自定义皮肤站）** | ✨ **新增** |
| | 认证后自动保存配置文件 | ✅ |
| **启动** | `launcher.offlineLogin()` + `launcher.launch()` 两段式 | ✅ |
| | `launcher.quickLaunch()` 一键启动 | ✅ |
| | **直连服务器（`--server`/`--serverPort`）** | ✨ **新增** |
| | **内存自动分配（`memory: 'auto'` → 系统内存 1/4）** | ✨ **新增** |
| | **崩溃诊断（非 0 退出自动提取 latest.log 尾部 + 崩溃报告）** | ✨ **新增** |
| | 独立实例目录 `instanceDir`（mods/saves 独立，libraries 共享） | ✅ |
| **服务端** | **MCServer 服务端启动/停止/控制台指令** | ✨ **新增** |
| | **玩家列表 / 状态监控 / 崩溃自动重启** | ✨ **新增** |
| **Mod 管理** | Mod 扫描/安装/启用/禁用/删除 | ✅ |
| | 批量启用/禁用/删除 | ✅ |
| | 7 天以上缓存自动清理 | ✅ |
| **资源** | 资源对象 8 并发下载（跳过已存在） | ✅ |
| | Legacy 资源目录自动识别（`resources/` vs `assets/`） | ✅ |
| **日志** | ERROR/WARN/INFO/DEBUG 四级 | ✅ |
| | 文件日志（默认 `<gameDir>/logs/launcher.log`） | ✅ |
| | TTY 彩色输出、事件回调、子 Logger、性能日志 | ✅ |
| **客户端能力** | 命令行工具 `cli.js`（20+ 选项） | ✅ |
| | stdio JSON-RPC 长连接模式（事件推送） | ✅ |
| | Python 绑定 `bindings/python/` | ✅ |
| | Rollup 构建 CJS/ESM/Min 三产物 | ✅ |

## 快速开始

### 安装

```bash
# 方式一：从 GitHub 仓库直接安装（推荐，实时最新）
npm install github:ted-li-git/Infinite_MC_Launcher_Core
# 指定版本：
npm install github:ted-li-git/Infinite_MC_Launcher_Core#v1.1.0-beta.5

# 方式二：克隆源码
git clone https://github.com/ted-li-git/Infinite_MC_Launcher_Core.git
cd Infinite_MC_Launcher_Core
npm install && npm run build
```

> 安装过程中 `prepare` 脚本会自动执行 `rollup -c`，无需手动构建。

### 基本使用（Node.js）

```javascript
import { MCLauncher } from './src/index.js';

const launcher = new MCLauncher({
    gameDirectory: './minecraft',  // .minecraft 目录
    javaPath: 'java',              // 留空=自动检测
    version: '1.20.1'              // 默认版本
});

// === 1. 离线登录 ===
await launcher.offlineLogin('Player1');

// === 2. 微软正版登录（传入已有 accessToken） ===
// await launcher.microsoftLogin('your-ms-access-token');

// === 3. LittleSkin 第三方登录（✨ 新增） ===
// await launcher.thirdPartyLogin({ preset: 'littleskin', username, password });

// 启动游戏
const proc = await launcher.launch();

proc.stdout.on('data', d => process.stdout.write(d));
proc.stderr.on('data', d => process.stderr.write(d));
proc.on('close', code => {
    console.log('游戏退出，code=', code);
    launcher.cleanup();
});
```

### 一键启动（推荐）

```javascript
import { MCLauncher } from './src/index.js';

const launcher = new MCLauncher({ gameDirectory: './minecraft' });

// 全部一步到位
const proc = await launcher.quickLaunch({
    version: '1.12.2',
    authType: 'offline',            // offline / microsoft / mojang /
                                    // third-party / littleskin
    username: 'Steve',

    // LittleSkin 账密登录示例：
    // authType: 'littleskin',
    // username: '你的LS账号', password: '你的密码',

    // 直连服务器（启动后自动加入）
    // server: 'mc.example.com',
    // serverPort: 25565,

    memory: '4G',
    windowWidth: 1280,
    windowHeight: 720
});
```

### Fabric 一键安装启动（✨ v1.0.6-beta.4 新增）

无需手动跑 Fabric installer，核心库直接对接 [Fabric Meta API](https://meta.fabricmc.net/)，写版本名即可自动下载 loader + 原版 + 全部库：

```javascript
import { MCLauncher } from './src/index.js';
const launcher = new MCLauncher({ gameDirectory: './minecraft' });

// 方式一：简写（推荐）—— 省略 loader 版本时自动选最新稳定版
const proc = await launcher.quickLaunch({
    version: '1.20.1-Fabric',   // 自动安装 原版1.20.1 + 最新稳定 Fabric Loader
    authType: 'offline',
    username: 'Steve',
    memory: '4G'
});

// 方式二：简写指定 loader 版本
// version: '1.20.1-Fabric_0.16.10'

// 方式三：官方标准版本名（loader 版本在前，与官方启动器目录名一致）
// version: 'fabric-loader-0.16.10-1.20.1'
```

版本名三种写法等价对照：

| 写法 | 示例 | 说明 |
|---|---|---|
| 简写（自动 loader） | `1.20.1-Fabric` | 查询 Meta API 选最新 stable loader |
| 简写（指定 loader） | `1.20.1-Fabric_0.16.10` | 自己锁定 loader 版本 |
| 官方标准格式 | `fabric-loader-0.16.10-1.20.1` | ⚠️ loader 版本在前、游戏版本在后 |

也可使用底层 API 精确控制：

```javascript
import { VersionManager } from './src/index.js';
const vm = new VersionManager('./minecraft');

const loaders = await vm.getFabricLoaders('1.20.1');  // 查询可用 loader 列表
// → [{ version: '0.16.10', stable: true }, ...]

const result = await vm.installFabric('1.20.1', '0.16.10'); // 指定版本安装
// const result = await vm.installFabric('1.20.1');          // 最新稳定版
// → { versionId: 'fabric-loader-0.16.10-1.20.1', modLoader: 'fabric', ... }
```

> Fabric 支持的游戏版本为 **1.14 及以上**（含快照）；Fabric mod 的 `.jar` 放进 `mods/`（或 `--instance-dir` 指定实例的 `mods/`）即可。

### Quilt / NeoForge / Forge 一键安装

用法与 Fabric 相同，换版本名即可，`installVersion()` / `quickLaunch()` 自动解析 Loader 并合并版本 JSON：

```javascript
// Quilt（Meta API，同 Fabric 无需跑 installer）
await launcher.quickLaunch({ version: '1.20.1-Quilt', authType: 'offline', username: 'Steve' });
// 指定 loader：version: '1.20.1-Quilt_0.26.0'

// NeoForge（MC 1.20.2+，官方 installer 无头安装）
await launcher.quickLaunch({ version: '1.21.1-NeoForge', authType: 'offline', username: 'Steve' });
// 指定版本：version: '1.21.1-NeoForge_21.1.172'

// Forge（自动兼容 1.12.2 老版本：--installClient / clientreq 过滤 / 失效域名重写）
await launcher.quickLaunch({ version: '1.20.1-Forge', authType: 'offline', username: 'Steve' });
// 指定版本：version: '1.20.1-Forge_47.2.0'、'1.12.2-Forge_14.23.5.2860'
```

四种加载器版本名对照：

| 加载器 | 官方标准格式 | 简写（自动最新 loader） | 简写（指定 loader） |
|--------|--------------|------------------------|---------------------|
| Fabric | `fabric-loader-0.16.10-1.20.1` | `1.20.1-Fabric` | `1.20.1-Fabric_0.16.10` |
| Quilt | `quilt-loader-0.26.0-1.20.1` | `1.20.1-Quilt` | `1.20.1-Quilt_0.26.0` |
| NeoForge | `neoforge-21.1.172` | `1.21.1-NeoForge` | `1.21.1-NeoForge_21.1.172` |
| Forge | `1.20.1-forge-47.2.0` | `1.20.1-Forge` | `1.20.1-Forge_47.2.0` |

底层 API：`vm.getQuiltLoaders(mc)` / `vm.installQuilt(mc[, loader])`、`vm.getNeoForgeVersions(mc)` / `vm.getLatestNeoForge(mc)` / `vm.installNeoForge(mc[, ver])`、`vm.getForgeVersions(mc)` / `vm.getLatestForge(mc)` / `vm.installForge(mc[, ver])`。

> Forge / NeoForge 走官方 installer 无头安装，需本机有 Java；installer jar 缓存于系统临时目录复用。

### 服务端启动（MCServer）

```javascript
import { MCServer } from './src/index.js';

const server = new MCServer({
    serverJar: './server/server.jar',  // 必填
    javaPath: 'java',
    minMemory: '1G', maxMemory: '2G',
    gui: false,                        // 追加 nogui
    eula: true,                        // 自动写入 eula.txt
    autoRestart: true, restartDelay: 5000, maxRestarts: 3   // 崩溃自动重启
});

server.on('ready', () => console.log('服务端已就绪'));
server.on('log', (line) => console.log(line));
server.on('playerJoin', (name) => console.log(`${name} 加入`));
server.on('playerLeave', (name) => console.log(`${name} 离开`));

server.start();
server.send('say Hello');              // 控制台指令
server.getPlayers();                   // 在线玩家列表
server.getStatus();                    // stopped/starting/running/stopping
await server.stop();                   // 优雅停止
```

### 内存自动分配与崩溃诊断

```javascript
const launcher = new MCLauncher({
    gameDirectory: './minecraft',
    memory: 'auto'   // 按系统总内存 1/4 分配，限制 1G~8G
});
// 游戏非 0 退出时自动打印 logs/latest.log 尾部 40 行 + 最新 crash-reports/crash-*.txt 头部 30 行
```

### 命令行调用（任何语言通用）

```bash
# 启动 1.12.2 离线
node cli.js launch --version 1.12.2 --username Player --auth offline \
    --game-dir "./minecraft" --memory 4G

# Fabric（自动最新稳定 loader，安装+启动一条龙）
node cli.js launch --version 1.20.1-Fabric --username Player --game-dir "./minecraft"
# Fabric 指定 loader（官方格式 loader 版本在前）
node cli.js install --version fabric-loader-0.16.10-1.20.1 --game-dir "./minecraft"

# LittleSkin + 直连服务器
node cli.js launch --version 1.20.1 --auth littleskin \
    --username LS账号 --password LS密码 \
    --server mc.example.com --server-port 25565

# 自定义皮肤站
node cli.js launch --version 1.20.4 --auth third-party \
    --auth-base https://你的皮肤站/api/yggdrasil \
    --username 账号 --password 密码

# 其他命令
node cli.js versions                      # 列出版本
node cli.js install --version 1.20.1      # 安装版本
node cli.js check   --version 1.20.1      # 完整性检查
node cli.js java                          # 检测系统 Java
node cli.js login                         # Microsoft 设备码登录
node cli.js stdio                         # 进入 JSON-RPC 长连接模式
node cli.js -h                            # 完整帮助
```

## Minecraft 版本兼容表

| 版本大类 | 区间 | Java 要求 | Mod 加载器 | 特殊兼容点 |
|---|---|---|---|---|
| 远古正式版 | 1.0 ~ 1.6.4 | **Java 6**（自动回退用 Java 8 可跑） | 极少量 Forge 旧版 | legacy `resources/` 资源目录；`minecraftArguments` 字符串解析 |
| 中世代 | 1.7 ~ 1.12.1 | **Java 8** | Forge 1.7.10+ | x86 32 位 Java 扫描；`width`/`height` 变量 |
| 稳定世代 | 1.12.2 ~ 1.16.5 | **Java 8** | Forge (主流) / Fabric 1.14+ | 完整 inheritsFrom 继承合并 |
| 过渡世代 | 1.17 ~ 1.17.1 | **Java 16** | Forge / Fabric | `javaVersion` 字段标配 |
| 现代世代 | 1.18 ~ 1.20.4 | **Java 17** | Forge / NeoForge 1.20.1 / Fabric | `arguments.game` 数组格式 |
| 最新世代 | 1.20.5 ~ 最新版（含 26.x.x） | **Java 21** | NeoForge 主流 / Fabric | `library_directory` / `classpath_separator` 变量 |
| 测试版 | 快照 / Pre / RC（26w4a 等） | **按快照号区间自动推断** | 随对应正式版 | YYwWWx 周构建号专用正则分支 |

## 文档链接

| 文档 | 面向人群 | 内容 |
|---|---|---|
| [**fasteasyguide.md**](fasteasyguide.md) | 🟢 初学者 / 小白 | 最简单的上手路径，命令行/JS/Python/C# 四选一 |
| [**API.md**](API.md) | 🟡 JS 开发者 | MCLauncher / 认证 / 版本 / Java / 日志 全部 API 表格 + 示例 |
| [**docs/INTEGRATION_GUIDE.md**](docs/INTEGRATION_GUIDE.md) | 🟠 集成开发者 | 集成方式、错误处理、事件监听、GUI 对接、最佳实践 |
| [**docs/DOTNET_GUIDE.md**](docs/DOTNET_GUIDE.md) | 🔴 .NET/C#/VB 开发者 | CLI 一次性 + stdio 长连接两种调用方式，完整 C# 示例 |

> `docs/` 下的集成指南若有引用过时，优先以仓库根目录的 **API.md** 和 **fasteasyguide.md** 为准。

## 许可证
MIT License