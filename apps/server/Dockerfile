# monorepo 多阶段构建。构建上下文必须是【仓库根目录】（见 prod compose 的 context: .）
# 因为 @scene-prod/server 依赖 workspace 包（ai / core / shared），需要整个 workspace 才能装齐。

# ---- deps：安装全部依赖（含 workspace 源码）----
# workspace 包（shared/core/ai）的入口指向 .ts 源码，运行时用 tsx 直接执行，
# 无需预编译成 JS（node 无法加载 .ts，dev 一直靠 tsx，生产保持一致最稳）。
FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile

# ---- runner：用 tsx 直接运行 TS 源码 ----
FROM node:20-alpine AS runner
RUN corepack enable
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app ./
WORKDIR /app/apps/server
EXPOSE 3100
# 环境变量由 compose 注入，不读 .env 文件。tsx 运行时转译，天然支持 monorepo 的 .ts workspace 依赖。
CMD ["pnpm", "exec", "tsx", "src/app.ts"]

# 优化方向（骨架先跑通再说）：
#   1) runner 阶段用 `pnpm deploy --prod` 或 `pnpm prune --prod` 剔除 devDependencies，缩小镜像
#   2) 先 COPY 各 package.json 再 install，让依赖层命中缓存，改源码不必重装
