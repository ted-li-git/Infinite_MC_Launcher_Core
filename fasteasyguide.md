# Fast Easy Guide - 小白入门指南

> 这篇文档假设你**完全不懂 JavaScript**，也能用这个库做出一个能用的 MC 启动器。

---

## 这个库是干什么的？

简单说：**你告诉它版本号和玩家名，它帮你启动 Minecraft。**

```
你：启动 1.21.1，玩家名 TestPlayer
库：好的，我帮你检查 Java → 检查文件 → 启动游戏
你：游戏窗口弹出来了！
```

它帮你处理了所有麻烦事：
- 找到合适的 Java 版本（1.12.2 要 Java 8，1.21.1 要 Java 21）
- 检查游戏文件是否完整
- 拼接正确的启动命令（几百个参数）
- 下载缺失的文件
- 加载 Forge 和 Mod

---

## 第一步：准备工作

### 你需要装的东西

| 软件 | 干什么用的 | 下载地址 |
|---|---|---|
| Node.js | 运行这个库 | https://nodejs.org |
| Java | 运行 Minecraft | https://www.java.com/zh-CN/download/ |

> 装Node.js时选 LTS（长期支持版），一路下一步就行。
> Java建议装两个：Java 8（老版本MC用）和 Java 21（新版本MC用）。

### 检查是否装好

打开终端（Windows用PowerShell），输入：

```bash
node --version
java -version
# 输出示例在下方
```

> 输出示例：
```
node --version
v20.20.1
java -version
java 11.0.26 2025-01-21 LTS
Java(TM) SE Runtime Environment 18.9 (build 11.0.26+7-LTS-187)
Java HotSpot(TM) 64-Bit Server VM 18.9 (build 11.0.26+7-LTS-187, mixed mode)
```

---

## 第二步：选一个语言

你会什么语言，就用什么语言。**不一定需要学 JavaScript，你还可以用 Python、 C#、JavaScript 等。**

### 选项 A：你懂 Python

```bash
cd infinite-mc-launcher-core

pip install -e bindings/python

```

```python
from mc_launcher import MCLauncher

launcher = MCLauncher(
    game_dir=r'C:\Users\你的用户名\AppData\Roaming\.minecraft',
    node_path='node',  # Node.js 的路径
    cli_path=r'D:\infinite-mc-launcher-core\cli.js'  # cli.js 的完整路径
)

result = launcher.launch(
    version='1.21.1',        # 游戏版本
    username='MyPlayer',     # 玩家名
    auth_type='offline'      # 离线模式
)

print(f"游戏已启动！PID: {result['pid']}")
```

运行：
```bash
python my_launcher.py
```

### 选项 B：你懂 C#

```csharp
using System.Diagnostics;
using Newtonsoft.Json.Linq;

var node = new Process();
node.StartInfo.FileName = "node";
node.StartInfo.Arguments = @"cli.js launch --version 1.21.1 --username MyPlayer --auth offline --game-dir ""C:\Users\你\.minecraft"" --json";
node.StartInfo.RedirectStandardOutput = true;
node.Start();
var output = node.StandardOutput.ReadToEnd();
node.WaitForExit();

var result = JObject.Parse(output);
Console.WriteLine($"游戏已启动！PID: {result["pid"]}");
```

### 选项 C：你懂 JavaScript / Node.js

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

运行：
```bash
node launch.js
```

### 选项 D：你什么都不懂，只想用命令行

```bash
node cli.js launch --version 1.21.1 --username MyPlayer --auth offline --game-dir "C:\Users\你\.minecraft"
```

---

## 常用功能速查

### 启动原版游戏

```bash
node cli.js launch --version 1.21.1 --username 玩家名 --auth offline --game-dir "游戏目录"
```

```python
launcher.launch(version='1.21.1', username='玩家名', auth_type='offline')
```

### 启动 Forge（带 Mod）

Forge 版本已经装好的话，直接指定版本名就行：

```bash
node cli.js launch --version "1.21.1-Forge_52.1.8" --username 玩家名 --auth offline --game-dir "游戏目录"
```

```python
# Python
launcher.launch(version='1.21.1-Forge_52.1.8', username='玩家名', auth_type='offline')
```

> **Mod 怎么加载？** 把 mod 放到游戏的 `mods/` 文件夹里，Forge 会自动加载，你不用管。

### 独立游戏目录（每个版本单独的存档/mod）

如果你想让不同版本有不同的存档和 mod（像 PCL 那样）：

```bash
node cli.js launch --version "1.21.1-Forge" --username 玩家名 --game-dir "主.minecraft目录" --instance-dir "版本独立目录"
```

```python
launcher.launch(
    version='1.21.1-Forge',
    username='玩家名',
    game_dir='主.minecraft目录',
    instance_dir='版本独立目录'
)
```

- `game_dir`：主目录（libraries 和 assets 在这里，所有版本共享）
- `instance_dir`：独立目录（mods、saves、config 在这里，每个版本独立）

### 查看已安装的版本

```bash
node cli.js versions --game-dir "游戏目录"
```

### 检查 Java 环境

```bash
node cli.js java
```

会列出你电脑上所有安装的 Java。

---

## 参数说明

### 启动参数

| 参数 | 命令行 | Python | 说明 |
|---|---|---|---|
| 游戏版本 | `--version` | `version=` | 版本名或版本号 |
| 玩家名 | `--username` | `username=` | 离线模式的玩家名 |
| 登录方式 | `--auth` | `auth_type=` | `offline`/`microsoft`/`mojang` |
| 游戏目录 | `--game-dir` | `game_dir=` | .minecraft 目录 |
| 独立目录 | `--instance-dir` | `instance_dir=` | mods/saves 独立目录 |
| 内存 | `--memory` | `memory=` | 如 `2G`、`4G` |
| 窗口宽度 | `--width` | `width=` | 如 `854` |
| 窗口高度 | `--height` | `height=` | 如 `480` |
| Java路径 | `--java-path` | `java_path=` | 手动指定 java.exe 路径 |

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

## 常见问题

### Q: 启动报错 "Java version mismatch"

A: 游戏需要的 Java 版本和你装的不匹配。
- 1.12.2 → Java 8
- 1.17~1.20.4 → Java 17
- 1.20.5+ → Java 21

不手动指定 Java 的话，库会自动检测。如果自动检测失败，用 `--java-path` 手动指定。

### Q: 启动报错 "Version not found"

A: 你指定的版本名在 `versions/` 目录下找不到。用 `node cli.js versions --game-dir "..."` 看看有哪些版本。

### Q: Forge 启动后 Mod 没加载

A: Mod 要放在游戏目录的 `mods/` 文件夹里。如果你用了独立目录（`--instance-dir`），mod 放在独立目录的 `mods/` 里。

### Q: 启动后显示"试玩模式"

A: 已修复。如果还出现，确认你用的是最新代码。

### Q: Python 报 "ModuleNotFoundError: No module named 'mc_launcher'"

A: 需要先安装 Python SDK：
```bash
cd infinite-mc-launcher-core
pip install -e bindings/python
```

### Q: 报 "node 不是内部命令"

A: Node.js 没装或没加入 PATH。去 https://nodejs.org 下载安装。

---

## 文件结构说明

```
你只需要关心这些文件：

cli.js                          ← 命令行入口（其他语言调用这个）
src/index.js                    ← Node.js 开发者用这个
bindings/python/mc_launcher/    ← Python 开发者用这个
examples/                       ← 示例代码，照着抄就行

这些不用管（库的内部实现）：
src/core/launcher.js            ← 总指挥
src/auth/                       ← 登录逻辑
src/game/                       ← 游戏文件处理
src/utils/                      ← 工具函数
```

---

## 总结

| 你想做什么 | 怎么做 |
|---|---|
| 用命令行启动游戏 | `node cli.js launch --version 版本 --username 名字 --auth offline --game-dir 目录` |
| 用 Python 启动 | `pip install -e bindings/python` 然后 `launcher.launch(...)` |
| 用 C# 启动 | `Process.Start("node", "cli.js launch ...")` |
| 用 Node.js 启动 | `import { MCLauncher } from './src/index.js'` |
| 加载 Mod | 把 mod 放进 `mods/` 文件夹 |
| 用 Forge | 版本名写 Forge 版本名（如 `1.21.1-Forge_52.1.8`） |
| 指定内存 | `--memory 4G` |

**记住一句话：你告诉它版本和玩家名，它帮你搞定剩下的事。**
