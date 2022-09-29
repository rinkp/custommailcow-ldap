import {Column, Entity, PrimaryColumn} from "typeorm";
import {ActiveUserSetting} from "../types";

@Entity()
export class Users {
    @PrimaryColumn()
    email: string;

    @Column()
    active: ActiveUserSetting;

    @Column()
    last_seen: Date;
}