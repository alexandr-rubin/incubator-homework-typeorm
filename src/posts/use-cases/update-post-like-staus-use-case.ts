import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { NotFoundException } from "@nestjs/common";
import { LikeStatuses } from "../../helpers/likeStatuses";
import { PostQueryRepository } from "../post.query-repository";
import { PostRepository } from "../post.repository";
import { PostEntity } from "../entities/post.entity";
import { DataSource } from "typeorm";
import { PostLikesAndDislikesEntity } from "../entities/post-likes-and-dislikes.entity";

export class UpdatePostLikeStatusCommand {
  constructor(public postId: string, public likeStatus: string, public userId:string, public login: string) {}
}

@CommandHandler(UpdatePostLikeStatusCommand)
export class UpdatePostLikeStatusUseCase implements ICommandHandler<UpdatePostLikeStatusCommand> {
  constructor(private postRepository: PostRepository, private postQueryRepository: PostQueryRepository, private dataSource: DataSource){}
  async execute(command: UpdatePostLikeStatusCommand): Promise<boolean> {
    const post = await this.postQueryRepository.getPostgByIdNoView(command.postId)
    if(!post){
      throw new NotFoundException()
    }

    const postLikesAndDislikes = await this.postQueryRepository.getPostLikesAndDislikesById(post.id)

    const like = postLikesAndDislikes.find(likeOrDislike => likeOrDislike.userId === command.userId)

    if(!like){
      return await this.firstLike(command.likeStatus, command.userId, post, command.login)
    }
    if(like.likeStatus === command.likeStatus){
      return true
    }
    if(command.likeStatus === LikeStatuses.None){
      return await this.updateNoneLikeStatus(like.likeStatus, command.likeStatus, command.postId, command.userId)
    }
    if(like.likeStatus !== command.likeStatus){
      if(like.likeStatus === LikeStatuses.None){
        await this.incPostLikeOrDislike(command.likeStatus, command.postId)
      }
      else if(command.likeStatus === LikeStatuses.Like){
        await this.postRepository.incLike(command.postId)
        await this.postRepository.decDisLike(command.postId)
      }
      else{
        await this.postRepository.decLike(command.postId)
        await this.postRepository.incDisLike(command.postId)
      }

      await this.updatePostLikeStatus(command.postId, command.likeStatus, command.userId)

      return true
    }

    return true
  }

  private async firstLike(likeStatus: string, userId: string, post: PostEntity, login: string) {
    if(likeStatus === LikeStatuses.None){
      return true
    }
    
    const qr = this.dataSource.createQueryRunner()
    await qr.connect()
    await qr.startTransaction()

    try{
      const postLike = {userId: userId, login: login, addedAt: new Date().toISOString(), likeStatus: likeStatus, postId: post.id}
      await qr.manager.getRepository(PostLikesAndDislikesEntity).save(postLike)
      if(likeStatus === LikeStatuses.Like){
        await this.postRepository.incLike(post.id, qr)
      }
      else{
        await this.postRepository.incDisLike(post.id, qr)
      }
      
      await qr.commitTransaction()
      
      return true
    }
    catch(error) {
      console.log(error)
      await qr.rollbackTransaction()
    }
    finally {
      await qr.release()
    }
  }

  private async updateNoneLikeStatus(likeLikeStatus: string, likeStatus: string, postId: string, userId: string) {
    if(likeLikeStatus === LikeStatuses.Like) {
      await this.postRepository.decLike(postId)
      await this.updatePostLikeStatus(postId, likeStatus, userId)
    }
    else if(likeLikeStatus === LikeStatuses.Dislike){
      await this.postRepository.decDisLike(postId)
      await this.updatePostLikeStatus(postId, likeStatus, userId)
    }
    return true
  }

  private async incPostLikeOrDislike(likeStatus: string, postId: string) {
    if(likeStatus === LikeStatuses.None){
      return
    }
    if(likeStatus === LikeStatuses.Like){
      await this.postRepository.incLike(postId)
    }
    else{
      await this.postRepository.incDisLike(postId)
    }
  }

  private async updatePostLikeStatus(postId: string, likeStatus: string, userId: string) {
    await this.postRepository.updatePostLikeStatus(postId, userId, likeStatus)
  }
}