import { IsNotEmpty, IsNumber, IsString } from 'class-validator';
import { Users } from '../../user/entities/user.entitiy';

import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({
  name: 'point',
})
export class Point {
  @IsNumber()
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @IsString()
  @Column({ type: 'varchar', nullable: true })
  description: string;

  @IsNotEmpty()
  @IsNumber()
  @Column({ type: 'int', nullable: true })
  status_pirce: number;

  @IsNotEmpty()
  @IsNumber()
  @Column('int', { name: 'userId', unsigned: true })
  userId: number;

  @IsNotEmpty()
  @IsNumber()
  @Column({ type: 'int' })
  possession: number;

  @ManyToOne(() => Users, (user) => user.point)
  @JoinColumn([{ name: 'userId', referencedColumnName: 'id' }])
  user: Users;
}
