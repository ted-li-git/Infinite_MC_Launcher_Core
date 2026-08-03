# Infinite MC Launcher Core 集成指南

## 概述

Infinite MC Launcher Core 是一个功能完整的Minecraft启动模块，支持离线登录和Microsoft正版登录。本指南将帮助你快速集成到你的项目中。

## 集成方式

### 1. 通过NPM安装（推荐）

```bash
npm install infinite-mc-core
# 或
yarn add infinite-mc-core
```

```javascript
import { MCLauncher } from 'infinite-mc-core';

const launcher = new MCLauncher({
    gameDirectory: './minecraft',
    version: '1.20.1'
});
```

### 2. 通过Git子模块集成

```bash
# 添加为子模块
git submodule add https://github.com/ted-li-git/infinite-mc-launcher-core.git libs/infinite-mc-core

# 更新子模块
git submodule update --init --recursive
```

### 3. 通过CDN使用

```html
<script src="https://cdn.jsdelivr.net/npm/infinite-mc-core/dist/mc-launcher.min.js"></script>
<script>
    const { MCLauncher } = window.MCLauncherCore;
    
    const launcher = new MCLauncher({
        gameDirectory: './minecraft',
        version: '1.20.1'
    });
</script>
```

## 快速开始

### 基本使用

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

### Microsoft正版登录

```javascript
async function microsoftLogin() {
    const launcher = new MCLauncher({
        gameDirectory: './minecraft'
    });
    
    // 方法1：使用设备流（需要用户交互）
    const deviceFlow = await launcher.microsoftAuth.startDeviceFlow();
    console.log('请访问:', deviceFlow.verificationUriComplete);
    console.log('设备代码:', deviceFlow.userCode);
    
    // 等待用户授权
    const profile = await launcher.microsoftLogin();
    
    // 方法2：使用现有访问令牌
    // const profile = await launcher.microsoftLogin('existing_access_token');
}
```

## 核心功能

### 认证模块

#### 离线登录
```javascript
// 基本离线登录
const profile = await launcher.offlineLogin('PlayerName');

// 完整配置文件创建
const fullProfile = await launcher.offlineAuth.createFullProfile('PlayerName', {
    language: 'zh_cn',
    renderDistance: 12,
    difficulty: 'hard'
});
```

#### Microsoft登录
```javascript
// 设备流认证
const deviceFlow = await launcher.microsoftAuth.startDeviceFlow();

// 检查授权状态
const tokenData = await launcher.microsoftAuth.checkDeviceAuthorization(deviceFlow.deviceCode);

// 完整Microsoft认证
const profile = await launcher.microsoftLogin();
```

### 游戏管理

#### 版本管理
```javascript
// 获取所有可用版本
const versions = await launcher.getAvailableVersions();

// 获取最新版本
const latestVersion = await launcher.versionManager.getLatestVersion('release');

// 安装特定版本
await launcher.installVersion('1.20.1');

// 检查版本是否已安装
const isInstalled = await launcher.versionManager.isInstalled('1.20.1');
```

#### 游戏启动
```javascript
// 启动游戏
const gameProcess = await launcher.launch();

// 自定义启动参数
const gameProcess = await launcher.launch({
    windowWidth: 1280,
    windowHeight: 720,
    memory: '4G',
    javaArgs: '-XX:+UseG1GC -XX:MaxGCPauseMillis=50'
});
```

### Mod管理

```javascript
// 扫描已安装的mod
const mods = await launcher.modManager.scanInstalledMods();

// 安装mod
await launcher.modManager.installMod('./path/to/mod.jar', {
    overwrite: true
});

// 启用/禁用mod
await launcher.modManager.toggleMod('fabric-api', true);  // 启用
await launcher.modManager.toggleMod('optifine', false);   // 禁用

// 批量操作
await launcher.modManager.batchOperation(['mod1', 'mod2'], 'disable');
```

### 服务端管理

```javascript
// 创建服务端
const serverConfig = await launcher.serverManager.createServer({
    name: '我的服务器',
    version: '1.20.1',
    port: 25565,
    maxPlayers: 10
});

// 启动服务端
const serverProcess = await launcher.launchServer(serverConfig.id);

// 服务端管理
await launcher.serverManager.stopServer(serverConfig.id);
await launcher.serverManager.restartServer(serverConfig.id);
await launcher.serverManager.backupServer(serverConfig.id);

// 发送命令
await launcher.serverManager.sendCommand(serverConfig.id, 'say Hello World!');
```

## 配置选项

### MCLauncher 配置

```javascript
const options = {
    // 必需配置
    gameDirectory: './minecraft',      // 游戏目录
    javaPath: 'java',                 // Java可执行文件路径
    
    // 可选配置
    version: 'latest',                // 游戏版本（默认latest）
    memory: '2G',                     // 分配内存（默认2G）
    windowWidth: 854,                 // 窗口宽度
    windowHeight: 480,                // 窗口高度
    enableMods: false,                // 是否启用mod支持
    enableDebug: false,               // 是否启用调试模式
    
    // 高级配置
    javaArgs: '',                     // 自定义JVM参数
    customLauncherName: 'My Launcher', // 自定义启动器名称
    customLauncherVersion: '1.0.0',   // 自定义启动器版本
};
```

## 错误处理

```javascript
try {
    await launcher.offlineLogin('PlayerName');
    await launcher.installVersion('1.20.1');
    await launcher.launch();
} catch (error) {
    console.error('启动失败:', error.message);
    
    // 根据错误类型处理
    if (error.message.includes('authentication')) {
        console.error('认证失败，请检查用户名');
    } else if (error.message.includes('download')) {
        console.error('下载失败，请检查网络连接');
    } else if (error.message.includes('java')) {
        console.error('Java环境问题，请检查Java安装');
    } else {
        console.error('未知错误:', error);
    }
}
```

## 事件监听

```javascript
// 游戏进程事件
const gameProcess = await launcher.launch();

gameProcess.stdout.on('data', (data) => {
    console.log('游戏输出:', data.toString());
});

gameProcess.stderr.on('data', (data) => {
    console.error('游戏错误:', data.toString());
});

gameProcess.on('close', (code) => {
    console.log(`游戏进程退出，代码: ${code}`);
});

gameProcess.on('error', (error) => {
    console.error('进程错误:', error);
});
```

## 进阶用法

### 自定义认证提供者

```javascript
import { MCLauncher, OfflineAuth } from 'infinite-mc-core';

class CustomAuth extends OfflineAuth {
    async authenticate(username) {
        // 自定义认证逻辑
        const uuid = this.generateCustomUUID(username);
        
        return {
            type: 'custom',
            username,
            uuid,
            displayName: username,
            customProperty: 'value'
        };
    }
    
    generateCustomUUID(username) {
        // 自定义UUID生成逻辑
        return 'custom-uuid-' + username;
    }
}

const launcher = new MCLauncher();
launcher.auth = new CustomAuth();
```

### 集成到GUI应用

```javascript
// Electron示例
const { app, BrowserWindow, ipcMain } = require('electron');
const { MCLauncher } = require('infinite-mc-core');

let launcher;

ipcMain.handle('launch-game', async (event, options) => {
    launcher = new MCLauncher(options);
    
    try {
        await launcher.offlineLogin(options.username);
        const gameProcess = await launcher.launch();
        
        // 返回进程信息到渲染进程
        return { 
            success: true, 
            pid: gameProcess.pid 
        };
    } catch (error) {
        return { 
            success: false, 
            error: error.message 
        };
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
// 使用try-catch包装关键操作
try {
    await launcher.launch();
} catch (error) {
    // 记录错误日志
    logger.error('Launch failed', error);
    
    // 提供用户友好的错误信息
    showErrorMessage(getUserFriendlyError(error));
    
    // 恢复状态
    launcher.cleanup();
}
```

### 2. 资源管理
```javascript
// 确保清理资源
async function launchWithCleanup() {
    const launcher = new MCLauncher(options);
    
    try {
        await launcher.launch();
        
        // 监听进程退出
        launcher.gameProcess.on('close', () => {
            launcher.cleanup();
        });
    } catch (error) {
        launcher.cleanup();
        throw error;
    }
}
```

### 3. 配置管理
```javascript
// 持久化配置
function loadUserConfig() {
    try {
        const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
        return config;
    } catch {
        return getDefaultConfig();
    }
}

function saveUserConfig(config) {
    fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
}
```

## 常见问题

### Q1: 如何解决"Java not found"错误？
A: 确保Java已正确安装，并指定正确的javaPath：
```javascript
// Windows
javaPath: 'C:\\Program Files\\Java\\jdk-17\\bin\\java.exe'

// Mac/Linux
javaPath: '/usr/bin/java'
```

### Q2: 如何处理网络下载失败？
A: 使用代理或重试机制：
```javascript
const launcher = new MCLauncher({
    gameDirectory: './minecraft',
    // 自定义下载配置
    downloadRetries: 3,
    downloadTimeout: 30000
});
```

### Q3: 如何支持旧版本Minecraft？
A: 指定特定版本并确保Java兼容：
```javascript
const launcher = new MCLauncher({
    version: '1.7.10',
    javaPath: 'java8'  // 旧版本需要Java 8
});
```

## 性能优化

### 1. 缓存管理
```javascript
// 启用版本缓存
launcher.versionManager.enableCache(true);

// 清理缓存
await launcher.versionManager.clearCache();
await launcher.assetManager.clearCache();
```

### 2. 并行下载
```javascript
// 并行下载库文件
launcher.versionManager.setConcurrentDownloads(5);
```

### 3. 进度监控
```javascript
// 监听下载进度
launcher.versionManager.on('download-progress', (progress) => {
    updateProgressBar(progress.percentage);
});
```

## 安全注意事项

1. **Microsoft令牌安全**：不要硬编码访问令牌，使用安全存储
2. **配置文件加密**：敏感配置应加密存储
3. **输入验证**：验证所有用户输入，防止注入攻击
4. **沙盒执行**：在安全环境中执行游戏进程

## 扩展开发

### 添加新的认证方式
```javascript
// 扩展认证基类
import { BaseAuth } from 'infinite-mc-core/src/auth/base.js';

class CustomAuth extends BaseAuth {
    async authenticate(credentials) {
        // 实现自定义认证逻辑
    }
}

// 注册到启动器
MCLauncher.registerAuth('custom', CustomAuth);
```

### 添加新的Mod加载器
```javascript
// 实现Mod加载器接口
class FabricModLoader {
    async setupEnvironment(launcher) {
        // 设置Fabric环境
    }
    
    async getLaunchArgs() {
        // 返回Fabric启动参数
    }
}

// 注册Mod加载器
launcher.modManager.registerLoader('fabric', FabricModLoader);
```

## 支持与贡献

- 报告问题：GitHub Issues
- 贡献代码：提交Pull Request
- 文档改进：更新文档文件
- 功能建议：提交Feature Request

## 许可证

MIT License - 查看LICENSE文件了解详情。