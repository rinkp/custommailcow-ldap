import {Client} from 'ldapts';
import {
    initializeDatabase,
    setSessionTime,
    checkUserFileDB,
    addUserFileDB,
    userSetActiveToFileDB, getUncheckedActiveUsers
} from "./filedb";
import {replaceInFile, ReplaceInFileConfig} from 'replace-in-file'
import fs, {PathLike} from 'fs'
import path from "path";
import {SearchResult} from "ldapts/Client";
import {checkUserAPI, addUserAPI, editUserAPI} from "./api";

import {ActiveUserSetting, APIUserData, Config, DBUserData} from "./types";

// Set all default variables
let config: Config = {
    LDAP_URI: undefined,
    LDAP_BIND_DN: undefined,
    LDAP_BIND_DN_PASSWORD: undefined,
    LDAP_BASE_DN: undefined,
    LDAP_FILTER: '(&(objectClass=user)(objectCategory=person))',
    SOGO_LDAP_FILTER: "objectClass='user' AND objectCategory='person'",
    LDAP_GC_URI: undefined,
    LDAP_DOMAIN: undefined,
}

async function initialization(): Promise<void> {
    // Read LDAP configuration
    readConfig()

    // Adjust template files
    let passdb_conf: string = await read_dovecot_passdb_conf_template();
    let plist_ldap: string = await read_sogo_plist_ldap_template();
    // Read data in extra config file
    let extra_conf: string = fs.readFileSync('./templates/dovecot/extra.conf', 'utf8');

    // Apply all config files, see if any changed
    let passdb_conf_changed: boolean = apply_config('./conf/dovecot/ldap/passdb.conf', passdb_conf)
    let extra_conf_changed: boolean = apply_config('./conf/dovecot/extra.conf', extra_conf)
    let plist_ldap_changed: boolean = apply_config('./conf/sogo/plist_ldap', plist_ldap)

    if (passdb_conf_changed || extra_conf_changed || plist_ldap_changed)
        console.log("One or more config files have been changed, please make sure to restart dovecot-mailcow and sogo-mailcow!")

    // Start 'connection' with database
    await initializeDatabase()
    // Start sync loop every interval milliseconds
    // while (true) {
    await sync()
    // let interval = parseInt(config['SYNC_INTERVAL'])
    // console.log(`Sync finished, sleeping ${interval} seconds before next cycle`)
    // await delay(interval)
    // }
}

initialization().then(() => console.log("Finished!"))

// function delay(ms: number) {
//     return new Promise(resolve => setTimeout(resolve, ms));
// }

/**
 * Synchronise LDAP users with Mailcow mailboxes and users stores in local DB
 */
async function sync(): Promise<void> {
    // Connect to LDAP server using config
    let ldap_connector: Client = new Client({
        url: config['LDAP_URI'],
    })
    await ldap_connector.bind(config['LDAP_BIND_DN'], config['LDAP_BIND_DN_PASSWORD'])

    // Search for al users, use filter and only display few attributes
    let ldap_results: SearchResult = await ldap_connector.search(config['LDAP_BASE_DN'], {
        scope: 'sub',
        filter: config['LDAP_FILTER'],
        attributes: ['mail', 'displayName', 'userAccountControl']
    })

    // Update session time
    setSessionTime()

    // Loop over all LDAP entries
    // TODO how to type entry as LDAP result? -> Make LDAP interface?
    for (let entry of ldap_results['searchEntries']) {
        try {
            // Check if LDAP user has email, if not, skip
            if (!entry['mail'] || entry['mail'].length === 0) {
                continue;
            }

            console.log("--------------------------------------")
            // Read data from LDAP
            let email: string = (entry as any)['mail']
            let ldap_name: string = (entry as any)['displayName']
            // Active: 0 = no incoming mail/no login, 1 = allow both, 2 = custom state: allow incoming mail/no login
            let ldap_active: ActiveUserSetting = ((entry as any)['userAccountControl'][0] & 0b10) ? 2 : 1;

            // Read data of LDAP user van local DB and mailcow
            let db_user_data: DBUserData = await checkUserFileDB(email)
            let api_user_data: APIUserData = await checkUserAPI(email)

            let unchanged: boolean = true

            // Check if user exists in DB, if not, add user to DB
            if (!db_user_data['db_user_exists']) {
                console.log(`Added filedb user: ${email} (Active: ${ldap_active})`)
                await addUserFileDB(email, ldap_active)
                db_user_data['db_user_exists'] = true;
                db_user_data['db_user_active'] = ldap_active;
                unchanged = false
            }

            // Check if user exists in Mailcow, if not, add user to Mailcow
            if (!api_user_data["api_user_exists"]) {
                console.log(`Added Mailcow user: ${email} (Active: ${ldap_active})`)
                await addUserAPI(email, ldap_name, ldap_active, 256)
                api_user_data['api_user_exists'] = true
                api_user_data['api_user_active'] = ldap_active
                api_user_data['api_name'] = ldap_name
                unchanged = false
            }

            // Check if user is active in DB, if not, adjust accordingly
            if (db_user_data["db_user_active"] !== ldap_active) {
                console.log(`Set ${email} to active ${ldap_active} in filedb`)
                await userSetActiveToFileDB(email, ldap_active)
                unchanged = false
            }

            // Check if user is active in Mailcow, if not, adjust accordingly
            if (api_user_data["api_user_active"] !== ldap_active) {
                console.log(`Set ${email} to active ${ldap_active} in Mailcow`)
                await editUserAPI(email, {active: ldap_active})
                unchanged = false
            }

            // Check if user's name in Mailcow matches LDAP name, adjust accordingly
            if (api_user_data["api_name"] !== ldap_name) {
                console.log(`Changed name of ${email} to ${ldap_name} in Mailcow`)
                await editUserAPI(email, {name: ldap_name})
                unchanged = false;
            }

            if (unchanged) {
                console.log(`Checked user ${email}, no changes needed`)
            }
        } catch (error) {
            console.log(`Exception throw during handling of ${entry}: ${error}`)
        }
    }

    // Check all users in DB that have not yet been checked and are active
    for (let user of await getUncheckedActiveUsers()) {
        try {
            // Get user data from Mailcow
            let api_user_data: APIUserData = await checkUserAPI(user.email)

            // Check if user is still active, if so, deactivate user
            if (api_user_data["api_user_active"]) {
                console.log(`Deactivated user ${user.email} in Mailcow, not found in LDAP`)
                await editUserAPI(user.email, {active: 0})
            }

            // Since user does not exist anymore, deactive user in filedb
            console.log(`Deactivated user ${user.email} in filedb, not found in LDAP`)
            await userSetActiveToFileDB(user.email, 0)
        } catch (error) {
            console.log(`Exception throw during handling of ${user}: ${error}`)
        }
    }

}

/**
 * Impose the configuration of LDAP from the environment
 */
function readConfig(): void {
    // All required config keys
    let required_config_keys: string[] = [
        'LDAP-MAILCOW_LDAP_URI',
        'LDAP-MAILCOW_LDAP_GC_URI',
        'LDAP-MAILCOW_LDAP_DOMAIN',
        'LDAP-MAILCOW_LDAP_BASE_DN',
        'LDAP-MAILCOW_LDAP_BIND_DN',
        'LDAP-MAILCOW_LDAP_BIND_DN_PASSWORD',
        'LDAP-MAILCOW_API_HOST',
        'LDAP-MAILCOW_API_KEY',
        'LDAP-MAILCOW_SYNC_INTERVAL'
    ]

    // Check if all keys are set in the environment
    for (let config_key of required_config_keys) {
        if (!(config_key in process.env)) throw new Error(`Required environment value ${config_key} is not set`)
        console.log(`Required environment value ${config_key} has been set`)

        // Add keys to local config variable
        config[config_key.replace('LDAP-MAILCOW_', '') as keyof Config] = process.env[config_key]
    }

    // Check if Sogo filter is set
    if ('LDAP-MAILCOW_LDAP_FILTER' in process.env && !('LDAP-MAILCOW_SOGO_LDAP_FILTER' in process.env))
        throw new Error('LDAP-MAILCOW_SOGO_LDAP_FILTER is required when you specify LDAP-MAILCOW_LDAP_FILTER')

    // Check if Mailcow filter is set
    if ('LDAP-MAILCOW_SOGO_LDAP_FILTER' in process.env && !('LDAP-MAILCOW_LDAP_FILTER' in process.env))
        throw new Error('LDAP-MAILCOW_LDAP_FILTER is required when you specify LDAP-MAILCOW_SOGO_LDAP_FILTER')

    // Set Mailcow LDAP filter (has fallback value)
    if ('LDAP-MAILCOW_LDAP_FILTER' in process.env)
        config['LDAP_FILTER'] = process.env['LDAP-MAILCOW_LDAP_FILTER']


    // Set Sogo LDAP filter (has fallback value)
    if ('LDAP-MAILCOW_SOGO_LDAP_FILTER' in process.env)
        config['SOGO_LDAP_FILTER'] = process.env['LDAP-MAILCOW_SOGO_LDAP_FILTER']

    console.log("Read and configured all environment varables")
}

/**
 * Compare, backup and save (new) config files
 * @param config_file_path - path to original config file
 * @param config_data - data of new config file
 */
function apply_config(config_file_path: PathLike, config_data: string): boolean {
    // Check if path to config file exists
    if (fs.existsSync(config_file_path)) {
        // Read and compare original data from config with new data
        let old_data: string = fs.readFileSync(config_file_path, 'utf8')
        if (old_data === config_data) {
            console.log(`Config file ${config_file_path} unchanged`)
            return false
        }

        // Backup the data
        let backup_index: number = 1
        let backup_file: string = `${config_file_path}.ldap_mailcow_bak.000`
        // Find free filename for backup name
        while (fs.existsSync(backup_file)) {
            let zero_filled: string = '000' + backup_index;
            zero_filled = zero_filled.substring(zero_filled.length - 3);
            backup_file = `${config_file_path}.ldap_mailcow_bak.${zero_filled}`;
            backup_index++;
        }
        // Rename original config file to backup name
        fs.renameSync(config_file_path, backup_file)
        console.log(`Backed up ${config_file_path} to ${backup_file}`)

        // Write new config file to config file location
        if (typeof config_file_path === "string") {
            fs.mkdirSync(path.dirname(config_file_path), {recursive: true})
        }
        fs.writeFileSync(config_file_path, config_data)
    } else {
        console.log(`A problem occured when backing up ${config_file_path}`)
    }

    console.log(`Saved generated config file to ${config_file_path}`)
    return true
}

/**
 * Replace all variables in template file with new configuration
 */
async function read_dovecot_passdb_conf_template(): Promise<string> {
    const options: ReplaceInFileConfig = {
        files: './templates/dovecot/ldap/passdb.conf',
        from: ['$ldap_gc_uri', '$ldap_domain', '$ldap_base_dn', '$ldap_bind_dn', '$ldap_bind_dn_password'],
        to: [
            config['LDAP_GC_URI'],
            config['LDAP_DOMAIN'],
            config['LDAP_BASE_DN'],
            config['LDAP_BIND_DN'],
            config['LDAP_BIND_DN_PASSWORD']
        ],
    };
    console.log("Adjust passdb_conf template file")
    await replaceInFile(options)
    return fs.readFileSync('./templates/dovecot/ldap/passdb.conf', 'utf8')
}

/**
 * Replace all variables in template file with new configuration
 */
async function read_sogo_plist_ldap_template(): Promise<string> {
    const options: ReplaceInFileConfig = {
        files: './templates/sogo/plist_ldap',
        from: ['$ldap_uri', '$ldap_base_dn', '$ldap_bind_dn', '$ldap_bind_dn_password', '$sogo_ldap_filter'],
        to: [
            config['LDAP_URI'],
            config['LDAP_BASE_DN'],
            config['LDAP_BIND_DN'],
            config['LDAP_BIND_DN_PASSWORD'],
            config['SOGO_LDAP_FILTER']
        ],
    };
    console.log("Adjust plist_ldap template file")
    await replaceInFile(options)
    return fs.readFileSync('./templates/sogo/plist_ldap', 'utf8')
}