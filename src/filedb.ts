import {createConnection, getConnection, Entity, Column} from 'typeorm';
import {Not, PrimaryGeneratedColumn, Repository} from "typeorm/browser";

@Entity()
export class User {
    @PrimaryGeneratedColumn()
    email: string;

    @Column()
    active: boolean;

    @Column()
    last_seen: Date;
}

// TODO -> in ormconfig.json zetten
// let db_file = 'db/ldap-mailcow.sqlite3'
let userRepository : Repository<User>
let session_time = new Date()

export async function initialize_database() {
    await createConnection().catch((error: any) => console.log(error));
    userRepository = getConnection().getRepository(User)
}

export async function get_unchecked_active_users() {
    return await userRepository.find({
        select: ["email"],
        where: {
            last_seen: Not(session_time),
            active: true
        }
    })
}

export async function add_user(email: string, active: boolean = true) {
    let user = new User();
    user.email = email;
    user.active = active;
    user.last_seen = session_time
    await getConnection().manager.save(user)
}

// Todo -> kijk naar wat returned moet worden
export async function check_user(email: string) {
    let user: User = await userRepository.findOne({
        email: email
    })
    if (user === undefined) return false
    user.last_seen = session_time
    await userRepository.update(user.email, user)
    return true
}

export async function user_set_active_to(email: string, active: boolean) {
    let user: User = await userRepository.findOne({
        email: email
    })
    user.active = active
    await userRepository.update(user.email, user)
    return true
}