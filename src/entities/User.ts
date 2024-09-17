﻿import { Column, Entity, PrimaryColumn } from 'typeorm';
import { ActiveUserSetting } from '../types';

@Entity()
export class Users {
  @PrimaryColumn()
    email!: string;

  @Column()
    active!: ActiveUserSetting;

  @Column()
    displayName!: string;

  @Column()
    inactiveCount!: number;

  @Column()
    mailPermRO!: string;

  @Column()
    mailPermRW!: string;

  @Column()
    mailPermROInbox!: string;

  @Column()
    mailPermROSent!: string;

  @Column()
    mailPermSOB!: string;

  @Column()
    newMailPermSOB!: string;

  @Column()
    lastSeen!: number;
}
