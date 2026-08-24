# Infinite MC Launcher Core

> MC的世界，永无止境。

Infinite MC Launcher Core（IMCLC）跨平台 Minecraft 启动器核心库，为每一个自研启动器打好最坚固的启动底座。

**当前版本：v1.0.5-beta.3**

- **全版本兼容**：`Minecraft 1.0 → 最新版`（含 1.0/1.2.5/1.7.10 等远古版本、1.12.2-1.21+ 现代版、以及 26w4a 等快照/预发布/RC 版本）
- **Mod 加载器**：Forge（1.7.10-1.20.1）、NeoForge（1.20.1-最新 26.x.x）、Fabric（inheritsFrom 自动合并）
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
| | 独立实例目录 `instanceDir`（mods/saves 独立，libraries 共享） | ✅ |
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
npm install github:ted-li-git/Infinite_MC_Launcher_Core#v1.0.5-beta.3

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

### 命令行调用（任何语言通用）

```bash
# 启动 1.12.2 离线
node cli.js launch --version 1.12.2 --username Player --auth offline \
    --game-dir "./minecraft" --memory 4G

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
| 稳定世代 | 1.12.2 ~ 1.16.5 | **Java 8** | Forge (主流) | 完整 inheritsFrom 继承合并 |
| 过渡世代 | 1.17 ~ 1.17.1 | **Java 16** | Forge | `javaVersion` 字段标配 |
| 现代世代 | 1.18 ~ 1.20.4 | **Java 17** | Forge / NeoForge 1.20.1 / Fabric | `arguments.game` 数组格式 |
| 最新世代 | 1.20.5 ~ 最新版（含 26.x.x） | **Java 21** | NeoForge 主流 | `library_directory` / `classpath_separator` 变量 |
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