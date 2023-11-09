import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { BlogRepository } from "./blog.repository";
import { BlogQueryRepository } from "./blog.query-repository";
import { BlogInputModel } from "./models/input/BlogInputModel";
import { BlogViewModel } from "./models/view/BlogViewModel";
import { Blog } from "./models/schemas/Blog";
import { PostForSpecBlogInputModel } from "../posts/models/input/PostForSpecBlog";
import { PostViewModel } from "../posts/models/view/Post";
import { BanUserForBlogInputModel } from "./models/input/BanUserForBlogInputModel";
import { BlogBannedUsers } from "./models/schemas/BlogBannedUsers";
import { SQLPostInputModel } from "../posts/models/input/SQLPost";
import { DeleteResult, UpdateResult } from "typeorm";

@Injectable()
export class BlogService {
  constructor(private blogRepository: BlogRepository, private blogQueryRepository: BlogQueryRepository){}

  async addBlog(blog: BlogInputModel, creatorId: string): Promise<BlogViewModel>{
    const newBlog: Blog = {...blog, createdAt: new Date().toISOString(), isMembership: false, userId: creatorId, banInfo: {isBanned: false, banDate: null}}
    const id = await this.blogRepository.addBlog(newBlog)
    const result = {id: id.toString(), ...newBlog, userId: undefined, banInfo: undefined}
    return result
  }

  async addPostForSpecificBlog(blogId: string, post: PostForSpecBlogInputModel, userId: string): Promise<PostViewModel>{
    const blog = await this.blogQueryRepository.getBlogByIdNoView(blogId)
    if(!blog){
      throw new NotFoundException()
    }
    if(blog.userId !== userId){
      throw new ForbiddenException()
    }
    const newPost: SQLPostInputModel = {...post, blogId: blogId, blogName: blog.name, createdAt: new Date().toISOString(),
    likesAndDislikesCount: { likesCount: 0, dislikesCount: 0}}
    const id = await this.blogRepository.addPostForSpecificBlog(newPost)
    const result = {id: id.toString(), ...newPost, extendedLikesInfo: { likesCount: 0, dislikesCount: 0, myStatus: 'None', 
    newestLikes: [/*{ addedAt: '', login: '', userId: ''}*/]}, likesAndDislikesCount: undefined}
    return result
  }

  async deleteBlogById(id: string, userId: string): Promise<DeleteResult> {
    await this.validateBlogUser(id, userId)
    const result = await this.blogRepository.deleteBlogById(id)
    // throw error after getting blog above?
    if(result.affected === 0){
      throw new NotFoundException()
    }
    
    return result
  }

  async updateBlogById(id: string, newblog: BlogInputModel, userId: string): Promise<UpdateResult> {
    await this.validateBlogUser(id, userId)
    const isUpdated = await this.blogRepository.updateBlogById(id, newblog)
    // throw error after getting blog above?
    if(!isUpdated){
      throw new NotFoundException()
    }

    await this.blogRepository.updatePostBlogName(id, newblog.name)
    return isUpdated
  }

  async validateBlogUser(blogId: string, userId: string) {
    const blog = await this.blogQueryRepository.getBlogByIdNoView(blogId)
    if(blog && blog.userId !== userId){
      throw new ForbiddenException()
    }
  }

  async bindBlogWithUser(blogId: string, userId: string): Promise<boolean> {
    const blog = await this.blogQueryRepository.getBlogByIdNoView(blogId)
    if(!blog){
      throw new BadRequestException('Incorrect blog id')
    }
    //
    if(blog.userId === userId || blog.userId !== null || blog.userId.length !== 0) {
      throw new BadRequestException('User Id is already binded')
    }

    return await this.blogRepository.bindBlogWithUser(blogId, userId)
  }

  async deleteBlogsTesting(): Promise<boolean> {
    const result = await this.blogRepository.deleteBlogsTesting()
    return !!result
  }

  async deleteBannedUsersTesting(): Promise<boolean> {
    const result = await this.blogRepository.deleteBannedUsersTesting()
    return !!result
  }

  async banOrUnbanBlogById(blogId: string, isBanned: boolean): Promise<UpdateResult> {
    const banDate = isBanned ? new Date().toISOString() : null
    return await this.blogRepository.banOrUnbanBlogById(blogId, isBanned, banDate)
  }

  async banOrUnbanUserForBlog(userLogin: string, userId: string, blogOwnerId: string, banInfo: BanUserForBlogInputModel) {
    await this.validateBlogUser(banInfo.blogId, blogOwnerId)
    const newBannedUserInfo: BlogBannedUsers = {
      isBanned: banInfo.isBanned,
      banReason: banInfo.banReason,
      banDate: new Date().toISOString(),
      userId: userId,
      login: userLogin,
      blogId: banInfo.blogId,
      createdAt: new Date().toISOString()
    }
    
    const bannedUser = await this.blogQueryRepository.getSingleBannedUserForBlog(userId, banInfo.blogId)
    if(!bannedUser){
      return await this.blogRepository.banNewUserForBlog(newBannedUserInfo)
    }

    bannedUser.banDate = newBannedUserInfo.banDate
    bannedUser.banReason = newBannedUserInfo.banReason
    bannedUser.isBanned = newBannedUserInfo.isBanned

    return await this.blogRepository.banExistingUserForBlog(bannedUser)
  }
}