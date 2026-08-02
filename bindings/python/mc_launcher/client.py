"""MC Launcher Core Python SDK 客户端"""

import json
import subprocess
from pathlib import Path
from typing import Optional, Callable, List, Dict, Any

from .exceptions import LauncherError


class MCLauncher:
    """Minecraft 启动器 Python 封装

    通过 subprocess 调用 Node.js CLI，Python 开发者无需懂 JavaScript。

    Args:
        cli_path: cli.js 文件路径（默认自动查找）
        node_path: Node.js 可执行文件路径（默认 'node'）
        game_dir: 默认游戏目录
    """

    def __init__(
        self,
        cli_path: Optional[str] = None,
        node_path: str = 'node',
        game_dir: Optional[str] = None
    ):
        self.node_path = node_path
        self.game_dir = game_dir

        if cli_path:
            self.cli_path = cli_path
        else:
            # 自动查找 cli.js
            # bindings/python/mc_launcher/client.py -> ../../../cli.js
            self.cli_path = str(
                Path(__file__).parent.parent.parent.parent / 'cli.js'
            )

    def _run_command(self, args: List[str], use_json: bool = True) -> Dict[str, Any]:
        """运行 CLI 命令并返回结果"""
        cmd = [self.node_path, self.cli_path] + args

        if self.game_dir and '--game-dir' not in args:
            cmd.extend(['--game-dir', self.game_dir])

        if use_json:
            cmd.append('--json')

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding='utf-8'
        )

        if result.returncode != 0:
            raise LauncherError(
                f"Command failed (exit {result.returncode}): {result.stderr.strip()}"
            )

        if use_json:
            try:
                return json.loads(result.stdout)
            except json.JSONDecodeError as e:
                raise LauncherError(
                    f"Invalid JSON output: {e}\nstdout: {result.stdout[:500]}"
                )

        return {'output': result.stdout}

    def get_versions(self) -> List[Dict[str, Any]]:
        """获取可用版本列表

        Returns:
            版本列表，每个版本包含 id, type, releaseTime, url, isInstalled
        """
        result = self._run_command(['versions'])
        if result.get('success'):
            return result['versions']
        raise LauncherError(result.get('error', 'Unknown error'))

    def install(self, version: str) -> Dict[str, Any]:
        """安装游戏版本

        Args:
            version: 游戏版本 ID（如 '1.20.1'）

        Returns:
            安装结果
        """
        result = self._run_command(['install', '--version', version])
        if result.get('success'):
            return result
        raise LauncherError(result.get('error', 'Unknown error'))

    def check_integrity(self, version: str) -> Dict[str, Any]:
        """检查版本文件完整性

        Args:
            version: 游戏版本 ID

        Returns:
            包含 complete (bool) 和 missing (list) 的字典
        """
        result = self._run_command(['check', '--version', version])
        if result.get('success'):
            return {
                'complete': result.get('complete', False),
                'missing': result.get('missing', [])
            }
        raise LauncherError(result.get('error', 'Unknown error'))

    def detect_java(self) -> List[Dict[str, Any]]:
        """检测系统中的 Java 安装

        Returns:
            Java 安装列表，每项包含 path 和 version
        """
        result = self._run_command(['java'])
        if result.get('success'):
            return result['javas']
        raise LauncherError(result.get('error', 'Unknown error'))

    def launch(
        self,
        version: str,
        username: str = 'Player',
        auth_type: str = 'offline',
        memory: Optional[str] = None,
        window_width: Optional[int] = None,
        window_height: Optional[int] = None,
        access_token: Optional[str] = None,
        password: Optional[str] = None,
        on_event: Optional[Callable[[Dict], None]] = None
    ) -> Dict[str, Any]:
        """启动游戏

        Args:
            version: 游戏版本 ID
            username: 玩家用户名
            auth_type: 认证方式（'offline'/'microsoft'/'mojang'）
            memory: 内存大小（如 '2G'）
            window_width: 窗口宽度
            window_height: 窗口高度
            access_token: Microsoft 访问令牌（auth_type='microsoft' 时）
            password: Mojang 密码（auth_type='mojang' 时）
            on_event: 事件回调函数，接收 {event, data} 字典
                      事件类型: log, game_stdout, game_stderr, game_exit

        Returns:
            启动结果，包含 pid 和 version
        """
        if on_event is None:
            return self._launch_simple(
                version, username, auth_type, memory,
                window_width, window_height,
                access_token, password
            )
        else:
            return self._launch_stdio(
                version, username, auth_type, memory,
                window_width, window_height,
                access_token, password, on_event
            )

    def _launch_simple(
        self, version, username, auth_type, memory,
        window_width, window_height, access_token, password
    ) -> Dict[str, Any]:
        """简单模式启动（无事件回调）"""
        args = ['launch', '--version', version, '--username', username, '--auth', auth_type]

        if memory:
            args.extend(['--memory', memory])
        if window_width:
            args.extend(['--window-width', str(window_width)])
        if window_height:
            args.extend(['--window-height', str(window_height)])
        if access_token:
            args.extend(['--access-token', access_token])
        if password:
            args.extend(['--password', password])

        result = self._run_command(args)
        if result.get('success'):
            return result
        raise LauncherError(result.get('error', 'Unknown error'))

    def _launch_stdio(
        self, version, username, auth_type, memory,
        window_width, window_height, access_token, password,
        on_event: Callable[[Dict], None]
    ) -> Dict[str, Any]:
        """stdio 模式启动（支持事件回调）"""
        cmd = [self.node_path, self.cli_path, 'stdio']
        if self.game_dir:
            cmd.extend(['--game-dir', self.game_dir])

        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding='utf-8'
        )

        # 构建 launch 请求
        params = {
            'version': version,
            'username': username,
            'authType': auth_type,
        }
        if memory:
            params['memory'] = memory
        if window_width:
            params['windowWidth'] = window_width
        if window_height:
            params['windowHeight'] = window_height
        if access_token:
            params['accessToken'] = access_token
        if password:
            params['password'] = password

        request = {'id': 1, 'method': 'launch', 'params': params}

        proc.stdin.write(json.dumps(request) + '\n')
        proc.stdin.flush()

        # 读取响应和事件
        result = None
        for line in proc.stdout:
            line = line.strip()
            if not line:
                continue

            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                continue

            if 'id' in msg:
                if 'result' in msg:
                    result = msg['result']
                elif 'error' in msg:
                    raise LauncherError(msg['error'].get('message', 'Unknown error'))
            elif 'event' in msg:
                on_event(msg)

        if result is None:
            raise LauncherError('No response from launcher')

        return result
