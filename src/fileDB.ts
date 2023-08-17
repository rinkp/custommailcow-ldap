import { Repository, Not, DataSource } from 'typeorm';
import { Users } from './entities/User';
import fs from 'fs';
import { MailcowPermissions, ACLResults, ActiveUserSetting, UserDataDB } from './types';

// Connection options for the DB
const dataSource = new DataSource({
  type: 'sqlite',
  database: './db/ldap-mailcow.sqlite3',
  entities: [
    Users,
  ],
});

let userRepository: Repository<Users>;
let sessionTime: number = new Date().getTime();

export function setSessionTime(): void {
  sessionTime = new Date().getTime();
}

/**
 * Initialize database connection. Setup database if it does not yet exist
 */
export async function initializeFileDB(): Promise<void> {
  if (!fs.existsSync('./db/ldap-mailcow.sqlite3'))
    fs.writeFileSync('./db/ldap-mailcow.sqlite3', '');
  dataSource.initialize().catch((error) => console.log(error));
  userRepository = dataSource.getRepository(Users);
}

/**
 * Get all users from DB that have not been checked in current session but are active
 */
export async function getUncheckedActiveUsers(): Promise<Users[]> {
  return Promise.resolve(userRepository.find({
    select: ['email'],
    where: {
      lastSeen: Not(sessionTime),
      active: Not(0),
    },
  }));
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
    newMailPermSOB: '',
    lastSeen: sessionTime,
  });
  await userRepository.save(user);
}

/**
 * Get a user data from database
 * @param email - mail from to be retrieved user
 */
export async function checkUserDB(email: string): Promise<UserDataDB> {
  const dbUserData: UserDataDB = {
    exists: false,
    isActive: 0,
    inactiveCount: 0,
  };

  // Find first user with email
  const user: Users = await userRepository.findOneOrFail({
    where: {
      email: email,
    },
  });

  // Check if user exists, if not, return immediately
  if (user === undefined || user === null) {
    return dbUserData;
  } else {
    // Update last time user has been checked
    user.lastSeen = sessionTime;
    await userRepository.update(user.email, user);

    // Return information of user
    dbUserData.exists = true;
    dbUserData.isActive = user.active;
    dbUserData.inactiveCount = user.inactiveCount;
    return dbUserData;
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
  const user: Users = await userRepository.findOneOrFail({
    where: {
      email: email,
    },
  });
  // Set new activity of user
  user.active = active;
  user.inactiveCount = inactiveCount;
  await userRepository.update(user.email, user);
}

/**
 * Update user's SOB
 * @param email - email of user
 * @param SOBEmail - acl to check
 */
export async function createSOBDB(email: string, SOBEmail: string): Promise<void> {
  // Retrieve user with email
  const user: Users = await userRepository.findOneOrFail({
    where: {
      email: email,
    },
  });

  // Check if permissions for ACL are set
  const SOB = !user.newMailPermSOB ? [] : user.newMailPermSOB.split(';');

  // Check if sob mail is in list (it should not be, but checking does not hurt)
  if (SOB.indexOf(SOBEmail) === -1) {
    SOB.push(SOBEmail);
    user.newMailPermSOB = SOB.join(';');
    await userRepository.update(user.email, user);
  }
}

export async function getChangedSOBDB(): Promise<Users[]> {
  // First, check all users that actually have changed
  const users = await userRepository.find();
  const changedUsers : Users[] = [];

  for (const user of users) {
    if (user.newMailPermSOB != user.mailPermSOB) {
      console.log(`SOB of ${user.email} changed from ${user.mailPermSOB} to ${user.newMailPermSOB}`);
      user.mailPermSOB = user.newMailPermSOB;
      changedUsers.push(user);
    }
    user.newMailPermSOB = '';
    await userRepository.update(user.email, user);
  }

  return changedUsers;
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
    newUsers: [],
    removedUsers: [],
  };

  // Find first user with email
  const user: Users = await userRepository.findOneOrFail({
    where: {
      email: email,
    },
  });

  // Get existing permissions from mailbox
  if (!newUsers) newUsers = [];
  if (!Array.isArray(newUsers)) newUsers = [newUsers];

  const removedUsers = !user ? [] : user[permission].split(';');

  // Filter for new users, also filter empty entries
  updatedUsers.newUsers = newUsers.filter(x => !removedUsers.includes(x) && x != '');
  updatedUsers.removedUsers = removedUsers.filter(x => !newUsers.includes(x) && x != '');

  // Put new user list in database
  user[permission] = newUsers.join(';');
  await userRepository.update(user.email, user);

  return updatedUsers;
}
