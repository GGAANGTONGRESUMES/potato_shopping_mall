import { PickType } from "@nestjs/swagger";
import { Goods } from "../entities/goods.entity";

export class UpdateGoodDto extends PickType(Goods, ["id"]) {}
