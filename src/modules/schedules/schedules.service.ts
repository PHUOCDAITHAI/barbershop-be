import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  BulkUpsertScheduleDto,
  CreateTimeOffDto,
  GetAvailableSlotsDto,
  UpsertScheduleDto,
} from './dto/schedule.dto';
import { DayOfWeek } from '@prisma/client';

const DAY_MAP: Record<number, DayOfWeek> = {
  0: DayOfWeek.SUNDAY,
  1: DayOfWeek.MONDAY,
  2: DayOfWeek.TUESDAY,
  3: DayOfWeek.WEDNESDAY,
  4: DayOfWeek.THURSDAY,
  5: DayOfWeek.FRIDAY,
  6: DayOfWeek.SATURDAY,
};

@Injectable()
export class SchedulesService {
  constructor(private prisma: PrismaService) {}

  async getAvailableSlots(barberId: string, query: GetAvailableSlotsDto) {
    const barber = await this.prisma.barber.findUnique({
      where: { id: barberId },
    });
    if (!barber) throw new NotFoundException('Không tìm thấy thợ cắt tóc');
    if (!barber.isAvailable)
      return { slots: [], message: 'Thợ đang không nhận lịch' };

    const date = new Date(query.date);
    const dayOfWeek = DAY_MAP[date.getDay()];

    // 1. Lấy lịch làm việc ngày đó
    const schedule = await this.prisma.barberSchedule.findUnique({
      where: { barberId_dayOfWeek: { barberId, dayOfWeek } },
    });

    if (!schedule || !schedule.isWorking) {
      return { slots: [], message: 'Thợ không làm việc ngày này' };
    }

    // 2. Kiểm tra ngày nghỉ
    const timeOff = await this.prisma.barberTimeOff.findFirst({
      where: { barberId, date: { equals: new Date(query.date) } },
    });

    if (timeOff?.allDay) {
      return { slots: [], message: 'Thợ nghỉ ngày này' };
    }

    // 3. Lấy các booking đã đặt trong ngày
    const existingBookings = await this.prisma.booking.findMany({
      where: {
        barberId,
        bookingDate: new Date(query.date),
        status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] },
      },
      select: { startTime: true, endTime: true },
    });

    // 4. Generate tất cả slots
    const slotDuration = query.duration || schedule.slotDuration;
    const allSlots = this.generateTimeSlots(
      schedule.startTime,
      schedule.endTime,
      slotDuration,
    );

    // 5. Filter bỏ slot đã bị book
    const availableSlots = allSlots.filter((slot) => {
      return !existingBookings.some((booking) =>
        this.isTimeOverlap(
          slot.start,
          slot.end,
          booking.startTime,
          booking.endTime,
        ),
      );
    });

    // 6. Filter bỏ slot đã qua (nếu là hôm nay)
    const today = new Date();
    const isToday =
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate();

    const finalSlots = isToday
      ? availableSlots.filter((slot) => {
          const [h, m] = slot.start.split(':').map(Number);
          const slotTime = new Date();
          slotTime.setHours(h, m, 0, 0);
          return slotTime > today;
        })
      : availableSlots;

    return {
      date: query.date,
      barberId,
      slotDuration,
      totalSlots: allSlots.length,
      availableSlots: finalSlots.length,
      slots: finalSlots,
    };
  }

  async upsertSchedule(userId: string, dto: UpsertScheduleDto) {
    const barber = await this.prisma.barber.findUnique({ where: { userId } });
    if (!barber) throw new NotFoundException('Không tìm thấy profile barber');

    return this.prisma.barberSchedule.upsert({
      where: {
        barberId_dayOfWeek: { barberId: barber.id, dayOfWeek: dto.dayOfWeek },
      },
      update: {
        startTime: dto.startTime,
        endTime: dto.endTime,
        isWorking: dto.isWorking ?? true,
        slotDuration: dto.slotDuration ?? 30,
      },
      create: {
        barberId: barber.id,
        dayOfWeek: dto.dayOfWeek,
        startTime: dto.startTime,
        endTime: dto.endTime,
        isWorking: dto.isWorking ?? true,
        slotDuration: dto.slotDuration ?? 30,
      },
    });
  }

  async bulkUpsertSchedules(userId: string, dto: BulkUpsertScheduleDto) {
    return Promise.all(
      dto.schedules.map((s) => this.upsertSchedule(userId, s)),
    );
  }

  async getMyTimeOffs(userId: string) {
    const barber = await this.prisma.barber.findUnique({ where: { userId } });
    if (!barber) throw new NotFoundException('Không tìm thấy profile barber');

    return this.prisma.barberTimeOff.findMany({
      where: { barberId: barber.id, date: { gte: new Date() } },
      orderBy: { date: 'asc' },
    });
  }

  async createTimeOff(userId: string, dto: CreateTimeOffDto) {
    const barber = await this.prisma.barber.findUnique({ where: { userId } });
    if (!barber) throw new NotFoundException('Không tìm thấy profile barber');

    const date = new Date(dto.date);

    // Kiểm tra xem ngày đó có booking nào chưa confirm hay không
    const existingBookings = await this.prisma.booking.count({
      where: {
        barberId: barber.id,
        bookingDate: date,
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
    });

    if (existingBookings > 0) {
      throw new BadRequestException(
        `Ngày ${dto.date} đã có ${existingBookings} booking chưa xử lý. Vui lòng huỷ hoặc chuyển lịch trước.`,
      );
    }

    return this.prisma.barberTimeOff.create({
      data: {
        barberId: barber.id,
        date,
        reason: dto.reason,
        allDay: dto.allDay ?? true,
        startTime: dto.startTime,
        endTime: dto.endTime,
      },
    });
  }

  async deleteTimeOff(userId: string, timeOffId: string) {
    const barber = await this.prisma.barber.findUnique({ where: { userId } });
    if (!barber) throw new NotFoundException('Không tìm thấy profile barber');

    const timeOff = await this.prisma.barberTimeOff.findFirst({
      where: { id: timeOffId, barberId: barber.id },
    });
    if (!timeOff) throw new NotFoundException('Không tìm thấy ngày nghỉ');

    return this.prisma.barberTimeOff.delete({ where: { id: timeOffId } });
  }

  async getMySchedules(userId: string) {
    const barber = await this.prisma.barber.findUnique({
      where: { userId },
      include: { schedules: { orderBy: { dayOfWeek: 'asc' } } },
    });
    if (!barber) throw new NotFoundException('Không tìm thấy profile barber');
    return barber.schedules;
  }

  private generateTimeSlots(
    startTime: string,
    endTime: string,
    duration: number,
  ) {
    const slots: { start: string; end: string }[] = [];
    let [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const endMinutes = eh * 60 + em;

    while (true) {
      const startMinutes = sh * 60 + sm;
      const endSlotMinutes = startMinutes + duration;
      if (endSlotMinutes > endMinutes) break;

      slots.push({
        start: this.minutesToTime(startMinutes),
        end: this.minutesToTime(endSlotMinutes),
      });

      sm += duration;
      if (sm >= 60) {
        sh += Math.floor(sm / 60);
        sm = sm % 60;
      }
    }

    return slots;
  }

  private minutesToTime(minutes: number): string {
    const h = Math.floor(minutes / 60)
      .toString()
      .padStart(2, '0');
    const m = (minutes % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  private isTimeOverlap(
    s1: string,
    e1: string,
    s2: string,
    e2: string,
  ): boolean {
    const toMin = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };
    return toMin(s1) < toMin(e2) && toMin(e1) > toMin(s2);
  }
}
