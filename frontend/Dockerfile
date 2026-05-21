# =============================================
# DeepAudit Frontend Docker 构建
# =============================================
# 使用 Nginx 提供静态文件和反向代理 (支持 SSE 流式传输)

FROM docker.m.daocloud.io/library/node:22-slim AS builder

# Huawei 可选配置
ARG Huawei=false
ARG Huawei_yellow=false

WORKDIR /app

# 根据参数设置代理
ENV http_proxy=""
ENV https_proxy=""
ENV HTTP_PROXY=""
ENV HTTPS_PROXY=""
ENV all_proxy=""
ENV ALL_PROXY=""
ENV no_proxy="*"
ENV NO_PROXY="*"

# 条件配置 npm 镜像源和代理
RUN if [ "$Huawei" = "true" ] || [ "$Huawei_yellow" = "true" ]; then \
      echo "Using Huawei npm mirror..."; \
      npm config set registry https://mirrors.tools.huawei.com/npm && \
      npm config set strict-ssl false && \
      npm install -g pnpm && \
      pnpm config set registry https://mirrors.tools.huawei.com/npm && \
      pnpm config set strict-ssl false; \
    else \
      echo "Using Taobao npm mirror..."; \
      npm config set registry https://registry.npmmirror.com && \
      npm install -g pnpm && \
      pnpm config set registry https://registry.npmmirror.com; \
    fi

# 设置代理环境变量（构建时使用）
RUN if [ "$Huawei" = "true" ]; then \
      echo "Setting Huawei proxy..."; \
      export http_proxy=http://172.25.10.10:8181 && \
      export https_proxy=http://172.25.10.10:8181 && \
      export HTTP_PROXY=http://172.25.10.10:8181 && \
      export HTTPS_PROXY=http://172.25.10.10:8181; \
    elif [ "$Huawei_yellow" = "true" ]; then \
      echo "Setting Huawei_yellow proxy..."; \
      export http_proxy=http://10.43.232.147:8181 && \
      export https_proxy=http://10.43.232.147:8181 && \
      export HTTP_PROXY=http://10.43.232.147:8181 && \
      export HTTPS_PROXY=http://10.43.232.147:8181; \
    fi

# 复制依赖文件
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# 增加网络超时设置和并发数限制，防止 ARM 架构构建卡死
ENV PNPM_NETWORK_TIMEOUT=300000
ENV PNPM_FETCH_RETRIES=5
RUN pnpm install --no-frozen-lockfile --network-concurrency 1

# 复制源代码
COPY . .

# 🔥 构建时使用占位符 - 实现 Build Once Run Anywhere
ENV VITE_API_BASE_URL=__API_BASE_URL__

# 构建生产版本
RUN pnpm build

# =============================================
# 生产镜像 - 使用 Nginx (支持 SSE 反向代理)
# =============================================
FROM docker.m.daocloud.io/library/nginx:alpine

# 复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制 Nginx 配置 (包含 SSE 反向代理配置)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 复制启动脚本
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
