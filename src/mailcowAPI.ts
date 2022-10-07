import MailCowClient from "ts-mailcow-api";
import {
    ACLEditRequest,
    MailboxDeleteRequest,
    MailboxEditRequest,
    MailboxPostRequest
} from "ts-mailcow-api/src/types";
import * as https from "https";
import {UserDataAPI, ContainerConfig} from "./types";
import {Mailbox} from "ts-mailcow-api/dist/types";

// Create MailCowClient based on BASE_URL and API_KEY
let mailcowClient: MailCowClient = undefined;

// Set password length
const passwordLength = 32;

/**
 * Initialize database connection. Setup database if it does not yet exist
 */
export async function initializeMailcowAPI(config: ContainerConfig): Promise<void> {
    mailcowClient = new MailCowClient(config['API_HOST'], config['API_KEY'], {httpsAgent: new https.Agent({keepAlive: true})});
}

/**
 * Generate random password
 * @param length - length of random password
 */
function generatePassword(length: number): string {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength: number = characters.length;
    for (let i = 0; i < length; i++) result += characters.charAt(Math.floor(Math.random() * charactersLength));
    return result;
}

/**
 * Add a user to Mailcow
 * @param email - email of the new user
 * @param name - name of the new user
 * @param active - activity of the new user
 * @param quotum - mailbox size of the new user
 */
export async function addUserAPI(email: string, name: string, active: number, quotum: number): Promise<void> {
    // Generate password
    const password: string = generatePassword(passwordLength);

    // Set details of the net mailbox
    const mailboxData: MailboxPostRequest = {
        // Active: 0 = no incoming mail/no login, 1 = allow both, 2 = custom state: allow incoming mail/no login
        'active': active,
        'force_pw_update': false,
        'local_part': email.split('@')[0],
        'domain': email.split('@')[1],
        'name': name,
        'quota': quotum,
        'password': password,
        'password2': password,
        'tls_enforce_in': false,
        'tls_enforce_out': false,
    };

    // Create mailbox
    await mailcowClient.mailbox.create(mailboxData);

    // Set ACL data of new mailbox
    const aclData: ACLEditRequest = {
        'items': email,
        'attr': {
            'user_acl': [
                "spam_alias",
                //"tls_policy",
                "spam_score",
                "spam_policy",
                "delimiter_action",
                // "syncjobs",
                // "eas_reset",
                // "sogo_profile_reset",
                "quarantine",
                // "quarantine_attachments",
                "quarantine_notification",
                // "quarantine_category",
                // "app_passwds",
                // "pushover"
            ]
        }
    };

    // Adjust ACL data of new mailbox
    await mailcowClient.mailbox.editUserACL(aclData);
}

/**
 * Edit user in Mailcow
 * @param email - email of user to be edited
 * @param options - options to be edited
 */
// Todo add send from ACLs
export async function editUserAPI(email: string, options?: { active?: number, name?: string, sender_acl?: string[] }): Promise<void> {
    const mailboxData: MailboxEditRequest = {
        'items': [email],
        'attr': options
    };
    await mailcowClient.mailbox.edit(mailboxData);
}

/**
 * Delete user from Mailcow
 * @param email
 */
export async function deleteUserAPI(email: string): Promise<void> {
    const mailboxData: MailboxDeleteRequest = {
        'mailboxes': [email],
    };
    await mailcowClient.mailbox.delete(mailboxData);
}

/**
 * Check if user exists in Mailcow
 * @param email - email of user
 */
export async function checkUserAPI(email: string): Promise<UserDataAPI> {
    const userData: UserDataAPI = {
        exists: false,
        isActive: 0,
    };

    // Get mailbox data from user with email
    const mailboxData: Mailbox = (await mailcowClient.mailbox.get(email)
        .catch(e => {
            throw new Error(e)
        }))[0]

    // If no data, return immediately, otherwise return response data
    if (mailboxData) {
        userData['exists'] = true
        userData['isActive'] = mailboxData['active_int']
        userData['displayName'] = mailboxData['name']
    }

    return userData
}
