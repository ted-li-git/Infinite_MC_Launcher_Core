# .NET 调用指南

> .NET 通过子进程调用 `node cli.js`，无需 JNI / COM。`CLI_PATH` = cli.js 完整路径。
> 核心库当前版本：`v1.0.5-beta.3`，支持 MC 1.0 ~ 1.21.11 + 快照，第三方 Yggdrasil 登录（LittleSkin / BlessingSkin / UnionPass）。

## 两种调用方式

| 方式 | 命令 | 适用场景 |
|---|---|---|
| **CLI 一次性** | 每次执行 `node cli.js <cmd>`，进程退出即结束 | 单次操作、脚本 |
| **stdio 长连接** | 启动 `node cli.js stdio` 常驻，按行收发 JSON | 启动器、需事件回调 |

## 方式一：CLI 一次性

通过 `Process.Start` 启动 node 进程，加 `--json` 让输出可解析：

```csharp
var psi = new ProcessStartInfo("node") {
    RedirectStandardOutput = true, UseShellExecute = false, CreateNoWindow = true };
psi.ArgumentList.Add(cliPath);
psi.ArgumentList.Add("launch"); psi.ArgumentList.Add("--version"); psi.ArgumentList.Add("1.21.1");
psi.ArgumentList.Add("--username"); psi.ArgumentList.Add("Player");
psi.ArgumentList.Add("--auth"); psi.ArgumentList.Add("offline");
psi.ArgumentList.Add("--game-dir"); psi.ArgumentList.Add(gameDir);
psi.ArgumentList.Add("--json");  // 输出 JSON 方便 JsonSerializer 解析

using var p = Process.Start(psi)!;
var output = await p.StandardOutput.ReadToEndAsync();  // {"success":true,"pid":12345,...}
await p.WaitForExitAsync();
```

读到的 JSON 用 `JsonDocument.Parse(output)` 解析，取 `pid` 即可。其他命令（versions/java/check）同理，换第一个参数即可。

### LittleSkin 登录 CLI 示例（C#）

```csharp
psi.ArgumentList.Add("launch");
psi.ArgumentList.Add("--version");   psi.ArgumentList.Add("1.20.1");
psi.ArgumentList.Add("--auth");      psi.ArgumentList.Add("littleskin"); // 或 --auth third-party
psi.ArgumentList.Add("--username");  psi.ArgumentList.Add("my_littleskin_account");
psi.ArgumentList.Add("--password");  psi.ArgumentList.Add("my_password");
psi.ArgumentList.Add("--game-dir");  psi.ArgumentList.Add(gameDir);
psi.ArgumentList.Add("--memory");    psi.ArgumentList.Add("4G");
psi.ArgumentList.Add("--json");
```

### 直连服务器 CLI 示例（C#）

```csharp
psi.ArgumentList.Add("launch");
psi.ArgumentList.Add("--version");     psi.ArgumentList.Add("1.20.1");
psi.ArgumentList.Add("--auth");        psi.ArgumentList.Add("offline");
psi.ArgumentList.Add("--username");    psi.ArgumentList.Add("Player");
psi.ArgumentList.Add("--server");      psi.ArgumentList.Add("mc.hypixel.net");
psi.ArgumentList.Add("--server-port"); psi.ArgumentList.Add("25565");
psi.ArgumentList.Add("--game-dir");    psi.ArgumentList.Add(gameDir);
psi.ArgumentList.Add("--json");
```

## 方式二：stdio 长连接

启动一个常驻进程，通过 stdin/stdout 按行收发 JSON-RPC：

**协议**（每行一条 JSON）：
- 请求：`{"id":1,"method":"launch","params":{"version":"1.21.1","username":"Player"}}`
- 响应：`{"id":1,"result":{"pid":12345}}`
- 事件：`{"event":"game_exit","data":{"code":0}}`（另有 `log` / `game_stdout` / `game_stderr`）
- 错误：`{"id":1,"error":{"message":"...","code":"..."}}`

**支持方法：** `versions` / `install` / `check` / `detectJava` / `launch` / `setGameDirectory`

**关键思路：**
1. `ProcessStartInfo` 同时重定向 stdin/stdout/stderr
2. 后台 `Task.Run` 跑一个循环 `ReadLineAsync`，按 `id` 匹配响应、按 `event` 触发回调
3. 用 `Dictionary<int, TaskCompletionSource<JsonElement>>` 存待响应请求，收到响应时 `SetResult`

**发送请求：**
```csharp
await p.StandardInput.WriteLineAsync(
    JsonSerializer.Serialize(new { id = 1, method = "launch", @params = new {
        version = "1.21.1",
        username = "Player",
        authType = "offline",
        // server = "mc.example.com",
        // serverPort = 25565,
    } })
);
```

### launch params 完整表

**通用参数：**

| params 键 | 类型 | 说明 |
|---|---|---|
| `version` | `string` | MC 版本号（支持 `1.20.1`、`1.20.1-Forge_47.2.0`、`26w4a` 快照等） |
| `username` | `string` | 玩家名 |
| `memory` | `string` | 分配内存，如 `"2G"`、`"4096M"` |
| `windowWidth` | `number` | 窗口宽度（像素） |
| `windowHeight` | `number` | 窗口高度（像素） |
| `javaPath` | `string` | 手动指定 Java.exe 路径（省略=自动检测） |
| `gameDir` | `string` | 游戏根目录（必填） |
| `instanceDir` | `string` | 独立实例目录（mods/saves 独立，libraries 共享） |
| `server` | `string` | 启动后自动直连的服务器地址 |
| `serverPort` | `number` | 服务器端口（默认 25565，`server` 存在时生效） |

**认证相关（按 authType 选填）：**

| params 键 | 类型 | 说明 |
|---|---|---|
| `authType` | `string` | **枚举：** `offline` / `microsoft` / `mojang` / `third-party` / `littleskin` / `blessskin` / `unionpass` |
| `password` | `string` | 账密登录时使用（offline 不需要，microsoft 不需要） |
| `accessToken` | `string` | token 登录时使用 |
| `clientToken` | `string` | 32 位十六进制；third-party/mojang 模式可选（省略自动生成） |
| `preset` | `string` | `authType=third-party` 时可选：`littleskin` / `blessskin` / `unionpass` |
| `authBase` | `string` | `authType=third-party` 时自定义：Yggdrasil 认证地址（如 `https://.../api/yggdrasil`） |
| `profileBase` | `string` | 可选，sessionserver 地址，省略默认等于 `authBase` |
| `siteName` | `string` | 可选，自定义皮肤站名称，用于日志显示 |

**LittleSkin 通过 stdio 启动示例：**

```csharp
var req = new
{
    id = 1,
    method = "launch",
    @params = new
    {
        version = "1.20.1",
        authType = "littleskin",      // 预设方式，最简单
        username = "my_account",
        password = "my_password",
        gameDir = @"C:\MC\.minecraft",
        memory = "4G",
        windowWidth = 1280,
        windowHeight = 720,
    }
};
await p.StandardInput.WriteLineAsync(JsonSerializer.Serialize(req));
```

**自定义皮肤站（third-party + authBase）通过 stdio 启动示例：**

```csharp
var req = new
{
    id = 2,
    method = "launch",
    @params = new
    {
        version = "1.21.1",
        authType = "third-party",
        authBase = "https://your-skin-site.com/api/yggdrasil",   // 自定义 Yggdrasil 地址
        profileBase = "https://your-skin-site.com/api/yggdrasil",// 可选，默认=authBase
        siteName = "我的皮肤站",
        username = "Player",
        accessToken = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",        // 已有 token
        clientToken = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",        // 可选
        gameDir = @"C:\MC\.minecraft",
        memory = "6G",
        // 同时启动后直连
        server = "play.myserver.cn",
        serverPort = 25565,
    }
};
await p.StandardInput.WriteLineAsync(JsonSerializer.Serialize(req));
```

## CLI 命令速查

| 命令 | 示例 |
|---|---|
| 启动（离线） | `node cli.js launch --version 1.21.1 --username Player --auth offline --game-dir "..."` |
| **启动 LittleSkin** | `node cli.js launch --version 1.20.1 --auth littleskin --username 账号 --password 密码 --game-dir "..."` |
| **启动自定义皮肤站** | `node cli.js launch --version 1.21.1 --auth third-party --auth-base https://xxx/api/yggdrasil --username Player --access-token xxxxxxxx --game-dir "..."` |
| **启动并直连服务器** | `node cli.js launch --version 1.20.1 --auth offline --username Player --server mc.hypixel.net --server-port 25565 --game-dir "..."` |
| Forge | 版本名写 Forge 版本，如 `1.21.1-Forge_52.1.8` |
| 独立目录 | 加 `--instance-dir "路径"`（mods/saves 独立，libraries 共享） |
| 内存/Java | 加 `--memory 4G` / `--java-path "C:\...\java.exe"` |
| 查版本/Java | `node cli.js versions` / `node cli.js java` |
| 查完整性 | `node cli.js check --version 1.21.1 --game-dir "..."` |

### CLI 第三方登录长选项名

| 长选项（CLI 用） | 对应 params 键 |
|---|---|
| `--auth` | authType |
| `--password` | password |
| `--access-token` | accessToken |
| `--client-token` | clientToken |
| `--preset` | preset |
| `--auth-base` | authBase |
| `--profile-base` | profileBase |
| `--site-name` | siteName |
| `--server` | server |
| `--server-port` | serverPort |

加 `--json` 输出 JSON。更多参数见 [API.md](../API.md) 和 [fasteasyguide.md](../fasteasyguide.md)。

## 常见坑

1. **authType 别名不敏感**：`third-party`、`thirdParty`、`littleskin` 都能识别，推荐统一写 `littleskin` / `third-party`。
2. **UnionPass 注意**：authBase 和 profileBase 都是 `https://auth.mc-user.com:233`（不要加 `/api/yggdrasil` 后缀），推荐直接用 `preset=unionpass`。
3. **自定义皮肤站路径**：BlessingSkin 标准后端格式必须带 `/api/yggdrasil`，末尾不要多斜杠。
4. **clientToken**：如果用 `accessToken` 方式登录，建议自己保存并传入 `clientToken`（否则每次生成新的会让旧 session 失效）。
5. **直连服务器只对客户端生效**：`--server` / `--port` 是 Minecraft 客户端原生启动参数，启动后会跳过主菜单直接进入该服务器（不是开服！服务端管理功能已从核心库移除）。
