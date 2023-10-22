import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../guards/jwt-auth.guard";
import { QuizGamesService } from "./quiz-games.service";
import { AccessTokenVrifyModel } from "../../models/Auth";
import { QuizGamesQueryRepository } from "./quiz-games.query-repository";
import { HttpStatusCode } from "../../helpers/httpStatusCode";
import { QuizGameIdValidationPipe } from "../../validation/pipes/game-id-validation.pipe";
import { AnswerInputModel } from "./models/input/Answer";

@UseGuards(JwtAuthGuard)
@Controller('pair-game-quiz/pairs')
export class QuizGamesController {
  constructor(private readonly quizGamesService: QuizGamesService, private readonly quizGamesQueryRepository: QuizGamesQueryRepository){}

  @HttpCode(HttpStatusCode.OK_200)
  @Post('connection')
  async createOrConnectToTheGame(@Req() req: AccessTokenVrifyModel) {
    return await this.quizGamesService.createOrConnectToTheGame(req.user.userId)
  }

  @HttpCode(HttpStatusCode.OK_200)
  @Post('my-current/answers')
  async answerCurrentGameQuestion(@Body() answer: AnswerInputModel, @Req() req: AccessTokenVrifyModel) {
    return this.quizGamesService.answerCurrentGameQuestion(answer.answer, req.user.userId)
  }

  @Get('my-current')
  async getMyCurrentGame(@Req() req: AccessTokenVrifyModel) {
    return await this.quizGamesQueryRepository.getMyCurrentGame(req.user.userId)
  }

  @Get(':gameId')
  async getGameById(@Param('gameId', QuizGameIdValidationPipe) gameId: string, @Req() req: AccessTokenVrifyModel) {
    return await this.quizGamesQueryRepository.getGameById(gameId, req.user.userId)
  }
}