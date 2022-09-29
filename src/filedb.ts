import {ConnectionOptions, Repository, createConnection, getConnection, Not} from 'typeorm';
import 'reflect-metadata'
import {Users} from './entities/User'
import fs from "fs";
import {ActiveUserSetting, DBUserData} from "./types";

// Connection options for the DB
const options: ConnectionOptions = {
    type: "sqlite",
    database: './db/ldap-mailcow.sqlite3',
    entities: [
        Users
    ],
}

let userRepository: Repository<Users>;
let session_time: Date = new Date();

export function setSessionTime(): void {
    session_time = new Date()
}

/**
 * Initialize database connection. Setup database if it does not yet exist
 */
export async function initializeDatabase(): Promise<void> {
    if (!fs.existsSync('./db/ldap-mailcow.sqlite3'))
        fs.writeFileSync('./db/ldap-mailcow.sqlite3', '')
    await createConnection(options).catch((error: any) => console.log(error));
    await getConnection().synchronize()
    userRepository = getConnection().getRepository(Users)
}

/**
 * Get all users from DB that have not been checked in current session but are active
 */
export async function getUncheckedActiveUsers(): Promise<Users[]> {
    return Promise.resolve(userRepository.find({
        select: ["email"],
        where: {
            last_seen: Not(session_time),
            active: true
        }
    }))
}

/**
 * Add a user to the DB
 * @param email - mail entry in the database
 * @param active - whether user is active
 */
// Todo return boolean?
export async function addUserFileDB(email: string, active: ActiveUserSetting): Promise<void> {
    let user: Users = Object.assign(new Users(), {
        email,
        active,
        last_seen: session_time,
    })
    await userRepository.save(user)
}

/**
 * Get a user data from database
 * @param email - mail from to be retrieved user
 */
export async function checkUserFileDB(email: string): Promise<DBUserData> {
    let db_user_data: DBUserData = {
        db_user_exists: false,
        db_user_active: undefined
    }

    // Find first user with email
    let user: Users = await userRepository.findOne({
        email: email
    })

    // Check if user exists, if not, return immediately
    if (user === undefined) {
        return db_user_data
    } else {
        // Update last time user has been checked
        user.last_seen = session_time
        await userRepository.update(user.email, user)

        // Return information of user
        db_user_data['db_user_exists'] = true
        db_user_data['db_user_active'] = user.active
        return db_user_data
    }
}

/**
 * Change user activity status in the DB
 * @param email - email of user
 * @param active - activity of user
 */
// Todo return boolean?
export async function userSetActiveToFileDB(email: string, active: ActiveUserSetting): Promise<void> {
    // Retrieve user with email
    let user: Users = await userRepository.findOne({
        email: email
    })
    // Set new activity of user
    user.active = active
    await userRepository.update(user.email, user)
}