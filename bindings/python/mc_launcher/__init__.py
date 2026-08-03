"""Infinite MC Launcher Core Python SDK

Minecraft 启动器 Python SDK，通过 subprocess 调用 Node.js CLI。
支持简单调用和 stdio 事件回调两种模式。

示例:
    from mc_launcher import MCLauncher

    launcher = MCLauncher(game_dir='C:/Users/user/.minecraft')

    # 获取版本列表
    versions = launcher.get_versions()

    # 检查完整性
    integrity = launcher.check_integrity('1.20.1')

    # 一键启动
    result = launcher.launch(version='1.20.1', username='Player1')

    # 带进度回调的启动
    def on_event(event):
        print(f"[{event['event']}] {event.get('data', '')}")

    result = launcher.launch(
        version='1.20.1',
        username='Player1',
        on_event=on_event
    )
"""

from .client import MCLauncher
from .exceptions import LauncherError

__all__ = ['MCLauncher', 'LauncherError']
__version__ = '1.0.0'
