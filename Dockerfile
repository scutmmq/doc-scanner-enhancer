# ==========================================================
# Stage 1: Build React 19 + Vite Frontend (includes public/hero-intro.mp4)
# ==========================================================
FROM node:20-slim AS frontend-builder

ARG NPM_REGISTRY=https://registry.npmmirror.com

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm config set registry "${NPM_REGISTRY}" && npm ci

COPY frontend/ ./
RUN npm run build

# ==========================================================
# Stage 2: Production Python 3.12 Runtime (FastAPI + OpenCV + RapidOCR)
# ==========================================================
FROM python:3.12-slim-bookworm AS runtime

ARG PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple/
ARG PIP_TRUSTED_HOST=mirrors.aliyun.com

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

WORKDIR /app

# OpenCV 与 ONNXRuntime 必需的系统共享库（Debian Bookworm）
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || true \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
       libgl1 \
       libglib2.0-0 \
       libgomp1 \
       libsm6 \
       libxext6 \
       libxrender1 \
    && rm -rf /var/lib/apt/lists/*

# 安装 Python 依赖
COPY requirements.txt ./
RUN pip install --no-cache-dir \
    -i "${PIP_INDEX_URL}" \
    --trusted-host "${PIP_TRUSTED_HOST}" \
    -r requirements.txt

# 拷贝后端源码与前端构建产物
COPY src/ ./src/
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# 预生成 6 类基准退化样张与真值，加速首次启动
RUN python -m src.evaluation.generate_samples

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/api/v1/health', timeout=3)" || exit 1

# 单进程异步 worker（保障内存态 QR 手机拍传会话一致性，OpenCV 计算自动走后台线程池）
CMD ["uvicorn", "src.server:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1", "--proxy-headers", "--forwarded-allow-ips=*"]
