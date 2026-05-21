# Huawei 环境配置指南

## 概述

本指南说明如何在华为环境中构建和使用 DeepAudit，包括使用华为内部镜像源、证书配置等。

## 功能特性

当启用 `Huawei=true` 或 `Huawei_yellow=true` 时，以下组件将使用华为配置：

**镜像源配置（两种模式相同）**：

### Backend 服务
1. **使用华为 apt 镜像源** - `mirrors.tools.huawei.com`
2. **使用华为 PyPI 镜像源** - `http://mirrors.tools.huawei.com/pypi/simple/`
3. **使用华为 npm 镜像源** - `https://mirrors.tools.huawei.com/npm`

### Frontend 服务
1. **使用华为 npm 镜像源** - `https://mirrors.tools.huawei.com/npm`

### Sandbox 服务
1. **使用华为 apt 镜像源** - `mirrors.tools.huawei.com`
2. **使用华为 npm 镜像源** - `https://mirrors.tools.huawei.com/npm`
3. **使用华为 Go 代理** - `http://mirrors.tools.huawei.com/goproxy/`
4. **使用华为 Rust 镜像** - `https://mirrors.tools.huawei.com/rustup`
5. **安装华为证书** - `HuaweiITRootCA.crt` 和 `HWITEnterpriseCA1.crt`
6. **使用本地二进制文件** - Node.js、Go 等工具的本地安装包

**代理配置（两种模式不同）**：

| 参数 | http_proxy | https_proxy |
|------|------------|-------------|
| Huawei | `http://172.25.10.10:8181` | `http://172.25.10.10:8181` |
| Huawei_yellow | `http://10.43.232.147:8181` | `http://10.43.232.147:8181` |

## 前置准备

在构建 Huawei 版本之前，需要准备以下文件到 `docker/sandbox/bin/` 目录（仅 sandbox 需要）：

### 必填文件（如果使用本地安装）

**重要说明**：
由于 Dockerfile 的 `COPY` 指令不支持条件判断，使用 Huawei 本地文件需要：
1. 先把文件放到 `docker/sandbox/bin/` 目录
2. 修改 `docker/sandbox/Dockerfile`，取消相关 `COPY` 行的注释

需要准备的文件：

1. **Node.js 安装包**
   - 文件名：`node-v22.22.2-linux-x64.tar.xz`
   - 下载地址：华为内部镜像站
   - Dockerfile 中需要取消注释：`# COPY ./bin/${NODE_VERSION}.tar.xz /tmp/nodejs.tar.xz`

2. **Go 安装包**
   - 文件名：`go1.25.8.linux-amd64.tar.gz`
   - 下载地址：华为内部镜像站
   - Dockerfile 中需要取消注释：`# COPY ./bin/go1.25.8.linux-amd64.tar.gz /tmp/go.tar.gz`

3. **证书文件**
   - `HuaweiITRootCA.crt`
   - `HWITEnterpriseCA1.crt`
   - Dockerfile 中需要取消注释相关 COPY 行

4. **pip 配置文件**
   - `pip.conf` - 包含华为内部 PyPI 源配置
   - Dockerfile 中需要取消注释相关 COPY 行

### 简化方案（推荐）

如果不想修改 Dockerfile，可以：
1. 只设置 `Huawei=true` 来使用华为镜像源
2. 不使用本地安装包，让工具通过华为镜像在线安装

### 可选文件

- 其他工具的本地安装包

## 使用方法

### 方式 1：使用 docker compose（推荐）

#### 方法 A：通过环境变量（构建所有服务）

```bash
# 设置 Huawei 环境变量并构建所有服务
Huawei=true docker compose build

# 设置 Huawei_yellow 环境变量并构建所有服务（使用不同代理地址）
Huawei_yellow=true docker compose build

# 或者只构建特定服务
Huawei=true docker compose build backend
Huawei=true docker compose build sandbox

# 完整启动（包含构建）
Huawei=true docker compose up -d
Huawei_yellow=true docker compose up -d
```

#### 方法 B：通过 .env 文件

在项目根目录创建 `.env` 文件：

```env
Huawei=true
# 或
Huawei_yellow=true
```

然后构建：

```bash
# 构建所有服务
docker compose build

# 或只构建特定服务
docker compose build backend
docker compose build sandbox
```

#### 方法 C：通过命令行 build-arg

```bash
# 构建 backend
docker compose build --build-arg Huawei=true backend
docker compose build --build-arg Huawei_yellow=true backend

# 构建 sandbox
docker compose build --build-arg Huawei=true sandbox
docker compose build --build-arg Huawei_yellow=true sandbox
```

---

### 方式 2：直接使用 docker build

#### Backend 服务
```bash
cd backend

# 构建 Huawei 版本
docker build --build-arg Huawei=true -t deepaudit/backend:huawei .

# 构建 Huawei_yellow 版本
docker build --build-arg Huawei_yellow=true -t deepaudit/backend:huawei-yellow .

# 构建默认版本
docker build -t deepaudit/backend:latest .
```

#### Sandbox 服务
```bash
cd docker/sandbox

# 构建 Huawei 版本
docker build --build-arg Huawei=true -t deepaudit/sandbox:huawei .

# 构建 Huawei_yellow 版本
docker build --build-arg Huawei_yellow=true -t deepaudit/sandbox:huawei-yellow .

# 构建默认版本
docker build -t deepaudit/sandbox:latest .
```

---

## 验证构建

构建完成后，可以验证镜像是否正确应用了 Huawei 配置：

### Sandbox 验证
```bash
# 运行临时容器验证
docker run --rm deepaudit/sandbox:huawei bash -c "echo \$GOPROXY && node --version && go version"
```

预期输出（Huawei 版本）：
```
http://mirrors.tools.huawei.com/goproxy/
v22.22.2
go1.25.8
```

### Backend 验证
```bash
# 运行临时容器验证
docker run --rm --entrypoint bash deepaudit/backend:huawei -c "echo \$UV_INDEX_URL && npm config get registry"
```

预期输出（Huawei 版本）：
```
http://mirrors.tools.huawei.com/pypi/simple/
https://mirrors.tools.huawei.com/npm
```

---

## 配置详解

### Dockerfile 中的条件逻辑

Backend、Frontend 和 Sandbox 的 Dockerfile 都使用 `ARG Huawei=false` 和 `ARG Huawei_yellow=false` 来控制配置：

```dockerfile
ARG Huawei=false
ARG Huawei_yellow=false

# 条件判断示例
RUN if [ "$Huawei" = "true" ] || [ "$Huawei_yellow" = "true" ]; then \
      # Huawei 特定镜像源配置 \
    else \
      # 默认配置 \
    fi

# 代理配置示例
RUN if [ "$Huawei" = "true" ]; then \
      export http_proxy=http://172.25.10.10:8181 && \
      export https_proxy=http://172.25.10.10:8181; \
    elif [ "$Huawei_yellow" = "true" ]; then \
      export http_proxy=http://10.43.232.147:8181 && \
      export https_proxy=http://10.43.232.147:8181; \
    fi
```

### 各组件的华为配置

#### Frontend 服务

##### 1. npm 源
- **Huawei/Huawei_yellow 版本**：`https://mirrors.tools.huawei.com/npm` + `strict-ssl=false`
- **默认版本**：`https://registry.npmmirror.com`

##### 2. 代理
- **Huawei 版本**：`http://172.25.10.10:8181`
- **Huawei_yellow 版本**：`http://10.43.232.147:8181`
- **默认版本**：无代理

#### Backend 服务

##### 1. apt 源
- **Huawei/Huawei_yellow 版本**：`mirrors.tools.huawei.com`
- **默认版本**：`mirrors.aliyun.com`

##### 2. PyPI 源
- **Huawei/Huawei_yellow 版本**：`http://mirrors.tools.huawei.com/pypi/simple/`
- **默认版本**：`https://pypi.tuna.tsinghua.edu.cn/simple`

##### 3. npm 源
- **Huawei/Huawei_yellow 版本**：`https://mirrors.tools.huawei.com/npm` + `strict-ssl=false`
- **默认版本**：`https://registry.npmmirror.com`

#### Sandbox 服务

##### 1. apt 源
- **Huawei/Huawei_yellow 版本**：`mirrors.tools.huawei.com`
- **默认版本**：`mirrors.aliyun.com`

##### 2. npm 源
- **Huawei/Huawei_yellow 版本**：`https://mirrors.tools.huawei.com/npm` + `strict-ssl=false`
- **默认版本**：`https://registry.npmmirror.com`

##### 3. Go 代理
- **Huawei/Huawei_yellow 版本**：`http://mirrors.tools.huawei.com/goproxy/`
- **默认版本**：`https://goproxy.cn,direct`

##### 4. Rust 镜像
- **Huawei/Huawei_yellow 版本**：`https://mirrors.tools.huawei.com/rustup`
- **默认版本**：`https://rsproxy.cn`

---

## 回退机制

如果某些 Huawei 本地文件不存在，Dockerfile 会自动：

1. **静默失败** - `COPY ... 2>/dev/null || true` 不会中断构建
2. **使用默认方式** - 如果本地文件不可用，会尝试在线安装

这确保了即使缺少部分文件，构建仍能继续完成。

---

## 常见问题

### Q: 构建时提示找不到 Huawei 文件？

**A:** 这是正常的。Dockerfile 使用了 `2>/dev/null || true` 来忽略文件不存在的错误。如果不需要 Huawei 配置，可以不用准备这些文件。

### Q: Huawei 和 Huawei_yellow 有什么区别？

**A:** 两种模式使用相同的华为镜像源配置，主要区别在于代理地址：
- **Huawei**：使用 `http://172.25.10.10:8181` 代理
- **Huawei_yellow**：使用 `http://10.43.232.147:8181` 代理

### Q: 如何同时使用 Huawei 配置和默认配置？

**A:** 可以构建两个不同标签的镜像：

```bash
# 构建默认版本
docker build -t deepaudit/backend:latest .
docker build -t deepaudit/sandbox:latest .

# 构建 Huawei 版本
docker build --build-arg Huawei=true -t deepaudit/backend:huawei .
docker build --build-arg Huawei=true -t deepaudit/sandbox:huawei .

# 构建 Huawei_yellow 版本
docker build --build-arg Huawei_yellow=true -t deepaudit/backend:huawei-yellow .
docker build --build-arg Huawei_yellow=true -t deepaudit/sandbox:huawei-yellow .
```

然后在 `docker-compose.yml` 中根据需要选择使用哪个镜像。

### Q: 证书文件在哪里获取？

**A:** 请联系华为 IT 部门获取内部证书文件。

### Q: 如何临时禁用华为配置？

**A:** 只要不设置 `Huawei=true` 或 `Huawei_yellow=true` 环境变量或 build-arg，就会使用默认配置。

### Q: 能否同时启用 Huawei 和 Huawei_yellow？

**A:** 不建议同时启用。如果同时设置，Huawei 参数优先级更高。建议只启用其中一个。

---

## 相关文档

- [部署指南](./DEPLOYMENT.md)
- [配置指南](./CONFIGURATION.md)
- [安全工具安装指南](./SECURITY_TOOLS_SETUP.md)

---

## 更新日志

- **v1.1** (2025-04-22) - 增加 Backend 服务 Huawei 配置支持
- **v1.0** (2025-04-22) - 初始版本，支持 Sandbox Huawei 可选配置
