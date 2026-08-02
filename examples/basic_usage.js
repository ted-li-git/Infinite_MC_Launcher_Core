/**
 * MC Launcher Core - 基本使用示例
 * 展示如何使用启动模块进行离线登录和游戏启动
 */

import { MCLauncher } from '../src/index.js';

async function basicExample() {
    console.log('=== MC Launcher Core 基本使用示例 ===\n');
    
    // 1. 创建启动器实例
    console.log('1. 创建启动器实例...');
    const launcher = new MCLauncher({
        gameDirectory: './minecraft',
        javaPath: 'java',
        version: '1.21.1',
        memory: '2G',
        enableDebug: true
    });
    
    // 2. 离线登录
    console.log('\n2. 进行离线登录...');
    try {
        const profile = await launcher.offlineLogin('TestPlayer');
        console.log(`✅ 离线登录成功！`);
        console.log(`   用户名: ${profile.username}`);
        console.log(`   UUID: ${profile.uuid}`);
        console.log(`   类型: ${profile.type}`);
    } catch (error) {
        console.error(`❌ 离线登录失败: ${error.message}`);
        return;
    }
    
    // 3. 查看可用版本
    console.log('\n3. 获取可用游戏版本...');
    try {
        const versions = await launcher.getAvailableVersions();
        const latestVersions = versions.slice(0, 5); // 显示最新的5个版本
        console.log(`✅ 找到 ${versions.length} 个可用版本`);
        console.log('   最新版本:');
        latestVersions.forEach(version => {
            const status = version.isInstalled ? '(已安装)' : '(未安装)';
            console.log(`   - ${version.id} ${version.type} ${status}`);
        });
    } catch (error) {
        console.error(`❌ 获取版本失败: ${error.message}`);
    }
    
    // 4. 安装指定版本
    console.log('\n4. 安装游戏版本...');
    try {
        const result = await launcher.installVersion('1.21.1');
        if (result.alreadyInstalled) {
            console.log(`✅ 版本 ${result.versionId} 已安装`);
        } else {
            console.log(`✅ 版本安装完成！`);
            console.log(`   版本: ${result.versionId}`);
            console.log(`   库文件数: ${result.librariesCount}`);
            console.log(`   时间戳: ${result.timestamp}`);
        }
    } catch (error) {
        console.error(`❌ 版本安装失败: ${error.message}`);
    }
    
    // 5. 获取启动器状态
    console.log('\n5. 查看启动器状态...');
    const status = launcher.getStatus();
    console.log(`✅ 启动器状态:`);
    console.log(`   是否认证: ${status.authenticated ? '是' : '否'}`);
    console.log(`   游戏目录: ${status.options.gameDirectory}`);
    console.log(`   游戏版本: ${status.options.version}`);
    console.log(`   分配内存: ${status.options.memory}`);
    
    // 6. 准备启动游戏
    console.log('\n6. 准备启动游戏...');
    try {
        const launchArgs = await launcher.prepareLaunch();
        console.log(`✅ 启动准备完成！`);
        console.log(`   主类: ${launchArgs.versionData.mainClass}`);
        console.log(`   参数数量: ${launchArgs.args.length}`);
        console.log(`   类路径: ${launchArgs.classpath?.split(';').length} 个文件`);
    } catch (error) {
        console.error(`❌ 启动准备失败: ${error.message}`);
    }
    
    // 7. 启动游戏
    console.log('\n7. 启动游戏...');
    try {
        console.log('正在启动游戏...');
        const gameProcess = await launcher.launch();
        console.log(`✅ 游戏已启动！进程ID: ${gameProcess.pid}`);

        // 转发游戏输出到控制台
        gameProcess.stdout.on('data', (data) => {
            process.stdout.write(data);
        });
        gameProcess.stderr.on('data', (data) => {
            process.stderr.write(data);
        });

        // 监听游戏退出
        gameProcess.on('close', (code) => {
            console.log(`\n游戏进程退出，代码: ${code}`);
            launcher.cleanup();
            process.exit(code || 0);
        });
    } catch (error) {
        console.error(`❌ 游戏启动失败: ${error.message}`);
        launcher.cleanup();
        return;
    }

    // 8. 游戏运行中
    console.log('\n8. 游戏运行中，关闭游戏窗口后自动退出...');
}

async function microsoftAuthExample() {
    console.log('\n\n=== Microsoft 认证示例 ===\n');
    
    const launcher = new MCLauncher({
        gameDirectory: './minecraft_test',
        enableDebug: true
    });
    
    console.log('Microsoft认证需要用户交互：');
    console.log('1. 启动设备流认证');
    console.log('2. 用户需要在浏览器中授权');
    console.log('3. 获取访问令牌');
    console.log('4. 完成认证\n');
    
    console.log('示例代码:');
    console.log(`
    async function microsoftLoginExample() {
        const launcher = new MCLauncher({
            gameDirectory: './minecraft_test',
            enableDebug: true
        });
        
        try {
            // 启动设备流认证
            console.log('请访问以下URL并输入设备代码：');
            // const deviceFlow = await launcher.microsoftAuth.startDeviceFlow();
            // console.log('验证URL:', deviceFlow.verificationUriComplete);
            // console.log('设备代码:', deviceFlow.userCode);
            
            // 等待用户授权
            // const profile = await launcher.microsoftLogin();
            // console.log('✅ Microsoft认证成功！');
            // console.log('用户名:', profile.username);
            // console.log('UUID:', profile.uuid);
            
        } catch (error) {
            console.error('❌ Microsoft认证失败:', error.message);
        }
    }
    `);
}

async function serverExample() {
    console.log('\n\n=== 服务端管理示例 ===\n');
    
    const launcher = new MCLauncher({
        gameDirectory: './minecraft_test',
        enableDebug: true
    });
    
    console.log('服务端管理功能示例：\n');
    
    console.log('1. 创建服务端配置:');
    console.log(`
    const serverConfig = await launcher.serverManager.createServer({
        name: '我的服务器',
        version: '1.20.1',
        port: 25565,
        maxPlayers: 10,
        gameMode: 'survival'
    });
    console.log('服务端创建成功:', serverConfig.id);
    `);
    
    console.log('\n2. 启动服务端:');
    console.log(`
    const serverProcess = await launcher.launchServer(serverConfig.id);
    console.log('服务端已启动，进程ID:', serverProcess.pid);
    `);
    
    console.log('\n3. 管理服务端:');
    console.log(`
    // 列出所有服务端
    const servers = await launcher.serverManager.listServers();
    
    // 获取服务端状态
    const status = await launcher.serverManager.getServerStatus(serverConfig.id);
    
    // 停止服务端
    await launcher.serverManager.stopServer(serverConfig.id);
    
    // 备份服务端
    await launcher.serverManager.backupServer(serverConfig.id);
    `);
}

async function modManagementExample() {
    console.log('\n\n=== Mod 管理示例 ===\n');
    
    const launcher = new MCLauncher({
        gameDirectory: './minecraft_test',
        enableDebug: true
    });
    
    console.log('Mod管理功能示例：\n');
    
    console.log('1. 扫描已安装的mod:');
    console.log(`
    const mods = await launcher.modManager.scanInstalledMods();
    console.log('找到', mods.length, '个mod');
    mods.forEach(mod => {
        console.log('-', mod.name, mod.enabled ? '(已启用)' : '(已禁用)');
    });
    `);
    
    console.log('\n2. 安装mod:');
    console.log(`
    const installResult = await launcher.modManager.installMod('./path/to/mod.jar', {
        overwrite: true
    });
    console.log('Mod安装成功:', installResult.fileName);
    `);
    
    console.log('\n3. 启用/禁用mod:');
    console.log(`
    // 启用mod
    await launcher.modManager.toggleMod('fabric-api', true);
    
    // 禁用mod  
    await launcher.modManager.toggleMod('optifine', false);
    `);
    
    console.log('\n4. 批量操作:');
    console.log(`
    await launcher.modManager.batchOperation(['mod1', 'mod2', 'mod3'], 'disable');
    `);
}

// 运行示例
async function runAllExamples() {
    try {
        await basicExample();
    } catch (error) {
        console.error('示例运行出错:', error);
    }
}

// 执行示例
runAllExamples().catch(console.error);