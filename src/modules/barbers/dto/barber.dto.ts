// src/barbers/dto/barber.dto.ts
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsArray,
  IsInt,
  IsBoolean,
  Min,
  Max,
} from 'class-validator';

export class UpdateBarberProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() bio?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  specialties?: string[];

  @ApiPropertyOptional() 
  @IsOptional() 
  @IsInt() 
  @Min(0) 
  experience?: number;

  @ApiPropertyOptional() 
  @IsOptional() 
  @IsString() 
  avatarUrl?: string;

  @ApiPropertyOptional() 
  @IsOptional() 
  @IsBoolean() 
  isAvailable?: boolean;
}

export class QueryBarbersDto {
  @ApiPropertyOptional() 
  @IsOptional() 
  @IsString() search?: string;

  @ApiPropertyOptional() 
  @IsOptional() 
  @IsBoolean() isAvailable?: boolean;
}

export class CreateReviewDto {
  @ApiProperty({ example: 5 }) 
  @IsInt() 
  @Min(1) 
  @Max(5) 
  rating: number;

  @ApiPropertyOptional() 
  @IsOptional() 
  @IsString() comment?: string;
}
