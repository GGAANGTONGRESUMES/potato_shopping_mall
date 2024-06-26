import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Orders } from './entities/orders.entity';
import { Between, DataSource, FindOptionsWhere, In, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { CreateOrderDto } from './dto/create-order.dto';
import { Users } from '../user/entities/user.entitiy';
import { Payments } from '../payments/entities/payments.entity';
import { Status } from './types/order.type';
import { Point } from '../point/entities/point.entity';
import { Carts } from './entities/carts.entity';
import { Goods } from '../goods/entities/goods.entity';
import logger from '../common/log/logger';
import { OrdersDetails } from './entities/ordersdetails.entity';
import { validation } from '../common/pipe/validationPipe';
import _ from 'lodash';
import { Stocks } from 'src/goods/entities/stocks.entity';
import { getDeliveryInqResult } from './delivery';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Orders)
    private ordersRepository: Repository<Orders>,
    @InjectRepository(OrdersDetails)
    private ordersDetailsRepository: Repository<OrdersDetails>,
    @InjectRepository(Users)
    private usersRepository: Repository<Users>,
    @InjectRepository(Point)
    private pointRepository: Repository<Point>,
    @InjectRepository(Payments)
    private paymentsRepository: Repository<Payments>,
    @InjectRepository(Goods)
    private goodsRepository: Repository<Goods>,
    private readonly dataSource: DataSource,
  ) {}

  // purchase 메서드 안에 dto 안에 있는 o_addr, o_detail_addr, o_tel이 저장되게 하면 됨(좌표를 저장되게 할 필요는 없음)
  // 기술, 시간 한계로 인해 일단은 배송이 시작되면 환불이 안되도록 함

  async purchase(
    userId: number,
    createOrderDto: CreateOrderDto,
    // 포스트맨의 body,
  ) {
    if (_.isNil(userId) || userId == 0) {
      const error = new BadRequestException('잘못된 요청입니다!');
      logger.errorLogger(error, `userId = ${userId}`);
      throw error;
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    await validation(CreateOrderDto, createOrderDto);
    const { carts_id, o_addr, o_detail_addr, o_tel } = createOrderDto;
    const carts = await queryRunner.manager.find(Carts, {
      where: {
        id: In(carts_id),
        user_id: userId,
      },
    });

    if (carts.length === 0) {
      const error = new NotFoundException('존재하지 않는 상품입니다.');
      logger.errorLogger(
        error,
        `userId = ${userId}, createOrderDto = ${JSON.stringify(createOrderDto)}, carts = ${JSON.stringify(carts)} `,
      );
      throw error;
    }

    if (carts.length !== carts_id.length) {
      const error = new BadRequestException('유효하지 않은 요청입니다.');
      logger.errorLogger(
        error,
        `userId = ${userId}, createOrderDto = ${JSON.stringify(createOrderDto)}, carts = ${JSON.stringify(carts)} `,
      );
      throw error;
    }
    for (let element of carts) {
      if (element.user_id !== userId) {
        const error = new BadRequestException('유효하지 않은 요청입니다.');
        logger.errorLogger(
          error,
          `userId = ${userId}, createOrderDto = ${JSON.stringify(createOrderDto)}, carts = ${JSON.stringify(carts)}, element = ${element} `,
        );
        throw error;
      }
    }

    try {
      let o_total_price: number = 0;
      for (const cart of carts) {
        if (cart.user_id !== userId) {
          const error = new BadRequestException(
            '유효하지 않은 요청: 카트 소유권이 일치하지 않습니다.',
          );
          logger.errorLogger(error, `userId = ${userId}, cartId = ${cart.id}`);
          throw error;
        }

        const goods = await queryRunner.manager
          .createQueryBuilder(Goods, 'goods')
          .where('goods.id = :id', { id: cart.goods_id })
          .getMany();

        const stockCount = await queryRunner.manager
          .createQueryBuilder(Stocks, 'stocks')
          .select('SUM(stocks.count)', 'total')
          .where('stocks.goods_id = :goodsId', { goodsId: cart.goods_id })
          .getRawOne();

        if (!goods || stockCount.total < cart.ct_count) {
          const error = new BadRequestException('재고가 부족합니다.');
          logger.errorLogger(
            error,
            `userId = ${userId}, goodsId = ${cart.goods_id}`,
          );
          throw error;
        }
        o_total_price += cart.ct_count * cart.ct_price;
        //Cart >> Orders 엔티티를 만들기 위해서 재고를 갱신하고 총액을 구하는 과정
      }

      const makingOrder = queryRunner.manager.create(Orders, {
        user_id: userId,
        o_total_price,
        o_tel,
        o_addr,
        o_detail_addr,
        //아마 p_status는 default(default값: false) 줘야 함
      });

      const order = await queryRunner.manager.save(Orders, makingOrder);

      for (let i = 0; i < carts.length; i++) {
        const ordersDetail = queryRunner.manager.create(OrdersDetails, {
          orders_id: order.id,
          goods_id: carts[i].goods_id,
          od_count: carts[i].ct_count,
        });

        if (!ordersDetail) {
          const fatalError = new InternalServerErrorException(
            '알 수 없는 에러가 발생했습니다.',
          );
          logger.fatalLogger(
            fatalError,
            `userId = ${userId}, createOrderDto = ${JSON.stringify(createOrderDto)}, order = ${order}, carts = ${carts}, carts_id = ${carts_id}`,
          );
          throw fatalError;
        }

        await queryRunner.manager.save(OrdersDetails, ordersDetail);
      }

      await queryRunner.commitTransaction();
      return order; // 생성된 주문 객체 반환
    } catch (err) {
      await queryRunner.rollbackTransaction();
      const fatalError = new InternalServerErrorException(
        '알 수 없는 에러가 발생했습니다.',
      );
      logger.fatalLogger(
        fatalError,
        `userId = ${userId}, createOrderDto = ${JSON.stringify(createOrderDto)}`,
      );
      throw fatalError;
    } finally {
      await queryRunner.release();
    }
  }

  // 유저별 주문 목록 전체 조회
  async findAllOrderbyUser(userId: number): Promise<Orders[]> {
    try {
      if (_.isNil(userId) || userId == 0) {
        const error = new BadRequestException('잘못된 요청입니다!');
        logger.errorLogger(error, `userId = ${userId}`);
        throw error;
      }

      const orders = await this.ordersRepository
        .createQueryBuilder('order')
        .where('order.user_id = :userId', { userId: userId })
        .getMany();

      if (!orders || orders.length === 0) {
        const error = new NotFoundException('주문 정보가 없습니다.');
        logger.errorLogger(error, `userId = ${userId}, orders = ${orders}`);
        throw error;
      }
      return orders;
    } catch (error) {
      const fatalError = new InternalServerErrorException(
        '알 수 없는 에러가 발생했습니다.',
      );
      logger.fatalLogger(fatalError, `userId = ${userId}`);
      throw fatalError;
    }
  }

  // 전체 주문 정보 확인
  async findAllOrderbyAdmin(
    page: number = 1,
    pageSize: number = 10,
  ): Promise<[Orders[], number]> {
    const skip = (page - 1) * pageSize; // 현재 페이지의 첫 번째 항목의 인덱스 계산

    try {
      const ordersWithTotal = await this.ordersRepository
        .createQueryBuilder('order')
        .leftJoin('order.user', 'users') // 주문 테이블과 주문 상세 테이블을 조인
        .select(['order', 'users.name', 'users.email']) // 필요한 필드만 선택
        .orderBy('order.created_at', 'DESC') // 주문일자를 내림차순으로 정렬
        .skip(skip)
        .take(pageSize)
        .getManyAndCount();

      const [orders, total] = ordersWithTotal;

      if (!orders.length) {
        const error = new NotFoundException('주문 정보가 없습니다.');
        logger.errorLogger(
          error,
          `Page: ${page}, PageSize: ${pageSize}, Orders: ${orders}`,
        );
        throw error;
      }

      console.log(
        `Total orders: ${total}, Page: ${page}, Returned: ${orders.length}`,
      );
      return ordersWithTotal;
    } catch (error) {
      const fatalError = new InternalServerErrorException(
        '알 수 없는 에러가 발생했습니다.' + error,
      );
      logger.fatalLogger(fatalError, `Page: ${page}, PageSize: ${pageSize}`);
      throw fatalError;
    }
  }

  // 주문 정보 단건 확인
  async findOneOrderbyBoth(orderId: number): Promise<Orders> {
    try {
      if (_.isNil(orderId) || orderId == 0) {
        const error = new BadRequestException('잘못된 요청입니다!');
        logger.errorLogger(error, `orderId = ${orderId}`);
        throw error;
      }

      // 쿼리 빌더를 사용하여 주문 데이터 조회
      const order = await this.ordersRepository
        .query(`select o.*, u.name, u.email, t.orders_id as tossOrderId from orders o 
              LEFT JOIN users u 
              ON o.user_id = u.id 
              Left join tosshistory t
              on t.orders_id  = o.id
              WHERE o.id = ${+orderId}`);
      console.log('구웃밥', order);
      if (!order) {
        const error = new NotFoundException('주문 정보가 없습니다.');
        logger.errorLogger(error, `orderId = ${orderId}, order = ${order}`);
        throw error;
      }
      return order;
    } catch (error) {
      const fatalError = new InternalServerErrorException(
        '알 수 없는 에러가 발생했습니다.',
      );
      logger.fatalLogger(fatalError, `orderId = ${orderId}`);
      throw fatalError;
    }
  }

  //주문 정보 상세 조회
  async findOrdersDetails(id: number) {
    const data = await this.ordersDetailsRepository.query(
      `select o.*, g.g_name, g.g_price*o.od_count as price from ordersdetails o
      LEFT JOIN goods g
      ON o.goods_id = g.id
      WHERE o.orders_id = ${id}
      `,
    );
    console.log('구욱바압', data);
    return data;
  }

  // 주문 취소
  async cancelOrder(userId: number, orderId: number): Promise<Orders> {
    if (_.isNil(userId) || userId == 0 || _.isNil(orderId) || orderId == 0) {
      const error = new BadRequestException('잘못된 요청입니다!');
      logger.errorLogger(error, `orderId = ${orderId} userId = ${userId}`);
      throw error;
    }

    const queryRunner = this.dataSource.createQueryRunner();

    const order = await queryRunner.manager.findOne(Orders, {
      where: { id: orderId },
    });
    if (!order) {
      const error = new NotFoundException('주문을 찾을 수 없습니다.');
      logger.errorLogger(error, `orderId  = ${orderId}, order = ${order}`);
      throw error;
    }

    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      // 환불 로직
      // 재고 반환 로직 추가
      if (order.o_status !== '주문취소') {
        const refundAmount = order.o_total_price; // 주문 취소로 인한 환불액
        const userPoint = await queryRunner.manager.findOne(Point, {
          where: { userId: order.user_id },
        });
        if (!userPoint) {
          const error = new NotFoundException(
            '사용자 포인트를 찾을 수 없습니다.',
          );
          logger.errorLogger(
            error,
            `orderId  = ${orderId}, order = ${order}, userPoint = ${userPoint}`,
          );
          throw error; //포인트 테이블에 해당 유저 데이터가 없는 경우
        }
        userPoint.possession += refundAmount; // 포인트 테이블에 환불액 기록
        await queryRunner.manager.save(Point, userPoint);

        const user = await queryRunner.manager.findOne(Users, {
          where: { id: order.user_id },
        });
        if (!user) {
          const error = new NotFoundException('사용자를 찾을 수 없습니다.');
          logger.errorLogger(
            error,
            `orderId  = ${orderId}, order = ${order}, user = ${user}`,
          );
          throw error;
        }
        user.points += refundAmount; // 유저의 기존 포인트에 환불액 추가
        await queryRunner.manager.save(Users, user);
      }

      order.o_status = Status.Odercancel; // 주문 상태를 '주문취소'로 변경

      const returnOrder = await queryRunner.manager.save(Orders, order);

      await queryRunner.commitTransaction();
      await queryRunner.release();
      return returnOrder;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      await queryRunner.release();

      const fatalError = new InternalServerErrorException(
        '알 수 없는 에러가 발생했습니다.',
      );
      logger.fatalLogger(fatalError, `orderId = ${orderId}`);
      throw fatalError;
    }
  }

  // getDeliveryInqResult

  async getDeliveryInqResult(t_invoice: string): Promise<any> {
    const result = getDeliveryInqResult(t_invoice);
    return result;
  }

  /**
   * 주문 건수 조회
   */
  async getTodayOrdersCount(userId: number): Promise<number> {
    // 사용자의 role 확인
    const user = await this.usersRepository.findOneBy({ id: +userId });
    if (!user || user.role !== 1) {
      throw new UnauthorizedException('관리자만 접근할 수 있습니다.');
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const count = await this.ordersRepository.count({
      where: {
        created_at: Between(todayStart, todayEnd),
      },
    });
    return count;
  }
}
