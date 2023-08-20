import { Repository, Not, DataSource } from 'typeorm';
import { Users } from './entities/User';
import fs from 'fs';
import { ActiveDirectoryPermissions, ChangedUsers, ActiveUserSetting, LocalUserData } from './types';
import { sessionTime } from './index';

let localUserRepository: Repository<Users>;
let dataSource: DataSource;

/**
 * Initialize database connection. Setup database if it does not yet exist
 */
export async function initializeLocalUserDatabase(): Promise<void> {
  if (!fs.existsSync('./db/ldap-mailcow.sqlite3'))
    fs.writeFileSync('./db/ldap-mailcow.sqlite3', '');

  dataSource = new DataSource({
    type: 'sqlite',
    database: './db/ldap-mailcow.sqlite3',
    entities: [
      Users,
    ],
    synchronize: true,
  });

  dataSource.initialize().catch((error) => console.log(error));
  localUserRepository = dataSource.getRepository(Users);
}


/**
 * Get all users from DB that have not been checked in current session but are active
 */
export async function getUncheckedLocalActiveUsers(): Promise<Users[]> {
  return Promise.resolve(localUserRepository.find({
    select: ['email'],
    where: {
      lastSeen: Not(sessionTime),
      active: Not(0),
    },
  }));
}


/**
 * Add a user to the local database
 * @param mail - mail entry in the database
 * @param displayName - display name of the user
 * @param active - whether user is active
 */
export async function createLocalUser(mail: string, displayName: string, active: ActiveUserSetting): Promise<void> {
  const user: Users = Object.assign(new Users(), {
    email: mail,
    active: active,
    displayName: displayName,
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
  await localUserRepository.save(user);
}


/**
 * Get a user data from database
 * @param mail - mail from to be retrieved user
 */
export async function getLocalUser(mail: string): Promise<LocalUserData> {
  const localUserData: LocalUserData = {
    exists: false,
    displayName: '',
    isActive: 0,
    inactiveCount: 0,
  };

  const localUser: Users | null = await localUserRepository.findOne({
    where: {
      email: mail,
    },
  });

  if (localUser === null) {
    return localUserData;
  } else {
    localUser.lastSeen = sessionTime;
    await localUserRepository.update(localUser.email, localUser);

    localUserData.exists = true;
    localUserData.displayName = localUser.displayName;
    localUserData.isActive = localUser.active;
    localUserData.inactiveCount = localUser.inactiveCount;
    return localUserData;
  }
}


/**
 * Change user activity status in the local database
 * @param mail - email of user
 * @param active - activity of user
 * @param inactiveCount - number of times user has been inactive
 */
export async function updateLocalUserActivity(mail: string, active: ActiveUserSetting, inactiveCount: number): Promise<void> {
  const user: Users = await localUserRepository.findOneOrFail({
    where: {
      email: mail,
    },
  });
  user.active = active;
  user.inactiveCount = inactiveCount;
  await localUserRepository.update(user.email, user);
}


/**
 * Change user display name in the local database
 * @param mail - email of user
 * @param displayName - display name to be set
 */
export async function editLocalUserDisplayName(mail: string, displayName: string): Promise<void> {
  const user: Users = await localUserRepository.findOneOrFail({
    where: {
      email: mail,
    },
  });
  user.displayName = displayName;
  await localUserRepository.update(user.email, user);
}


/**
 * Update user's SOB in the local database
 * @param mail - email of user
 * @param SOBEmail - email to check SOB for
 */
export async function editLocalUserPermissions(mail: string, SOBEmail: string): Promise<void> {
  const user: Users = await localUserRepository.findOneOrFail({
    where: {
      email: mail,
    },
  });

  // Check if permissions for ACL are set
  const SOB: string[] = !user.newMailPermSOB ? [] : user.newMailPermSOB.split(';');

  // Check if sob mail is in list (it should not be, but checking does not hurt)
  if (SOB.indexOf(SOBEmail) === -1) {
    SOB.push(SOBEmail);
    user.newMailPermSOB = SOB.join(';');
    await localUserRepository.update(user.email, user);
  }
}


/**
 * Get all local users of which the SOB has changed in this session
 */
export async function getUpdateSOBLocalUsers(): Promise<Users[]> {
  const users: Users[] = await localUserRepository.find();
  const changedUsers : Users[] = [];

  for (const user of users) {
    if (user.newMailPermSOB != user.mailPermSOB) {
      console.log(`SOB of ${user.email} changed from ${user.mailPermSOB} to ${user.newMailPermSOB}.`);
      user.mailPermSOB = user.newMailPermSOB;
      changedUsers.push(user);
    }
    user.newMailPermSOB = '';
    await localUserRepository.update(user.email, user);
  }

  return changedUsers;
}


/**
 * Update local user permissions
 * @param mail - email of user
 * @param newUsers - acl to check
 * @param permission - type of permission to change
 */
export async function updateLocalUserPermissions(mail: string, newUsers: string[], permission: ActiveDirectoryPermissions): Promise<ChangedUsers> {
  const changedUsers: ChangedUsers = {
    newUsers: [],
    removedUsers: [],
  };

  const user: Users = await localUserRepository.findOneOrFail({
    where: {
      email: mail,
    },
  });

  // Sometimes, new users can be null or a singular item
  if (!newUsers) newUsers = [];
  if (!Array.isArray(newUsers)) newUsers = [newUsers];

  // Filter for users, also filter empty entries
  const removedUsers : string[] = !user ? [] : user[permission].split(';');
  changedUsers.newUsers = newUsers.filter((innerUser: string) => !removedUsers.includes(innerUser) && innerUser != '');
  changedUsers.removedUsers = removedUsers.filter((innerUser: string) => !newUsers.includes(innerUser) && innerUser != '');
  user[permission] = newUsers.join(';');
  await localUserRepository.update(user.email, user);

  return changedUsers;
}
