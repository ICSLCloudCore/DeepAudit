"""
初始化系统预置的提示词模板和审计规则
"""

import json
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.models.prompt_template import PromptTemplate
from app.models.audit_rule import AuditRuleSet, AuditRule

logger = logging.getLogger(__name__)


# ==================== 系统提示词模板 ====================

SYSTEM_PROMPT_TEMPLATES = [
    {
        "name": "默认代码审计",
        "description": "全面的代码审计提示词，涵盖安全、性能、代码质量等多个维度",
        "template_type": "system",
        "is_default": True,
        "sort_order": 0,
        "variables": {"language": "编程语言", "code": "代码内容"},
        "content_zh": """你是一个专业的代码审计助手。请从以下维度全面分析代码：
- 安全漏洞（SQL注入、XSS、命令注入、路径遍历、SSRF、XXE、反序列化、硬编码密钥等）
- 潜在的 Bug 和逻辑错误
- 性能问题和优化建议
- 编码规范和代码风格
- 可维护性和可读性
- 最佳实践和设计模式

请尽可能多地找出代码中的所有问题，不要遗漏任何安全漏洞或潜在风险！""",
        "content_en": """You are a professional code auditing assistant. Please comprehensively analyze the code from the following dimensions:
- Security vulnerabilities (SQL injection, XSS, command injection, path traversal, SSRF, XXE, deserialization, hardcoded secrets, etc.)
- Potential bugs and logical errors
- Performance issues and optimization suggestions
- Coding standards and code style
- Maintainability and readability
- Best practices and design patterns

Find as many issues as possible! Do NOT miss any security vulnerabilities or potential risks!"""
    },
    {
        "name": "安全专项审计",
        "description": "专注于安全漏洞检测的提示词模板",
        "template_type": "system",
        "is_default": False,
        "sort_order": 1,
        "variables": {"language": "编程语言", "code": "代码内容"},
        "content_zh": """你是一个专业的安全审计专家。请专注于检测以下安全问题：

【注入类漏洞】
- SQL注入（包括盲注、时间盲注、联合查询注入）
- 命令注入（OS命令执行）
- LDAP注入
- XPath注入
- NoSQL注入

【跨站脚本（XSS）】
- 反射型XSS
- 存储型XSS
- DOM型XSS

【认证与授权】
- 硬编码凭证
- 弱密码策略
- 会话管理问题
- 权限绕过

【敏感数据】
- 敏感信息泄露
- 不安全的加密
- 明文传输敏感数据

【其他安全问题】
- SSRF（服务端请求伪造）
- XXE（XML外部实体注入）
- 反序列化漏洞
- 路径遍历
- 文件上传漏洞
- CSRF（跨站请求伪造）

请详细说明每个漏洞的风险等级、利用方式和修复建议。""",
        "content_en": """You are a professional security audit expert. Please focus on detecting the following security issues:

【Injection Vulnerabilities】
- SQL Injection (including blind, time-based, union-based)
- Command Injection (OS command execution)
- LDAP Injection
- XPath Injection
- NoSQL Injection

【Cross-Site Scripting (XSS)】
- Reflected XSS
- Stored XSS
- DOM-based XSS

【Authentication & Authorization】
- Hardcoded credentials
- Weak password policies
- Session management issues
- Authorization bypass

【Sensitive Data】
- Sensitive information disclosure
- Insecure cryptography
- Plaintext transmission of sensitive data

【Other Security Issues】
- SSRF (Server-Side Request Forgery)
- XXE (XML External Entity Injection)
- Deserialization vulnerabilities
- Path traversal
- File upload vulnerabilities
- CSRF (Cross-Site Request Forgery)

Please provide detailed risk level, exploitation method, and remediation suggestions for each vulnerability."""
    },
    {
        "name": "安全合规基线审计",
        "description": "专注于Go代码安全合规基线检测，覆盖口令安全、密钥算法、TLS配置、随机数安全等核心基础安全要求",
        "template_type": "system",
        "is_default": False,
        "sort_order": 2,
        "variables": {"language": "编程语言", "code": "代码内容"},
        "content_zh": """你是一名专业的Go代码安全合规基线审计专家。请严格对照以下安全基线要求，逐项检测代码中存在的合规风险，不得遗漏。

【口令安全基线】
- 是否存在硬编码的明文密码或默认弱口令（如 "admin"、"123456"、"password"）
- 密码长度校验是否满足最低要求（≥ 8 位，建议 ≥ 12 位）
- 是否校验密码复杂度（大写字母、小写字母、数字、特殊字符）
- 密码是否以明文形式写入日志、数据库或响应体
- 密码存储是否使用强哈希函数（bcrypt / scrypt / argon2），而非 MD5/SHA1/SHA256 直接哈希

【密钥与加密算法安全基线】
- 是否使用已淘汰的对称加密算法：DES、3DES、RC4
- AES 是否使用不安全模式（ECB），应使用 GCM 或经认证的 CBC
- AES 密钥长度是否不足（< 128 位）
- 是否使用 MD5 或 SHA1 对敏感数据（令牌、密码）进行哈希
- RSA 密钥长度是否不足（< 2048 位），建议 ≥ 3072 位
- 是否存在硬编码的 API Key、JWT 签名密钥、私钥 PEM 内容

【随机数安全基线】
- 是否使用 math/rand 生成安全敏感的随机值（密钥、令牌、验证码、Session ID）
- 是否使用固定种子（如 rand.Seed(42)）初始化随机数生成器
- 安全场景是否统一使用 crypto/rand 包

【TLS / 传输安全基线】
- tls.Config.MinVersion 是否低于 tls.VersionTLS12
- 是否设置 InsecureSkipVerify: true（跳过证书验证）
- 密码套件（CipherSuites）中是否包含弱算法（RC4、3DES、NULL 套件）
- HTTP 客户端是否未配置证书验证，存在中间人攻击风险

【JWT 安全基线】
- 是否允许 alg:none 算法，可绕过签名验证
- HS256 签名密钥是否过短（< 256 bits）
- 是否未验证 exp（过期时间）、iss（签发者）等关键声明
- JWT Payload 中是否存储了不应公开的敏感信息（密码、私钥）

【凭证与敏感信息管理基线】
- 是否存在硬编码的数据库连接字符串、云服务 AccessKey/SecretKey
- 敏感配置是否通过环境变量或配置中心（Vault/KMS/Secret Manager）注入
- 日志输出中是否包含敏感字段（密码、Token、Cookie、信用卡号）
- 错误响应中是否泄露了内部堆栈信息或系统路径

对每个发现的问题，请输出：
1. 问题位置（行号/函数名）
2. 违反的基线条款
3. 风险等级（critical / high / medium / low）
4. 具体修复建议（包含代码示例）""",
        "content_en": """You are a professional Go code security compliance baseline auditor. Please strictly check the code against the following security baseline requirements, item by item, without omission.

【Password Security Baseline】
- Any hardcoded plaintext passwords or default weak passwords (e.g. "admin", "123456", "password")
- Whether password length validation meets the minimum requirement (≥ 8 chars, recommended ≥ 12)
- Whether password complexity is validated (uppercase, lowercase, digits, special characters)
- Whether passwords are written in plaintext to logs, databases, or response bodies
- Whether passwords are stored using strong hash functions (bcrypt / scrypt / argon2), NOT MD5/SHA1/SHA256 direct hash

【Cryptographic Algorithm Security Baseline】
- Use of deprecated symmetric encryption: DES, 3DES, RC4
- AES used in insecure mode (ECB); should use GCM or authenticated CBC
- AES key length insufficient (< 128 bits)
- MD5 or SHA1 used to hash sensitive data (tokens, passwords)
- RSA key length insufficient (< 2048 bits); recommended ≥ 3072 bits
- Hardcoded API Keys, JWT signing keys, or private key PEM content

【Random Number Security Baseline】
- Use of math/rand for security-sensitive random values (keys, tokens, captcha, session IDs)
- Fixed seed used (e.g. rand.Seed(42)) to initialize random number generator
- Security contexts must consistently use the crypto/rand package

【TLS / Transport Security Baseline】
- tls.Config.MinVersion below tls.VersionTLS12
- InsecureSkipVerify set to true (certificate validation skipped)
- CipherSuites containing weak algorithms (RC4, 3DES, NULL ciphers)
- HTTP clients not configured with certificate verification (MITM risk)

【JWT Security Baseline】
- alg:none algorithm allowed, bypassing signature verification
- HS256 signing key too short (< 256 bits)
- Failure to validate exp (expiry), iss (issuer), or other critical claims
- Sensitive information (passwords, private keys) stored in JWT Payload

【Credential & Sensitive Information Management Baseline】
- Hardcoded database connection strings, cloud AccessKey/SecretKey
- Sensitive config not injected via environment variables or secret manager (Vault/KMS)
- Sensitive fields (passwords, tokens, cookies, card numbers) present in log output
- Internal stack traces or system paths leaked in error responses

For each identified issue, output:
1. Location (line number / function name)
2. Violated baseline requirement
3. Risk level (critical / high / medium / low)
4. Specific remediation advice (with code example)"""
    },
    {
        "name": "代码质量审计",
        "description": "专注于代码质量和可维护性的提示词模板",
        "template_type": "system",
        "is_default": False,
        "sort_order": 3,
        "variables": {"language": "编程语言", "code": "代码内容"},
        "content_zh": """你是一个专业的代码质量审计专家。请专注于检测以下代码质量问题：

【代码规范】
- 命名不规范（变量、函数、类）
- 代码格式不一致
- 注释缺失或过时
- 魔法数字/字符串

【代码结构】
- 函数过长（超过50行）
- 类职责不单一
- 嵌套层级过深
- 重复代码

【可维护性】
- 高耦合低内聚
- 缺少错误处理
- 硬编码配置
- 缺少日志记录

【设计模式】
- 违反SOLID原则
- 可使用设计模式优化的场景
- 过度设计

【测试相关】
- 难以测试的代码
- 缺少边界条件处理
- 依赖注入问题

请提供具体的重构建议和代码示例。""",
        "content_en": """You are a professional code quality audit expert. Please focus on detecting the following code quality issues:

【Code Standards】
- Non-standard naming (variables, functions, classes)
- Inconsistent code formatting
- Missing or outdated comments
- Magic numbers/strings

【Code Structure】
- Functions too long (over 50 lines)
- Classes with multiple responsibilities
- Deep nesting levels
- Duplicate code

【Maintainability】
- High coupling, low cohesion
- Missing error handling
- Hardcoded configurations
- Missing logging

【Design Patterns】
- SOLID principle violations
- Scenarios that could benefit from design patterns
- Over-engineering

【Testing Related】
- Hard-to-test code
- Missing boundary condition handling
- Dependency injection issues

Please provide specific refactoring suggestions and code examples."""
    },
]


# ==================== 系统审计规则集 ====================

SYSTEM_RULE_SETS = [
    {
        "name": "OWASP Top 10",
        "description": "基于 OWASP Top 10 2021 的安全审计规则集",
        "language": "all",
        "rule_type": "security",
        "is_default": True,
        "sort_order": 0,
        "severity_weights": {"critical": 10, "high": 5, "medium": 2, "low": 1},
        "rules": [
            {
                "rule_code": "A01",
                "name": "访问控制失效",
                "description": "检测权限绕过、越权访问、IDOR等访问控制问题",
                "category": "security",
                "severity": "critical",
                "custom_prompt": "检查是否存在访问控制失效问题：权限检查缺失、越权访问、IDOR（不安全的直接对象引用）、CORS配置错误",
                "fix_suggestion": "实施最小权限原则，在服务端进行权限验证，使用基于角色的访问控制(RBAC)",
                "reference_url": "https://owasp.org/Top10/A01_2021-Broken_Access_Control/",
            },
            {
                "rule_code": "A02",
                "name": "加密机制失效",
                "description": "检测弱加密、明文传输、密钥管理不当等问题",
                "category": "security",
                "severity": "critical",
                "custom_prompt": "检查是否存在加密问题：使用弱加密算法(MD5/SHA1/DES)、明文存储密码、硬编码密钥、不安全的随机数生成",
                "fix_suggestion": "使用强加密算法(AES-256/RSA-2048)，使用安全的密码哈希(bcrypt/Argon2)，妥善管理密钥",
                "reference_url": "https://owasp.org/Top10/A02_2021-Cryptographic_Failures/",
            },
            {
                "rule_code": "A03",
                "name": "注入攻击",
                "description": "检测SQL注入、命令注入、LDAP注入等注入漏洞",
                "category": "security",
                "severity": "critical",
                "custom_prompt": "检查是否存在注入漏洞：SQL注入、命令注入、LDAP注入、XPath注入、NoSQL注入、表达式语言注入",
                "fix_suggestion": "使用参数化查询，输入验证和转义，使用ORM框架，最小权限原则",
                "reference_url": "https://owasp.org/Top10/A03_2021-Injection/",
            },
            {
                "rule_code": "A04",
                "name": "不安全设计",
                "description": "检测业务逻辑漏洞、缺少安全控制等设计问题",
                "category": "security",
                "severity": "high",
                "custom_prompt": "检查是否存在不安全的设计：缺少速率限制、业务逻辑漏洞、缺少输入验证、信任边界不清",
                "fix_suggestion": "采用安全设计原则，威胁建模，实施深度防御",
                "reference_url": "https://owasp.org/Top10/A04_2021-Insecure_Design/",
            },
            {
                "rule_code": "A05",
                "name": "安全配置错误",
                "description": "检测默认配置、不必要的功能、错误的权限设置",
                "category": "security",
                "severity": "high",
                "custom_prompt": "检查是否存在安全配置错误：默认凭证、不必要的功能启用、详细错误信息泄露、缺少安全头",
                "fix_suggestion": "最小化安装，禁用不必要功能，定期审查配置，自动化配置检查",
                "reference_url": "https://owasp.org/Top10/A05_2021-Security_Misconfiguration/",
            },
            {
                "rule_code": "A06",
                "name": "易受攻击和过时的组件",
                "description": "检测使用已知漏洞的依赖库",
                "category": "security",
                "severity": "high",
                "custom_prompt": "检查是否使用了已知漏洞的组件：过时的依赖库、未修补的漏洞、不安全的第三方组件",
                "fix_suggestion": "定期更新依赖，使用依赖扫描工具，订阅安全公告",
                "reference_url": "https://owasp.org/Top10/A06_2021-Vulnerable_and_Outdated_Components/",
            },
            {
                "rule_code": "A07",
                "name": "身份认证失效",
                "description": "检测弱密码、会话管理问题、凭证泄露",
                "category": "security",
                "severity": "critical",
                "custom_prompt": "检查是否存在身份认证问题：弱密码策略、会话固定、凭证明文存储、缺少多因素认证",
                "fix_suggestion": "实施强密码策略，使用MFA，安全的会话管理，防止暴力破解",
                "reference_url": "https://owasp.org/Top10/A07_2021-Identification_and_Authentication_Failures/",
            },
            {
                "rule_code": "A08",
                "name": "软件和数据完整性失效",
                "description": "检测不安全的反序列化、CI/CD安全问题",
                "category": "security",
                "severity": "critical",
                "custom_prompt": "检查是否存在完整性问题：不安全的反序列化、未验证的更新、CI/CD管道安全",
                "fix_suggestion": "验证数据完整性，使用数字签名，安全的反序列化",
                "reference_url": "https://owasp.org/Top10/A08_2021-Software_and_Data_Integrity_Failures/",
            },
            {
                "rule_code": "A09",
                "name": "安全日志和监控失效",
                "description": "检测日志记录不足、监控缺失",
                "category": "security",
                "severity": "medium",
                "custom_prompt": "检查是否存在日志监控问题：缺少安全日志、敏感信息记录到日志、缺少告警机制",
                "fix_suggestion": "记录安全相关事件，实施监控和告警，定期审查日志",
                "reference_url": "https://owasp.org/Top10/A09_2021-Security_Logging_and_Monitoring_Failures/",
            },
            {
                "rule_code": "A10",
                "name": "服务端请求伪造(SSRF)",
                "description": "检测SSRF漏洞",
                "category": "security",
                "severity": "high",
                "custom_prompt": "检查是否存在SSRF漏洞：未验证的URL输入、内网资源访问、云元数据访问",
                "fix_suggestion": "验证和过滤URL，使用白名单，禁用不必要的协议",
                "reference_url": "https://owasp.org/Top10/A10_2021-Server-Side_Request_Forgery_%28SSRF%29/",
            },
        ]
    },
    {
        "name": "代码质量规则",
        "description": "通用代码质量检查规则集",
        "language": "all",
        "rule_type": "quality",
        "is_default": False,
        "sort_order": 1,
        "severity_weights": {"critical": 10, "high": 5, "medium": 2, "low": 1},
        "rules": [
            {
                "rule_code": "CQ001",
                "name": "函数过长",
                "description": "函数超过50行，建议拆分",
                "category": "maintainability",
                "severity": "medium",
                "custom_prompt": "检查函数是否过长（超过50行），是否应该拆分为更小的函数",
                "fix_suggestion": "将大函数拆分为多个小函数，每个函数只做一件事",
            },
            {
                "rule_code": "CQ002",
                "name": "重复代码",
                "description": "检测重复的代码块",
                "category": "maintainability",
                "severity": "medium",
                "custom_prompt": "检查是否存在重复的代码块，可以提取为公共函数或类",
                "fix_suggestion": "提取重复代码为公共函数、类或模块",
            },
            {
                "rule_code": "CQ003",
                "name": "嵌套过深",
                "description": "代码嵌套层级超过4层",
                "category": "maintainability",
                "severity": "low",
                "custom_prompt": "检查代码嵌套是否过深（超过4层），影响可读性",
                "fix_suggestion": "使用早返回、提取函数等方式减少嵌套",
            },
            {
                "rule_code": "CQ004",
                "name": "魔法数字",
                "description": "代码中使用未命名的常量",
                "category": "style",
                "severity": "low",
                "custom_prompt": "检查是否存在魔法数字或魔法字符串，应该定义为常量",
                "fix_suggestion": "将魔法数字定义为有意义的常量",
            },
            {
                "rule_code": "CQ005",
                "name": "缺少错误处理",
                "description": "缺少异常捕获或错误处理",
                "category": "bug",
                "severity": "high",
                "custom_prompt": "检查是否缺少必要的错误处理，可能导致程序崩溃",
                "fix_suggestion": "添加适当的try-catch或错误检查",
            },
            {
                "rule_code": "CQ006",
                "name": "未使用的变量",
                "description": "声明但未使用的变量",
                "category": "style",
                "severity": "low",
                "custom_prompt": "检查是否存在声明但未使用的变量",
                "fix_suggestion": "删除未使用的变量或使用它们",
            },
            {
                "rule_code": "CQ007",
                "name": "命名不规范",
                "description": "变量、函数、类命名不符合规范",
                "category": "style",
                "severity": "low",
                "custom_prompt": "检查命名是否符合语言规范和最佳实践",
                "fix_suggestion": "使用有意义的、符合规范的命名",
            },
            {
                "rule_code": "CQ008",
                "name": "注释缺失",
                "description": "复杂逻辑缺少必要注释",
                "category": "maintainability",
                "severity": "low",
                "custom_prompt": "检查复杂逻辑是否缺少必要的注释说明",
                "fix_suggestion": "为复杂逻辑添加清晰的注释",
            },
        ]
    },
    {
        "name": "安全合规基线规则",
        "description": "面向Go代码的安全合规基线检测规则集，覆盖口令安全、密钥算法安全等基础安全要求",
        "language": "go",
        "rule_type": "compliance",
        "is_default": False,
        "sort_order": 2,
        "severity_weights": {"critical": 10, "high": 5, "medium": 2, "low": 1},
        "rules": [
            {
                "rule_code": "COMP001",
                "name": "弱口令检测",
                "description": "检测代码中使用或生成弱口令的行为，包括硬编码默认密码、过短密码等",
                "category": "compliance",
                "severity": "high",
                "custom_prompt": (
                    "检查Go代码中是否存在弱口令问题：\n"
                    "1. 硬编码的默认密码或弱密码字面量（如 'admin'、'123456'、'password'）\n"
                    "2. 密码长度校验不足（低于8位）\n"
                    "3. 密码复杂度要求缺失（未校验大小写/数字/特殊字符）\n"
                    "4. 密码明文存储到数据库或日志中"
                ),
                "fix_suggestion": (
                    "1. 禁止在代码中硬编码密码，改用配置文件或密钥管理服务\n"
                    "2. 强制密码最小长度 ≥ 8 位，建议 ≥ 12 位\n"
                    "3. 要求密码包含大写字母、小写字母、数字、特殊字符\n"
                    "4. 使用 bcrypt/scrypt/argon2 等强哈希函数存储密码"
                ),
                "reference_url": "https://owasp.org/www-community/controls/Password_Storage_Cheat_Sheet",
            },
            {
                "rule_code": "COMP002",
                "name": "弱密码哈希算法",
                "description": "检测使用MD5、SHA1等已知弱哈希算法处理敏感数据（如密码、凭证）",
                "category": "compliance",
                "severity": "critical",
                "custom_prompt": (
                    "检查Go代码中是否使用了弱哈希算法处理敏感数据：\n"
                    "1. 使用 crypto/md5 或 crypto/sha1 对密码、令牌进行哈希\n"
                    "2. 使用不加盐（salt）的哈希\n"
                    "3. 使用 golang.org/x/crypto 以外的弱哈希库处理密码"
                ),
                "fix_suggestion": (
                    "1. 密码哈希必须使用 bcrypt（golang.org/x/crypto/bcrypt）、scrypt 或 argon2\n"
                    "2. MD5/SHA1 仅允许用于非安全场景（如文件校验和），严禁用于密码/令牌\n"
                    "3. 哈希时必须使用随机盐（salt），并与哈希值一同存储"
                ),
                "reference_url": "https://pkg.go.dev/golang.org/x/crypto/bcrypt",
            },
            {
                "rule_code": "COMP003",
                "name": "弱对称加密算法",
                "description": "检测使用DES、3DES、RC4等已淘汰的对称加密算法",
                "category": "compliance",
                "severity": "critical",
                "custom_prompt": (
                    "检查Go代码中是否使用了弱对称加密算法：\n"
                    "1. 使用 crypto/des（DES/3DES）\n"
                    "2. 使用 RC4（golang.org/x/crypto/rc4）\n"
                    "3. AES使用ECB模式（crypto/aes 配合 ECB 填充）\n"
                    "4. 密钥长度不足（AES<128位，RSA<2048位）"
                ),
                "fix_suggestion": (
                    "1. 对称加密使用 AES-GCM（crypto/aes + crypto/cipher GCM）\n"
                    "2. AES密钥长度建议 256 位\n"
                    "3. 禁止使用ECB模式，优先选择GCM或CBC（需配合HMAC认证）\n"
                    "4. 立即从代码库中移除 DES/3DES/RC4 的使用"
                ),
                "reference_url": "https://pkg.go.dev/crypto/aes",
            },
            {
                "rule_code": "COMP004",
                "name": "不安全的随机数生成",
                "description": "检测使用 math/rand 等伪随机数生成器生成安全敏感的随机值（密钥、令牌、验证码等）",
                "category": "compliance",
                "severity": "high",
                "custom_prompt": (
                    "检查Go代码中是否使用了不安全的随机数：\n"
                    "1. 使用 math/rand 生成密码、令牌、密钥、验证码\n"
                    "2. 使用固定种子（如 rand.Seed(1)）初始化伪随机数\n"
                    "3. 未使用 crypto/rand 生成安全随机数"
                ),
                "fix_suggestion": (
                    "1. 所有安全敏感场景（令牌、密钥、验证码）必须使用 crypto/rand\n"
                    "2. 使用 crypto/rand.Read() 或 crypto/rand.Int() 生成随机值\n"
                    "3. math/rand 仅用于非安全场景（如测试数据、随机排序）"
                ),
                "reference_url": "https://pkg.go.dev/crypto/rand",
            },
            {
                "rule_code": "COMP005",
                "name": "TLS配置不安全",
                "description": "检测TLS配置中使用过时协议版本（TLS 1.0/1.1）或弱加密套件",
                "category": "compliance",
                "severity": "high",
                "custom_prompt": (
                    "检查Go代码中TLS配置是否不安全：\n"
                    "1. tls.Config 中 MinVersion 低于 tls.VersionTLS12\n"
                    "2. InsecureSkipVerify 设置为 true\n"
                    "3. CipherSuites 中包含弱密码套件（如 RC4、3DES）\n"
                    "4. 未配置 MinVersion 导致默认允许低版本TLS"
                ),
                "fix_suggestion": (
                    "1. 设置 tls.Config.MinVersion = tls.VersionTLS12，建议 VersionTLS13\n"
                    "2. 生产环境中禁止设置 InsecureSkipVerify: true\n"
                    "3. 仅使用 Go 推荐的强密码套件（tls.CipherSuites()）\n"
                    "4. 定期更新证书，使用2048位以上RSA或ECDSA P-256"
                ),
                "reference_url": "https://pkg.go.dev/crypto/tls#Config",
            },
            {
                "rule_code": "COMP006",
                "name": "硬编码密钥或Token",
                "description": "检测代码中硬编码的API密钥、JWT密钥、私钥等敏感凭证",
                "category": "compliance",
                "severity": "critical",
                "custom_prompt": (
                    "检查Go代码中是否存在硬编码的敏感凭证：\n"
                    "1. 硬编码的JWT签名密钥（如 var jwtSecret = \"xxx\"）\n"
                    "2. 硬编码的API Key、Access Token、Secret Key\n"
                    "3. 硬编码的数据库连接密码\n"
                    "4. 硬编码的私钥PEM内容"
                ),
                "fix_suggestion": (
                    "1. 所有密钥和凭证通过环境变量或配置中心（Vault/KMS）注入\n"
                    "2. 使用 os.Getenv() 或 viper 读取配置，禁止字面量赋值\n"
                    "3. 使用 .gitignore 防止配置文件提交到代码仓库\n"
                    "4. 对已泄露的密钥立即吊销并轮换"
                ),
                "reference_url": "https://owasp.org/www-project-top-ten/2017/A3_2017-Sensitive_Data_Exposure",
            },
            {
                "rule_code": "COMP007",
                "name": "JWT安全配置",
                "description": "检测JWT使用中的安全问题，包括算法混淆攻击、弱签名密钥、不验证有效期等",
                "category": "compliance",
                "severity": "high",
                "custom_prompt": (
                    "检查Go代码中JWT使用是否安全：\n"
                    "1. 允许 alg:none 算法（可绕过签名验证）\n"
                    "2. HS256签名密钥过短（< 256 bits）\n"
                    "3. 未验证 exp（过期时间）声明\n"
                    "4. 敏感信息（密码、私钥）存储在JWT payload中（payload不加密）"
                ),
                "fix_suggestion": (
                    "1. 明确指定允许的算法，禁止 none 算法\n"
                    "2. HS256密钥长度 ≥ 256 bits，或改用 RS256/ES256\n"
                    "3. 始终验证 exp、iat、iss 等标准声明\n"
                    "4. 敏感数据不放入JWT payload，如需加密使用JWE规范"
                ),
                "reference_url": "https://owasp.org/www-project-web-security-testing-guide/",
            },
        ]
    },
]


async def init_system_templates(db: AsyncSession) -> None:
    """初始化系统提示词模板"""
    for template_data in SYSTEM_PROMPT_TEMPLATES:
        # 检查是否已存在
        result = await db.execute(
            select(PromptTemplate).where(
                PromptTemplate.name == template_data["name"],
                PromptTemplate.is_system == True
            )
        )
        existing = result.scalar_one_or_none()
        
        if not existing:
            template = PromptTemplate(
                name=template_data["name"],
                description=template_data["description"],
                template_type=template_data["template_type"],
                content_zh=template_data["content_zh"],
                content_en=template_data["content_en"],
                variables=json.dumps(template_data.get("variables", {})),
                is_default=template_data.get("is_default", False),
                is_system=True,
                is_active=True,
                sort_order=template_data.get("sort_order", 0),
            )
            db.add(template)
            logger.info(f"✓ 创建系统提示词模板: {template_data['name']}")
    
    await db.flush()


async def init_system_rule_sets(db: AsyncSession) -> None:
    """初始化系统审计规则集"""
    for rule_set_data in SYSTEM_RULE_SETS:
        # 检查是否已存在
        result = await db.execute(
            select(AuditRuleSet).where(
                AuditRuleSet.name == rule_set_data["name"],
                AuditRuleSet.is_system == True
            )
        )
        existing = result.scalar_one_or_none()
        
        if not existing:
            rule_set = AuditRuleSet(
                name=rule_set_data["name"],
                description=rule_set_data["description"],
                language=rule_set_data["language"],
                rule_type=rule_set_data["rule_type"],
                severity_weights=json.dumps(rule_set_data.get("severity_weights", {})),
                is_default=rule_set_data.get("is_default", False),
                is_system=True,
                is_active=True,
                sort_order=rule_set_data.get("sort_order", 0),
            )
            db.add(rule_set)
            await db.flush()
            
            # 创建规则
            for rule_data in rule_set_data.get("rules", []):
                rule = AuditRule(
                    rule_set_id=rule_set.id,
                    rule_code=rule_data["rule_code"],
                    name=rule_data["name"],
                    description=rule_data.get("description"),
                    category=rule_data["category"],
                    severity=rule_data.get("severity", "medium"),
                    custom_prompt=rule_data.get("custom_prompt"),
                    fix_suggestion=rule_data.get("fix_suggestion"),
                    reference_url=rule_data.get("reference_url"),
                    enabled=True,
                    sort_order=rule_data.get("sort_order", 0),
                )
                db.add(rule)
            
            logger.info(f"✓ 创建系统规则集: {rule_set_data['name']} ({len(rule_set_data.get('rules', []))} 条规则)")
    
    await db.flush()


async def init_templates_and_rules(db: AsyncSession) -> None:
    """初始化所有系统模板和规则"""
    logger.info("开始初始化系统模板和规则...")
    
    try:
        await init_system_templates(db)
        await init_system_rule_sets(db)
        await db.commit()
        logger.info("✓ 系统模板和规则初始化完成")
    except Exception as e:
        logger.warning(f"初始化模板和规则时出错（可能表不存在）: {e}")
        await db.rollback()
