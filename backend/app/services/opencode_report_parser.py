"""
OpenCode报告解析服务
用于解析OpenCode生成的审计报告并存储到数据库
"""

import os
import re
import json
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


class OpenCodeReportParser:
    """OpenCode报告解析器"""

    def __init__(self):
        self.severity_map = {"致命": "critical", "严重": "high", "一般": "medium", "提示": "low"}
        self.confidence_map = {"确认": "confirmed", "高": "high", "中": "medium", "低": "low"}
        # 全局计数器，用于确保每个文件的漏洞ID唯一
        self.global_vuln_counter = 0

    def parse_report_directory(self, reports_dir: str) -> List[Dict[str, Any]]:
        """
        解析报告目录下的所有漏洞文件

        Args:
            reports_dir: 报告目录路径

        Returns:
            解析后的漏洞数据列表
        """
        findings = []
        reports_path = Path(reports_dir)

        if not reports_path.exists():
            logger.warning(f"报告目录不存在: {reports_dir}")
            return findings

        # 重置全局计数器
        self.global_vuln_counter = 0

        # 查找所有漏洞文件
        vuln_files = list(reports_path.glob("VULN-*.md"))

        for vuln_file in vuln_files:
            try:
                file_findings = self.parse_vulnerability_file(str(vuln_file))
                findings.extend(file_findings)
                logger.info(f"成功解析文件 {vuln_file.name}，发现 {len(file_findings)} 个漏洞")
            except Exception as e:
                logger.error(f"解析文件 {vuln_file.name} 时出错: {str(e)}")

        return findings

    def parse_vulnerability_file(self, file_path: str) -> List[Dict[str, Any]]:
        """
        解析单个漏洞文件

        Args:
            file_path: 漏洞文件路径

        Returns:
            解析后的漏洞数据列表
        """
        findings = []

        # 从文件名提取信息
        filename = Path(file_path).name
        count_or_range, severity_cn = self.extract_filename_info(filename)

        if not count_or_range or not severity_cn:
            logger.warning(f"无法从文件名提取信息: {filename}")
            return findings

        severity = self.severity_map.get(severity_cn, severity_cn)

        # 读取文件内容
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()

        # 分割多个漏洞
        vuln_sections = self._split_vulnerability_sections(content)

        for i, section in enumerate(vuln_sections):
            try:
                vuln_id = self._determine_vuln_id(count_or_range, i, section)
                finding_data = self.extract_finding_data(section, vuln_id, severity)
                findings.append(finding_data)
            except Exception as e:
                logger.error(f"解析漏洞 {i + 1} 时出错: {str(e)}")

        return findings

    def extract_filename_info(self, filename: str) -> Tuple[Optional[str], Optional[str]]:
        """
        从文件名提取漏洞信息

        支持两种格式:
        - 旧格式: VULN-{start}-{end}_{severity}.md (例如: VULN-001-005_致命.md)
        - 新格式: VULN-{count}_{severity}.md (例如: VULN-5-low.md)

        Args:
            filename: 文件名

        Returns:
            (数量或范围标识, 严重程度中文)
        """
        # 先尝试新格式: VULN-{count}_{severity}.md
        new_pattern = r"VULN-(\d+)_(.+)\.md"
        match = re.match(new_pattern, filename)
        if match:
            count = match.group(1)
            severity = match.group(2)
            # 将英文严重程度转换为中文以保持一致性
            severity_map = {"critical": "致命", "high": "严重", "medium": "一般", "low": "提示"}
            severity_cn = severity_map.get(severity.lower(), severity)
            return count, severity_cn

        # 再尝试旧格式: VULN-{start}-{end}_{severity}.md
        old_pattern = r"VULN-(\d+-\d+)_(.+)\.md"
        match = re.match(old_pattern, filename)
        if match:
            vuln_id_range = match.group(1)
            severity_cn = match.group(2)
            return vuln_id_range, severity_cn

        return None, None

    def _split_vulnerability_sections(self, content: str) -> List[str]:
        """
        将内容分割为多个漏洞部分

        假设每个漏洞以 ## VULN-xxx 或类似标题开始

        Args:
            content: 文件内容

        Returns:
            漏洞部分列表
        """
        # 尝试按 ## 标题分割
        sections = re.split(r"(?=##\s+VULN-\d+)", content)

        # 过滤空部分
        sections = [s.strip() for s in sections if s.strip()]

        return sections

    def _determine_vuln_id(self, count_or_range: str, index: int, section: str) -> str:
        """
        确定漏洞ID

        首先尝试从section内容中提取，如果失败则根据count_or_range和索引生成

        Args:
            count_or_range: 漏洞数量或范围 (如 "5" 或 "001-005")
            index: 在文件中的索引
            section: 漏洞内容部分

        Returns:
            漏洞ID (如 "VULN-001")
        """
        # 尝试从section中提取
        vuln_id_match = re.search(r"VULN-(\d+)", section)
        if vuln_id_match:
            return f"VULN-{vuln_id_match.group(1)}"

        # 检查是count还是range
        if "-" in count_or_range:
            # 是范围格式
            start, end = map(int, count_or_range.split("-"))
            vuln_num = start + index
            if vuln_num <= end:
                return f"VULN-{vuln_num:03d}"
            return f"VULN-{vuln_num:03d}"
        else:
            # 是count格式，使用全局计数器
            self.global_vuln_counter += 1
            return f"VULN-{self.global_vuln_counter:03d}"

    def extract_finding_data(self, section: str, vuln_id: str, severity: str) -> Dict[str, Any]:
        """
        从漏洞部分提取完整数据

        Args:
            section: 漏洞内容部分
            vuln_id: 漏洞ID
            severity: 严重程度

        Returns:
            完整的漏洞数据字典
        """
        data = {
            "vuln_id": vuln_id,
            "severity": severity,
            "vulnerability_title": self._extract_title(section),
        }

        # 提取基本信息
        data["cvss_score"] = self._extract_cvss_score(section)
        data["cvss_vector"] = self._extract_field(section, ["CVSS向量", "CVSS Vector"])
        data["cwe"] = self._extract_field(section, ["CWE", "CWE编号"])
        data["confidence"] = self._extract_confidence(section)
        data["location"] = self._extract_field(section, ["位置", "Location"])
        data["file_path"] = self._extract_file_path(section)
        data["line_start"], data["line_end"] = self._extract_line_numbers(section)
        data["function_name"] = self._extract_field(section, ["函数名", "Function"])

        # 提取漏洞描述
        data["vulnerability_essence"] = self._extract_field(
            section, ["漏洞本质", "Vulnerability Essence"]
        )
        data["root_cause"] = self._extract_field(section, ["根因分析", "Root Cause"])
        data["security_impact"] = self._extract_field(section, ["安全影响", "Security Impact"])

        # 提取漏洞代码
        data["vulnerable_code"] = self._extract_code_block(section, ["漏洞代码", "Vulnerable Code"])

        # 提取数据流路径
        data["dataflow_source"] = self._extract_field(section, ["污点源", "Source", "Taint Source"])
        data["dataflow_sink"] = self._extract_field(section, ["汇聚点", "Sink"])
        data["dataflow_sanitization"] = self._extract_field(section, ["净化检查", "Sanitization"])
        data["dataflow_conclusion"] = self._extract_field(
            section, ["数据流结论", "Dataflow Conclusion"]
        )
        data["dataflow_propagation"] = self._extract_dataflow_propagation(section)

        # 提取利用场景
        data["exploit_steps"] = self._extract_field(section, ["攻击步骤", "Exploit Steps"])
        data["exploit_poc"] = self._extract_code_block(
            section, ["PoC", "概念验证", "Proof of Concept"]
        )

        # 提取影响
        data["impact_confidentiality"] = self._extract_impact_level(
            section, ["机密性", "Confidentiality"]
        )
        data["impact_integrity"] = self._extract_impact_level(section, ["完整性", "Integrity"])
        data["impact_availability"] = self._extract_impact_level(
            section, ["可用性", "Availability"]
        )

        # 提取修复建议
        data["fix_description"] = self._extract_field(section, ["修复说明", "Fix Description"])
        data["fix_code_before"] = self._extract_code_block(section, ["修复前", "Before Fix"])
        data["fix_code_after"] = self._extract_code_block(section, ["修复后", "After Fix"])

        return data

    def _extract_title(self, section: str) -> str:
        """提取漏洞标题"""
        # 尝试从第一行或##标题提取
        lines = section.split("\n")
        for line in lines:
            line = line.strip()
            if line.startswith("##"):
                title = line.lstrip("#").strip()
                # 去除 VULN-xxx 前缀
                title = re.sub(r"^VULN-\d+\s*[:-]?\s*", "", title)
                if title:
                    return title

        # 默认返回
        return "未命名漏洞"

    def _extract_field(self, section: str, field_names: List[str]) -> Optional[str]:
        """提取文本字段"""
        for field_name in field_names:
            # 尝试多种格式: **字段名**: 内容, 字段名: 内容, ### 字段名
            patterns = [
                rf"\*\*{field_name}\*\*\s*[:：]\s*(.+?)(?=\n\s*\n|\n\s*[#*]|$)",
                rf"{field_name}\s*[:：]\s*(.+?)(?=\n\s*\n|\n\s*[#*]|$)",
                rf"###\s*{field_name}\s*\n(.+?)(?=\n\s*###|$)",
            ]

            for pattern in patterns:
                match = re.search(pattern, section, re.DOTALL | re.IGNORECASE)
                if match:
                    content = match.group(1).strip()
                    if content:
                        return content

        return None

    def _extract_cvss_score(self, section: str) -> Optional[float]:
        """提取CVSS评分"""
        patterns = [
            r"CVSS\s*[:：]\s*(\d+(?:\.\d+)?)",
            r"CVSS评分\s*[:：]\s*(\d+(?:\.\d+)?)",
        ]

        for pattern in patterns:
            match = re.search(pattern, section, re.IGNORECASE)
            if match:
                try:
                    return float(match.group(1))
                except ValueError:
                    pass

        return None

    def _extract_confidence(self, section: str) -> Optional[str]:
        """提取置信度"""
        confidence_field = self._extract_field(section, ["置信度", "Confidence"])
        if confidence_field:
            for cn, en in self.confidence_map.items():
                if cn in confidence_field:
                    return en
            return confidence_field
        return None

    def _extract_file_path(self, section: str) -> Optional[str]:
        """提取文件路径"""
        # 先尝试从location字段提取
        location = self._extract_field(section, ["位置", "Location"])
        if location:
            # 从 location 中提取文件路径 (格式: 文件路径:行号)
            path_match = re.match(r"^(.+?):\d+", location)
            if path_match:
                return path_match.group(1)

        # 尝试直接查找文件路径
        path_patterns = [
            r"文件路径\s*[:：]\s*(.+?)(?=\n|$)",
            r"File Path\s*[:：]\s*(.+?)(?=\n|$)",
        ]

        for pattern in path_patterns:
            match = re.search(pattern, section, re.IGNORECASE)
            if match:
                return match.group(1).strip()

        return None

    def _extract_line_numbers(self, section: str) -> Tuple[Optional[int], Optional[int]]:
        """提取行号范围"""
        # 尝试从location提取
        location = self._extract_field(section, ["位置", "Location"])
        if location:
            line_match = re.search(r"[:：](\d+)(?:-(\d+))?", location)
            if line_match:
                start = int(line_match.group(1))
                end = int(line_match.group(2)) if line_match.group(2) else start
                return start, end

        # 尝试单独的行号字段
        line_start = self._extract_field(section, ["起始行", "Line Start", "行号"])
        line_end = self._extract_field(section, ["结束行", "Line End"])

        try:
            start = int(line_start) if line_start else None
            end = int(line_end) if line_end else start
            return start, end
        except ValueError:
            return None, None

    def _extract_code_block(self, section: str, block_names: List[str]) -> Optional[str]:
        """提取代码块"""
        for block_name in block_names:
            # 查找 ### 标题后跟着的代码块
            pattern = rf"###\s*{block_name}\s*\n```[\s\S]*?\n([\s\S]*?)\n```"
            match = re.search(pattern, section, re.DOTALL | re.IGNORECASE)
            if match:
                return match.group(1).strip()

            # 查找 **标题**: 后跟着的代码块
            pattern2 = rf"\*\*{block_name}\*\*\s*[:：]?\s*\n```[\s\S]*?\n([\s\S]*?)\n```"
            match2 = re.search(pattern2, section, re.DOTALL | re.IGNORECASE)
            if match2:
                return match2.group(1).strip()

        return None

    def _extract_dataflow_propagation(self, section: str) -> Optional[Dict[str, Any]]:
        """提取数据流传播路径（JSON格式）"""
        propagation_field = self._extract_field(
            section, ["传播路径", "Propagation Path", "Dataflow Path"]
        )
        if propagation_field:
            try:
                # 尝试解析JSON
                return json.loads(propagation_field)
            except json.JSONDecodeError:
                # 如果不是JSON，返回纯文本
                return {"text": propagation_field}
        return None

    def _extract_impact_level(self, section: str, impact_types: List[str]) -> Optional[str]:
        """提取影响级别（高/中/低）"""
        for impact_type in impact_types:
            patterns = [
                rf"{impact_type}\s*[:：]\s*(高|中|低)",
                rf"{impact_type}\s*[:：]\s*(high|medium|low)",
            ]

            for pattern in patterns:
                match = re.search(pattern, section, re.IGNORECASE)
                if match:
                    level = match.group(1).lower()
                    level_map = {"高": "high", "中": "medium", "低": "low"}
                    return level_map.get(level, level)

        return None
