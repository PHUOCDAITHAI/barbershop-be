import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SchedulesService } from './schedules.service';
import {
  BulkUpsertScheduleDto,
  CreateTimeOffDto,
  GetAvailableSlotsDto,
  UpsertScheduleDto,
} from './dto/schedule.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Role } from '@prisma/client';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

@ApiTags('Schedules')
@Controller('schedules')
export class SchedulesController {
  constructor(private schedulesService: SchedulesService) {}

  @Get('barbers/:barberId/available-slots')
  @ApiOperation({ summary: 'Lấy slot khả dụng của barber trong ngày (public)' })
  getAvailableSlots(
    @Param('barberId') barberId: string,
    @Query() query: GetAvailableSlotsDto,
  ) {
    return this.schedulesService.getAvailableSlots(barberId, query);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.BARBER)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '[Barber] Xem lịch làm việc của mình' })
  getMySchedules(@CurrentUser('id') userId: string) {
    return this.schedulesService.getMySchedules(userId);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.BARBER)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '[Barber] Cập nhật 1 ngày trong lịch' })
  upsertSchedule(
    @CurrentUser('id') userId: string,
    @Body() dto: UpsertScheduleDto,
  ) {
    console.log('dto -> ', dto);
    return this.schedulesService.upsertSchedule(userId, dto);
  }

  @Patch('me/bulk')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.BARBER)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '[Barber] Cập nhật toàn bộ lịch làm việc' })
  bulkUpsertSchedules(
    @CurrentUser('id') userId: string,
    @Body() dto: UpsertScheduleDto[],
  ) {
    return this.schedulesService.bulkUpsertSchedules(userId, {
      schedules: dto,
    });
  }

  @Get('me/time-offs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.BARBER)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '[Barber] Xem danh sách ngày nghỉ' })
  getMyTimeOffs(@CurrentUser('id') userId: string) {
    return this.schedulesService.getMyTimeOffs(userId);
  }

  @Post('me/time-offs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.BARBER)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '[Barber] Đăng ký ngày nghỉ' })
  createTimeOff(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateTimeOffDto,
  ) {
    return this.schedulesService.createTimeOff(userId, dto);
  }

  @Delete('me/time-offs/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.BARBER)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '[Barber] Huỷ ngày nghỉ' })
  deleteTimeOff(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.schedulesService.deleteTimeOff(userId, id);
  }
}
