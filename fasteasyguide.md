# Fast Easy Guide - 小白入门指南

> 这篇文档假设你**完全不懂 JavaScript**，也能用这个库做出一个能用的 MC 启动器。
> 本文档 v1.1.0-beta.5 更新。

---

## 这个库是干什么的？

简单说：**你告诉它版本号和玩家名，它帮你启动 Minecraft。**

```
你：启动 1.21.1，玩家名 TestPlayer
库：好的，我帮你检查 Java → 检查文件 → 启动游戏
你：游戏窗口弹出来了！
```

它帮你处理了所有麻烦事：
- 找到合适的 Java 版本（1.12.2 要 Java 8，1.21.1 要 Java 21，1.0/1.2.5 远古版甚至认 Java 6）
- 检查游戏文件是否完整，缺文件自动重新下载
- 拼接正确的启动命令（几百个参数，各种变量替换）
- 加载 Forge / NeoForge（inheritsFrom 自动合并）
- **一键自动安装 Fabric**（写 `1.20.1-Fabric` 就行，自动下载 Loader，v1.0.6-beta.4 新增）
- **自动登录 LittleSkin 等第三方皮肤站**（皮肤/披风直接生效，不用 authlib-injector）
- **启动游戏后自动加入指定服务器**（跳过主菜单）
- 兼容 **Minecraft 1.0 到最新版**（含快照、远古版本）

---

## 第一步：准备工作

### 你需要装的东西

| 软件 | 干什么用的 | 下载地址 |
|---|---|---|
| Node.js | 运行这个库 | https://nodejs.org (选 LTS 版) |
| Java | 运行 Minecraft | 建议装 3 个： **Java 8**（老版本/Forge 1.12.2）、**Java 17**（1.18~1.20.4）、**Java 21**（新版 1.20.5+） |

> Node.js 一路下一步就行，会自动加入 PATH。
> Java 三个都装的话，启动器会**自动挑对的那个**，你不用操心。

### 检查是否装好

打开终端（Windows 用 PowerShell），输入：

```bash
node --version
java -version
```

> 输出示例：
```
node --version → v22.12.0  (LTS 或 Current 都行，≥20 即可)
java -version → java 21.0.5 LTS  (只要能正常输出就行，多版本的话库会自动挑)
```

---

## 第二步：选一个语言（4 种任选）

### 选项 A：你什么都不懂，只想用命令行（最快）

复制粘贴就能跑。

```bash
# 1. 先 cd 到库的目录（你克隆或解压的地方）
cd D:\infinite-mc-launcher-core

# 2. 启动！离线模式 1.20.1
node cli.js launch --version 1.20.1 --username 玩家名 --auth offline --game-dir "C:\Users\你\.minecraft"
```

> 把 `"C:\Users\你\.minecraft"` 换成你真实的 .minecraft 路径，注意**用双引号包住**（路径有空格时必须）。

**然后游戏窗口就弹出来了 🎉**

### 选项 B：你懂 Python

```bash
cd infinite-mc-launcher-core
pip install -e bindings/python
```

```python
from mc_launcher import MCLauncher

launcher = MCLauncher(
    game_dir=r'C:\Users\你\AppData\Roaming\.minecraft',
    node_path='node',
    cli_path=r'D:\infinite-mc-launcher-core\cli.js'
)

result = launcher.launch(
    version='1.21.1',
    username='MyPlayer',
    auth_type='offline',
    memory='4G',
)
print(f"游戏已启动！PID: {result['pid']}")
```

### 选项 C：你懂 C# / VB.NET

参见 [DOTNET_GUIDE.md](docs/DOTNET_GUIDE.md)，用 `Process.Start("node", "cli.js ...")`。

### 选项 D：你懂 JavaScript / Node.js

```javascript
import { MCLauncher } from './src/index.js';

const launcher = new MCLauncher({
    gameDirectory: 'C:\\Users\\你\\.minecraft',
    version: '1.21.1'
});

await launcher.offlineLogin('MyPlayer');
const proc = await launcher.launch();
console.log('游戏已启动！PID:', proc.pid);
```

---

## 常用功能速查（一行代码 / 一行命令搞定）

### ✅ 启动原版游戏（最常用）

```bash
node cli.js launch --version 1.21.1 --username 玩家名 --auth offline --game-dir "游戏目录" --memory 4G
```

```python
launcher.launch(version='1.21.1', username='玩家名', auth_type='offline', memory='4G')
```

### 🔑 用 LittleSkin 登录（第三方皮肤站，有自定义皮肤/披风）

**命令行：**
```bash
node cli.js launch --version 1.20.1 --auth littleskin \
    --username 你的LittleSkin账号 \
    --password 你的LittleSkin密码 \
    --game-dir "游戏目录"
```

**Python：**
```python
launcher.launch(version='1.20.1', auth_type='littleskin',
                username='账号', password='密码')
```

> 皮肤和披风会**自动生效**，不需要 authlib-injector。

### 🎨 自定义皮肤站（非 LittleSkin，自建的 Blessing Skin / UnionPass 等）

```bash
node cli.js launch --version 1.20.1 --auth third-party \
    --auth-base "https://你的皮肤站地址/api/yggdrasil" \
    --username 账号 --password 密码
```

内置 3 个预设站（**写 `--preset` 省得填 URL**）：
| 参数 `--preset xxx` | 站点 |
|---|---|
| `littleskin` | LittleSkin（国内最大） |
| `blessskin` | Blessing Skin 官方示例站 |
| `unionpass` | 统一通行证 UniAuth |

### 🚪 启动游戏后直接加入服务器

加上 `--server 服务器地址`，游戏启动完会自动连服（跳过主菜单）：

```bash
node cli.js launch --version 1.20.1 --auth littleskin -u 账号 -p 密码 \
    --server mc.example.com --server-port 25565
```

### 🔧 启动 Forge 或 NeoForge（带 Mod）

版本名写完整的 Forge 版本名就行（先确保那个版本目录存在）：

```bash
node cli.js launch --version "1.20.1-Forge_47.4.20" --username 玩家名 --auth offline
```

```python
launcher.launch(version='1.21.1-Forge_52.1.8', username='玩家名')
```

> **Mod 怎么加载？** 把 mod 的 `.jar` 丢到游戏的 `mods/` 文件夹里，Forge 会自动加载。
> 如果你用 `--instance-dir` 版本独立目录，mod 要放到**那个独立目录下的 mods/**。

### 🧵 启动 Fabric（轻量 Mod 加载器，✨ 自动安装）

不用自己去官网下载 Fabric installer！版本名按下面写，核心库会自动从 Fabric 官方服务器下载 Loader 和所需的库：

```bash
# 最简单：游戏版本后加 -Fabric，自动选最新稳定版 Loader
node cli.js launch --version "1.20.1-Fabric" --username 玩家名 --auth offline

# 指定 Loader 版本（简写）
node cli.js launch --version "1.20.1-Fabric_0.16.10" --username 玩家名 --auth offline

# 官方标准写法（注意：Loader 版本在前，游戏版本在后，别写反！）
node cli.js install --version "fabric-loader-0.16.10-1.20.1"
```

```javascript
// Node.js
const proc = await launcher.quickLaunch({
    version: '1.20.1-Fabric',   // 自动安装 + 启动
    authType: 'offline',
    username: '玩家名'
});
```

| 版本名写法 | 含义 |
|---|---|
| `1.20.1-Fabric` | 最新稳定 Loader（推荐，省心） |
| `1.20.1-Fabric_0.16.10` | 指定 Loader 版本 |
| `fabric-loader-0.16.10-1.20.1` | 官方标准格式（**Loader 版本在前**） |

> - Fabric 支持 **Minecraft 1.14 及以上**（1.12.2 及更早没有官方 Fabric）。
> - Fabric Mod 的 `.jar` 同样放进 `mods/`（或 `--instance-dir` 独立目录的 `mods/`）。
> - Fabric 和 Forge 的 Mod **不通用**，下载 Mod 时认准 Fabric 版本。

### 📁 独立游戏目录（每个版本独立的存档/mod/config）

像 PCL/HelloMC Launcher 那样，不同版本**不共享** mods 和 saves：

```bash
node cli.js launch --version "1.20.1-Forge" --username 玩家名 \
    --game-dir     "C:\Users\你\.minecraft"              `# 主目录，libraries/assets 共享` \
    --instance-dir "D:\MCInstances\1.20.1-Forge"        `# 独立目录，mods/saves 在这里`
```

- `--game-dir`：所有版本共用的 .minecraft（省硬盘空间）
- `--instance-dir`：某个版本的独立目录（mods/saves/config 各自独立）

### 📋 查看电脑上装了哪些版本

```bash
node cli.js versions --game-dir "游戏目录"
```

### ☕ 检测 Java 环境（启动器自动挑的就是这个结果）

```bash
node cli.js java
```

会列出你电脑安装的**全部 Java** 和它们的路径版本。库会自动按 MC 版本挑最合适的。

### ✅ 检查某个版本的文件是否完整

```bash
node cli.js check --version 1.20.1 --game-dir "游戏目录"
```

---

## 参数说明

### 启动参数表（对照）

| 参数 | 命令行（node cli.js launch） | Python `launcher.launch()` | 说明 |
|---|---|---|---|
| 游戏版本 | `--version 1.20.1` | `version='1.20.1'` | 必填。版本名/Forge版本名/快照名(如 26w4a)/Fabric(如 `1.20.1-Fabric`) |
| 玩家名 | `--username 小明` | `username='小明'` | 离线/mojang/第三方账密登录用 |
| 密码 | `--password xxx` | `password='xxx'` | 第三方/Mojang 账密登录 |
| 登录方式 | `--auth xxx` | `auth_type='xxx'` | `offline`/`microsoft`/`mojang`/`third-party`/**`littleskin`** |
| 预设皮肤站 | `--preset littleskin` | `preset='littleskin'` | littleskin/blessskin/unionpass（auth=third-party 时用） |
| 自定义皮肤站地址 | `--auth-base "https://..."` | `auth_base='https://...'` | 不填 preset 时必填 |
| Access Token | `--access-token xxx` | `access_token='xxx'` | Microsoft 或 第三方 token 登录 |
| 游戏目录 | `--game-dir "路径"` | `game_dir='路径'` | .minecraft 主目录 |
| 独立目录 | `--instance-dir "路径"` | `instance_dir='路径'` | 版本独立 mods/saves |
| 内存 | `--memory 4G` | `memory='4G'` | 如 512M / 2G / 8G |
| 窗口宽 | `--window-width 1280` | `window_width=1280` | 默认 854 |
| 窗口高 | `--window-height 720` | `window_height=720` | 默认 480 |
| Java路径 | `--java-path "C:\...\java.exe"` | `java_path='...'` | 不写会自动检测 |
| 直连服务器 | `--server mc.xxx.com` | `server='mc.xxx.com'` | 启动后自动加入该服 |
| 服务器端口 | `--server-port 25566` | `server_port=25566` | 默认 25565 |

### 输出格式

加 `--json` 让命令行输出 JSON（方便程序解析）：

```bash
node cli.js launch --version 1.21.1 --username test --auth offline --game-dir "..." --json
```

输出：
```json
{
  "success": true,
  "pid": 12345,
  "version": "1.21.1"
}
```

---

## 加载 Quilt / NeoForge / Forge（和 Fabric 一样简单）

版本名换成对应写法就行，其余步骤完全相同：

```bash
# Quilt（MC 1.14+）
node cli.js launch --version 1.20.1-Quilt --username 玩家名 --auth offline --game-dir "..."

# NeoForge（MC 1.20.2+）
node cli.js launch --version 1.21.1-NeoForge --username 玩家名 --auth offline --game-dir "..."

# Forge（新版老版都行，含 1.12.2）
node cli.js launch --version 1.20.1-Forge --username 玩家名 --auth offline --game-dir "..."
node cli.js launch --version 1.12.2-Forge_14.23.5.2860 --username 玩家名 --auth offline --game-dir "..."
```

> 不写 loader 版本号就自动选最新版；想锁定版本用下划线：`1.20.1-Forge_47.2.0`。
> 注意：Forge / NeoForge 第一次安装要跑官方安装器，**本机必须装好 Java**（Quilt / Fabric 不需要）。

## 两个省心功能

**内存自动分配**：`memory` 写 `'auto'`（命令行 `--memory auto`），按你电脑内存的 1/4 自动分（最少 1G、最多 8G），不用自己算。

```bash
node cli.js launch --version 1.20.1 --memory auto --username 玩家名 --auth offline --game-dir "..."
```

**崩溃自动诊断**：游戏闪退（退出码非 0）时，启动器会自动把 `logs/latest.log` 最后 40 行和最新的崩溃报告头部打印到日志里，照着报错搜就行。

## 开服务器（MCServer）

Node.js 里三行启动一个服务端：

```javascript
import { MCServer } from './src/index.js';

const server = new MCServer({ serverJar: './server/server.jar', maxMemory: '2G', eula: true });
server.on('playerJoin', name => console.log(name + ' 上线了'));
server.start();
// server.send('say 大家好');  // 发控制台指令
// await server.stop();       // 关服
```

想要崩了自动拉起？加 `autoRestart: true, maxRestarts: 3`。

---

## 常见问题 FAQ（直接抄答案）

### Q: 启动报错 "Java version mismatch" / "No suitable Java xx found"

A: 库自动检测失败，手动用 `--java-path` 指定：

```bash
# 先看你装了哪些
node cli.js java
# 输出中找到匹配版本的 java.exe 路径，直接用
node cli.js launch ... --java-path "C:\Program Files\Eclipse Adoptium\jdk-8.0.442.6-hotspot\bin\java.exe"
```

**版本对照表（记不住就按这个查）：**

| 你要玩的版本 | 需要的 Java |
|---|---|
| 1.0 ~ 1.6.4 远古版（非常老） | **Java 6** 或 Java 8（会有警告但基本能跑） |
| 1.7 ~ 1.16.5（含 1.12.2） | **Java 8**（重要！Forge 1.12.2 必须 Java 8，高版本会炸） |
| 1.17.x | **Java 16** |
| 1.18 ~ 1.20.4 | **Java 17** |
| 1.20.5 ~ 最新版（含 26.x.x） | **Java 21** |
| 快照 26w4a / 26w5a 等 | **Java 21** |

### Q: 启动报错 "Version not found" 或 "Version xxx is not installed"

A: 你写的版本目录不存在。先 `node cli.js versions --game-dir "..."`，列出的才是已经安装的版本。没装的话先 `node cli.js install --version 1.20.1` 安装。

### Q: Forge 启动后 Mod 没加载

A: Mod 要放在对应版本**实际使用的那个** `mods/` 文件夹里。
- 没有用 `--instance-dir` → 放在 `--game-dir` 的 `mods/`
- 用了 `--instance-dir` → 放在 `--instance-dir` 的 `mods/`

### Q: Fabric 安装报错 "No Fabric loader available" / 404

A: 依次检查：
1. **游戏版本是否 ≥ 1.14**：Fabric 官方只支持 1.14 及以上（含快照），1.12.2/1.7.10 没有 Fabric，请改用 Forge。
2. **版本号有没有拼错**：标准写法 Loader 在前（`fabric-loader-0.16.10-1.20.1`），游戏版本在后；不确定就直接用简写 `1.20.1-Fabric` 让它自动选。
3. **网络能否访问** `meta.fabricmc.net` 和 `maven.fabricmc.net`（大陆网络一般可直连，失败可挂代理重试）。

### Q: Fabric 启动了但 Mod 不生效

A: Fabric Mod 和 Forge Mod **不通用**。确认你下载的 Mod 文件标注了 **Fabric** 版本，并且放进了正确的 `mods/`（用了 `--instance-dir` 就放独立目录里）。另外 Fabric 模组常依赖 **Fabric API** 这个前置 Mod，需要一并放进 `mods/`。

### Q: 启动后显示"试玩模式"/"Demo Mode"（5 分钟就结束）

A: 离线账号的 demo 模式 bug，v1.0.5-beta.3 后已修复。还出现请升级代码或手动把 `features.is_demo` 设为 false。

### Q: Python 报 "ModuleNotFoundError: No module named 'mc_launcher'"

A:
```bash
cd infinite-mc-launcher-core
pip install -e bindings/python
```

### Q: "node 不是内部或外部命令"

A: Node.js 没装或没加入 PATH → https://nodejs.org 下载 LTS 安装。

### Q: 第三方皮肤站登录失败 "account has no linked game profile"

A: 你在皮肤站**只注册了账号，还没创建游戏角色**。去皮肤站的「角色管理」里创建一个游戏角色（角色名=游戏里显示的玩家名），然后再登录。

### Q: LittleSkin 登录失败 "401 invalid credentials"

A: 账号密码写错。LittleSkin 要用**注册邮箱**或**用户名**登录，部分站点密码区分大小写。

---

## 文件结构说明

```
你只需要关心这些文件：

cli.js                          ← 命令行入口（Python/C#/VB.NET/任何语言调用这个）
src/index.js                    ← Node.js 开发者用这个（import MCLauncher）
bindings/python/mc_launcher/    ← Python 开发者用这个（pip install 后 from mc_launcher import）
examples/                       ← 示例代码，照着抄就行

这些不用管（库的内部实现）：
src/core/launcher.js            ← 总指挥
src/auth/                       ← 登录（offline/microsoft/mojang/thirdparty 四个模块）
src/game/                       ← 游戏版本/资源/参数处理
src/utils/                      ← Java 检测 / 日志 / UUID / 配置
```

---

## 总结（一张表记所有）

| 你想做什么 | 怎么做（命令行 / 核心参数） |
|---|---|
| 用命令行启动离线游戏 | `node cli.js launch --version 版本 --username 名字 --auth offline --game-dir 目录` |
| 用 LittleSkin 皮肤登录 | `--auth littleskin --username 账号 --password 密码` |
| 用自定义皮肤站 | `--auth third-party --auth-base "https://你的站/api/yggdrasil" -u 账号 -p 密码` |
| 启动后自动连服务器 | 加 `--server mc.example.com [--server-port 25566]` |
| 用 Python 启动 | `pip install -e bindings/python` 然后 `launcher.launch(...)` |
| 用 C#/VB 启动 | `Process.Start("node", "cli.js launch ... --json")`，解析返回 JSON 取 pid |
| 用 Node.js 启动 | `import { MCLauncher } from './src/index.js'` → `quickLaunch(...)` |
| 加载 Mod | 把 `.jar` 丢进对应版本的 `mods/` 文件夹 |
| 用 Forge/NeoForge | `--version` 写完整版本名（如 `1.20.1-Forge_47.4.20`） |
| 用 Fabric（自动装） | `--version 1.20.1-Fabric`（或 `1.20.1-Fabric_0.16.10` 指定版本） |
| 加大内存 | 加 `--memory 4G` / `--memory 8G` |
| 版本独立存档/Mod | 加 `--instance-dir "独立目录路径"` |

Infinite MineCraft Launcher Core - The world of MC ， it's infinite。
