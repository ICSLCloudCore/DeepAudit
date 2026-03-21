## 🏗️ 系统架构

### 整体架构图

DeepAudit 采用微服务架构，核心由 Multi-Agent 引擎驱动。

<div align="center">
<img src="frontend/public/images/README-show/架构图.png" alt="DeepAudit 架构图" width="90%">
</div>

### 🔄 审计工作流

| 步骤 | 阶段 | 负责 Agent | 主要动作 |
|:---:|:---:|:---:|:---|
| 1 | **策略规划** | **Orchestrator** | 接收审计任务，分析项目类型，制定审计计划，下发任务给子 Agent |
| 2 | **信息收集** | **Recon Agent** | 扫描项目结构，识别框架/库/API，提取攻击面（Entry Points） |
| 3 | **漏洞挖掘** | **Analysis Agent** | 结合 RAG 知识库与 AST 分析，深度审查代码，发现潜在漏洞 |
| 4 | **PoC 验证** | **Verification Agent** | **(关键)** 编写 PoC 脚本，在 Docker 沙箱中执行。如失败则自我修正重试 |
| 5 | **报告生成** | **Orchestrator** | 汇总所有发现，剔除被验证为误报的漏洞，生成最终报告 |

### 📂 项目代码结构

```text
DeepAudit/
├── backend/                        # Python FastAPI 后端
│   ├── app/
│   │   ├── agents/                 # Multi-Agent 核心逻辑
│   │   │   ├── orchestrator.py     # 总指挥：任务编排
│   │   │   ├── recon.py            # 侦察兵：资产识别
│   │   │   ├── analysis.py         # 分析师：漏洞挖掘
│   │   │   └── verification.py     # 验证者：沙箱 PoC
│   │   ├── core/                   # 核心配置与沙箱接口
│   │   ├── models/                 # 数据库模型
│   │   └── services/               # RAG, LLM 服务封装
│   └── tests/                      # 单元测试
├── frontend/                       # React + TypeScript 前端
│   ├── src/
│   │   ├── components/             # UI 组件库
│   │   ├── pages/                  # 页面路由
│   │   └── stores/                 # Zustand 状态管理
├── docker/                         # Docker 部署配置
│   ├── sandbox/                    # 安全沙箱镜像构建
│   └── postgres/                   # 数据库初始化
└── docs/                           # 详细文档
```

---

## 🚀 快速开始

### 方式一：一行命令部署（推荐）

使用预构建的 Docker 镜像，无需克隆代码，一行命令即可启动：

```bash
curl -fsSL https://raw.githubusercontent.com/lintsinghua/DeepAudit/v3.0.0/docker-compose.prod.yml | docker compose -f - up -d
```

## 🇨🇳 国内加速部署（作者亲测非常无敌之快）

使用南京大学镜像站加速拉取 Docker 镜像（将 `ghcr.io` 替换为 `ghcr.nju.edu.cn`）：

```bash
# 国内加速版 - 使用南京大学 GHCR 镜像站
curl -fsSL https://raw.githubusercontent.com/lintsinghua/DeepAudit/v3.0.0/docker-compose.prod.cn.yml | docker compose -f - up -d
```
<details>
<summary>手动拉取镜像（如需单独拉取）（点击展开）</summary>

```bash
# 前端镜像
docker pull ghcr.nju.edu.cn/lintsinghua/deepaudit-frontend:latest

# 后端镜像
docker pull ghcr.nju.edu.cn/lintsinghua/deepaudit-backend:latest

# 沙箱镜像
docker pull ghcr.nju.edu.cn/lintsinghua/deepaudit-sandbox:latest
```
</details>

> 💡 镜像源由 [南京大学开源镜像站](https://mirrors.nju.edu.cn/) 提供支持

<details>
<summary>💡 配置 Docker 镜像加速（可选，进一步提升拉取速度）（点击展开）</summary>

如果拉取镜像仍然较慢，可以配置 Docker 镜像加速器。编辑 Docker 配置文件并添加以下镜像源：

**Linux / macOS**：编辑 `/etc/docker/daemon.json`

**Windows**：右键 Docker Desktop 图标 → Settings → Docker Engine

```json
{
  "registry-mirrors": [
    "https://docker.1ms.run",
    "https://dockerproxy.com",
    "https://hub.rat.dev"
  ]
}
```

保存后重启 Docker 服务：

```bash
# Linux
sudo systemctl restart docker

# macOS / Windows
# 重启 Docker Desktop 应用
```

</details>

> 🎉 **启动成功！** 访问 http://localhost:3000 开始体验。

---

### 方式二：克隆代码部署

适合需要自定义配置或二次开发的用户：

```bash
# 1. 克隆项目
git clone https://github.com/lintsinghua/DeepAudit.git && cd DeepAudit

# 2. 配置环境变量
cp backend/env.example backend/.env
# 编辑 backend/.env 填入你的 LLM API Key

# 3. 一键启动
docker compose up -d
```

> 首次启动会自动构建沙箱镜像，可能需要几分钟。

---

## 🔧 源码开发指南

适合开发者进行二次开发调试。

### 环境要求
- Python 3.11+
- Node.js 20+
- PostgreSQL 15+
- Docker (用于沙箱)


### 1. 手动启动数据库

```bash
docker compose up -d redis db adminer
```

### 2. 后端启动



```bash
cd backend
# 配置环境
cp env.example .env

# 使用 uv 管理环境（推荐）
uv sync
source .venv/bin/activate

# 启动 API 服务
uv run uvicorn app.main:app --reload
```

### 3. 前端启动

```bash
cd frontend
# 配置环境
cp .env.example .env

pnpm install
pnpm dev
```

### 3. 沙箱环境

开发模式下需要本地 Docker 拉取沙箱镜像：

```bash
# 标准拉取
docker pull ghcr.io/lintsinghua/deepaudit-sandbox:latest

# 国内加速（南京大学镜像站）
docker pull ghcr.nju.edu.cn/lintsinghua/deepaudit-sandbox:latest
```

---

## 🤖 Multi-Agent 智能审计

### 支持的漏洞类型

<table>
<tr>
<td>

| 漏洞类型 | 描述 |
|---------|------|
| `sql_injection` | SQL 注入 |
| `xss` | 跨站脚本攻击 |
| `command_injection` | 命令注入 |
| `path_traversal` | 路径遍历 |
| `ssrf` | 服务端请求伪造 |
| `xxe` | XML 外部实体注入 |

</td>
<td>

| 漏洞类型 | 描述 |
|---------|------|
| `insecure_deserialization` | 不安全反序列化 |
| `hardcoded_secret` | 硬编码密钥 |
| `weak_crypto` | 弱加密算法 |
| `authentication_bypass` | 认证绕过 |
| `authorization_bypass` | 授权绕过 |
| `idor` | 不安全直接对象引用 |

</td>
</tr>
</table>

> 📖 详细文档请查看 **[Agent 审计指南](docs/AGENT_AUDIT.md)**

---

## 🔌 支持的 LLM 平台

<table>
<tr>
<td align="center" width="33%">
<h3>🌍 国际平台</h3>
<p>
OpenAI GPT-4o / GPT-4<br/>
Claude 3.5 Sonnet / Opus<br/>
Google Gemini Pro<br/>
DeepSeek V3
</p>
</td>
<td align="center" width="33%">
<h3>🇨🇳 国内平台</h3>
<p>
通义千问 Qwen<br/>
智谱 GLM-4<br/>
Moonshot Kimi<br/>
文心一言 · MiniMax · 豆包
</p>
</td>
<td align="center" width="33%">
<h3>🏠 本地部署</h3>
<p>
<strong>Ollama</strong><br/>
Llama3 · Qwen2.5 · CodeLlama<br/>
DeepSeek-Coder · Codestral<br/>
<em>代码不出内网</em>
</p>
</td>
</tr>
</table>

💡 支持 API 中转站，解决网络访问问题 | 详细配置 → [LLM 平台支持](docs/LLM_PROVIDERS.md)

---

## 🎯 功能矩阵

| 功能 | 说明 | 模式 |
|------|------|------|
| 🤖 **Agent 深度审计** | Multi-Agent 协作，自主编排审计策略 | Agent |
| 🧠 **RAG 知识增强** | 代码语义理解，CWE/CVE 知识库检索 | Agent |
| 🔒 **沙箱 PoC 验证** | Docker 隔离执行，验证漏洞有效性 | Agent |
| 🗂️ **项目管理** | GitHub/GitLab/Gitea 导入，ZIP 上传，10+ 语言支持 | 通用 |
| ⚡ **即时分析** | 代码片段秒级分析，粘贴即用 | 通用 |
| 🔍 **五维检测** | Bug · 安全 · 性能 · 风格 · 可维护性 | 通用 |
| 💡 **What-Why-How** | 精准定位 + 原因解释 + 修复建议 | 通用 |
| 📋 **审计规则** | 内置 OWASP Top 10，支持自定义规则集 | 通用 |
| 📝 **提示词模板** | 可视化管理，支持中英文双语 | 通用 |
| 📊 **报告导出** | PDF / Markdown / JSON 一键导出 | 通用 |
| ⚙️ **运行时配置** | 浏览器配置 LLM，无需重启服务 | 通用 |

## 🦖 发展路线图

我们正在持续演进，未来将支持更多语言和更强大的 Agent 能力。

- [x] 基础静态分析，集成 Semgrep
- [x] 引入 RAG 知识库，支持 Docker 安全沙箱
- [x] **Multi-Agent 协作架构** (Current)
- [ ] 支持更真实的模拟服务环境，进行更真实漏洞验证流程
- [ ] 沙箱从function_call优化集成为稳定MCP服务
- [ ] **自动修复 (Auto-Fix)**: Agent 直接提交 PR 修复漏洞
- [ ] **增量PR审计**: 持续跟踪 PR 变更，智能分析漏洞，并集成CI/CD流程
- [ ] **优化RAG**: 支持自定义知识库

---

## 📄 许可证

本项目采用 [AGPL-3.0 License](LICENSE) 开源。
