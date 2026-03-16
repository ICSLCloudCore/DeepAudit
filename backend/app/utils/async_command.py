"""
异步命令执行工具

提供安全、高效的异步命令执行功能，支持超时控制、输出捕获等。
"""

import asyncio
import os
import shlex
from typing import Optional, List, Dict, Union, Tuple, Sequence
from dataclasses import dataclass
from enum import Enum


class CommandExecutionError(Exception):
    """命令执行错误"""
    def __init__(
        self,
        message: str,
        returncode: Optional[int] = None,
        stdout: Optional[str] = None,
        stderr: Optional[str] = None
    ):
        super().__init__(message)
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


@dataclass
class CommandResult:
    """命令执行结果"""
    returncode: int
    stdout: str
    stderr: str
    success: bool
    command: Union[str, List[str]]

    @property
    def output(self) -> str:
        """获取完整输出（stdout + stderr）"""
        parts = []
        if self.stdout:
            parts.append(self.stdout)
        if self.stderr:
            parts.append(self.stderr)
        return "\n".join(parts)


async def execute_command(
    command: Union[str, List[str]],
    cwd: Optional[str] = None,
    env: Optional[Dict[str, str]] = None,
    timeout: Optional[float] = None,
    shell: bool = False,
    stdin: Optional[Union[str, bytes]] = None,
    encoding: str = "utf-8",
    errors: str = "replace",
    capture_output: bool = True,
    check: bool = False
) -> CommandResult:
    """
    异步执行命令

    Args:
        command: 要执行的命令（字符串或参数列表）
        cwd: 工作目录
        env: 环境变量字典
        timeout: 超时时间（秒）
        shell: 是否使用 shell 执行
        stdin: 标准输入内容
        encoding: 输出编码
        errors: 编码错误处理方式
        capture_output: 是否捕获输出
        check: 如果命令返回非零状态码，是否抛出异常

    Returns:
        CommandResult 包含执行结果

    Raises:
        CommandExecutionError: 当 check=True 且命令失败时
        asyncio.TimeoutError: 当命令执行超时时
    """
    # 处理环境变量
    process_env = {**os.environ, **env} if env else None

    # 处理 stdin
    stdin_bytes = None
    if stdin is not None:
        if isinstance(stdin, str):
            stdin_bytes = stdin.encode(encoding)
        else:
            stdin_bytes = stdin

    # 准备子进程参数
    subprocess_kwargs = {
        "cwd": cwd,
        "env": process_env,
    }

    if capture_output:
        subprocess_kwargs["stdout"] = asyncio.subprocess.PIPE
        subprocess_kwargs["stderr"] = asyncio.subprocess.PIPE
    else:
        subprocess_kwargs["stdout"] = None
        subprocess_kwargs["stderr"] = None

    if stdin is not None:
        subprocess_kwargs["stdin"] = asyncio.subprocess.PIPE

    # 创建子进程
    if shell:
        # 使用 shell 模式
        if isinstance(command, list):
            cmd_str = " ".join(shlex.quote(str(arg)) for arg in command)
        else:
            cmd_str = str(command)
        process = await asyncio.create_subprocess_shell(
            cmd_str,
            **subprocess_kwargs
        )
    else:
        # 使用 exec 模式（更安全）
        if isinstance(command, str):
            cmd_list = shlex.split(command)
        else:
            cmd_list = list(command)
        process = await asyncio.create_subprocess_exec(
            *cmd_list,
            **subprocess_kwargs
        )

    # 执行命令并等待结果
    try:
        if timeout is not None:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                process.communicate(stdin_bytes),
                timeout=timeout
            )
        else:
            stdout_bytes, stderr_bytes = await process.communicate(stdin_bytes)
    except asyncio.TimeoutError:
        # 超时，尝试杀死进程
        try:
            process.kill()
            await process.wait()
        except:
            pass
        raise

    # 解码输出
    stdout = ""
    stderr = ""
    if capture_output:
        if stdout_bytes is not None:
            stdout = stdout_bytes.decode(encoding, errors=errors)
        if stderr_bytes is not None:
            stderr = stderr_bytes.decode(encoding, errors=errors)

    result = CommandResult(
        returncode=process.returncode,
        stdout=stdout,
        stderr=stderr,
        success=process.returncode == 0,
        command=command
    )

    # 检查是否需要抛出异常
    if check and not result.success:
        raise CommandExecutionError(
            f"Command failed with return code {result.returncode}",
            returncode=result.returncode,
            stdout=result.stdout,
            stderr=result.stderr
        )

    return result


async def execute_command_simple(
    command: Union[str, List[str]],
    cwd: Optional[str] = None,
    timeout: Optional[float] = None,
    check: bool = True
) -> str:
    """
    简化版本的命令执行，只返回 stdout

    Args:
        command: 要执行的命令
        cwd: 工作目录
        timeout: 超时时间
        check: 是否检查返回码

    Returns:
        stdout 输出内容

    Raises:
        CommandExecutionError: 当 check=True 且命令失败时
    """
    result = await execute_command(
        command=command,
        cwd=cwd,
        timeout=timeout,
        shell=False,
        capture_output=True,
        check=check
    )
    return result.stdout


async def execute_command_stream(
    command: Union[str, List[str]],
    cwd: Optional[str] = None,
    env: Optional[Dict[str, str]] = None,
    timeout: Optional[float] = None,
    shell: bool = False,
    encoding: str = "utf-8",
    errors: str = "replace"
) -> Tuple[int, asyncio.StreamReader, asyncio.StreamReader]:
    """
    流式执行命令，返回进程对象和流读取器

    注意：使用此函数需要手动管理进程生命周期

    Args:
        command: 要执行的命令
        cwd: 工作目录
        env: 环境变量
        timeout: 超时时间（用于初始化，不是完整执行超时）
        shell: 是否使用 shell
        encoding: 编码
        errors: 错误处理

    Returns:
        (process, stdout_reader, stderr_reader)
    """
    process_env = {**os.environ, **env} if env else None

    if shell:
        if isinstance(command, list):
            cmd_str = " ".join(shlex.quote(str(arg)) for arg in command)
        else:
            cmd_str = str(command)
        process = await asyncio.create_subprocess_shell(
            cmd_str,
            cwd=cwd,
            env=process_env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
    else:
        if isinstance(command, str):
            cmd_list = shlex.split(command)
        else:
            cmd_list = list(command)
        process = await asyncio.create_subprocess_exec(
            *cmd_list,
            cwd=cwd,
            env=process_env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

    return process, process.stdout, process.stderr


async def execute_commands_parallel(
    commands: List[Union[str, List[str]]],
    cwd: Optional[str] = None,
    env: Optional[Dict[str, str]] = None,
    timeout: Optional[float] = None,
    max_concurrent: Optional[int] = None,
    check: bool = False
) -> List[CommandResult]:
    """
    并行执行多个命令

    Args:
        commands: 命令列表
        cwd: 工作目录
        env: 环境变量
        timeout: 每个命令的超时时间
        max_concurrent: 最大并发数
        check: 是否检查返回码

    Returns:
        CommandResult 列表
    """
    if max_concurrent is None:
        # 无限制并发
        tasks = [
            execute_command(
                cmd,
                cwd=cwd,
                env=env,
                timeout=timeout,
                shell=False,
                capture_output=True,
                check=check
            )
            for cmd in commands
        ]
        return await asyncio.gather(*tasks)
    else:
        # 使用信号量控制并发
        semaphore = asyncio.Semaphore(max_concurrent)

        async def bounded_execute(cmd):
            async with semaphore:
                return await execute_command(
                    cmd,
                    cwd=cwd,
                    env=env,
                    timeout=timeout,
                    shell=False,
                    capture_output=True,
                    check=check
                )

        tasks = [bounded_execute(cmd) for cmd in commands]
        return await asyncio.gather(*tasks)


def which(program: str) -> Optional[str]:
    """
    查找可执行程序路径（同步版本）

    Args:
        program: 程序名称

    Returns:
        程序路径或 None
    """
    return shlex.which(program)


async def async_which(program: str) -> Optional[str]:
    """
    异步查找可执行程序路径

    Args:
        program: 程序名称

    Returns:
        程序路径或 None
    """
    return await asyncio.to_thread(which, program)


async def check_command_available(command: str) -> bool:
    """
    检查命令是否可用

    Args:
        command: 命令名称

    Returns:
        是否可用
    """
    try:
        await execute_command(
            [command, "--version"] if os.name != "nt" else [command, "/?"],
            timeout=5,
            check=False,
            capture_output=True
        )
        return True
    except Exception:
        return False