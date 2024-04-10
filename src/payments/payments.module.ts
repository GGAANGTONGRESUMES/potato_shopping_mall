import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payments } from './entities/payments.entity';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { Users } from '../user/entities/user.entitiy';
import { Point } from '../point/entities/point.entity';
@Module({
    imports: [TypeOrmModule.forFeature([Payments, Users, Point])],
    providers: [PaymentsService],
    controllers: [PaymentsController],
    exports: [PaymentsService],
})
export class PaymentsModule { }