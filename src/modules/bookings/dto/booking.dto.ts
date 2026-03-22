// src/bookings/dto/booking.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString, IsArray, IsOptional, IsDateString,
  IsEnum, IsUUID, ArrayMinSize,
} from 'class-validator';
import { BookingStatus } from '@prisma/client';

export class CreateBookingDto {
  @ApiProperty({ description: 'ID của barber' })
  @IsUUID()
  barberId: string;

  @ApiProperty({ example: '2024-12-25', description: 'Ngày đặt lịch' })
  @IsDateString()
  bookingDate: string;

  @ApiProperty({ example: '10:00', description: 'Giờ bắt đầu' })
  @IsString()
  startTime: string;

  @ApiProperty({ type: [String], description: 'Danh sách ID dịch vụ' })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('all', { each: true })
  serviceIds: string[];

  @ApiPropertyOptional({ example: 'Làm ơn cắt kiểu fade' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateBookingStatusDto {
  @ApiProperty({ enum: BookingStatus })
  @IsEnum(BookingStatus)
  status: BookingStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cancelReason?: string;
}

export class QueryBookingsDto {
  @ApiPropertyOptional({ enum: BookingStatus })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @ApiPropertyOptional({ example: '2024-12-01' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2024-12-31' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  barberId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  limit?: number;
}

export class AdminQueryBookingsDto extends QueryBookingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}
