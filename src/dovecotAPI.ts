import axios, {AxiosInstance} from "axios";
import {
    ContainerConfig,
    DoveadmExchangeResult,
    DoveadmExchanges, DoveadmRequestData,
    DoveadmRights,
    MailcowPermissions
} from "./types";

let dovecotClient: AxiosInstance;

export async function initializeDovecotAPI(config: ContainerConfig): Promise<void> {
    dovecotClient = axios.create({
        // baseURL: `${config.DOVEADM_API_HOST}/doveadm/v1`,
        baseURL: 'http://172.22.1.250:9000/doveadm/v1',
        headers: {
            'Content-Type': 'text/plain',
            'Authorization': `X-Dovecot-API ${Buffer.from(config.DOVEADM_API_KEY).toString('base64')}`
        }
    });
}

/**
 * Get all mailboxes of an email
 * @param email - email to get all inboxes from
 */
async function getMailboxes(email: string): Promise<string[]> {
    // Get all mailboxes
    const response = (await dovecotClient.post(
        '',
        [[
            "mailboxList",
            {
                "user": email
            },
            `mailboxList_${email}`
        ]]
    )).data as DoveadmExchanges

    // Convert response to array of mailboxes
    const mailboxObjects : DoveadmRequestData = response[0][1]
    return mailboxObjects.filter(function(item : DoveadmExchangeResult){
        return !item.mailbox.startsWith("Shared")
    }).map((item : DoveadmExchangeResult) => {
        return item.mailbox;
    });
}

/**
 * Set read and write permissions in doveadm
 * @param email - mailbox for which permissions should be set
 * @param users - users that will be getting permissions to email
 * @param type - permissions that will be set
 * @param remove - whether permissions should be removed or added
 */
export async function setMailPerm(email: string, users: string[], type: MailcowPermissions, remove: boolean) {
    let mailboxes: string[] = [];

    let tag;
    if (type == MailcowPermissions.mailPermROInbox) {
        mailboxes = mailboxes.concat(['INBOX', 'Inbox']);
        tag = "PermROInbox"
    }

    if (type == MailcowPermissions.mailPermROSent) {
        if (tag === null) {
            tag = "PermROSent"
        } else {
            tag = "PermROInboxSent"
        }
        mailboxes.push('Sent');
    }

    if (type == MailcowPermissions.mailPermRO || MailcowPermissions.mailPermRW) {
        mailboxes = await getMailboxes(email);
        tag = "PermRO"
    }

    // Create one big request for all mailboxes and users that should be added
    const requests = []
    for (const mailbox of mailboxes) {
        for (const user of users) {
            let rights = [
                DoveadmRights.lookup,
                DoveadmRights.read,
                DoveadmRights.write,
                DoveadmRights.write_seen,
            ]

            if (type === MailcowPermissions.mailPermRW) {
                rights = rights.concat([
                    DoveadmRights.write_deleted,
                    DoveadmRights.insert,
                    DoveadmRights.post,
                    DoveadmRights.expunge,
                    DoveadmRights.create,
                    DoveadmRights.delete
                ])
            }

            const request : DoveadmRequestData = [
                // Check if users should be removed or added
                remove ? 'aclRemove' : 'aclSet',
                {
                    'user': email,
                    'id': `user=${user}`,
                    'mailbox': mailbox,
                    'right': rights
                },
                type === MailcowPermissions.mailPermRW ? `PermRW_${email}_${user}` : `${tag}_${email}_${user}`
            ]

            requests.push(request)
        }
    }

    // Post request
    await dovecotClient.post(
        '', requests
    );
}


