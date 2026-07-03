# 前端 monorepo 多阶段构建。构建上下文必须是【仓库根目录】（见 prod compose 的 context: .）
# 因为 @scene-prod/editor 依赖 workspace 包（core / shared）。

# ---- build：装依赖并构建前端静态产物 ----
FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
# core/shared 的 exports 指向 .ts 源码，Vite 直接打包源码，无需预先 build 这两个包。
# 同域部署：API 走相对路径由 Nginx 反代，故注入空串（config.ts 用 ?? 保留空串语义）
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN pnpm --filter "@scene-prod/editor" build

# ---- runner：Nginx 托管静态产物 + 反向代理 ----
FROM nginx:1.27-alpine AS runner
COPY apps/scene-editor/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/scene-editor/dist /usr/share/nginx/html
EXPOSE 80 443
