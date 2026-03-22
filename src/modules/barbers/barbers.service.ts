import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto, QueryBarbersDto, UpdateBarberProfileDto } from './dto/barber.dto';

@Injectable()
export class BarbersService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: QueryBarbersDto) {
    const where: any = {};
    if (query.search) {
      where.OR = [
        { user: { name: { contains: query.search, mode: 'insensitive' } } },
        { bio: { contains: query.search, mode: 'insensitive' } },
        { specialties: { has: query.search } },
      ];
    }
    if (query.isAvailable !== undefined) where.isAvailable = query.isAvailable;

    return this.prisma.barber.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            avatarUrl: true,
          },
        },
        schedules: { orderBy: { dayOfWeek: 'asc' } },
      },
      orderBy: { rating: 'desc' },
    });
  }

  async findOne(id: string) {
    const barber = await this.prisma.barber.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            avatarUrl: true,
          },
        },
        schedules: { orderBy: { dayOfWeek: 'asc' } },
        reviews: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            booking: {
              include: {
                customer: { select: { name: true, avatarUrl: true } },
              },
            },
          },
        },
      },
    });
    if (!barber) {
      throw new NotFoundException('Không tìm thấy thợ cắt tóc');
    }
    return barber;
  }

  async findByUserId(userId: string) {
    const barber = await this.prisma.barber.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            avatarUrl: true,
          },
        }
      },
    });
    if (!barber) {
      throw new NotFoundException('Không tìm thấy profile barber');
    }
    return barber;
  }

  async updateProfile(userId: string, dto: UpdateBarberProfileDto) {
    const barber = await this.prisma.barber.findUnique({ where: { userId } });
    if (!barber) throw new NotFoundException('Không tìm thấy profile barber');

    return this.prisma.barber.update({
      where: { userId },
      data: dto,
      include: {
        user: { select: { id: true, name: true, email: true } },
        schedules: true,
      },
    });
  }

  async getBarberBookings(
    barberId: string,
    status?: string,
    page = 1,
    limit = 10,
  ) {
    const skip = (page - 1) * limit;
    const where: any = { barberId };
    if (status) where.status = status;

    const [bookings, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        skip,
        take: limit,
        orderBy: { bookingDate: 'desc' },
        include: {
          customer: {
            select: { id: true, name: true, phone: true, avatarUrl: true },
          },
          services: { include: { service: { select: { name: true } } } },
        },
      }),
      this.prisma.booking.count({ where }),
    ]);

    return {
      data: bookings,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // Thống kê doanh thu của barber
  async getBarberStats(barberId: string) {
    const barber = await this.prisma.barber.findUnique({
      where: { id: barberId },
    });
    if (!barber) throw new NotFoundException('Không tìm thấy thợ cắt tóc');

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalBookings, monthBookings, completedBookings, revenue] =
      await Promise.all([
        this.prisma.booking.count({ where: { barberId } }),
        this.prisma.booking.count({
          where: { barberId, createdAt: { gte: startOfMonth } },
        }),
        this.prisma.booking.count({ where: { barberId, status: 'COMPLETED' } }),
        this.prisma.booking.aggregate({
          where: { barberId, status: 'COMPLETED' },
          _sum: { totalPrice: true },
        }),
      ]);

    return {
      totalBookings,
      monthBookings,
      completedBookings,
      totalRevenue: revenue._sum.totalPrice || 0,
      rating: barber.rating,
      totalReviews: barber.totalReviews,
    };
  }

  async updateProfileByAdmin(barberId: string, dto: UpdateBarberProfileDto) {
    const barber = await this.prisma.barber.findUnique({
      where: { id: barberId },
    });
    if (!barber) throw new NotFoundException('Không tìm thấy thợ cắt tóc');

    return this.prisma.barber.update({ where: { id: barberId }, data: dto });
  }

  async createReview(
    customerId: string,
    bookingId: string,
    dto: CreateReviewDto,
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { review: true },
    });

    if (!booking) throw new NotFoundException('Không tìm thấy booking');
    if (booking.customerId !== customerId)
      throw new ForbiddenException('Không có quyền review booking này');
    if (booking.status !== 'COMPLETED')
      throw new BadRequestException(
        'Chỉ có thể review khi dịch vụ đã hoàn thành',
      );
    if (booking.review)
      throw new BadRequestException('Booking này đã được review rồi');

    const review = await this.prisma.review.create({
      data: {
        bookingId,
        barberId: booking.barberId,
        rating: dto.rating,
        comment: dto.comment,
      },
    });

    // Cập nhật lại rating trung bình của barber
    const stats = await this.prisma.review.aggregate({
      where: { barberId: booking.barberId },
      _avg: { rating: true },
      _count: true,
    });

    await this.prisma.barber.update({
      where: { id: booking.barberId },
      data: {
        rating: Math.round((stats._avg.rating || 0) * 10) / 10,
        totalReviews: stats._count,
      },
    });

    return review;
  }
}
