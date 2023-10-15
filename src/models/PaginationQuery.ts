export class QueryParamsModel {
  banStatus?: string
  searchNameTerm?: string
  searchLoginTerm?: string
  searchEmailTerm?: string
  bodySearchTerm?: string
  publishedStatus!: string
  sortBy!: string
  sortDirection!: "asc" | "desc"
  pageNumber!: number
  pageSize!: number
}