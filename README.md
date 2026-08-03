# Infinite MC Launcher Core

> MC的世界，永无止境。

Infinite MC Launcher Core（IMCLC）：跨平台 Minecraft 启动器核心库，为每一个自研启动器打好最坚强的启动。支持原版与 Forge（1.12.2 - 1.21.1），可被 Python / C# / C++ 等任意语言一键调用。

## 使用前注意

**本项目目前为Alpha版本，还是AI写的，可能会有很多很多bug，未经过完整测试，不建议在生产环境中使用。**  
请理性反馈问题，开发者会尽快修复。

## 功能特性

- 离线登录（已实测）
- 正版登录Mojang/Microsoft账户验证（未实测）
- 模块化设计，易于扩展
- 预留mod管理接口
- 预留服务端管理接口
- 配置文件管理
- 游戏版本管理
- 资源文件验证和下载

## 快速开始

### 安装
```bash
# 下载此项目
git clone https://github.com/ted-li-git/Infinite_MC_Launcher_Core.git
```

### 基本使用
```javascript
import { MCLauncher } from './src/index.js';

const launcher = new MCLauncher({
    gameDirectory: './minecraft', //路径
    javaPath: 'java', //Java路径
    version: '1.20.1' //游戏版本
});

// 离线登录
await launcher.offlineLogin('PlayerName');

// 正版登录
await launcher.microsoftLogin('access_token');

// 启动游戏
await launcher.launch();
```

### 或集成到现有项目

#### 通过Git Submodule集成
```bash
# 添加为子模块
git submodule add https://github.com/ted-li-git/Infinite_MC_Launcher_Core.git libs/infinite-mc-core
```

## 文档链接
- [快速简单开始文档](fasteasyguide.md)
- [API文档](API.md)
- [API文档](api.md)
- [.NET 集成指南](docs/DOTNET_GUIDE.md)
- [集成指南](docs/INTEGRATION_GUIDE.md)

**docs目录下的集成指南部分引用方式可能过时，以 API.md 和 fasteasyguide.md 为准**

## 许可证
MIT License
