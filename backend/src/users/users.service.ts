import { Injectable, ConflictException, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from './user.entity';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    @InjectRepository(User, 'appConnection')
    private usersRepo: Repository<User>,
    private cfg: ConfigService,
  ) {}

  async onModuleInit() {
    await this.ensureAdminExists();
  }

  private async ensureAdminExists() {
    const email = this.cfg.get('ADMIN_EMAIL') ?? 'admin@pwc.com';
    const exists = await this.usersRepo.findOne({ where: { email } });
    if (!exists) {
      const password = this.cfg.get('ADMIN_PASSWORD') ?? 'Admin@2026!';
      await this.create({ email, password, name: 'Admin', role: UserRole.ADMIN });
      console.log(`✅ Admin user created: ${email}`);
    }
  }

  async create(dto: { email: string; password: string; name?: string; role?: UserRole }) {
    const existing = await this.usersRepo.findOne({ where: { email: dto.email } });
    if (existing) throw new ConflictException('User already exists');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = this.usersRepo.create({
      email: dto.email,
      passwordHash,
      name: dto.name,
      role: dto.role ?? UserRole.VIEWER,
    });
    return this.usersRepo.save(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { email } });
  }

  async findAll(): Promise<User[]> {
    return this.usersRepo.find({ select: ['id', 'email', 'name', 'role', 'isActive', 'createdAt'] });
  }

  async update(id: number, dto: { name?: string; role?: UserRole; isActive?: boolean }) {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    if (dto.name !== undefined) user.name = dto.name;
    if (dto.role !== undefined) user.role = dto.role;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;
    await this.usersRepo.save(user);
    return { id: user.id, email: user.email, name: user.name, role: user.role, isActive: user.isActive, createdAt: user.createdAt };
  }

  async remove(id: number) {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    await this.usersRepo.remove(user);
    return { success: true };
  }
}
