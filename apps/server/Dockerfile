# monorepo 多阶段构建。构建上下文必须是【仓库根目录】（见 prod compose 的 context: .）
# 因为 @scene-prod/server 依赖 workspace 包（ai / core / shared），需要整个 workspace 才能装齐。

# ---- build：装全部依赖并构建所有 @scene-prod 包 ----
FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
# 先构建被依赖的包，再构建 server（tsc 输出到各自的 dist）
RUN pnpm --filter "@scene-prod/*" build

# ---- runner：仅带运行所需产物 ----
FROM node:20-alpine AS runner
RUN corepack enable
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app ./
WORKDIR /app/apps/server
EXPOSE 3100
# 容器内用环境变量注入配置，不读 .env 文件，所以不加 --env-file
CMD ["node", "dist/app.js"]

# 优化方向（骨架先跑通再说）：
#   1) runner 阶段用 `pnpm deploy --prod` 或 `pnpm prune --prod` 剔除 devDependencies，缩小镜像
#   2) 先 COPY 各 package.json 再 install，让依赖层命中缓存，改源码不必重装
