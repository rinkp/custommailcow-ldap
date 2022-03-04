import MailCowClient from "ts-mailcow-api";
import {
    ACLEditRequest,
    MailboxDeleteRequest,
    MailboxEditAttributes,
    MailboxEditRequest,
    MailboxPostRequest
} from "ts-mailcow-api/src/types";

// Create MailCowClient based on BASE_URL and API_KEY
const mcc = new MailCowClient("https://demo.mailcow.email/", "390448-22B69F-FA37D9-19701B-6F033F");

// Set password length
const password_length = 32;

// Generate random alphanumerical password
function generate_password(length: number) {
    let result = '';
    let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let charactersLength = characters.length;
    for (let i = 0; i < length; i++ ) result += characters.charAt(Math.floor(Math.random() * charactersLength));
    return result;
}

/**
 *
 * @param email
 * @param name
 * @param active
 * @param quotum
 */
export async function add_user(email: string, name: string, active: number, quotum: number) {
    let password = generate_password(password_length);

    // TODO -> active moet nog een integer worden ipv boolean
    let mailbox_data : MailboxPostRequest = {
        // Active: 0 = no incoming mail/no login, 1 = allow both, 2 = custom state: allow incoming mail/no login
        'active': !!active,
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

    await mcc.mailbox.create(mailbox_data);

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

    await mcc.mailbox.editUserACL(acl_data);
}

/**
 *
 * @param email
 * @param active
 * @param name
 */
// Todo add send from ACLs
export async function edit_user(email: string, active?: number, name?: string) {
    let attr : Partial<MailboxEditAttributes> = {};
    // TODO -> active moet nog een integer worden ipv boolean
    if (active) attr['active'] = !!active;
    if (name) attr['name'] = name;

    let mailbox_data : MailboxEditRequest = {
        'items': [email],
        'attr': attr
    };

    await mcc.mailbox.edit(mailbox_data);
}

/**
 *
 * @param email
 */
export async function delete_user(email: string) {
    let mailbox_data : MailboxDeleteRequest = {
        'mailboxes': [email],
    };

    await mcc.mailbox.delete(mailbox_data);
}

/**
 *
 * @param email
 */
export async function check_user(email: string) {
    await mcc.mailbox.get(email)
        .catch(e => {
            // TODO -> afhankelijk of bovenliggende implementatie veranderd (gezien python code denk ik wel)
        })
}