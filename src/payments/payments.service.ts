import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Payments } from './entities/payments.entity';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Point } from '../point/entities/point.entity';
import { Users } from '../user/entities/user.entitiy';
import { Orders } from '../orders/entities/orders.entity';
import { CreatePaymentDto } from '../orders/dto/create-payment.dto';
import { validation } from '../common/pipe/validationPipe';
import { OrdersDetails } from '../orders/entities/ordersdetails.entity';
import { Stocks } from '../goods/entities/stocks.entity';
import logger from '../common/log/logger';
import { Goods } from '../goods/entities/goods.entity';
import { Status } from '../orders/types/order.type';
import _ from 'lodash';
import { RedisService } from '../redis/redis.service';
import { KakaoGeocoder } from '../common/utils/kakao-geocoder.util';
import { TossHistory } from './entities/tossHistory.entity';
import { faker } from '@faker-js/faker';
import axios from 'axios';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payments)
    private paymentsRepository: Repository<Payments>,
    @InjectRepository(Point)
    private pointRepository: Repository<Point>,
    @InjectRepository(Users)
    private usersRepository: Repository<Users>,
    @InjectRepository(Orders)
    private ordersRepository: Repository<Orders>,
    @InjectRepository(OrdersDetails)
    private ordersDetailsRepository: Repository<OrdersDetails>,
    @InjectRepository(Stocks)
    private stocksRepository: Repository<Stocks>,
    @InjectRepository(TossHistory)
    private tossRepository: Repository<TossHistory>,
    private redisService: RedisService,
    private readonly dataSource: DataSource,
    private kakaoGeocoder: KakaoGeocoder,
  ) {}

  // 전체적으로 추가적인 보안요소 필요
  async pay(
    userId: number,
    createPaymentDto: CreatePaymentDto, // 포스트맨의 body,
  ) {
    if (_.isNil(userId) || userId == 0) {
      const error = new BadRequestException('잘못된 요청입니다!');
      logger.errorLogger(
        error,
        `userId = ${userId}, createPaymentDto = ${createPaymentDto}`,
      );
      throw error;
    }

    await validation(CreatePaymentDto, createPaymentDto);
    const { orders_id } = createPaymentDto;

    const queryRunner = this.dataSource.createQueryRunner();

    try {
      const order = await queryRunner.manager
        .createQueryBuilder(Orders, 'order')
        .where('order.id = :orders_id AND order.user_id = :userId', {
          orders_id,
          userId,
        })
        .getOne();

      if (!order) {
        const error = new BadRequestException('존재하지 않는 주문입니다.');
        logger.errorLogger(
          error,
          `userId = ${userId}, createPaymentDto = ${createPaymentDto}, order = ${order}`,
        );
        throw error;
      }

      const user = await queryRunner.manager
        .createQueryBuilder(Users, 'user')
        .where('user.id = :userId', { userId })
        .getOne();

      if (!user) {
        const error = new BadRequestException('존재하지 않는 유저입니다.');
        logger.errorLogger(
          error,
          `userId = ${userId}, createPaymentDto = ${createPaymentDto}, order = ${user}`,
        );
        throw error;
      }

      const details = await queryRunner.manager
        .createQueryBuilder(OrdersDetails, 'details')
        .where('details.orders_id = :orders_id', { orders_id })
        .getMany();

      //redlock
      const client = this.redisService.getClient();
      const redlock = this.redisService.redlock(client);

      const lock = await redlock.acquire(
        [`transaction-point: user_id = ${userId} & order_id = ${order.id}`],
        6000,
      );
      try {
        //트랜잭션
        await queryRunner.connect();
        await queryRunner.startTransaction();
        try {
          const paymentAmount = order.o_total_price;

          const newPoints = user.points - paymentAmount;

          if (newPoints < 0) {
            const error = new BadRequestException('포인트가 부족합니다.');
            logger.errorLogger(
              error,
              `userId = ${userId}, createPaymentDto = ${createPaymentDto}`,
            );
            throw error;
          }

          const destination = await this.kakaoGeocoder.getCoordinates(
            order.o_addr,
          );

          const storage =
            await this.kakaoGeocoder.getClosestStorage(destination);

          for (const detail of details) {
            const goods = queryRunner.manager.createQueryBuilder(
              Goods,
              'goods',
            );
            const stocks = await queryRunner.manager
              .createQueryBuilder(Stocks, 'stocks')
              // , 'racks.*', 'storage.*'
              .select(['stocks.*', 'goods.*'])
              .leftJoinAndSelect('goods', 'goods', 'stocks.goods_id = goods.id')
              .leftJoinAndSelect('racks', 'racks', 'stocks.rack_id = racks.id')
              .leftJoinAndSelect(
                'storage',
                'storage',
                'racks.storage_id = storage.id',
              )
              .where('goods.id = :goodsId', { goodsId: detail.goods_id })
              .andWhere('storage.id = :storageId', { storageId: storage.id })
              .getRawOne();

            console.log('위대한 국밥', stocks);
            if (!goods || stocks.count < detail.od_count) {
              const error = new BadRequestException('재고가 없습니다.');
              logger.errorLogger(
                error,
                `userId = ${userId}, goodsId = ${detail.goods_id}`,
              );
              throw error;
            }

            const newStockCount = stocks.count - detail.od_count;
            await queryRunner.manager
              .createQueryBuilder()
              .update(Stocks)
              .set({ count: newStockCount })
              .where('id = :stockId', { stockId: stocks.id })
              .execute();
          }

          await queryRunner.manager
            .createQueryBuilder()
            .update(Users)
            .set({ points: newPoints })
            .where('id = :userId', { userId })
            .execute();

          const newPayments = queryRunner.manager.create(Payments, {
            orders_id,
            user_id: userId,
            p_total_price: paymentAmount,
          });

          const returnNewPayments = await queryRunner.manager.save(
            Payments,
            newPayments,
          );

          await queryRunner.manager.update(
            Orders,
            { user_id: userId, id: orders_id },
            { p_status: true },
          );

          await queryRunner.commitTransaction();
          await queryRunner.release();

          return returnNewPayments;
        } catch (err) {}
      } catch (err) {
        const fatalError = new InternalServerErrorException(
          '동시성 제어 관련 에러가 발생했습니다.',
        );
        logger.fatalLogger(
          fatalError,
          `userId = ${userId}, createPaymentDto = ${createPaymentDto}, error detail = ${console.dir(fatalError)}`,
        );
        throw fatalError;
      } finally {
        if (lock) {
          await lock.release();
        }
      }
    } catch (err) {
      const fatalError = new InternalServerErrorException(
        '알 수 없는 에러가 발생했습니다.',
      );
      logger.fatalLogger(
        fatalError,
        `userId = ${userId}, createPaymentDto = ${createPaymentDto}, error detail = ${console.dir(fatalError)}`,
      );
      throw fatalError;
    }
  }

  //포인트 결제 성공 테스트
  async payPointConfirmTest(orders_id) {
     const data =  await this.paymentsRepository.findOneBy({orders_id})
     await this.paymentsRepository.delete({orders_id})
     return {
      message: '결제가 성공적으로 완료되었습니다.',
      data
     }
  }


  //토스페이 -결제 인증 요청
  async payCash(userId: number, createPaymentDto) {
    await validation(CreatePaymentDto, createPaymentDto);
    if (_.isNil(userId) || userId == 0) {
      const error = new BadRequestException('잘못된 요청입니다!');
      logger.errorLogger(error, `userId = ${userId}`);
      throw error;
    }
    const { orders_id } = createPaymentDto;

    const order = await this.ordersRepository.findOne({
      relations: ['ordersdetails'],
      where: {
        id: orders_id,
      },
    });

    if (_.isNil(order)) {
      throw new NotFoundException('주문 내역을 찾을 수 없습니다.');
    }

    const existingTrial = await this.tossRepository.findOneBy({orders_id})
    console.log('토스 1', existingTrial)
    if(existingTrial && existingTrial.p_total_price == 0 && existingTrial.p_status == false) {
      const data = existingTrial

      console.log('토스 2', existingTrial)
      return {
        message:  `${order.ordersdetails[0].goods_id}번 상품 외 ${order.ordersdetails.length - 1} 건`,
        data
      }
    }

    if(existingTrial && existingTrial.toss_transaction_key && existingTrial.p_total_price !== 0 && existingTrial.p_status) {

      console.log('토스 3', existingTrial)
      throw new BadRequestException('이미 결제된 내역입니다.')
    }


    let toss_orders_id;
    let duplicate;
    console.log('페이먼츠 국밥');
    do {
      toss_orders_id = faker.string.alphanumeric(10);
      duplicate = await this.tossRepository.findOneBy({ toss_orders_id });
    } while (!_.isNil(duplicate));

    const data = this.tossRepository.create({
      user_id: userId,
      orders_id,
      toss_orders_id,
      o_total_price: order.o_total_price,
    });
    console.log('페이먼츠 국밥4', data);
    await this.tossRepository.save(data);
    return {
      message: `${order.ordersdetails[0].goods_id}번 상품 외 ${order.ordersdetails.length - 1} 건`,
      data,
    };
  }


  //토스페이 - 결제 승인 요청
  async payCashConfirm(requestData) {
    const { paymentKey, orderId, amount } = requestData;

    if (
      _.isNil(paymentKey) ||
      paymentKey == 0 ||
      _.isNil(orderId) ||
      orderId == 0 ||
      _.isNil(amount)
    ) {
      throw new BadRequestException('잘못된 요청입니다!');
    }

    //redlock
    const client = this.redisService.getClient();
    const redlock = this.redisService.redlock(client);

    const queryRunner = this.dataSource.createQueryRunner();

    const tossPayment = await queryRunner.manager
      .createQueryBuilder(TossHistory, 'toss')
      .leftJoinAndSelect('toss.orders', 'orders')
      .where('toss.toss_orders_id = :orderId', { orderId })
      .getOne();
    if (!tossPayment) {
      const error = new BadRequestException('존재하지 않는 주문입니다.');
      logger.errorLogger(error, `requestData = ${JSON.stringify(requestData)}`);
      throw error;
    }

    const lock = await redlock.acquire(
      [`transaction-toss: order_id = ${orderId}`],
      30000,
    );
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();
      try {
        const details = await queryRunner.manager
          .createQueryBuilder(OrdersDetails, 'details')
          .where('details.orders_id = :orders_id', {
            orders_id: tossPayment.orders_id,
          })
          .getMany();

        const destination = await this.kakaoGeocoder.getCoordinates(
          tossPayment.orders.o_addr,
        );
        console.log('토스 국밥22222', destination);
        const storage = await this.kakaoGeocoder.getClosestStorage(destination);
        console.log('토스 국밥2222', storage);

        for (const detail of details) {
          const goods = queryRunner.manager.createQueryBuilder(Goods, 'goods');
          const stocks = await queryRunner.query(`
    SELECT
    stocks.*,
    goods.id,
    racks.id,
    storage.id
    FROM
        stocks
    LEFT JOIN goods ON stocks.goods_id = goods.id
    LEFT JOIN racks ON stocks.rack_id = racks.id
    LEFT JOIN storage ON racks.storage_id = storage.id
    WHERE
    goods.id = ${detail.goods_id} AND storage.id = ${storage.id}
  `);
          //orders_id = 100622
          //goods_id = 19616

          if (!goods || stocks[0].count < detail.od_count) {
            const error = new BadRequestException('재고가 없습니다.');
            logger.errorLogger(error, `goodsId = ${detail.goods_id}`);
            throw error;
          }

          const newStockCount = stocks[0].count - detail.od_count;
          console.log('죽음의 국밥', newStockCount);
          await queryRunner.manager
            .createQueryBuilder()
            .update(Stocks)
            .where('goods_id = :goodsId', { goodsId: stocks[0].goods_id })
            .andWhere('rack_id = :rackId', { rackId: stocks[0].rack_id })
            .set({ count: newStockCount })
            .execute();
        }

        tossPayment.p_total_price = tossPayment.o_total_price;

        await queryRunner.manager.save(TossHistory, tossPayment);

        await queryRunner.manager.update(
          Orders,
          { user_id: tossPayment.user_id, id: tossPayment.orders_id },
          { p_status: true },
        );

        await queryRunner.commitTransaction();
        await queryRunner.release();
      } catch (error) {}
      return {
        data: requestData,
      };
    } catch (error) {
      const fatalError = new InternalServerErrorException(
        '동시성 제어 관련 에러가 발생했습니다.',
      );
      logger.fatalLogger(
        fatalError,
        `JSON.stringify = ${JSON.stringify(requestData)}, error detail = ${console.dir(fatalError)}`,
      );
      throw fatalError;
    } finally {
      if (lock) {
        lock.release();
      }
    }
  }

   //토스페이 결제 마지막 마무리
   async payCashWrapUp(transactionData) {
    console.log('구웃밥2', transactionData)
    const {orderId, lastTransactionKey} = transactionData
    const data = await this.tossRepository.findOne({
      where: {
        toss_orders_id: orderId
      }
    })
    if(_.isNil(data) || !data.p_status || !data.toss_payment_key) {
      const fatalError = new InternalServerErrorException('PG 결제 과정에서 알 수 없는 오류가 발생하였습니다.')
      logger.fatalLogger(fatalError, `data = ${JSON.stringify(data)}, transactionData = ${JSON.stringify(transactionData)}`)
      throw fatalError
    }
    

    const result = await this.tossRepository.update({toss_orders_id: orderId}, {toss_transaction_key: lastTransactionKey})

    return {
        message: '토스로부터 결제 정보를 수신받았습니다.',
        data: result
    }
   }


  // 유저별 결제 목록 전체 조회
  async findAllOrderbyUser(userId: number): Promise<Payments[]> {
    if (_.isNil(userId) || userId == 0) {
      const error = new BadRequestException('잘못된 요청입니다!');
      logger.errorLogger(error, `userId = ${userId}`);
      throw error;
    }

    try {
      const payments = await this.paymentsRepository
        .createQueryBuilder('payment')
        .where('payment.user_id = :userId', { userId })
        .getMany();

      if (!payments || payments.length === 0) {
        const error = new NotFoundException('결제 정보가 없습니다.');
        logger.errorLogger(error, `userId = ${userId}, payments = ${payments}`);
        throw error;
      }
      return payments;
    } catch (error) {
      const fatalError = new InternalServerErrorException(
        '알 수 없는 에러가 발생했습니다.',
      );
      logger.fatalLogger(fatalError, `userId = ${userId}`);
      throw fatalError;
    }
  }

  // 전체 결제 정보 확인
  async findAllOrderbyAdmin(): Promise<Payments[]> {
    try {
      const payments = await this.paymentsRepository.find();
      if (!payments || payments.length === 0) {
        const error = new NotFoundException('결제 정보가 없습니다.');
        logger.errorLogger(error, `payments = ${payments}`);
        throw error;
      }
      return payments;
    } catch (error) {
      const fatalError = new InternalServerErrorException(
        '알 수 없는 에러가 발생했습니다.',
      );
      logger.fatalLogger(fatalError, `parameter = none`);
      throw fatalError;
    }
  }

  // 상세 결제 정보 확인
  async findOneOrderbyBoth(paymentsId: number): Promise<Payments> {
    if (_.isNil(paymentsId) || paymentsId == 0) {
      const error = new BadRequestException('잘못된 요청입니다!');
      logger.errorLogger(error, `paymentsId = ${paymentsId}`);
      throw error;
    }

    try {
      // 쿼리 빌더를 사용하여 결제 정보 조회
      const payments = await this.paymentsRepository
        .createQueryBuilder('payment')
        .where('payment.id = :id', { id: paymentsId })
        .getOne();

      if (!payments) {
        const error = new NotFoundException('결제 정보가 없습니다.');
        logger.errorLogger(
          error,
          `paymentsId = ${paymentsId}, payments = ${payments}`,
        );
        throw error;
      }
      return payments;
    } catch (error) {
      const fatalError = new InternalServerErrorException(
        '알 수 없는 에러가 발생했습니다.',
      );
      logger.fatalLogger(fatalError, `paymentsId = ${paymentsId}`);
      throw fatalError;
    }
  }

  // 결제 취소
  //트랜잭션 필요
  async cancelPay(userId: number, paymentsId: number): Promise<Payments> {
    if (
      _.isNil(paymentsId) ||
      paymentsId == 0 ||
      _.isNil(userId) ||
      userId == 0
    ) {
      const error = new BadRequestException('잘못된 요청입니다!');
      logger.errorLogger(
        error,
        `paymentsId = ${paymentsId}, userId = ${userId}`,
      );
      throw error;
    }
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      if (!userId || userId == 0 || !paymentsId || paymentsId == 0) {
        const error = new BadRequestException('잘못된 요청입니다!');
        logger.errorLogger(
          error,
          `userId = ${userId}, paymentsId = ${paymentsId}`,
        );
        throw error;
      }
      const payments = await queryRunner.manager.findOne(Payments, {
        where: { id: paymentsId, user_id: userId },
      });
      if (!payments) {
        const error = new NotFoundException('결제 정보를 찾을 수 없습니다.');
        logger.errorLogger(
          error,
          `userId = ${userId}, paymentsId = ${paymentsId}, payments = ${payments}`,
        );
        throw error;
      }

      // 환불 로직

      const refundAmount = payments.p_total_price; // 결제 취소로 인한 환불액
      const userPoint = await queryRunner.manager.findOne(Point, {
        where: { userId: payments.user_id },
      });
      if (!userPoint) {
        const error = new NotFoundException(
          '사용자 포인트를 찾을 수 없습니다.',
        );
        logger.errorLogger(
          error,
          `userId = ${userId}, paymentsId = ${paymentsId}, payments = ${payments}, userPoint = ${userPoint}`,
        );
        throw error;
      }

      userPoint.possession += refundAmount; // 포인트 테이블에 환불액 기록
      await queryRunner.manager.save(Point, userPoint);

      const user = await queryRunner.manager.findOne(Users, {
        where: { id: payments.user_id },
      });
      if (!user) {
        const error = new NotFoundException('사용자를 찾을 수 없습니다.');
        logger.errorLogger(
          error,
          `userId = ${userId}, paymentsId = ${paymentsId}, payments = ${payments}, user = ${user}`,
        );
        throw error;
      }
      user.points += refundAmount; // 유저의 기존 포인트에 환불액 추가
      await queryRunner.manager.save(Users, user);

      await queryRunner.manager.update(
        Orders,
        { user_id: userId, id: payments.orders_id },
        { p_status: false, o_status: Status.PayCanceled },
      );
      payments.p_total_price = -payments.p_total_price;

      const order = await queryRunner.manager.findOne(Orders, {
        where: { user_id: userId, id: payments.orders_id },
      });
      if (order.o_status == Status.PayCanceled) {
        const error = new BadRequestException('이미 취소된 주문입니다.');
        logger.errorLogger(
          error,
          `userId = ${userId}, paymentsId = ${paymentsId}, payments = ${payments}, order = ${order}`,
        );
        throw error;
      }

      await queryRunner.manager.save(Payments, payments);
      await queryRunner.commitTransaction();
      await queryRunner.release();
      return payments;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      await queryRunner.release();
      const fatalError = new InternalServerErrorException(
        '알 수 없는 에러가 발생했습니다.',
      );
      logger.fatalLogger(
        fatalError,
        `userId = ${userId}, paymentsId = ${paymentsId}`,
      );
      throw fatalError;
    }
  }


   //토스 결제 취소
   async cancelPayCash(userId, orders_id) {
       try {
           // 결제 취소 로직을 서비스에서 호출하여 실행.
           const {orders_id: number} = orders_id
          console.log('토스 결제 취소2')
           const transaction = await this.tossRepository.findOne({
            where: {
              user_id: userId,
              orders_id: number
            }
           });
           console.log('토스 결제 취소2-1', transaction)
           const cancelReason = {cancelReason: "고객이 취소를 원함"}
           const secretKey = 'test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6';
           const encryptedSecretKey = 'Basic ' + Buffer.from(secretKey + ':').toString('base64');
          const data = await axios.post(`https://api.tosspayments.com/v1/payments/${transaction.toss_payment_key}/cancel`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': encryptedSecretKey
            },
            data: JSON.stringify(cancelReason),
           })
           const response = data.data
           const result = await this.tossRepository.insert({
            user_id: transaction.user_id,
            orders_id: transaction.orders_id,
            toss_orders_id: transaction.toss_orders_id,
            toss_transaction_key: response.toss_transaction_key,
            toss_payment_key: transaction.toss_payment_key,
            o_total_price: transaction.o_total_price,
            p_total_price: -transaction.p_total_price,
            p_status: true,
           }) 
           console.log('토스 결제 취소3', response)
           return { message: '결제가 취소되었습니다.', data: result };
       } catch (error) {
           console.error(error)
           if (error instanceof NotFoundException) {
               throw error;
           } else {
               const fatalError = new NotFoundException('알 수 없는 에러가 발생하여 결제를 취소할 수 없습니다.');
               logger.fatalLogger(fatalError, `req.user = ${userId}, orders_id = ${orders_id}`)
               throw fatalError// 그 외의 오류는 일반적인 오류 메시지를 반환.
           }
       }
   }


  /**
   * 주소로 좌표찾기
   * @param address
   * @returns
   */
  async getCoordinates(address: string): Promise<{ lat: number; lng: number }> {
    const coordinates = await this.kakaoGeocoder.getCoordinates(address);
    let lat = coordinates.lat;
    let lng = coordinates.lng;
    return coordinates;
  }
}
