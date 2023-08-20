import axios, { AxiosInstance } from 'axios';
import {
  DovecotData,
  DovecotRequestData,
  DovecotPermissions,
  ActiveDirectoryPermissions,
} from './types';
import { containerConfig } from './index';

let dovecotClient: AxiosInstance;

/**
 * Initialize the Dovecot API
 */
export async function initializeDovecotAPI(): Promise<void> {
  dovecotClient = axios.create({
    baseURL: 'http://172.22.1.250:9000/doveadm/v1',
    headers: {
      'Content-Type': 'text/plain',
      'Authorization': `X-Dovecot-API ${Buffer.from(containerConfig.DOVEADM_API_KEY).toString('base64')}`,
    },
  });
}

/**
 * Get all mailbox subfolders of a mail
 * @param mail - email to get all subfolders from
 */
async function getMailboxSubFolders(mail: string): Promise<string[]> {
  const mailboxData: DovecotData[] = ((await dovecotClient.post(
    '',
    [[
      'mailboxList',
      {
        'user': mail,
      },
      `mailboxList_${mail}`,
    ]],
  )).data)[0][1];

  let subFolders: string[] = [];
  for (let subFolder of mailboxData) {
    if (subFolder.mailbox.startsWith('Shared')) continue;
    subFolders.push(subFolder.mailbox);
  }

  return subFolders;
}

/**
 * Set read and write permissions in dovecot
 * @param mail - mail for which permissions should be set
 * @param users - users that will be getting permissions to the above mail
 * @param permission - permissions that will be set
 * @param removePermission - whether permissions should be removed or added
 */
export async function setDovecotPermissions(mail: string, users: string[], permission: ActiveDirectoryPermissions, removePermission: boolean) {
  let mailboxSubFolders: string[] = [];
  let permissionTag;

  if (permission == ActiveDirectoryPermissions.mailPermROInbox) {
    mailboxSubFolders = mailboxSubFolders.concat(['INBOX', 'Inbox']);
    permissionTag = 'PermROInbox';
  }

  if (permission == ActiveDirectoryPermissions.mailPermROSent) {
    if (permissionTag === null) {
      permissionTag = 'PermROSent';
    } else {
      permissionTag = 'PermROInboxSent';
    }
    mailboxSubFolders.push('Sent');
  }

  if (permission == ActiveDirectoryPermissions.mailPermRO || ActiveDirectoryPermissions.mailPermRW) {
    mailboxSubFolders = await getMailboxSubFolders(mail);
    permissionTag = 'PermRO';
  }

  // Dovecot API requests are very unclear and badly documented
  // The idea; you can create an array of requests and send it as one big request
  const dovecotRequests : DovecotRequestData[] = [];
  for (const subFolder of mailboxSubFolders) {
    for (const user of users) {

      let rights = [
        DovecotPermissions.lookup,
        DovecotPermissions.read,
        DovecotPermissions.write,
        DovecotPermissions.write_seen,
      ];

      if (permission === ActiveDirectoryPermissions.mailPermRW) {
        rights = rights.concat([
          DovecotPermissions.write_deleted,
          DovecotPermissions.insert,
          DovecotPermissions.post,
          DovecotPermissions.expunge,
          DovecotPermissions.create,
          DovecotPermissions.delete,
        ]);
      }

      const dovecotRequest: DovecotRequestData = [
        removePermission ? 'aclRemove' : 'aclSet',
        {
          'user': mail,
          'id': `user=${user}`,
          'mailbox': subFolder,
          'right': rights,
        },
        permission === ActiveDirectoryPermissions.mailPermRW ? `PermRW_${mail}_${user}` : `${permissionTag}_${mail}_${user}`,
      ];

      dovecotRequests.push(dovecotRequest);
    }
  }

  // There is a max size of the requests
  // Break them up in smaller pieces if necessary
  const dovecotMaxRequestSize: number = 25;
  if (dovecotRequests.length > dovecotMaxRequestSize) {
    for (let i: number = 0; i < dovecotMaxRequestSize; i += dovecotMaxRequestSize) {
      await dovecotClient.post(
        '', dovecotRequests.slice(i, i + dovecotMaxRequestSize),
      );
    }
  } else {
    await dovecotClient.post(
      '', dovecotRequests,
    );
  }
}


