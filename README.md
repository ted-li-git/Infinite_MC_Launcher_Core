# Infinite MC Launcher Core

> MC的世界，永无止境。

Infinite MC Launcher Core（IMCLC）：跨平台 Minecraft 启动器核心库，为每一个自研启动器打好最坚强的启动。支持原版与 Forge（1.12.2 - 最新的Minecraft），可被 Python / C# / C++ 等任意语言一键调用。

## 使用前注意

**本项目目前为Beta版本，部分由AI撰写，可能有一些未发现，部分功能已经过测试，可以尝试在开发环境中使用，但是请注意备份您的源码。**  
请理性反馈问题，开发者会尽快修复。

## 功能特性

- 离线登录（已实测）
- 正版登录Mojang/Microsoft账户验证（已实测Microsoft登录）
- 模块化设计，易于扩展
- 预留mod管理接口
- 预留服务端管理接口
- 配置文件管理
- 游戏版本管理
- 资源文件验证和下载

## 快速开始

### 安装
```bash
# 方式一：通过 GitHub Packages 安装（推荐）
npm install @ted-li-git/infinite-mc-launcher-core

# 方式二：直接从 GitHub 仓库安装
npm install github:ted-li-git/Infinite_MC_Launcher_Core

# 方式三：克隆项目
git clone https://github.com/ted-li-git/Infinite_MC_Launcher_Core.git
cd Infinite_MC_Launcher_Core
npm install
```

> 使用方式一前，需在项目根目录 `.npmrc` 中添加：
> ```
> @ted-li-git:registry=https://npm.pkg.github.com
> ```

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

#### 通过 npm 安装
```bash
npm install @ted-li-git/infinite-mc-launcher-core
```

#### 通过 Git Submodule 集成
```bash
git submodule add https://github.com/ted-li-git/Infinite_MC_Launcher_Core.git libs/infinite-mc-core
```

## 文档链接
- [快速简单开始文档](fasteasyguide.md)
- [API文档](API.md)
- [.NET 集成指南](docs/DOTNET_GUIDE.md)
- [集成指南](docs/INTEGRATION_GUIDE.md)

**docs目录下的集成指南部分引用方式可能过时，以 API.md 和 fasteasyguide.md 为准**

## 许可证
MIT License
