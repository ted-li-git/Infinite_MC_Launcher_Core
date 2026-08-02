# MC Launcher Core

一个功能完善的Minecraft启动模块，支持离线登录和正版登录，预留mod和服务端扩展空间。

## 功能特性

- ✅ 离线登录（用户名验证）
- ✅ 正版登录（Mojang/Microsoft账户验证）
- ✅ 模块化设计，易于扩展
- ✅ 预留mod管理接口
- ✅ 预留服务端管理接口
- ✅ 配置文件管理
- ✅ 游戏版本管理
- ✅ 资源文件验证和下载

## 快速开始

### 安装
```bash
# 克隆项目
git clone https://github.com/yourusername/mc-launcher-core.git

# 或通过npm安装（如果使用JavaScript版本）
npm install mc-launcher-core
```

### 基本使用
```javascript
import { MCLauncher } from 'mc-launcher-core';

const launcher = new MCLauncher({
    gameDirectory: './minecraft',
    javaPath: 'java',
    version: '1.20.1'
});

// 离线登录
await launcher.offlineLogin('PlayerName');

// 或正版登录
await launcher.microsoftLogin('access_token');

// 启动游戏
await launcher.launch();
```

## 项目结构

```
mc_launcher_core/
├── src/
│   ├── auth/              # 认证模块
│   │   ├── offline/       # 离线登录
│   │   └── microsoft/     # Microsoft账户登录
│   ├── game/             # 游戏启动管理
│   │   ├── version.js    # 版本管理
│   │   └── assets.js     # 资源管理
│   ├── mods/             # mod管理（预留）
│   ├── servers/          # 服务端管理（预留）
│   └── utils/            # 工具函数
├── examples/             # 示例代码
└── docs/                # 文档
```

## API文档

### MCLauncher类
主启动器类，管理所有启动相关功能。

#### 构造函数
```javascript
new MCLauncher(options)
```

#### 参数
- `options.gameDirectory` - 游戏目录路径
- `options.javaPath` - Java可执行文件路径（默认：'java'）
- `options.version` - 游戏版本
- `options.memory` - 分配内存大小（默认：'2G'）

#### 方法
- `offlineLogin(username)` - 离线登录
- `microsoftLogin(accessToken)` - Microsoft账户登录
- `mojangLogin(username, password)` - Mojang账户登录（传统）
- `launch(options)` - 启动游戏
- `getAvailableVersions()` - 获取可用版本列表
- `installVersion(version)` - 安装指定版本

## 扩展开发

### 添加Mod支持
```javascript
// 在mods目录创建自定义mod管理器
class ModManager {
    constructor(launcher) {
        this.launcher = launcher;
    }
    
    installMod(modFile) {
        // 实现mod安装逻辑
    }
}
```

### 添加服务端支持
```javascript
// 在servers目录创建服务端管理器
class ServerManager {
    constructor(launcher) {
        this.launcher = launcher;
    }
    
    startServer(serverConfig) {
        // 实现服务端启动逻辑
    }
}
```

## 集成到现有项目

### 通过Git Submodule集成
```bash
# 添加为子模块
git submodule add https://github.com/yourusername/mc-launcher-core.git libs/mc-launcher-core
```

### 通过CDN集成
```html
<script src="https://cdn.jsdelivr.net/npm/mc-launcher-core/dist/mc-launcher.min.js"></script>
```

## 许可证
MIT License