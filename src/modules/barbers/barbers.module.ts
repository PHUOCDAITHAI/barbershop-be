import { Module } from '@nestjs/common';
import { BarbersService } from './barbers.service';
import { BarbersController } from './barbers.controller';

@Module({
  providers: [BarbersService],
  controllers: [BarbersController]
})
export class BarbersModule {}
