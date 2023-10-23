import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { QuizGameEntity } from "./entities/quiz-game.entity";
import { GameStatuses } from "../../helpers/gameStatuses";
import { GamePairViewModel } from "./models/view/GamePair";
import { UserQueryRepository } from "../../users/user.query-repository";
import { QuizAnswersEntity } from "./entities/quiz-answers.entity";
import { AnswerViewModel } from "./models/view/Answer";
import { AllGameAnswersViewModel } from "./models/view/AllGameAnswers";
import { AllGameScoreViewModel } from "./models/view/GameScore";
import { AnswerStatuses } from "../../helpers/answerStatuses";
import { StatisticViewModel } from "./models/view/Statistic";

@Injectable()
export class QuizGamesQueryRepository {
  constructor(@InjectRepository(QuizGameEntity) private readonly quizGamesRepository: Repository<QuizGameEntity>,
  private readonly userQueryRepository: UserQueryRepository, 
  @InjectRepository(QuizAnswersEntity) private readonly quizAnswersRepository: Repository<QuizAnswersEntity>){}
  
  async findPendingSecondPlayerGame(): Promise<QuizGameEntity | null> {
    return await this.quizGamesRepository.findOneBy({status: GameStatuses.PendingSecondPlayer})
  }

  async findActiveGameForUser(userId: string): Promise<QuizGameEntity | null> {
    const game = await this.quizGamesRepository.createQueryBuilder('game')
      .where('(game.player1Id = :userId OR game.player2Id = :userId)', { userId })
      .andWhere('game.status IN (:...statuses)', { statuses: [GameStatuses.Active, GameStatuses.PendingSecondPlayer] })
      .getOne()
    return game || null
}

async getMyStatistic(userId: string): Promise<StatisticViewModel> {
  const games = await this.quizGamesRepository.createQueryBuilder('game')
      .where('(game.player1Id = :userId OR game.player2Id = :userId)', { userId })
      .getMany()

  const modifiedArray = await Promise.all(games.map(async element => {
    return await this.mapGame(element)
  }))

  const statistic = this.calculateStatistics(modifiedArray, userId)

  return statistic
}

  async getMyCurrentGame(userId: string): Promise<GamePairViewModel> {
    const game = await this.findActiveGameForUser(userId)
    if(!game){
      throw new NotFoundException('No active game for user.')
    }
    const result = await this.mapGame(game)

    return result
  }

  async getGameById(id: string, userId: string): Promise<GamePairViewModel> {
    const game = await this.quizGamesRepository.findOneBy({id: id})
    if(!game){
      throw new NotFoundException('Game is not found.')
    }
    if(game.player1Id !== userId && game.player2Id !== userId){
      throw new ForbiddenException('No access to this game.')
    }
    
    const result: GamePairViewModel = await this.mapGame(game)

    return result
  }

  private calculateStatistics(modifiedArray: GamePairViewModel[], userId: string): StatisticViewModel {
    let sumScore = 0;
    let winsCount = 0;
    let lossesCount = 0;
    let drawsCount = 0;

    for (const modifiedGame of modifiedArray) {
        const isFirstPlayer = modifiedGame.firstPlayerProgress.player.id === userId
        const isSecondPlayer = modifiedGame.secondPlayerProgress.player.id === userId

        if (isFirstPlayer || isSecondPlayer) {
            const playerScore = isFirstPlayer ? modifiedGame.firstPlayerProgress.score : modifiedGame.secondPlayerProgress.score
            sumScore += playerScore

            if (isFirstPlayer && playerScore > modifiedGame.secondPlayerProgress.score) {
                winsCount++
            } else if (isSecondPlayer && playerScore > modifiedGame.firstPlayerProgress.score) {
                winsCount++
            } else if (isFirstPlayer && playerScore < modifiedGame.secondPlayerProgress.score) {
                lossesCount++
            } else if (isSecondPlayer && playerScore < modifiedGame.firstPlayerProgress.score) {
              lossesCount++
            } else if (modifiedGame.firstPlayerProgress.score === modifiedGame.secondPlayerProgress.score) {
                drawsCount++
            }
        }
    }

    const gamesCount = winsCount + lossesCount + drawsCount
    const avgScores = gamesCount > 0 ? sumScore / gamesCount : 0
    const roundedAvgScore = parseFloat(avgScores.toFixed(2));

    const statistic: StatisticViewModel = {
        sumScore,
        avgScores: roundedAvgScore,
        gamesCount,
        winsCount,
        lossesCount,
        drawsCount
    }

    return statistic
}

  private async mapGame(game: QuizGameEntity) {
    const player1 = await this.userQueryRepository.getUsergByIdNoView(game.player1Id)
    const player2Login = game.player2Id !== null ? (await this.userQueryRepository.getUsergByIdNoView(game.player2Id)).login : game.player2Id

    const allGameAnswers = await this.getAnswersForGame(game, player1.id, game.player2Id)
    const score = this.countScoreForGame(allGameAnswers)

    const result: GamePairViewModel = {
      id: game.id, 
      firstPlayerProgress: {answers: allGameAnswers.firstPlayerAnswers, player: {id: game.player1Id, login: player1.login }, score: score.firstPlayerScore},
      secondPlayerProgress: {answers: allGameAnswers.secondPlayerAnswers, player: {id: game.player2Id, login: player2Login}, score: score.secondPlayerScore},
      questions: game.questions,
      status: game.status,
      pairCreatedDate: game.pairCreatedDate,
      startGameDate: game.startGameDate,
      finishGameDate: game.finishGameDate
    }

    if(game.status === GameStatuses.PendingSecondPlayer){
      result.questions = null
      result.secondPlayerProgress = null
    }

    return result
  }

  async getGameByIdNoView(id: string): Promise<QuizGameEntity | null> {
    const game = await this.quizGamesRepository.findOneBy({id: id})

    return game
  }

  private countScoreForGame(answers: AllGameAnswersViewModel): AllGameScoreViewModel{
    let firstPlayerCorrectAnswersCount = this.countCorrectAnswers(answers.firstPlayerAnswers)
    let secondPlayerCorrectAnswersCount = this.countCorrectAnswers(answers.secondPlayerAnswers)

    if(answers.firstPlayerAnswers.length === 5 && answers.secondPlayerAnswers.length === 5){
      const firstPlayerFinishedFirst = answers.firstPlayerAnswers[answers.firstPlayerAnswers.length - 1].addedAt < answers.secondPlayerAnswers[answers.secondPlayerAnswers.length - 1].addedAt;

      if (firstPlayerFinishedFirst && firstPlayerCorrectAnswersCount > 1) {
        firstPlayerCorrectAnswersCount++
      }
      else if(secondPlayerCorrectAnswersCount > 0){
        secondPlayerCorrectAnswersCount++
      }
    }

    return {firstPlayerScore: firstPlayerCorrectAnswersCount, secondPlayerScore: secondPlayerCorrectAnswersCount}
  }

  private countCorrectAnswers = (answers: AnswerViewModel[]) => {
    return answers.reduce((count, answer) => {
        if (answer.answerStatus === AnswerStatuses.Correct) {
            count++
        }
        return count
    }, 0)
  }

  private async getAnswersForGame(game: QuizGameEntity, player1Id: string, player2Id: string): Promise<AllGameAnswersViewModel> {
    const firstPlayerAnswers = await this.quizAnswersRepository.findBy({gameId: game.id, userId: player1Id})
    const secondPlayerAnswers = await this.quizAnswersRepository.findBy({gameId: game.id, userId: player2Id})

    const firstPlayerMappedAnswers = this.mapAnswers(firstPlayerAnswers)
    const secondPlayerMappedAnswers = this.mapAnswers(secondPlayerAnswers)

    return {firstPlayerAnswers: firstPlayerMappedAnswers, secondPlayerAnswers: secondPlayerMappedAnswers}
  }

  private mapAnswers(answers: QuizAnswersEntity[]): AnswerViewModel[] {
    const mappedAnswers = answers.map(answer => {
      return {
          questionId: answer.questionId,
          answerStatus: answer.answerStatus,
          addedAt: answer.addedAt
      }
    })

    mappedAnswers.sort((a, b) => {
      if (a.addedAt < b.addedAt) return -1;
      if (a.addedAt > b.addedAt) return 1;
      return 0;
    })

    return mappedAnswers
  }
}