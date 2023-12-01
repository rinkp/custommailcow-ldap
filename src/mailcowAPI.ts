import MailCowClient from 'ts-mailcow-api';
import {
  ACLEditRequest,
  MailboxEditRequest,
  MailboxPostRequest,
} from 'ts-mailcow-api/src/types';
import * as https from 'https';
import { MailcowUserData } from './types';
import {
  Mailbox,
  MailboxEditAttributes,
} from 'ts-mailcow-api/dist/types';
import { containerConfig } from './index';

const passwordLength: number = 32;
let mailcowClient: MailCowClient;

/**
 * Initialize database connection
 */
export async function initializeMailcowAPI(): Promise<void> {
  mailcowClient = new MailCowClient(
    containerConfig.API_HOST,
    containerConfig.API_KEY,
    {
      httpsAgent: new https.Agent({
        keepAlive: true,
      }),
    },
  );
}

/**
 * Generate random password
 * @param length - length of random password
 */
function generatePassword(length: number): string {
  let result: string = '';
  const characters: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charactersLength: number = characters.length;
  for (let i: number = 0; i < length; i++)
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  return result;
}

/**
 * Add a user to Mailcow
 * @param mail - mail of the new user
 * @param name - name of the new user
 * @param active - activity of the new user
 * @param quotum - mailbox size of the new user
 */
export async function createMailcowUser(mail: string, name: string, active: number, quotum: number): Promise<void> {
  const password: string = generatePassword(passwordLength);

  const mailboxData: MailboxPostRequest = {
    // Active: 0 = no incoming mail/no login, 1 = allow both, 2 = custom state: allow incoming mail/no login
    'active': active,
    'force_pw_update': false,
    'local_part': mail.split('@')[0],
    'domain': mail.split('@')[1],
    'name': name,
    'quota': quotum,
    'password': password,
    'password2': password,
    'tls_enforce_in': false,
    'tls_enforce_out': false,
  };

  await mailcowClient.mailbox.create(mailboxData);

  const aclData: ACLEditRequest = {
    'items': mail,
    'attr': {
      'user_acl': [
        'spam_alias',
        'spam_score',
        'spam_policy',
        'delimiter_action',
        'quarantine',
        'quarantine_notification',
      ],
    },
  };

  await mailcowClient.mailbox.editUserACL(aclData);
}

/**
 * Edit user in Mailcow
 * @param mail - mail of user to be edited
 * @param options - options to be edited
 */
export async function editMailcowUser(mail: string, options: Partial<MailboxEditAttributes>): Promise<void> {
  const mailboxData: MailboxEditRequest = {
    'items': [mail],
    'attr': options,
  };

  await mailcowClient.mailbox.edit(mailboxData);
}

/**
 * Check if user exists in Mailcow
 * @param mail - mail of user
 */
export async function getMailcowUser(mail: string): Promise<MailcowUserData> {
  const userData: MailcowUserData = {
    exists: false,
    isActive: 0,
  };

  // Should only find one user
  const mailboxData: Mailbox = (await mailcowClient.mailbox.get(mail))[0];

  if (!(Object.keys(mailboxData).length === 0 && mailboxData.constructor === Object)) {
    userData.exists = true;
    userData.isActive = mailboxData.active_int;
    userData.displayName = mailboxData.name;
  }

  return userData;
}
