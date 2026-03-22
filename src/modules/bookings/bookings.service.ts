import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdminQueryBookingsDto,
  CreateBookingDto,
  QueryBookingsDto,
  UpdateBookingStatusDto,
} from './dto/booking.dto';
import { BookingStatus, Role } from '@prisma/client';

@Injectable()
export class BookingsService {
  constructor(private prisma: PrismaService) {}

  async create(customerId: string, dto: CreateBookingDto) {
    // 1. Validate barber tồn tại và đang nhận lịch
    const barber = await this.prisma.barber.findUnique({
      where: { id: dto.barberId },
      include: { user: true },
    });
    if (!barber) throw new NotFoundException('Không tìm thấy thợ cắt tóc');
    if (!barber.isAvailable)
      throw new BadRequestException('Thợ hiện không nhận lịch');

    // 2. Validate các service tồn tại và đang active
    const services = await this.prisma.service.findMany({
      where: { id: { in: dto.serviceIds }, isActive: true },
    });
    if (services.length !== dto.serviceIds.length) {
      throw new BadRequestException('Một hoặc nhiều dịch vụ không hợp lệ');
    }

    // 3. Tính tổng thời gian và giá
    const totalDuration = services.reduce((sum, s) => sum + s.duration, 0);
    const totalPrice = services.reduce((sum, s) => sum + s.price, 0);

    // 4. Tính endTime
    const endTime = this.addMinutesToTime(dto.startTime, totalDuration);

    // 5. Validate ngày đặt không phải quá khứ
    const bookingDate = new Date(dto.bookingDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (bookingDate < today) {
      throw new BadRequestException('Không thể đặt lịch trong quá khứ');
    }

    // 6. Kiểm tra lịch làm việc của barber ngày đó
    const DAY_MAP: Record<number, string> = {
      0: 'SUNDAY',
      1: 'MONDAY',
      2: 'TUESDAY',
      3: 'WEDNESDAY',
      4: 'THURSDAY',
      5: 'FRIDAY',
      6: 'SATURDAY',
    };
    const dayOfWeek = DAY_MAP[bookingDate.getDay()] as any;

    const schedule = await this.prisma.barberSchedule.findUnique({
      where: { barberId_dayOfWeek: { barberId: dto.barberId, dayOfWeek } },
    });
    if (!schedule || !schedule.isWorking) {
      throw new BadRequestException('Thợ không làm việc ngày này');
    }

    // 7. Kiểm tra giờ đặt nằm trong khung giờ làm việc
    if (
      !this.isWithinWorkHours(
        dto.startTime,
        endTime,
        schedule.startTime,
        schedule.endTime,
      )
    ) {
      throw new BadRequestException(
        `Giờ đặt phải trong khung ${schedule.startTime} - ${schedule.endTime}`,
      );
    }

    // 8. Kiểm tra ngày nghỉ
    const timeOff = await this.prisma.barberTimeOff.findFirst({
      where: { barberId: dto.barberId, date: bookingDate, allDay: true },
    });
    if (timeOff) throw new BadRequestException('Thợ nghỉ ngày này');

    // 9. Kiểm tra slot có bị trùng không (race condition safe với transaction)
    const conflict = await this.prisma.booking.findFirst({
      where: {
        barberId: dto.barberId,
        bookingDate,
        status: {
          in: [
            BookingStatus.PENDING,
            BookingStatus.CONFIRMED,
            BookingStatus.IN_PROGRESS,
          ],
        },
        AND: [
          { startTime: { lt: endTime } },
          { endTime: { gt: dto.startTime } },
        ],
      },
    });
    if (conflict)
      throw new ConflictException(
        'Khung giờ này đã được đặt, vui lòng chọn giờ khác',
      );

    // 10. Tạo booking trong transaction
    const booking = await this.prisma.$transaction(async (tx) => {
      // Double-check conflict inside transaction
      const conflictCheck = await tx.booking.findFirst({
        where: {
          barberId: dto.barberId,
          bookingDate,
          status: {
            in: [
              BookingStatus.PENDING,
              BookingStatus.CONFIRMED,
              BookingStatus.IN_PROGRESS,
            ],
          },
          AND: [
            { startTime: { lt: endTime } },
            { endTime: { gt: dto.startTime } },
          ],
        },
      });
      if (conflictCheck)
        throw new ConflictException('Khung giờ này đã được đặt');

      return tx.booking.create({
        data: {
          customerId,
          barberId: dto.barberId,
          bookingDate,
          startTime: dto.startTime,
          endTime,
          totalPrice,
          totalDuration,
          notes: dto.notes,
          status: BookingStatus.PENDING,
          services: {
            create: services.map((s) => ({
              serviceId: s.id,
              price: s.price,
              duration: s.duration,
            })),
          },
        },
        include: {
          barber: {
            include: { user: { select: { name: true, phone: true } } },
          },
          services: {
            include: { service: { select: { name: true, price: true } } },
          },
          customer: { select: { name: true, email: true, phone: true } },
        },
      });
    });

    return booking;
  }

  async findMyBookings(customerId: string, query: QueryBookingsDto) {
    const { status, dateFrom, dateTo, page = 1, limit = 10 } = query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = { customerId };
    if (status) where.status = status;
    if (dateFrom || dateTo) {
      where.bookingDate = {};
      if (dateFrom) where.bookingDate.gte = new Date(dateFrom);
      if (dateTo) where.bookingDate.lte = new Date(dateTo);
    }

    const [bookings, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { bookingDate: 'desc' },
        include: {
          barber: {
            include: {
              user: { select: { name: true, avatarUrl: true, phone: true } },
            },
          },
          services: { include: { service: { select: { name: true } } } },
          review: true,
        },
      }),
      this.prisma.booking.count({ where }),
    ]);

    return {
      data: bookings,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    };
  }

  async cancelByCustomer(
    customerId: string,
    bookingId: string,
    reason?: string,
  ) {
    const booking: any = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) throw new NotFoundException('Không tìm thấy booking');
    if (booking.customerId !== customerId)
      throw new ForbiddenException('Không có quyền huỷ booking này');

    if (
      ![BookingStatus.PENDING, BookingStatus.CONFIRMED].includes(booking.status)
    ) {
      throw new BadRequestException(
        'Chỉ có thể huỷ booking đang chờ xác nhận hoặc đã xác nhận',
      );
    }

    // Kiểm tra huỷ ít nhất 2 tiếng trước giờ hẹn
    const bookingDateTime = new Date(booking.bookingDate);
    const [h, m] = booking.startTime.split(':').map(Number);
    bookingDateTime.setHours(h, m, 0, 0);
    const twoHoursBefore = new Date(
      bookingDateTime.getTime() - 2 * 60 * 60 * 1000,
    );

    if (new Date() > twoHoursBefore) {
      throw new BadRequestException(
        'Chỉ có thể huỷ trước giờ hẹn ít nhất 2 tiếng',
      );
    }

    return this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.CANCELLED,
        cancelReason: reason || 'Khách huỷ',
      },
    });
  }

  async updateStatusByBarber(
    userId: string,
    bookingId: string,
    dto: UpdateBookingStatusDto,
  ) {
    const barber = await this.prisma.barber.findUnique({ where: { userId } });
    if (!barber) throw new NotFoundException('Không tìm thấy profile barber');

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) throw new NotFoundException('Không tìm thấy booking');
    if (booking.barberId !== barber.id)
      throw new ForbiddenException('Không có quyền cập nhật booking này');

    // Validate state machine
    this.validateStatusTransition(booking.status, dto.status, 'barber');

    return this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: dto.status,
        cancelReason: dto.cancelReason,
      },
      include: {
        customer: { select: { name: true, email: true, phone: true } },
        services: { include: { service: { select: { name: true } } } },
      },
    });
  }

  private addMinutesToTime(time: string, minutes: number): string {
    const [h, m] = time.split(':').map(Number);
    const total = h * 60 + m + minutes;
    const newH = Math.floor(total / 60)
      .toString()
      .padStart(2, '0');
    const newM = (total % 60).toString().padStart(2, '0');
    return `${newH}:${newM}`;
  }

  private isWithinWorkHours(
    slotStart: string,
    slotEnd: string,
    workStart: string,
    workEnd: string,
  ): boolean {
    const toMin = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };
    return (
      toMin(slotStart) >= toMin(workStart) && toMin(slotEnd) <= toMin(workEnd)
    );
  }

  private validateStatusTransition(
    current: BookingStatus,
    next: BookingStatus,
    actor: string,
  ) {
    const allowedTransitions: Record<BookingStatus, BookingStatus[]> = {
      PENDING: [BookingStatus.CONFIRMED, BookingStatus.CANCELLED],
      CONFIRMED: [
        BookingStatus.IN_PROGRESS,
        BookingStatus.CANCELLED,
        BookingStatus.NO_SHOW,
      ],
      IN_PROGRESS: [BookingStatus.COMPLETED],
      COMPLETED: [],
      CANCELLED: [],
      NO_SHOW: [],
    };
    console.log(allowedTransitions[current]);
    console.log(next);
    if (!allowedTransitions[current].includes(next)) {
      throw new BadRequestException(
        `Không thể chuyển từ trạng thái "${current}" sang "${next}"`,
      );
    }
  }

  async findAllAdmin(query: AdminQueryBookingsDto) {
    const {
      status,
      dateFrom,
      dateTo,
      barberId,
      customerId,
      search,
      page = 1,
      limit = 10,
    } = query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = {};
    if (status) where.status = status;
    if (barberId) where.barberId = barberId;
    if (customerId) where.customerId = customerId;
    if (dateFrom || dateTo) {
      where.bookingDate = {};
      if (dateFrom) where.bookingDate.gte = new Date(dateFrom);
      if (dateTo) where.bookingDate.lte = new Date(dateTo);
    }
    if (search) {
      where.OR = [
        { customer: { name: { contains: search, mode: 'insensitive' } } },
        { customer: { phone: { contains: search } } },
      ];
    }

    const [bookings, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          customer: {
            select: { id: true, name: true, phone: true, email: true },
          },
          barber: { include: { user: { select: { name: true } } } },
          services: { include: { service: { select: { name: true } } } },
        },
      }),
      this.prisma.booking.count({ where }),
    ]);

    return {
      data: bookings,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    };
  }

  async getDashboardStats() {
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    const [
      totalBookingsToday,
      totalBookingsMonth,
      totalBookingsLastMonth,
      revenueMonth,
      revenueLastMonth,
      bookingsByStatus,
      topBarbers,
      topServices,
      recentBookings,
    ] = await Promise.all([
      this.prisma.booking.count({
        where: { bookingDate: { gte: startOfToday } },
      }),
      this.prisma.booking.count({
        where: { createdAt: { gte: startOfMonth } },
      }),
      this.prisma.booking.count({
        where: { createdAt: { gte: startOfLastMonth, lte: endOfLastMonth } },
      }),
      this.prisma.booking.aggregate({
        where: { status: 'COMPLETED', bookingDate: { gte: startOfMonth } },
        _sum: { totalPrice: true },
      }),
      this.prisma.booking.aggregate({
        where: {
          status: 'COMPLETED',
          bookingDate: { gte: startOfLastMonth, lte: endOfLastMonth },
        },
        _sum: { totalPrice: true },
      }),
      this.prisma.booking.groupBy({
        by: ['status'],
        _count: true,
      }),
      this.prisma.barber.findMany({
        take: 5,
        orderBy: { rating: 'desc' },
        include: { user: { select: { name: true } } },
        where: { isAvailable: true },
      }),
      this.prisma.bookingService.groupBy({
        by: ['serviceId'],
        _count: { serviceId: true },
        orderBy: { _count: { serviceId: 'desc' } },
        take: 5,
      }),
      this.prisma.booking.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { name: true } },
          barber: { include: { user: { select: { name: true } } } },
        },
      }),
    ]);

    // Lấy tên services từ topServices
    const serviceIds = topServices.map((s) => s.serviceId);
    const serviceDetails = await this.prisma.service.findMany({
      where: { id: { in: serviceIds } },
      select: { id: true, name: true },
    });

    const revenueMonthValue = revenueMonth._sum.totalPrice || 0;
    const revenueLastMonthValue = revenueLastMonth._sum.totalPrice || 0;
    const revenueGrowth = revenueLastMonthValue
      ? ((revenueMonthValue - revenueLastMonthValue) / revenueLastMonthValue) *
        100
      : 0;

    return {
      overview: {
        bookingsToday: totalBookingsToday,
        bookingsThisMonth: totalBookingsMonth,
        bookingsLastMonth: totalBookingsLastMonth,
        revenueThisMonth: revenueMonthValue,
        revenueLastMonth: revenueLastMonthValue,
        revenueGrowth: Math.round(revenueGrowth * 10) / 10,
      },
      bookingsByStatus: bookingsByStatus.reduce(
        (acc, item) => {
          acc[item.status] = item._count;
          return acc;
        },
        {} as Record<string, number>,
      ),
      topBarbers,
      topServices: topServices.map((s) => ({
        serviceId: s.serviceId,
        name: serviceDetails.find((d) => d.id === s.serviceId)?.name,
        count: s._count.serviceId,
      })),
      recentBookings,
    };
  }

  async updateStatusByAdmin(bookingId: string, dto: UpdateBookingStatusDto) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) throw new NotFoundException('Không tìm thấy booking');

    return this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: dto.status, cancelReason: dto.cancelReason },
    });
  }

  async findOne(id: string, requesterId: string, role: Role) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            avatarUrl: true,
          },
        },
        barber: {
          include: {
            user: {
              select: { id: true, name: true, phone: true, avatarUrl: true },
            },
          },
        },
        services: { include: { service: true } },
        review: true,
      },
    });
    if (!booking) throw new NotFoundException('Không tìm thấy booking');

    // Chỉ customer/barber liên quan hoặc admin mới được xem
    if (role === Role.ADMIN) return booking;
    if (role === Role.CUSTOMER && booking.customerId === requesterId)
      return booking;
    if (role === Role.BARBER) {
      const barber = await this.prisma.barber.findUnique({
        where: { userId: requesterId },
      });
      if (barber && booking.barberId === barber.id) return booking;
    }

    throw new ForbiddenException('Không có quyền xem booking này');
  }
}
