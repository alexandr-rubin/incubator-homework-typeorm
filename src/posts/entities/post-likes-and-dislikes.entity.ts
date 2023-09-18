import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm"
import { UUID } from "typeorm/driver/mongodb/bson.typings"
import { PostEntity } from "./post.entity"
import { UserEntity } from "../../users/user.entity"

@Entity('PostLikesAndDislikes')
export class PostLikesAndDislikesEntity {
  @PrimaryGeneratedColumn('uuid')
  id: UUID
  @ManyToOne(() => UserEntity)
  user: UserEntity
  @Column('uuid')
  userId: UUID
  @Column()
  login: string
  @Column()
  addedAt: string
  @Column()
  likeStatus: string
  @ManyToOne(() => PostEntity)
  post: PostEntity
  @Column('uuid')
  postId: UUID
}