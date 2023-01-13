import axios, { AxiosInstance } from "axios";
import {
    ContainerConfig,
    DoveadmExchangeResult,
    DoveadmExchanges,
    DoveadmRights,
    MailcowPermissions
} from "./types";

let dovecotClient: AxiosInstance;

export async function initializeDovecotAPI(config: ContainerConfig): Promise<void> {
    dovecotClient = axios.create({
        // baseURL: `${config.DOVEADM_API_HOST}/doveadm/v1`,
        baseURL: 'http://172.22.1.250:9000/doveadm/v1',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `X-Dovecot-API ${config.DOVEADM_API_KEY}`
        }
    });
}

/**
 * Get all mailboxes of an email
 * @param email - email to get all inboxes from
 */
async function getMailboxes(email: string): Promise<string[]> {
    // Get all mailboxes
    // const response = (await dovecotClient.post(
    //     '',
    //     [[
    //         "mailboxList",
    //         {
    //             "user": email
    //         },
    //         `mailboxList_${email}`
    //     ]]
    // )) as DoveadmExchanges
    // // Convert response to array of mailboxes
    // return response.doveadmExchange[0].doveadmRequestData.data.map((item) => {
    //     return item.mailbox;
    // });
    return ["test"];
}

/**
 * Set read and write permissions in doveadm
 * @param email - mailbox for which permissions should be set
 * @param users - users that will be getting permissions to email
 * @param type - permissions that will be set
 * @param remove - whether permissions should be removed or added
 */
export async function setMailPerm(email: string, users: string[], type: MailcowPermissions, remove: boolean) {
    // let mailboxes;
    // if (type == MailcowPermissions.mailPermROInbox) {
    //     mailboxes = ['Inbox']
    // } else if (type == MailcowPermissions.mailPermROSent) {
    //     mailboxes = ['Sent']
    // } else {
    const mailboxes = await getMailboxes(email);
    // }

    console.log(mailboxes)

    // Create one big request for all mailboxes and users that should be added
    // const requests = []
    // for (const mailbox in mailboxes) {
    //     for (const user in users) {
    //         const request = [
    //             // Check if users should be removed or added
    //             remove ? 'actRemove' : 'aclSet',
    //             {
    //                 'user': email,
    //                 'id': `user=${user}`,
    //                 'mailbox': mailbox,
    //                 'right': [
    //                     DoveadmRights.lookup,
    //                     DoveadmRights.read,
    //                     DoveadmRights.write,
    //                     DoveadmRights.write_seen,
    //                 ]
    //             },
    //             // Give unique tag
    //             `PermRW_${email}_${user}`
    //         ]
    //         // If read and write permissions, add extra doveadm rights
    //         if (type == MailcowPermissions.mailPermRW) {
    //             (request[0] as DoveadmExchangeResult)['right'].concat([
    //                 DoveadmRights.write_deleted,
    //                 DoveadmRights.insert,
    //                 DoveadmRights.post,
    //                 DoveadmRights.expunge,
    //                 DoveadmRights.create,
    //                 DoveadmRights.delete,
    //             ])
    //         }
    //         requests.push(request)
    //     }
    // }

    // Post request
    // const response = await dovecotClient.post(
    //     '', requests
    // );
    // console.log(response)
}


