import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BarbersService } from './barbers.service';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateReviewDto, QueryBarbersDto, UpdateBarberProfileDto } from './dto/barber.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

@ApiTags('Barbers')
@Controller('barbers')
export class BarbersController {
  constructor(private barbersService: BarbersService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách thợ cắt tóc (public)' })
  findAll(@Query() query: QueryBarbersDto) {
    return this.barbersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết thợ cắt tóc (public)' })
  findOne(@Param('id') id: string) {
    return this.barbersService.findOne(id);
  }

  @Get('me/profile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.BARBER)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '[Barber] Xem profile của mình' })
  getMyProfile(@CurrentUser('id') id: string) {
    return this.barbersService.findByUserId(id);
  }

  @Patch('me/profile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.BARBER)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '[Barber] Cập nhật profile' })
  updateMyProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateBarberProfileDto,
  ) {
    return this.barbersService.updateProfile(userId, dto);
  }

  @Get('me/bookings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.BARBER)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '[Barber] Danh sách booking của mình' })
  getMyBookings(
    @CurrentUser('id') userId: string,
    @Query('status') status?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    // lấy barberId từ userId
    return this.barbersService
      .findByUserId(userId)
      .then((barber) =>
        this.barbersService.getBarberBookings(barber.id, status, +page, +limit),
      );
  }

  @Get('me/stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.BARBER)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '[Barber] Thống kê của mình' })
  getMyStats(@CurrentUser('id') userId: string) {
    return this.barbersService
      .findByUserId(userId)
      .then((barber) => this.barbersService.getBarberStats(barber.id));
  }

  @Post('reviews/:bookingId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '[Customer] Đánh giá sau khi hoàn thành' })
  createReview(
    @CurrentUser('id') userId: string,
    @Param('bookingId') bookingId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.barbersService.createReview(userId, bookingId, dto);
  }

  // Admin
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '[Admin] Cập nhật thông tin thợ' })
  updateByAdmin(@Param('id') id: string, @Body() dto: UpdateBarberProfileDto) {
    return this.barbersService.updateProfileByAdmin(id, dto);
  }

  @Get(':id/stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '[Admin] Thống kê barber' })
  getStats(@Param('id') id: string) {
    return this.barbersService.getBarberStats(id);
  }
}
