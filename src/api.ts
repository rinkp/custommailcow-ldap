import MailCowClient from "ts-mailcow-api";
import {
    ACLEditRequest,
    MailboxDeleteRequest,
    MailboxEditAttributes,
    MailboxEditRequest,
    MailboxPostRequest
} from "ts-mailcow-api/src/types";
import * as https from "https";

// Create MailCowClient based on BASE_URL and API_KEY
const mcc = new MailCowClient("https://webmail.gewis.nl/", "XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXXXX", {httpsAgent: new https.Agent({ keepAlive: true })});

// Set password length
const password_length = 32;

/**
 * Generate random password
 * @param length - length of random password
 */
function generatePassword(length: number) {
    let result = '';
    let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let charactersLength = characters.length;
    for (let i = 0; i < length; i++ ) result += characters.charAt(Math.floor(Math.random() * charactersLength));
    return result;
}

/**
 * Add a user to Mailcow
 * @param email - email of the new user
 * @param name - name of the new user
 * @param active - activity of the new user
 * @param quotum - mailbox size of the new user
 */
export async function addUserAPI(email: string, name: string, active: number, quotum: number) {
    // Generate password
    let password = generatePassword(password_length);

    // Set details of the net mailbox
    let mailbox_data : MailboxPostRequest = {
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
    let acl_data : ACLEditRequest = {
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
export async function editUserAPI(email: string, options?: { active?: number, name?: string }) {
    let mailbox_data : MailboxEditRequest = {
        'items': [email],
        'attr': options
    };
    await mcc.mailbox.edit(mailbox_data);
}

/**
 * Delete user from Mailcow
 * @param email
 */
export async function deleteUserAPI(email: string) {
    let mailbox_data : MailboxDeleteRequest = {
        'mailboxes': [email],
    };
    await mcc.mailbox.delete(mailbox_data);
}

interface Response {
    api_user_exists: boolean,
    api_user_active: number,
    api_name?: string,
}

/**
 * Check if user exists in Mailcow
 * @param email - email of user
 */
export async function checkUserAPI(email: string) {
    let response : Response = {
        api_user_exists: false,
        api_user_active: 0,
    };

    // Get mailbox data from user with email
    let mailbox_data = (await mcc.mailbox.get(email)
        .catch(e => {
            throw new Error(e)
        }))[0]

    // If no data, return immediately, otherwise return response data
    if (mailbox_data) {
        response['api_user_exists'] = true
        // TODO -> dit kan misschien nog steeds fout zijn omdat active_int een int representation is van boolean
        response['api_user_active'] = mailbox_data['active_int']
        response['api_name'] = mailbox_data['name']
    }

    return response
}