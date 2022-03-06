import MailCowClient from "ts-mailcow-api";
import {
    ACLEditRequest,
    MailboxDeleteRequest,
    MailboxEditRequest,
    MailboxPostRequest
} from "ts-mailcow-api/src/types";
import * as https from "https";
import {APIUserData} from "./types";
import {Mailbox} from "ts-mailcow-api/dist/types";

// Create MailCowClient based on BASE_URL and API_KEY
const mcc: MailCowClient = new MailCowClient("https://webmail.gewis.nl/", "XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXXXX", {httpsAgent: new https.Agent({keepAlive: true})});

// Set password length
const password_length: number = 32;

/**
 * Generate random password
 * @param length - length of random password
 */
function generatePassword(length: number): string {
    let result: string = '';
    let characters: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let charactersLength: number = characters.length;
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
// Todo return boolean?
export async function addUserAPI(email: string, name: string, active: number, quotum: number): Promise<void> {
    // Generate password
    let password: string = generatePassword(password_length);

    // Set details of the net mailbox
    let mailbox_data: MailboxPostRequest = {
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
    await mcc.mailbox.create(mailbox_data);

    // Set ACL data of new mailbox
    let acl_data: ACLEditRequest = {
        'items': email,
        'attr': {
            'user_acl': [
                "spam_alias",
                "tls_policy",
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
    await mcc.mailbox.editUserACL(acl_data);
}

/**
 * Edit user in Mailcow
 * @param email - email of user to be edited
 * @param options - options to be edited
 */
// Todo add send from ACLs
// Todo return boolean?
export async function editUserAPI(email: string, options?: { active?: number, name?: string }): Promise<void> {
    let mailbox_data: MailboxEditRequest = {
        'items': [email],
        'attr': options
    };
    await mcc.mailbox.edit(mailbox_data);
}

/**
 * Delete user from Mailcow
 * @param email
 */
// Todo return boolean?
export async function deleteUserAPI(email: string): Promise<void> {
    let mailbox_data: MailboxDeleteRequest = {
        'mailboxes': [email],
    };
    await mcc.mailbox.delete(mailbox_data);
}

/**
 * Check if user exists in Mailcow
 * @param email - email of user
 */
export async function checkUserAPI(email: string): Promise<APIUserData> {
    let api_user_data: APIUserData = {
        api_user_exists: false,
        api_user_active: 0,
    };

    // Get mailbox data from user with email
    let mailbox_data: Mailbox = (await mcc.mailbox.get(email)
        .catch(e => {
            throw new Error(e)
        }))[0]

    // If no data, return immediately, otherwise return response data
    if (mailbox_data) {
        api_user_data['api_user_exists'] = true
        // TODO -> dit kan misschien nog steeds fout zijn omdat active_int een int representation is van boolean
        api_user_data['api_user_active'] = mailbox_data['active_int']
        api_user_data['api_name'] = mailbox_data['name']
    }

    return api_user_data
}