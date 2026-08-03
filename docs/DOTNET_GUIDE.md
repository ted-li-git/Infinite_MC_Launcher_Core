# .NET 调用指南

> .NET 通过子进程调用 `node cli.js`，无需 JNI / COM。`CLI_PATH` = cli.js 完整路径。

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
    JsonSerializer.Serialize(new { id = 1, method = "launch", @params = new { version = "1.21.1", username = "Player" } })
);
```

**launch 参数：** `version` / `username` / `authType`（offline/microsoft/mojang）/ `accessToken` / `password` / `memory` / `windowWidth` / `windowHeight`

## CLI 命令速查

| 命令 | 示例 |
|---|---|
| 启动 | `node cli.js launch --version 1.21.1 --username Player --auth offline --game-dir "..."` |
| Forge | 版本名写 Forge 版本，如 `1.21.1-Forge_52.1.8` |
| 独立目录 | 加 `--instance-dir "路径"`（mods/saves 独立，libraries 共享） |
| 内存/Java | 加 `--memory 4G` / `--java-path "C:\...\java.exe"` |
| 查版本/Java | `node cli.js versions` / `node cli.js java` |
| 查完整性 | `node cli.js check --version 1.21.1 --game-dir "..."` |

加 `--json` 输出 JSON。更多参数见 [API.md](../API.md) 和 [fasteasyguide.md](../fasteasyguide.md)。
