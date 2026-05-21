# ============================================
# 多阶段构建 - 构建阶段
# ============================================
FROM docker.m.daocloud.io/library/python:3.12-trixie AS builder

# Huawei 可选配置
ARG Huawei=false
ARG Huawei_yellow=false

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# 配置时区
RUN rm -f /etc/localtime && ln -s /usr/share/zoneinfo/Asia/Shanghai /etc/localtime

# 条件配置 apt 源
RUN if [ "$Huawei" = "true" ] || [ "$Huawei_yellow" = "true" ]; then \
      echo "Using Huawei apt mirror..."; \
      sed -i 's|deb.debian.org|mirrors.tools.huawei.com|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || \
      sed -i 's|deb.debian.org|mirrors.tools.huawei.com|g' /etc/apt/sources.list 2>/dev/null || true; \
    else \
      echo "Using Alibaba apt mirror..."; \
      sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || \
      sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list 2>/dev/null || true; \
    fi && \
    rm -f /etc/apt/apt.conf.d/proxy.conf 2>/dev/null || true && \
    echo 'Acquire::http::Proxy "false";' > /etc/apt/apt.conf.d/99-no-proxy && \
    echo 'Acquire::https::Proxy "false";' >> /etc/apt/apt.conf.d/99-no-proxy && \
    echo 'Acquire::Retries "5";' >> /etc/apt/apt.conf.d/99-no-proxy && \
    echo 'Acquire::http::Timeout "60";' >> /etc/apt/apt.conf.d/99-no-proxy

# 安装构建依赖（gcc 只在构建阶段需要）
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        gcc \
        libpq-dev \
        libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# 安装 uv
COPY --from=ghcr.m.daocloud.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# 复制依赖文件
COPY backend/pyproject.toml backend/uv.lock backend/README.md ./

# 安装 Python 依赖到虚拟环境（根据 Huawei 参数选择 PyPI 源）
RUN if [ "$Huawei" = "true" ] || [ "$Huawei_yellow" = "true" ]; then \
      echo "Using Huawei PyPI mirror..."; \
      UV_INDEX_URL=http://mirrors.tools.huawei.com/pypi/simple/ uv sync --no-dev; \
    else \
      echo "Using Tsinghua PyPI mirror..."; \
      UV_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple uv sync --no-dev; \
    fi

# ============================================
# 多阶段构建 - 运行阶段
# ============================================
FROM docker.m.daocloud.io/library/python:3.12-trixie AS runtime

# 继承 Huawei 参数
ARG Huawei=false
ARG Huawei_yellow=false

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Huawei: 证书和全局pip源配置
ARG CERT_DIR="/usr/local/share/ca-certificates/"

# Huawei: 创建证书目录
RUN if [ "$Huawei" = "true" ] || [ "$Huawei_yellow" = "true" ]; then \
      echo "Applying Huawei configuration..."; \
      mkdir -p ${CERT_DIR}; \
    fi

# 注意：Huawei 证书文件需要通过其他方式（如 volume 挂载）提供
# 或在构建前手动放置到 bin 目录并取消下面的注释
COPY docker/backend/HuaweiITRootCA.crt ${CERT_DIR}/
COPY docker/backend/HWITEnterpriseCA1.crt ${CERT_DIR}/

# 条件配置 PyPI 源
ENV UV_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
RUN if [ "$Huawei" = "true" ] || [ "$Huawei_yellow" = "true" ]; then \
      echo "Using Huawei PyPI mirror..."; \
    else \
      echo "Using Tsinghua PyPI mirror..."; \
    fi

# 配置时区
RUN rm -f /etc/localtime && ln -s /usr/share/zoneinfo/Asia/Shanghai /etc/localtime

# 条件配置 apt 源
RUN if [ "$Huawei" = "true" ] || [ "$Huawei_yellow" = "true" ]; then \
      echo "Using Huawei apt mirror..."; \
      sed -i 's|deb.debian.org|mirrors.tools.huawei.com|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || \
      sed -i 's|deb.debian.org|mirrors.tools.huawei.com|g' /etc/apt/sources.list 2>/dev/null || true; \
    else \
      echo "Using Alibaba apt mirror..."; \
      sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || \
      sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list 2>/dev/null || true; \
    fi

# 只安装运行时依赖（不需要 gcc）
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libpq5 \
        curl \
        git \
        openssh-client \
        libpango-1.0-0 \
        libpangoft2-1.0-0 \
        libpangocairo-1.0-0 \
        libcairo2 \
        libgdk-pixbuf-2.0-0 \
        libglib2.0-0 \
        shared-mime-info \
        fonts-noto-cjk \
    && fc-cache -fv \
    && rm -rf /var/lib/apt/lists/* \
    && update-ca-certificates \
    && apt-get clean

# 安装comment-checker
COPY docker/backend/bin/comment-checker /usr/local/bin

# 安装 ripgrep
COPY --chown=0:0 docker/backend/bin/rg /usr/local/bin

# 安装cppcheck（如果文件存在）
# ADD --chown=0:0 docker/backend/bin/cppcheck.tar.gz /usr/local

# 安装 gh
ARG GH_VERSION="gh_2.89.0_linux_amd64"
ADD --chown=0:0 docker/backend/bin/${GH_VERSION}.tar.gz /usr/local

# 安装nodejs
ARG NODE_VERSION="node-v22.22.2-linux-x64"
ADD --chown=0:0 docker/backend/bin/${NODE_VERSION}.tar.xz /usr/local

RUN cp -r /usr/local/${NODE_VERSION}/* /usr/local/ \
    && cp -r /usr/local/${GH_VERSION}/* /usr/local/ \
    && rm -rf /usr/local/${NODE_VERSION} \
    && rm -rf /usr/local/${GH_VERSION} \
    && chmod +x /usr/local/bin/comment-checker

# 条件配置 npm 源
RUN if [ "$Huawei" = "true" ] || [ "$Huawei_yellow" = "true" ]; then \
      echo "Using Huawei npm mirror..."; \
      npm config set registry https://mirrors.tools.huawei.com/npm -g && \
      npm config set strict-ssl false -g; \
    else \
      echo "Using Taobao npm mirror..."; \
      npm config set registry https://registry.npmmirror.com -g; \
    fi

# 环境变量
ENV PATH="/root/.bun/bin:${PATH}"
ENV NODE_TLS_REJECT_UNAUTHORIZED=0
ENV OPENCODE_DISABLE_MODELS_FETCH=true
ENV OPENCODE_DISABLE_AUTOUPDATE=true

# Huawei: 临时代理（仅在 Huawei=true 或 Huawei_yellow=true 时启用）
ARG TEMP_PROXY=""

# 安装 opencode 和 oh-my-openagent
RUN npm install -g bun \
    && if [ "$Huawei" = "true" ]; then \
        echo "Using Huawei bun mirror with proxy..."; \
        export no_proxy="10.0.0.0/8,192.168.0.0/16,172.16.0.0/12,127.0.0.0/8,169.254.0.0/16,172.2.255.254,192.50.0.0/24,70.181.0.0/16,.huawei.com" && \
        export http_proxy=http://172.25.10.10:8181 && \
        export https_proxy=http://172.25.10.10:8181 && \
        bun add -g opencode-ai oh-my-openagent oh-my-opencode-slim; \
    elif [ "$Huawei_yellow" = "true" ]; then \
        echo "Using Huawei bun mirror with Huawei_yellow proxy..."; \
        export no_proxy="10.0.0.0/8,192.168.0.0/16,172.16.0.0/12,127.0.0.0/8,169.254.0.0/16,172.2.255.254,192.50.0.0/24,70.181.0.0/16,.huawei.com" && \
        export http_proxy=http://10.43.232.147:8181 && \
        export https_proxy=http://10.43.232.147:8181 && \
        bun add -g opencode-ai oh-my-openagent oh-my-opencode-slim; \
    else \
        echo "Using Taobao bun mirror..."; \
        BUN_CONFIG_REGISTRY=https://registry.npmmirror.com bun add -g opencode-ai oh-my-openagent oh-my-opencode-slim; \
    fi

# 先复制应用代码
COPY backend/ .

# 再复制虚拟环境和 uv
COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /usr/local/bin/uv /usr/local/bin/uv

# 创建上传目录并设置启动脚本权限
RUN mkdir -p /app/uploads/zip_files && \
    chmod +x /app/docker-entrypoint.sh

# 暴露端口
EXPOSE 8000

# 启动命令 - 使用启动脚本自动执行数据库迁移
CMD ["/app/docker-entrypoint.sh"]
