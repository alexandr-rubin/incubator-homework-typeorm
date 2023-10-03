import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { NotFoundException } from "@nestjs/common";
import { LikeStatuses } from "../../helpers/likeStatuses";
import { CommentRepository } from "../comment.repository";
import { CommentQueryRepository } from "../comment.query-repository";
import { CommentEntity } from "../entities/comment.entity";

export class UpdateCommentLikeStatusCommand {
  constructor(public commentId: string, public likeStatus: string, public userId:string) {}
}

@CommandHandler(UpdateCommentLikeStatusCommand)
export class UpdateCommentLikeStatusUseCase implements ICommandHandler<UpdateCommentLikeStatusCommand> {
  constructor(private commentRepository: CommentRepository, private commentQueryRepository: CommentQueryRepository){}

  async execute(command: UpdateCommentLikeStatusCommand): Promise<boolean> {
    const comment = await this.commentQueryRepository.getCommentByIdNoView(command.commentId)
    if(!comment){
      throw new NotFoundException()
    }

    const commentLikes = await this.commentQueryRepository.getCommentLikesAndDislikesById(comment.id)

    const like = commentLikes.find(likeOrDislike => likeOrDislike.userId === command.userId)

    if(!like){
      if(command.likeStatus === LikeStatuses.None){
        return true
      }
      return await this.firstLike(comment, command.likeStatus, command.userId)
    }
    if(like.likeStatus === command.likeStatus){
      return true
    }
    if(command.likeStatus === LikeStatuses.None){
      if(like.likeStatus === LikeStatuses.Like){
        await this.commentRepository.decLike(command.commentId)
        await this.updateCommentLikeStatus(command.commentId, command.likeStatus, command.userId)
      }
      else if(like.likeStatus === LikeStatuses.Dislike){
        await this.commentRepository.decDisLike(command.commentId)
        await this.updateCommentLikeStatus(command.commentId, command.likeStatus, command.userId)
      }
      return true
    }
    if(like.likeStatus !== command.likeStatus){
      if(like.likeStatus === LikeStatuses.None){
        if(command.likeStatus === LikeStatuses.Like){
          await this.commentRepository.incLike(command.commentId)
        }
        else{
          await this.commentRepository.incDisLike(command.commentId)
        }
      }
      else if(command.likeStatus === LikeStatuses.Like){
          await this.commentRepository.incLike(command.commentId)
          await this.commentRepository.decDisLike(command.commentId)
      }
      else{
          await this.commentRepository.decLike(command.commentId)
          await this.commentRepository.incDisLike(command.commentId)
      }

      await this.updateCommentLikeStatus(command.commentId, command.likeStatus, command.userId)

      return true
    }

    return true
  }

  private async firstLike(comment: CommentEntity, likeStatus: string, userId: string) {
    const commentLike = {userId: userId, addedAt: new Date().toISOString(), likeStatus: likeStatus, commentId: comment.id}
    await this.commentRepository.updateFirstLike(commentLike)
    if(likeStatus === LikeStatuses.Like){
      await this.commentRepository.incLike(comment.id)
    }
    else{
      await this.commentRepository.incDisLike(comment.id)
    }
    return true
  }

  private async updateCommentLikeStatus(commentId: string, likeStatus: string, userId: string) {
    await this.commentRepository.updateCommentLikeStatus(likeStatus, commentId, userId)
  }
}