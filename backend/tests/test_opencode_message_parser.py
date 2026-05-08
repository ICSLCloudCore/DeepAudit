"""
OpenCode 消息解析器测试类

可以独立运行，用于测试 OpenCodeMessageParser 的功能
"""

import sys
import json
from pathlib import Path

# 添加项目根目录到 Python 路径
sys.path.insert(0, str(Path(__file__).parent.parent))

# 直接导入需要的模块，避免触发 app.services.__init__ 的导入
import importlib.util

# 加载 opencode_message_parser.py
spec_parser = importlib.util.spec_from_file_location(
    "opencode_message_parser",
    str(
        Path(__file__).parent.parent
        / "app"
        / "services"
        / "opencode"
        / "opencode_message_parser.py"
    ),
)
opencode_message_parser = importlib.util.module_from_spec(spec_parser)
sys.modules["opencode_message_parser"] = opencode_message_parser
spec_parser.loader.exec_module(opencode_message_parser)
OpenCodeMessageParser = opencode_message_parser.OpenCodeMessageParser

# 加载 opencode_message.py schema
spec_schema = importlib.util.spec_from_file_location(
    "opencode_message",
    str(Path(__file__).parent.parent / "app" / "schemas" / "opencode_message.py"),
)
opencode_message = importlib.util.module_from_spec(spec_schema)
sys.modules["opencode_message"] = opencode_message
spec_schema.loader.exec_module(opencode_message)
PartType = opencode_message.PartType
TextPart = opencode_message.TextPart
ReasoningPart = opencode_message.ReasoningPart
ToolPart = opencode_message.ToolPart
StepStartPart = opencode_message.StepStartPart
StepFinishPart = opencode_message.StepFinishPart


class OpenCodeMessageParserTester:
    """OpenCode 消息解析器测试类"""

    def __init__(self):
        """初始化测试器"""
        pass

    def get_sample_data(self):
        """获取内置示例数据"""
        return [
            {
                "info": {
                    "role": "user",
                    "time": {"start": 1234567890},
                    "id": "msg_001",
                    "sessionID": "sess_001",
                },
                "parts": [
                    {
                        "type": "text",
                        "id": "part_001",
                        "sessionID": "sess_001",
                        "messageID": "msg_001",
                        "text": "Please audit this code for security vulnerabilities",
                    }
                ],
            },
            {
                "info": {
                    "role": "assistant",
                    "time": {"start": 1234567891, "end": 1234567899},
                    "id": "msg_002",
                    "sessionID": "sess_001",
                    "finish": "complete",
                    "summary": {"vulnerabilities": 3},
                },
                "parts": [
                    {
                        "type": "step-start",
                        "id": "part_002",
                        "sessionID": "sess_001",
                        "messageID": "msg_002",
                    },
                    {
                        "type": "tool",
                        "id": "part_003",
                        "sessionID": "sess_001",
                        "messageID": "msg_002",
                        "callID": "call_001",
                        "tool": "file_read",
                        "state": {
                            "status": "success",
                            "input": {"path": "/src/main.py"},
                            "output": "import os\n\ndef main():\n    password = input('Enter password: ')\n    os.system(f'echo {password}')\n",
                            "title": "Reading source file",
                        },
                    },
                    {
                        "type": "reasoning",
                        "id": "part_004",
                        "sessionID": "sess_001",
                        "messageID": "msg_002",
                        "text": "I found a command injection vulnerability in the code. The password input is directly passed to os.system() without sanitization.",
                    },
                    {
                        "type": "text",
                        "id": "part_005",
                        "sessionID": "sess_001",
                        "messageID": "msg_002",
                        "text": "# Security Audit Report\n\n## Critical Vulnerabilities\n\n1. **Command Injection** in main()\n   - Location: /src/main.py:5\n   - Risk: Remote code execution\n   - Fix: Use subprocess.run() with shell=False and proper escaping",
                    },
                    {
                        "type": "step-finish",
                        "id": "part_006",
                        "sessionID": "sess_001",
                        "messageID": "msg_002",
                        "reason": "complete",
                        "cost": 0.0025,
                    },
                ],
            },
        ]

    def load_json_from_file(self, file_path):
        """从文件加载 JSON 数据"""
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading JSON file: {e}")
            return None

    def print_part_info(self, part, part_index):
        """打印单个 Part 的详细信息"""
        part_type = part.type
        print(f"  +- Part {part_index + 1}: {part_type.value.upper()}")
        print(f"  |  Part ID: {part.id}")

        if part_type == PartType.TEXT:
            text_display = part.text[:100] + ("..." if len(part.text) > 100 else "")
            print(f"  |  Text: {repr(text_display)}")
        elif part_type == PartType.REASONING:
            text_display = part.text[:100] + ("..." if len(part.text) > 100 else "")
            print(f"  |  Reasoning: {repr(text_display)}")
        elif part_type == PartType.TOOL:
            print(f"  |  Tool: {part.tool}")
            print(f"  |  Call ID: {part.callID}")
            print(f"  |  Status: {part.state.status}")
            print(f"  |  Title: {part.state.title}")
        elif part_type == PartType.STEP_START:
            print(f"  |  Step started")
        elif part_type == PartType.STEP_FINISH:
            print(f"  |  Reason: {part.reason}")
            if hasattr(part, "cost") and part.cost is not None:
                print(f"  |  Cost: ${part.cost:.4f}")

        print()

    def print_message_info(self, message, msg_index):
        """打印单条消息的详细信息"""
        print(f"\n{'=' * 60}")
        print(f"Message {msg_index + 1}")
        print(f"{'=' * 60}")
        print(f"Role: {message.info.role}")
        print(f"Message ID: {message.info.id}")
        print(f"Session ID: {message.info.sessionID}")

        if hasattr(message.info, "finish") and message.info.finish:
            print(f"Finish: {message.info.finish}")

        if hasattr(message.info, "summary") and message.info.summary:
            print(f"Summary: {message.info.summary}")

        print(f"\nParts ({len(message.parts)}):")
        for idx, part in enumerate(message.parts):
            self.print_part_info(part, idx)

    def parse_and_print(self, json_data):
        """
        解析 JSON 数据并打印结果

        Args:
            json_data: JSON 数据（字典或列表）
        """
        try:
            # 判断是单条消息还是消息数组
            if isinstance(json_data, dict):
                print("解析单条消息...")
                message = OpenCodeMessageParser.parse_raw_message(json_data)
                self.print_message_info(message, 0)
            elif isinstance(json_data, list):
                print(f"解析消息数组 ({len(json_data)} 条消息)...")
                messages = OpenCodeMessageParser.parse_message_array(json_data)
                for idx, msg in enumerate(messages):
                    self.print_message_info(msg, idx)
            else:
                print(f"错误: 不支持的数据类型 {type(json_data)}")
                return

            print(f"\n{'=' * 60}")
            print("[OK] 解析成功！")
            print(f"{'=' * 60}")

        except Exception as e:
            print(f"\n[ERROR] 解析失败: {e}")
            import traceback

            traceback.print_exc()


def run_tests():
    """独立运行的测试函数"""
    print("=" * 60)
    print("OpenCode 消息解析器测试")
    print("=" * 60)

    tester = OpenCodeMessageParserTester()

    # 测试2：从文件加载示例数据
    print("\n[测试 2] 从 docs/example/message.json 加载示例数据")

    # 使用绝对路径
    example_file = "C:/Users/40990/Documents/DeepAudit/docs/example/message.json"
    print(f"尝试加载: {example_file}")

    from pathlib import Path

    if Path(example_file).exists():
        print(f"文件存在，开始加载...")
        file_data = tester.load_json_from_file(example_file)
        if file_data:
            print(f"成功加载，开始解析...")
            tester.parse_and_print(file_data)
    else:
        print(f"文件不存在")

    print("\n" + "=" * 60)
    print("[DONE] 所有测试完成！")
    print("=" * 60)
    print("OpenCode 消息解析器测试")
    print("=" * 60)

    print("\n" + "=" * 60)
    print("[DONE] 所有测试完成！")
    print("=" * 60)


if __name__ == "__main__":
    run_tests()
