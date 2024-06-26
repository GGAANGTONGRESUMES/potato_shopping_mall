import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payments } from './entities/payments.entity';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { Users } from '../user/entities/user.entitiy';
import { Point } from '../point/entities/point.entity';
import { Orders } from '../orders/entities/orders.entity';
import { OrdersDetails } from '../orders/entities/ordersdetails.entity';
import { Stocks } from '../goods/entities/stocks.entity';
import { RedisService } from 'src/redis/redis.service';
import { KakaoGeocoder } from '../common/utils/kakao-geocoder.util';
import { Storage } from '../storage/entities/storage.entity'
import { TossHistory } from './entities/tossHistory.entity';
@Module({
    imports: [TypeOrmModule.forFeature([Payments, Users, Point, Orders, OrdersDetails, Stocks, Storage, TossHistory])],
    providers: [PaymentsService,RedisService,KakaoGeocoder],
    controllers: [PaymentsController],
    exports: [PaymentsService,RedisService],
})
export class PaymentsModule { }