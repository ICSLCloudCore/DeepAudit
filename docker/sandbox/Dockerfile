# DeepAudit Agent Sandbox
# 安全沙箱环境用于漏洞验证和 PoC 执行
# 集成各类安全扫描工具 (Semgrep, Bandit, Gitleaks, etc.)

FROM docker.m.daocloud.io/library/python:3.12-bullseye

LABEL maintainer="XCodeReviewer Team"
LABEL description="Secure sandbox environment for vulnerability verification and security scanning"

# Huawei 可选配置
ARG Huawei=false

# Huawei: 临时代理（仅在 Huawei=true 时启用）
ARG TEMP_PROXY="export no_proxy=10.0.0.0/8,192.168.0.0/16,172.16.0.0/12,127.0.0.0/8,169.254.0.0/16,172.2.255.254,192.50.0.0/24,70.181.0.0/16,.huawei.com https_proxy=http://172.25.10.10:8181 https_proxy=http://172.25.10.10:8181"

# Huawei: 证书和全局pip源配置
ARG CERT_DIR="/usr/local/share/ca-certificates/"

# 创建证书目录
RUN mkdir -p ${CERT_DIR}

# 复制证书文件
COPY ./HuaweiITRootCA.crt ${CERT_DIR}/
COPY ./HWITEnterpriseCA1.crt ${CERT_DIR}/
# COPY ./bin/pip.conf /etc/

# 安装基本工具
RUN unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY && \
    if [ "$Huawei" = "true" ]; then \
      echo "Using Huawei apt mirror..."; \
      sed -i 's/deb.debian.org/mirrors.tools.huawei.com/g' /etc/apt/sources.list; \
      sed -i 's/security.debian.org/mirrors.tools.huawei.com/g' /etc/apt/sources.list; \
    else \
      echo "Using Alibaba apt mirror..."; \
      sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list; \
      sed -i 's/security.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list; \
    fi && \
    apt-get update && apt-get install -y --no-install-recommends \
    curl \
    wget \
    netcat-openbsd \
    dnsutils \
    iputils-ping \
    ca-certificates \
    git \
    unzip \
    jq \
    php-cli \
    openjdk-11-jdk-headless \
    ruby-full \
    build-essential \
    cmake \
    clang \
    llvm \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Huawei: Node.js 配置
ARG NODE_VERSION="node-v22.22.2-linux-x64"

# 注意：Huawei Node.js 本地文件需要手动放置到 bin 目录
# 并取消下面的注释来启用：
COPY ./bin/${NODE_VERSION}.tar.xz /tmp/nodejs.tar.xz

# 统一安装 Node.js
RUN if [ "$Huawei" = "true" ] && [ -f /tmp/nodejs.tar.xz ]; then \
      echo "Installing Node.js from Huawei local file..."; \
      mkdir -p /usr/local && \
      tar -xJf /tmp/nodejs.tar.xz -C /usr/local/ && \
      cp -r /usr/local/${NODE_VERSION}/* /usr/local/ 2>/dev/null || true && \
      rm -rf /usr/local/${NODE_VERSION} /tmp/nodejs.tar.xz && \
      npm config set registry "https://mirrors.tools.huawei.com/npm" -g && \
      npm config set strict-ssl false -g; \
    else \
      echo "Installing Node.js from NodeSource..."; \
      unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY && \
      curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
      && apt-get install -y nodejs \
      && npm config set registry https://registry.npmmirror.com \
      && rm -rf /var/lib/apt/lists/*; \
    fi

# Huawei: Go 配置
# 先设置基础 Go 环境变量
ENV PATH=$PATH:/usr/local/go/bin

# 注意：Huawei Go 本地文件需要手动放置到 bin 目录
# 并取消下面的注释来启用：
COPY ./bin/go1.25.8.linux-amd64.tar.gz /tmp/go.tar.gz

# 统一安装 Go
RUN if [ "$Huawei" = "true" ] && [ -f /tmp/go.tar.gz ]; then \
      echo "Installing Go from Huawei local file..."; \
      tar -C /usr/local -xzf /tmp/go.tar.gz && \
      rm /tmp/go.tar.gz && \
      echo 'export GOPROXY=http://mirrors.tools.huawei.com/goproxy/' >> /etc/profile; \
    else \
      echo "Installing Go from Alibaba mirror..."; \
      rm -f /tmp/go.tar.gz 2>/dev/null || true && \
      unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY && \
      curl -L https://mirrors.aliyun.com/golang/go1.21.6.linux-amd64.tar.gz -o go.tar.gz && \
      tar -C /usr/local -xzf go.tar.gz && \
      rm go.tar.gz && \
      echo 'export GOPROXY=https://goproxy.cn,direct' >> /etc/profile; \
    fi

# 设置默认 GOPROXY（会被 /etc/profile 覆盖）
ENV GOPROXY=https://goproxy.cn,direct

# Huawei: Rust 配置
# 设置基础 Rust 环境变量
ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=/usr/local/cargo/bin:$PATH

# 安装 Rust
RUN if [ "$Huawei" = "true" ]; then \
      echo "Installing Rust from Huawei mirror..."; \
      export RUSTUP_DIST_SERVER=https://mirrors.tools.huawei.com/rustup && \
      export RUSTUP_UPDATE_ROOT=https://mirrors.tools.huawei.com/rustup/rustup && \
      unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY && \
      curl -k https://mirrors.tools.huawei.com/rustup/rustup/rustup-init.sh | sh -s -- -y --default-toolchain stable --profile minimal && \
      chmod -R a+w /usr/local/cargo; \
    else \
      echo "Installing Rust from rsproxy mirror..."; \
      export RUSTUP_DIST_SERVER=https://rsproxy.cn && \
      export RUSTUP_UPDATE_ROOT=https://rsproxy.cn/rustup && \
      unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY && \
      curl --proto '=https' --tlsv1.2 -sSf https://rsproxy.cn/rustup-init.sh | sh -s -- -y --default-toolchain stable --profile minimal && \
      chmod -R a+w /usr/local/cargo; \
    fi

# 设置最终的 Rust 镜像源（Huawei 或默认）
ENV RUSTUP_DIST_SERVER=https://rsproxy.cn \
    RUSTUP_UPDATE_ROOT=https://rsproxy.cn/rustup
RUN if [ "$Huawei" = "true" ]; then \
      echo "Setting Huawei Rust mirror..."; \
      echo 'export RUSTUP_DIST_SERVER=https://mirrors.tools.huawei.com/rustup' >> /etc/profile && \
      echo 'export RUSTUP_UPDATE_ROOT=https://mirrors.tools.huawei.com/rustup/rustup' >> /etc/profile; \
    fi

# 安装 Python 安全工具
RUN unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY && \
    if [ "$Huawei" = "true" ]; then \
      echo "Using Huawei PyPI mirror..."; \
      pip install --no-cache-dir -i http://mirrors.tools.huawei.com/pypi/simple \
        requests \
        httpx \
        aiohttp \
        beautifulsoup4 \
        lxml \
        pycryptodome \
        paramiko \
        pyjwt \
        python-jose \
        sqlparse \
        semgrep \
        bandit \
        safety; \
    else \
      echo "Using Tsinghua PyPI mirror..."; \
      pip install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple \
        requests \
        httpx \
        aiohttp \
        beautifulsoup4 \
        lxml \
        pycryptodome \
        paramiko \
        pyjwt \
        python-jose \
        sqlparse \
        semgrep \
        bandit \
        safety; \
    fi

# 安装 Gitleaks
COPY bin/gitleaks_8.18.2_linux_x64.tar.gz /tmp/
RUN tar -xzf /tmp/gitleaks_8.18.2_linux_x64.tar.gz -C /usr/local/bin/ gitleaks && \
    chmod +x /usr/local/bin/gitleaks && \
    rm /tmp/gitleaks_8.18.2_linux_x64.tar.gz

# 安装 TruffleHog
COPY bin/trufflehog_3.95.2_checksums.txt /tmp/
COPY bin/trufflehog_3.95.2_linux_amd64.tar.gz /tmp/
RUN cd /tmp && \
    # 验证 SHA256（安全检查）
    sha256sum -c trufflehog_3.95.2_checksums.txt 2>&1 | grep "trufflehog_3.95.2_linux_amd64.tar.gz: OK" && \
    # 解压并安装
    tar -xzf trufflehog_3.95.2_linux_amd64.tar.gz -C /usr/local/bin/ trufflehog && \
    chmod +x /usr/local/bin/trufflehog && \
    # 清理
    rm -f trufflehog_3.95.2_checksums.txt trufflehog_3.95.2_linux_amd64.tar.gz

# 安装 OSV-Scanner
COPY bin/osv-scanner_1.6.2_linux_amd64 /usr/local/bin/osv-scanner
RUN chmod +x /usr/local/bin/osv-scanner

# 创建非 root 用户
RUN groupadd -g 1000 sandbox && \
    useradd -u 1000 -g sandbox -m -s /bin/bash sandbox

# 创建工作目录
RUN mkdir -p /workspace /tmp/sandbox && \
    chown -R sandbox:sandbox /workspace /tmp/sandbox

# 设置环境变量
ENV HOME=/home/sandbox
ENV PATH=/home/sandbox/.local/bin:$PATH
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# 限制 Python 导入路径
ENV PYTHONPATH=/workspace

# 切换到非 root 用户
USER sandbox

WORKDIR /workspace

# 默认命令
CMD ["/bin/bash"]

