import { Column, Entity, PrimaryColumn } from 'typeorm';
@Entity()
export class SogoUserProfile {
  @PrimaryColumn()
  c_uid!: string;

  @Column()
  c_defaults!: string;

  @Column()
  c_settings!: string;
}
