// 用 ?? 而非 ||：生产同域部署时构建注入 VITE_API_BASE_URL=""（空串），
// 走相对路径由 Nginx 反代到后端；本地开发未设置该变量时才回退到 localhost:3100。
const BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3100'

export { BASE_URL }
export const API_BASE_URL: string = `${BASE_URL}/api/scene-prod`
export const ASSET_BASE_URL: string = `${BASE_URL}/api/scene-prod/assets`;