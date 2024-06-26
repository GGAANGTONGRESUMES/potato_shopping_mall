import { DataSource } from 'typeorm';
import { faker } from '@faker-js/faker';
import { Boards } from '../src/boards/entities/boards.entity';
import { Comments } from '../src/boards/entities/comments.entity';
import { Categories } from '../src/goods/entities/categories.entity';

import { Stocks } from '../src/goods/entities/stocks.entity';
import { Carts } from '../src/orders/entities/carts.entity';
import { Orders } from '../src/orders/entities/orders.entity';
import { Payments } from '../src/payments/entities/payments.entity';
import { Point } from '../src/point/entities/point.entity';
import { Users } from '../src/user/entities/user.entitiy';
import { OrdersDetails } from '../src/orders/entities/ordersdetails.entity';
import { Reviews } from '../src/orders/entities/review.entity';
import { Like } from '../src/like/entities/like.entity';
import dotenv from 'dotenv'
import { Racks } from '../src/storage/entities/rack.entity'
import { Storage } from 'src/storage/entities/storage.entity';
import { Goods } from 'src/goods/entities/goods.entity';

dotenv.config()

const AppDataSource = new DataSource({
  type: 'mysql',
  host: 'potato-db.cbyo86kq8krr.ap-northeast-2.rds.amazonaws.com',
  port: 3306,
  username: 'root',
  password: 'potatomaster!',
  database: 'potato_shop',
  // type: 'mysql',
  // host: 'localhost',
  // port: 3306,
  // username: 'ggangtong1',
  // password: '3617',
  // database: 'potato_shopping_mall',
  // host: process.env.DB_HOST,
  // port: +process.env.DB_PORT,
  // username: process.env.DB_USERNAME,
  // password: process.env.DB_PASSWORD,
  // database: process.env.DB_NAME,
  entities: [Users, Point, Payments, Orders, Reviews, OrdersDetails, Orders, Carts, Like, Stocks, Goods, Categories, Comments, Boards, Racks, Storage],
  synchronize: true,
  logging: false,
});



const count_orders = 75000
const count_ordersDetails = 3
 
async function createDummyData() {

  await AppDataSource.initialize()
    .then(
      async() => {
        //물류창고
        let count = 1
        for(let i = 0; i < count_orders; i++) {
          console.log(`-------------dummy data #${count} input start------------------`)
          const order = new Orders()
          order.user_id = i + 1
          order.o_total_price = faker.number.int({
            min: 10000,
            max: 1000000
          })
          await AppDataSource.manager.save(order)
          for(let i = 0; i < count_ordersDetails; i++) {
            const ordersDetails = new OrdersDetails()
            ordersDetails.orders_id = order.id
            ordersDetails.goods_id = faker.number.int({
              min: 1,
              max: 25000
            })
            ordersDetails.od_count = faker.number.int({
              min: 1,
              max: 15
            })
            await AppDataSource.manager.save(ordersDetails)
          }
          console.log(`-------------dummy data #${count} input start------------------`)
          count++
        }
        return;
    }
  ).catch(error => console.error(error))
}

createDummyData()