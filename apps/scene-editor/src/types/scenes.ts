export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type NewScene = {
  name: string
  description: string
  enableOnboarding: boolean
}