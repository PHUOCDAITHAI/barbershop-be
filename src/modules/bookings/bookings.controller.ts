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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BookingsService } from './bookings.service';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import {
  AdminQueryBookingsDto,
  CreateBookingDto,
  QueryBookingsDto,
  UpdateBookingStatusDto,
} from './dto/booking.dto';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Bookings')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('bookings')
export class BookingsController {
  constructor(private bookingsService: BookingsService) {}

  @Post()
  @ApiOperation({ summary: '[Customer] Tạo booking mới' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateBookingDto) {
    return this.bookingsService.create(userId, dto);
  }

  @Get('my')
  @ApiOperation({ summary: '[Customer] Danh sách booking của tôi' })
  findMyBookings(
    @CurrentUser('id') userId: string,
    @Query() query: QueryBookingsDto,
  ) {
    return this.bookingsService.findMyBookings(userId, query);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: '[Customer] Huỷ booking' })
  cancelBooking(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    return this.bookingsService.cancelByCustomer(userId, id, reason);
  }

  @Patch(':id/status/barber')
  @UseGuards(RolesGuard)
  @Roles(Role.BARBER, Role.ADMIN)
  @ApiOperation({ summary: '[Barber] Cập nhật trạng thái booking' })
  updateStatusBarber(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateBookingStatusDto,
  ) {
    return this.bookingsService.updateStatusByBarber(userId, id, dto);
  }

  @Get('admin')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] Tất cả bookings' })
  findAllAdmin(@Query() query: AdminQueryBookingsDto) {
    return this.bookingsService.findAllAdmin(query);
  }

  @Get('admin/dashboard')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] Dashboard thống kê' })
  getDashboard() {
    return this.bookingsService.getDashboardStats();
  }

  @Patch(':id/status/admin')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] Cập nhật trạng thái bất kỳ' })
  updateStatusAdmin(
    @Param('id') id: string,
    @Body() dto: UpdateBookingStatusDto,
  ) {
    return this.bookingsService.updateStatusByAdmin(id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết booking (Customer/Barber/Admin)' })
  findOne(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: Role,
  ) {
    return this.bookingsService.findOne(id, userId, role);
  }
}
