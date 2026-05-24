const BASE_URL: string = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3100'

export { BASE_URL }
export const API_BASE_URL: string = `${BASE_URL}/api/scene-prod`
export const ASSET_BASE_URL: string = `${BASE_URL}/api/scene-prod/assets`;