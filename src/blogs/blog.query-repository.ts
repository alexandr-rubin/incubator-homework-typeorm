import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Paginator } from "../models/Paginator";
import { QueryParamsModel } from "../models/PaginationQuery";
import { createPaginationQuery } from "../helpers/pagination";
import { BlogViewModel } from "./models/view/BlogViewModel";
import { Blog, BlogDocument } from "./models/schemas/Blog";
import { BlogBannedUsers, BlogBannedUsersDocument } from "./models/schemas/BlogBannedUsers";
import { DataSource } from "typeorm";
import { InjectDataSource } from "@nestjs/typeorm";
import { SQLBlog } from "./models/view/SQLBlogViewModel";

@Injectable()
export class BlogQueryRepository {
  constructor(@InjectModel(Blog.name) private blogModel: Model<BlogDocument>, @InjectModel(BlogBannedUsers.name) private blogBannedUsersModel: Model<BlogBannedUsersDocument>,
  @InjectDataSource() protected dataSource: DataSource){}
  async getBlogs(params: QueryParamsModel, userId: string | null): Promise<Paginator<BlogViewModel>> {
    const query = createPaginationQuery(params)
    const blogs = await this.getBlogsWithFilter(query, userId)
    
    // раскомментить когда верну баны
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    // const transformedBlogs = blogs.filter(blog => !blog.banInfo.isBanned).map(({ userId, banInfo, ...rest }) => ({ id: rest.id, ...rest }))

    //const count = trans blogs?????????????? blogs.length
    const count = await this.dataSource.query(`
      SELECT COUNT(*) FROM public."Blogs" b
      WHERE (COALESCE(b."name" ILIKE $1, true))
    `,[query.searchNameTerm ? `%${query.searchNameTerm}%` : null])
    const result = Paginator.createPaginationResult(+count[0].count, query, blogs)
    
    return result
  }

  async getBlogsIds(userId: string | null): Promise<string[]> {
    const blogs = await this.blogModel.find({userId: userId, 'banInfo.isBanned': false})
    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const blogIdArray = blogs.map((blog) => (blog._id.toString()))
    
    return blogIdArray
  }

  async getSuperAdminBlogs(params: QueryParamsModel)/*: Promise<Paginator<BlogAdminViewModel>>*/ {
    const query = createPaginationQuery(params)
    const blogs = await this.getBlogsWithFilter(query, null)
    const count = await this.dataSource.query(`
      SELECT COUNT(*) FROM public."Blogs" b
      WHERE (COALESCE(b."name" ILIKE $1, true))
    `,[query.searchNameTerm ? `%${query.searchNameTerm}%` : null])
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    // const transformedBlogs = blogs.map(({ userId, ...rest }) => ({ id: rest.id, ...rest, blogOwnerInfo: {userId: userId, userLogin: null}, 
    // banInfo: {isBanned: rest.banInfo.isBanned, banDate: rest.banInfo.banDate} }))
    const transformedBlogs = blogs.map(({ userId, ...rest }) => ({ id: rest.id, ...rest}))
    const result = Paginator.createPaginationResult(+count[0].count, query, transformedBlogs)
    return result
  }

  async getBlogById(blogId: string): Promise<BlogViewModel> {
    // const blog = await this.blogModel.findById(blogId, { __v: false, userId: false })
    const blog: SQLBlog = await this.dataSource.query(`
    SELECT * FROM public."Blogs"
    WHERE id = $1
    `, [blogId])

    if (!blog[0] /*|| blog[0].banInfo.isBanned*/){
      throw new NotFoundException()
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { userId, banInfo, ...rest } = blog[0]
    const id = rest.id
    return { id, ...rest }
  }

  async getBlogByIdNoView(blogId: string): Promise<Blog | null> {
    // to json?
    // const blog = await this.blogModel.findById(blogId, { __v: false })
    // if (!blog){
    //   return null
    // }
    // return blog
    const blog: SQLBlog = await this.dataSource.query(`
    SELECT * FROM public."Blogs"
    WHERE id = $1
    `, [blogId])
    if(!blog[0]){
      return null
    }
    return blog[0]
  }

  async getBannedBlogsId(): Promise<string[]> {
    const bannedBlogs = await this.blogModel.find({'banInfo.isBanned': true}, '_id')
    const bannedBlogsIds = bannedBlogs.map(blog => blog._id.toString());
    return bannedBlogsIds
  }

  async getBannedUsersForBlog(params: QueryParamsModel, blogId: string)/*: Promise<Paginator<>>*/ {
    // const blog = await this.blogModel.findById(blogId)
    
    // if(!blog){
    //   throw new NotFoundException()
    // }
    // const query = createPaginationQuery(params)
    
    // // const bannedUsers = blog.blogBannedUsers.filter(user => 
    // //   user.isBanned === true && 
    // //   (query.searchLoginTerm === null || new RegExp(query.searchLoginTerm, 'i').test(user.userLogin))
    // // )

    // const skip = (query.pageNumber - 1) * query.pageSize

    // //fix
    // const bannedUsers = blog.blogBannedUsers
    // .filter(user => 
    // user.isBanned === true && 
    // (query.searchLoginTerm === null || new RegExp(query.searchLoginTerm, 'i').test(user.userLogin))
    // )
    // .sort((a, b) => {
    //   if (query.sortDirection === 'asc') {
    //     return a[query.sortBy] - b[query.sortBy];
    //   } else {
    //     return b[query.sortBy] - a[query.sortBy];
    //   }
    // })
    // .slice(skip, skip + query.pageSize)
    
    // const mappedArray = bannedUsers.map(user => ({
    //   id: user.userId,
    //   login: user.userLogin,
    //   banInfo: {
    //     isBanned: user.isBanned,
    //     banDate: user.banDate,
    //     banReason: user.banReason
    //   }
    // }))

    // const count = blog.blogBannedUsers.filter(user => user.isBanned === true).length

    // const result = Paginator.createPaginationResult(count, query, mappedArray)

    // return result
    
    const query = createPaginationQuery(params)
    const skip = (query.pageNumber - 1) * query.pageSize
    const filter = query.searchLoginTerm === null ? {blogId: blogId, isBanned: true} : { userLogin: { $regex: query.searchLoginTerm, $options: 'i' }, isBanned: true}
    const users = await this.blogBannedUsersModel.find(filter, { __v: false })
    .sort({[query.sortBy]: query.sortDirection === 'asc' ? 1 : -1}).skip(skip).limit(query.pageSize).lean()

    const mappedUsers = users.map(user => ({
        id: user.userId,
        login: user.login,
        banInfo: {
          isBanned: user.isBanned,
          banDate: user.banDate,
          banReason: user.banReason
        }
    }))

    const count = await this.blogBannedUsersModel.countDocuments({blogId: blogId, isBanned: true})

    const result = Paginator.createPaginationResult(count, query, mappedUsers)
    
    return result
  }

  async getSingleBannedUserForBlog(userId: string, blogId: string): Promise<BlogBannedUsersDocument>{
    const user = await this.blogBannedUsersModel.findOne({userId: userId, blogId: blogId})
    return user
  }

  // add filter to params
  private async getBlogsWithFilter(query: QueryParamsModel, userId: string | null): Promise<SQLBlog[]>{
    const skip = (query.pageNumber - 1) * query.pageSize
    const filter: any = userId === null ? `WHERE (COALESCE(b."name" ILIKE $1, true))` : `WHERE (COALESCE(b."name" ILIKE $1, true)) AND "userId" = ${userId}`
    const blogs: SQLBlog[] = await this.dataSource.query(`
    SELECT id, name, description, "websiteUrl", "createdAt", "isMembership" FROM public."Blogs" b   
    ${filter}
    ORDER BY b."${query.sortBy}" COLLATE "C" ${query.sortDirection}
    OFFSET $2
    LIMIT $3
    `, [query.searchNameTerm ? `%${query.searchNameTerm}%` : null, skip, query.pageSize])

    return blogs
  }

  // private generateUserIdFilter(query: QueryParamsModel, userId: string | null) {
  //   const filter: any = userId === null ? `WHERE (COALESCE(b."name" ILIKE $1, true))` : `WHERE (COALESCE(b."name" ILIKE $1, true)) AND "userId" = ${userId}`
  //   if (query.searchNameTerm !== null) {
  //     filter.name = { $regex: query.searchNameTerm, $options: 'i' }
  //   }

  //   return filter
  // }
}