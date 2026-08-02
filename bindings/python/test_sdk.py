"""测试 Python SDK"""
import sys
sys.path.insert(0, '.')

from mc_launcher import MCLauncher, LauncherError

launcher = MCLauncher(game_dir='./minecraft')

# 1. 检测 Java
print('=== Java 检测 ===')
javas = launcher.detect_java()
print(f'Found {len(javas)} Java installations:')
for j in javas:
    print(f'  Java {j["version"]}: {j["path"]}')

# 2. 检查完整性
print('\n=== 完整性检查 ===')
integrity = launcher.check_integrity('1.12.2')
print(f'1.12.2: complete={integrity["complete"]}, missing={len(integrity["missing"])} files')
if integrity['missing']:
    for m in integrity['missing'][:3]:
        print(f'  - {m}')

# 3. 获取版本列表
print('\n=== 版本列表 ===')
versions = launcher.get_versions()
installed = [v for v in versions if v.get('isInstalled')]
print(f'Total: {len(versions)}, Installed: {len(installed)}')
for v in installed[:5]:
    print(f'  {v["id"]} ({v["type"]})')

print('\n=== 测试完成 ===')
