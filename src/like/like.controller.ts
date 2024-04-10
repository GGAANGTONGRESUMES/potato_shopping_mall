import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { LikeService } from './like.service';
import { CreateLikeDto } from './dto/create-like.dto';
// import { UpdateLikeDto } from './dto/update-like.dto';

@Controller('like')
export class LikeController {
  constructor(private readonly likeService: LikeService) {}

  @Post('create')
  async create(@Body() createLikeDto: CreateLikeDto) {
    const new_like = await this.likeService.create(createLikeDto);
    return {
      message: '생성 되었습니다',
      data: new_like,
    };
  }

  @Get(':usersId')
  findAll(@Param('usersId') usersId:number) {
    return this.likeService.findAll(usersId);
  }

  // @Get(':id')
  // findOne(@Param('id') id: string) {
  //   return this.likeService.findOne(+id);
  // }

  // @Patch(':id')
  // update(@Param('id') id: string, @Body() updateLikeDto: UpdateLikeDto) {
  //   return this.likeService.update(+id, updateLikeDto);
  // }

  // @Delete(':id')
  // remove(@Param('id') id: string) {
  //   return this.likeService.remove(+id);
  // }
}
