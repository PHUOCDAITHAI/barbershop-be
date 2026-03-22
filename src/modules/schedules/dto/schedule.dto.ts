// src/schedules/dto/schedule.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsString,
  IsBoolean,
  IsInt,
  IsOptional,
  Min,
  Max,
  IsDateString,
} from 'class-validator';
import { DayOfWeek } from '@prisma/client';

export class UpsertScheduleDto {
  @ApiProperty({ enum: DayOfWeek })
  @IsEnum(DayOfWeek)
  dayOfWeek: DayOfWeek;

  @ApiProperty({ example: '08:00' })
  @IsString()
  startTime: string;

  @ApiProperty({ example: '18:00' })
  @IsString()
  endTime: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isWorking?: boolean;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(120)
  slotDuration?: number;
}

export class BulkUpsertScheduleDto {
  @ApiProperty({ type: [UpsertScheduleDto] })
  schedules: UpsertScheduleDto[];
}

export class CreateTimeOffDto {
  @ApiProperty({ example: '2024-12-25' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @ApiPropertyOptional({ example: '12:00' })
  @IsOptional()
  @IsString()
  startTime?: string;

  @ApiPropertyOptional({ example: '14:00' })
  @IsOptional()
  @IsString()
  endTime?: string;
}

export class GetAvailableSlotsDto {
  @ApiProperty({ example: '2024-12-25' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({ description: 'Tổng thời gian dịch vụ (phút)' })
  @IsOptional()
  @IsInt()
  @Min(15)
  duration?: number;
}
