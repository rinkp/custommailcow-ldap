import {Client, DN} from 'ldapts';
import {
    initializeDB,
    setSessionTime,
    checkUserDB,
    addUserDB,
    activityUserDB, getUncheckedActiveUsers, updatePermissionsDB, resetUserChanged, updateSOBDB,
} from "./filedb";
import {replaceInFile, ReplaceInFileConfig} from 'replace-in-file'
import fs, {PathLike} from 'fs'
import path from "path";
import {SearchResult} from "ldapts/Client";
import {checkUserAPI, addUserAPI, editUserAPI, initializeAPI} from "./api";

import {MailcowPermissions, ACLResults, ActiveUserSetting, UserDataAPI, ContainerConfig, UserDataDB, LDAPResults} from "./types";

// Set all default variables
const config: ContainerConfig = {
    LDAP_URI: undefined,
    LDAP_BIND_DN: undefined,
    LDAP_BIND_DN_PASSWORD: undefined,
    LDAP_BASE_DN: undefined,
    LDAP_FILTER: '(&(objectClass=user)(objectCategory=person))',
    SOGO_LDAP_FILTER: "objectClass='user' AND objectCategory='person'",
    LDAP_GC_URI: undefined,
    LDAP_DOMAIN: undefined,
    API_HOST: undefined,
    API_KEY: undefined,
    SYNC_INTERVAL: undefined,
    DOVEADM_API_KEY: undefined
}

let LDAPConnector: Client;

async function initializeSync(): Promise<void> {
    // Read LDAP configuration
    readConfig()

    // Connect to LDAP server using config
    LDAPConnector = new Client({
        url: config['LDAP_URI'],
    })
    await LDAPConnector.bind(config['LDAP_BIND_DN'], config['LDAP_BIND_DN_PASSWORD'])

    // Adjust template files
    const passDBConfig: string = await readPassDBConfig();
    const pListLDAP: string = await readPListLDAP();
    // Read data in extra config file
    const extraConfig: string = await readDovecotExtraConfig();

    // Apply all config files, see if any changed
    const passDBConfigChanged: boolean = applyConfig('./conf/dovecot/ldap/passdb.conf', passDBConfig)
    const extraConfigChanged: boolean = applyConfig('./conf/dovecot/extra.conf', extraConfig)
    const pListLDAPChanged: boolean = applyConfig('./conf/sogo/plist_ldap', pListLDAP)

    if (passDBConfigChanged || extraConfigChanged || pListLDAPChanged)
    // eslint-disable-next-line max-len
    console.log("One or more config files have been changed, please make sure to restart dovecot-mailcow and sogo-mailcow!")

    // Start 'connection' with database
    await initializeDB()
    await initializeAPI(config)

    // Start sync loop every interval milliseconds
    while (true) {
        console.log("Resetting user changes")
        await resetUserChanged()
        console.log("Syncing users")
        await syncUsers()
        const interval = parseInt(config['SYNC_INTERVAL'])
        console.log(`Sync finished, sleeping ${interval} seconds before next cycle`)
        await delay(interval * 1000)
    }
}

initializeSync().then(() => console.log("Finished!"))

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Synchronise LDAP users with Mailcow mailboxes and users stores in local DB
 */
async function syncUsers(): Promise<void> {

    // Search for al users, use filter and only display few attributes
    const LDAPResults: SearchResult = await LDAPConnector.search(config['LDAP_BASE_DN'], {
        scope: 'sub',
        filter: config['LDAP_FILTER'],
        attributes: ['mail', 'displayName', 'userAccountControl', 'mailPermRO', 'mailPermRW',
            'mailPermROInbox', 'mailPermROSent', 'mailPermSOB']
    })

    // Update session time
    setSessionTime()

    // Loop over all LDAP entries
    for (const entry of LDAPResults['searchEntries'] as unknown as LDAPResults[]) {
        try {
            console.log("--------------------------------------")
            // Check if LDAP user has email, if not, skip
            if (!entry['mail'] || entry['mail'].length === 0) {
                continue;
            }

            // Read data from LDAP
            const email: string = entry['mail']
            const displayName: string = entry['displayName']
            // Active: 0 = no incoming mail/no login, 1 = allow both, 2 = custom state: allow incoming mail/no login
            const isActive: ActiveUserSetting = (entry['userAccountControl'] & 0b10) == 2 ? 2 : 1;

            // Read data of LDAP user van local DB and mailcow
            const userDataDB: UserDataDB = await checkUserDB(email)
            const userDataAPI: UserDataAPI = await checkUserAPI(email)

            let unchanged = true

            // Check if user exists in DB, if not, add user to DB
            if (!userDataDB['exists']) {
                console.log(`Added filedb user: ${email} (Active: ${isActive})`)
                await addUserDB(email, isActive)
                userDataDB['exists'] = true;
                userDataDB['isActive'] = isActive;
                unchanged = false
            }

            // Check if user exists in Mailcow, if not, add user to Mailcow
            if (!userDataAPI["exists"]) {
                console.log(`Added Mailcow user: ${email} (Active: ${isActive})`)
                await addUserAPI(email, displayName, isActive, 256)
                userDataAPI['exists'] = true
                userDataAPI['isActive'] = isActive
                userDataAPI['displayName'] = displayName
                unchanged = false
            }

            // Check if user is active in DB, if not, adjust accordingly
            if (userDataDB["isActive"] !== isActive) {
                console.log(`Set ${email} to active ${isActive} in filedb`)
                await activityUserDB(email, isActive)
                unchanged = false
            }

            // Check if user is active in Mailcow, if not, adjust accordingly
            if (userDataAPI["isActive"] !== isActive) {
                console.log(`Set ${email} to active ${isActive} in Mailcow`)
                await editUserAPI(email, {active: isActive})
                unchanged = false
            }

            // Check if user's name in Mailcow matches LDAP name, adjust accordingly
            if (userDataAPI["displayName"] !== displayName) {
                console.log(`Changed name of ${email} to ${displayName} in Mailcow`)
                await editUserAPI(email, {name: displayName})
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
    for (const user of await getUncheckedActiveUsers()) {
        try {
            // Get user data from Mailcow
            const userDataAPI: UserDataAPI = await checkUserAPI(user.email)

            // Check if user is still active, if so, deactivate user
            if (userDataAPI["isActive"]) {
                console.log(`Deactivated user ${user.email} in Mailcow, not found in LDAP`)
                await editUserAPI(user.email, {active: 0})
            }

            // Since user does not exist anymore, deactive user in filedb
            console.log(`Deactivated user ${user.email} in filedb, not found in LDAP`)
            await activityUserDB(user.email, 0)
        } catch (error) {
            console.log(`Exception throw during handling of ${user}: ${error}`)
        }
    }

    // for (const entry of LDAPResults['searchEntries'] as unknown as LDAPResults[]) {
    //     try {
    //         if (entry[MailcowPermissions.mailPermRO].length != 0)
    //             await syncUserPermissions(entry, MailcowPermissions.mailPermRO);
    //         if (entry[MailcowPermissions.mailPermRW].length != 0)
    //             await syncUserPermissions(entry, MailcowPermissions.mailPermRW);
    //         if (entry[MailcowPermissions.mailPermROInbox].length != 0)
    //             await syncUserPermissions(entry, MailcowPermissions.mailPermROInbox);
    //         if (entry[MailcowPermissions.mailPermROSent].length != 0)
    //             await syncUserPermissions(entry, MailcowPermissions.mailPermROSent);
    //
    //         if (entry[MailcowPermissions.mailPermSOB].length != 0) await syncUserSOB(entry);
    //     } catch (error) {
    //         console.log(entry)
    //         console.log(`Exception throw during handling of ${entry}: ${error}`)
    //     }
    // }

}

async function syncUserPermissions(entry: LDAPResults, type: MailcowPermissions) {
    const permissionResults: SearchResult = await LDAPConnector.search(entry[type], {
        scope: 'sub',
        attributes: ['memberFlattened']
    });
    updatePermissionsDB(entry['mail'],
        (permissionResults['searchEntries'][0] as unknown as LDAPResults)['memberFlattened'], type)
        .then((results: ACLResults) => {
            // console.log(results)
            // TODO add Sogo socket
            // https://doc.dovecot.org/admin_manual/doveadm_http_api/
            // http://172.22.1.250:9000 for Mailcow
        }
    )
}

async function syncUserSOB(entry: LDAPResults) {
    const SOBResults: SearchResult = await LDAPConnector.search(entry[MailcowPermissions.mailPermSOB], {
        scope: 'sub',
        attributes: ['memberFlattened']
    });
    // Construct list in database with DN of all committees they are in
    // Get existing list of committees, add new DN as string
    for (const members of SOBResults['searchEntries'] as unknown as LDAPResults[]) {
        for (const member of members['memberFlattened']) {
            const member_results: SearchResult = await LDAPConnector.search(member, {
                scope: 'sub',
                attributes: ['mail']
            });
            const member_mail = member_results['searchEntries'] as unknown as LDAPResults[];
            await updateSOBDB(member_mail[0]['mail'], entry['mail']);
        }
    }
}

/**
 * Impose the configuration of LDAP from the environment
 */
function readConfig(): void {
    // All required config keys
    const required_config_keys: string[] = [
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
    for (const config_key of required_config_keys) {
        if (!(config_key in process.env)) throw new Error(`Required environment value ${config_key} is not set`)
        console.log(`Required environment value ${config_key} has been set`)

        // Add keys to local config variable
        config[config_key.replace('LDAP-MAILCOW_', '') as keyof ContainerConfig] = process.env[config_key]
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
 * @param configPath - path to original config file
 * @param configData - data of new config file
 */
function applyConfig(configPath: PathLike, configData: string): boolean {
    // Check if path to config file exists
    if (fs.existsSync(configPath)) {
        // Read and compare original data from config with new data
        const oldConfig: string = fs.readFileSync(configPath, 'utf8')

        if (oldConfig.replace(/\s+/g, "*") === configData.replace(/\s+/g, "*")) {
            console.log(`Config file ${configPath} unchanged`)
            return false
        }

        // Backup the data
        let backupIndex = 1
        let backupFile = `${configPath}.ldap_mailcow_bak.000`
        // Find free filename for backup name
        while (fs.existsSync(backupFile)) {
            let prependZeroes: string = '000' + backupIndex;
            prependZeroes = prependZeroes.substring(prependZeroes.length - 3);
            backupFile = `${configPath}.ldap_mailcow_bak.${prependZeroes}`;
            backupIndex++;
        }
        // Rename original config file to backup name
        fs.renameSync(configPath, backupFile)
        console.log(`Backed up ${configPath} to ${backupFile}`)

        // Write new config file to config file location
        if (typeof configPath === "string") {
            fs.mkdirSync(path.dirname(configPath), {recursive: true})
        }
        fs.writeFileSync(configPath, configData)
    } else {
        console.log(`A problem occured when backing up ${configPath}`)
    }

    console.log(`Saved generated config file to ${configPath}`)
    return true
}

/**
 * Replace all variables in template file with new configuration
 */
async function readPassDBConfig(): Promise<string> {
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
async function readDovecotExtraConfig(): Promise<string> {
    const options: ReplaceInFileConfig = {
        files: './templates/dovecot/ldap/extra.conf',
        from: ['$doveadm_api_key'],
        to: [
            config['DOVEADM_API_KEY']
        ],
    };
    await replaceInFile(options)
    return fs.readFileSync('./templates/dovecot/ldap/extra.conf', 'utf8')
}

/**
 * Replace all variables in template file with new configuration
 */
async function readPListLDAP(): Promise<string> {
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
