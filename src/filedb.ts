import {ConnectionOptions, createConnection, getConnection, Not} from 'typeorm';
import 'reflect-metadata'
import {Users} from './entities/User'
import fs from "fs";

const options: ConnectionOptions = {
    type: "sqlite",
    database: './db/ldap-mailcow.sqlite3',
    entities: [
        Users
    ],
}

let userRepository : any;
let session_time : Date = new Date();

export function set_session_time() {
    session_time = new Date()
}

export async function initialize_database() {
    if (!fs.existsSync('./db/ldap-mailcow.sqlite3'))
        fs.writeFileSync('./db/ldap-mailcow.sqlite3', '')
    await createConnection(options).catch((error: any) => console.log(error));
    await getConnection().synchronize()
    userRepository = getConnection().getRepository(Users)
}

export async function get_unchecked_active_users() : Promise<Users[]> {
    return Promise.resolve(userRepository.find({
        select: ["email"],
        where: {
            last_seen: Not(session_time),
            active: true
        }
    }))
}

type active_user = 0 | 1 | 2

export async function add_user_filedb(email: string, active: active_user) {
    let user = new Users();
    user.email = email;
    user.active = active;
    user.last_seen = session_time
    await getConnection().manager.save(user)
}


type db_user_data = {
    db_user_exists: boolean
    db_user_active: number
}
export async function check_user_filedb(email: string) {
    let db_user_data : db_user_data = {
        db_user_exists: false,
        db_user_active: 0
    }

    let user: Users = await userRepository.findOne({
        email: email
    })

    if (user === undefined) {
        return db_user_data
    } else {
        user.last_seen = session_time
        await userRepository.update(user.email, user)

        db_user_data['db_user_exists'] = true
        db_user_data['db_user_active'] = user.active
        return db_user_data
    }
}

export async function user_set_active_to_filedb(email: string, active: active_user) {
    let user: Users = await userRepository.findOne({
        email: email
    })
    console.log(user)
    user.active = active
    await userRepository.update(user.email, user)
}