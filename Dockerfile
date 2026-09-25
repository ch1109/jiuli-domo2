FROM node:20-bookworm-slim

ENV NEXT_TELEMETRY_DISABLED=1
ENV TZ=Asia/Singapore
ENV PATH="/opt/jiuli-python/bin:${PATH}"

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/jiuli-python \
    && /opt/jiuli-python/bin/pip install --no-cache-dir \
      openpyxl==3.1.5 pypdf==6.10.0 xlrd==2.0.2

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack pnpm install --frozen-lockfile

COPY . .
RUN corepack pnpm build \
    && mkdir -p /app/.next/cache \
    && chown -R node:node /app/.next/cache

USER node
EXPOSE 3000
CMD ["corepack", "pnpm", "start", "--hostname", "0.0.0.0", "--port", "3000"]
