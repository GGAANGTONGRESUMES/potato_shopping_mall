import { DataSource } from 'typeorm';
import { faker } from '@faker-js/faker';
import { Boards } from '../src/boards/entities/boards.entity';
import { Comments } from '../src/boards/entities/comments.entity';
import { Categories } from '../src/goods/entities/categories.entity';
import { Goods } from '../src/goods/entities/goods.entity';
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
import { Storage } from '../src/storage/entities/storage.entity';
import { JwtService } from '@nestjs/jwt';
import fs from 'fs';

dotenv.config()

const AppDataSource = new DataSource({
  type: 'mysql',
  host: 'potato-db.cbyo86kq8krr.ap-northeast-2.rds.amazonaws.com',
  port: 3306,
  username: 'root',
  password: 'potatomaster!',
  database: 'potato_shop',
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

const arrayRole = [0, 1]
const arrayGrade = [0, 1, 2]
 
//원하는 수 만큼 넣으세요.
const count_user = 100000;
const jwtService = new JwtService()
const JWT_ACCESS_TOKEN_SECRET = 'adkjfadjfdasjfasdf'
async function createDummyData() {
  const data = [];
  //oauth랑 user랑 합치고, user에 이렇게 남겨놓으면 될듯?
  await AppDataSource.initialize()
    .then(
      async() => {
        let count = 1
        //유저
        for(let i = 0; i < count_user; i++) {
          console.log(`-------------dummy data #${count} input start------------------`)
          const email = faker.internet.email()
          const nickname = faker.internet.userName()
          const name = faker.person.fullName()
          const profile = faker.image.url({
            width: 400,
            height: 400
          })
          const randomIndexRole = Math.floor(Math.random() * arrayRole.length)
          const randomIndexGrade = Math.floor(Math.random() * arrayGrade.length) 
          const role = randomIndexRole
          const grade = randomIndexGrade
          const points = 1000000
          const bank = faker.string.numeric(10)

          //DB 입력
          const user = new Users()
          
          user.email = email
          user.name = name
          user.nickname = nickname
          user.profile = profile
          user.role = role
          user.grade = grade
          user.points = points
          user.bank = +bank

          const existingEmail = await AppDataSource.manager.findOne(Users, {where: {
            email
          }})

          if(!existingEmail) { 
         const user = await AppDataSource.createQueryBuilder()
          .insert()
          .into(Users) // 사용자 엔티티에 따라 변경해야 합니다.
          .values({
              email: email,
              name: name,
              nickname: nickname,
              profile: profile,
              role: role,
              grade: grade,
              points: points,
              bank: +bank
          })
          .execute()
          
          const insertedUser = await AppDataSource.createQueryBuilder()
          .select()
          .from(Users, "user")
          .where("user.email = :email", {email})
          .getOne()

          //csv 파일 생성
          if(insertedUser) {
          const payload = {email: insertedUser.email, sub: insertedUser.id}
          const csv = {
            accessToken: `Bearer ${jwtService.sign(payload, {
              secret: JWT_ACCESS_TOKEN_SECRET
            })}`
          }
          data.push(csv)
        }
        }
          console.log(`-------------dummy data #${count} input ends------------------`)
          count++
    }
    const filename = 'fake_data_token.csv'
    const csvData = data.map(csv => `${csv.accessToken}`).join('\n');
    fs.writeFileSync(filename, `accessToken\n${csvData}`);
  }
    ).catch(error => console.error(error))
}

createDummyData()