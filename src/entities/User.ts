import {Column, Entity, PrimaryColumn} from "typeorm";

@Entity()
export class Users {
    @PrimaryColumn()
    email: string;

    @Column()
    active: 0 | 1 | 2;

    @Column()
    last_seen: Date;
}