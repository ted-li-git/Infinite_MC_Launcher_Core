import { MCLauncher } from '../src/index.js';

const launcher = new MCLauncher({
    gameDirectory: './minecraft',
    version: '1.21.1-Forge_52.1.8',
    instanceDir: './minecraft/versions/1.21.1-Forge_52.1.8',
    memory: '2G',
    enableDebug: true
});

try {
    console.log('=== Forge 启动测试 ===');
    await launcher.offlineLogin('TestPlayer');
    const proc = await launcher.launch();
    console.log(`游戏已启动, PID: ${proc.pid}`);

    proc.stdout.on('data', d => process.stdout.write(d));
    proc.stderr.on('data', d => process.stderr.write(d));
    proc.on('close', code => {
        console.log(`\n游戏退出, 代码: ${code}`);
        launcher.cleanup();
        process.exit(code ?? 0);
    });
} catch (err) {
    console.error('启动失败:', err);
    process.exit(1);
}
