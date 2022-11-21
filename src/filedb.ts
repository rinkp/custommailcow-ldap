import {ConnectionOptions, Repository, createConnection, getConnection, Not, Column} from 'typeorm';
import 'reflect-metadata'
import {Users} from './entities/User'
import fs from "fs";
import {MailcowPermissions, ACLResults, ActiveUserSetting, UserDataDB, SOBList} from "./types";

// Connection options for the DB
const options: ConnectionOptions = {
    type: "sqlite",
    database: './db/ldap-mailcow.sqlite3',
    entities: [
        Users
    ],
}

let userRepository: Repository<Users>;
let session_time: number = new Date().getTime();

export function setSessionTime(): void {
    session_time = new Date().getTime()
}

/**
 * Initialize database connection. Setup database if it does not yet exist
 */
export async function initializeDB(): Promise<void> {
    if (!fs.existsSync('./db/ldap-mailcow.sqlite3'))
        fs.writeFileSync('./db/ldap-mailcow.sqlite3', '')
    await createConnection(options).catch((error: never) => console.log(error));
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
            lastSeen: Not(session_time),
            active: Not(0)
        }
    }))
}

/**
 * Add a user to the DB
 * @param email - mail entry in the database
 * @param active - whether user is active
 */
export async function addUserDB(email: string, active: ActiveUserSetting): Promise<void> {
    const user: Users = Object.assign(new Users(), {
        email: email,
        active: active,
        inactiveCount: 0,
        mailPermRO: '',
        changedRO: 0,
        mailPermRW: '',
        changedRW: 0,
        mailPermROInbox: '',
        changedROInbox: 0,
        mailPermROSent: '',
        changedROSent: 0,
        mailPermSOB: '',
        changedSOB: 0,
        lastSeen: session_time,
    })
    await userRepository.save(user)
}

/**
 * Get a user data from database
 * @param email - mail from to be retrieved user
 */
export async function checkUserDB(email: string): Promise<UserDataDB> {
    const db_user_data: UserDataDB = {
        exists: false,
        isActive: undefined,
        inactiveCount: 0
    }

    // Find first user with email
    const user: Users = await userRepository.findOne({
        email: email
    })

    // Check if user exists, if not, return immediately
    if (user === undefined) {
        return db_user_data
    } else {
        // Update last time user has been checked
        user.lastSeen = session_time
        await userRepository.update(user.email, user)

        // Return information of user
        db_user_data['exists'] = true
        db_user_data['isActive'] = user.active
        db_user_data['inactiveCount'] = user.inactiveCount
        return db_user_data
    }
}

/**
 * Change user activity status in the DB
 * @param email - email of user
 * @param active - activity of user
 * @param inactiveCount - number of times user has been inactive
 */
export async function activityUserDB(email: string, active: ActiveUserSetting, inactiveCount: number): Promise<void> {
    // Retrieve user with email
    const user: Users = await userRepository.findOne({
        email: email
    })
    // Set new activity of user
    user.active = active
    user.inactiveCount = inactiveCount
    await userRepository.update(user.email, user)
}

/**
 * Update user's SOB
 * @param email - email of user
 * @param SOBEmail - acl to check
 */
export async function updateSOBDB(email: string, SOBEmail: string): Promise<void> {
    // Retrieve user with email
    const user: Users = await userRepository.findOne({
        email: email
    })

    // Check if permissions for ACL are set
    const SOB = !user[MailcowPermissions.mailPermSOB] ? [] : user[MailcowPermissions.mailPermSOB].split(';');

    // Check if sob mail is in list, if not, add it
    if (SOB.indexOf(SOBEmail) === -1) {
        SOB.push(SOBEmail)
        user.changedSOB = true;
        console.log(`New SOB added to ${email}. Now allowed to SOB ${SOBEmail}`)
        user[MailcowPermissions.mailPermSOB] = SOB.join(';');
        await userRepository.update(user.email, user)
    }
}

export async function getChangedSOB(): Promise<SOBList[]> {
    // Retrieve user with email
    return await userRepository.createQueryBuilder()
        .select(["email", "mailPermSOB"])
        .where({
            changedSOB: true
        })
        .execute()
}

export async function resetUserChanged(email: string): Promise<void> {
    // Find first user with email
    const user: Users = await userRepository.findOne({
        email: email
    })

    user.changedSOB = false;
    await userRepository.update(user.email, user)
}


/**
 * Update user's ACLs
 * @param email - email of user
 * @param newUsers - acl to check
 * @param permission - type of permission to check
 */
export async function updatePermissionsDB(email: string, newUsers: string[], permission: MailcowPermissions): Promise<ACLResults> {
    // Keep track of changes in permissions
    const updatedUsers: ACLResults = {
        newUsers: undefined,
        removedUsers: undefined
    }

    // Find first user with email
    const user: Users = await userRepository.findOne({
        email: email
    })

    // Get existing permissions from mailbox
    if(!newUsers) newUsers = [];
    if(!Array.isArray(newUsers)) newUsers = [newUsers];
    const removedUsers = !user ? [] : user[permission].split(';');

    // Filter for new users
    updatedUsers.newUsers = newUsers.filter(x => !removedUsers.includes(x));
    updatedUsers.removedUsers = removedUsers.filter(x => !newUsers.includes(x));

    // Put new user list in database
    user[permission] = newUsers.join(';');
    await userRepository.update(user.email, user)

    return updatedUsers
}
