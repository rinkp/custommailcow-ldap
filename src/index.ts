import {Client} from 'ldapts';
import {
    initialize_database,
    set_session_time,
    check_user_filedb,
    add_user_filedb,
    user_set_active_to_filedb, get_unchecked_active_users
} from "./filedb";
import {replaceInFile} from 'replace-in-file'
import fs from 'fs'
import path from "path";
import {SearchResult} from "ldapts/Client";
import {check_user_api, add_user_api, edit_user_api} from "./api";

let config: any = {}

async function initialization() {
    read_config()

    console.log("finished config")
    let passdb_conf = await read_dovecot_passdb_conf_template();
    console.log("finished passdb_conf")
    let plist_ldap = await read_sogo_plist_ldap_template();
    console.log("finished plist_ldap")
    let extra_conf = fs.readFileSync('./templates/dovecot/extra.conf');
    console.log("read extra_conf")

    let passdb_conf_changed = apply_config('./conf/dovecot/ldap/passdb.conf', passdb_conf)
    let extra_conf_changed = apply_config('./conf/dovecot/extra.conf', extra_conf)
    let plist_ldap_changed = apply_config('./conf/sogo/plist_ldap', plist_ldap)

    if (passdb_conf_changed || extra_conf_changed || plist_ldap_changed)
        console.log("One or more config files have been changed, please make sure to restart dovecot-mailcow and sogo-mailcow!")

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


type active_user = 0 | 1 | 2

async function sync() {
    let ldap_connector = new Client({
        url: config['LDAP_URI'],
    })
    await ldap_connector.bind(config['LDAP_BIND_DN'], config['LDAP_BIND_DN_PASSWORD'])

    let ldap_results: SearchResult = await ldap_connector.search(config['LDAP_BASE_DN'], {
        scope: 'sub',
        filter: config['LDAP_FILTER'],
        attributes: ['mail', 'displayName', 'userAccountControl']
    })

    set_session_time()
    await initialize_database()

    for (let entry of ldap_results['searchEntries']) {
        try {
            if (!entry['mail'] || entry['mail'].length === 0) {
                continue;
            }

            console.log("--------------------------------------")

            let email: string = (entry as any)['mail']
            let ldap_name: string = (entry as any)['displayName']
            // Active: 0 = no incoming mail/no login, 1 = allow both, 2 = custom state: allow incoming mail/no login
            let ldap_active: active_user = ((entry as any)['userAccountControl'][0] & 0b10) ? 2 : 1;

            let db_user_data = await check_user_filedb(email)
            let api_user_data = await check_user_api(email)

            let unchanged = true

            if (!db_user_data['db_user_exists']) {
                console.log(`Added filedb user: ${email} (Active: ${ldap_active})`)
                await add_user_filedb(email, ldap_active)
                db_user_data['db_user_exists'] = true;
                db_user_data['db_user_active'] = ldap_active;
                unchanged = false
            }

            if (!api_user_data["api_user_exists"]) {
                console.log(`Added Mailcow user: ${email} (Active: ${ldap_active})`)
                await add_user_api(email, ldap_name, ldap_active, 256)
                api_user_data['api_user_exists'] = true
                api_user_data['api_user_active'] = ldap_active
                api_user_data['api_name'] = ldap_name
                unchanged = false
            }

            if (db_user_data["db_user_active"] !== ldap_active) {
                console.log(`Set ${email} to active ${ldap_active} in filedb`)
                await user_set_active_to_filedb(email, ldap_active)
                unchanged = false
            }

            if (api_user_data["api_user_active"] !== ldap_active) {
                console.log(`Set ${email} to active ${ldap_active} in Mailcow`)
                await edit_user_api(email, {active: ldap_active})
                unchanged = false
            }

            if (api_user_data["api_name"] !== ldap_name) {
                console.log(`Changed name of ${email} to ${ldap_name} in Mailcow`)
                await edit_user_api(email, {name: ldap_name})
                unchanged = false;
            }

            if (unchanged) {
                console.log(`Checked user ${email}, no changes needed`)
            }
        } catch (error) {
            console.log(`Exception throw during handling of ${entry}: ${error}`)
        }
    }

    for (let user of await get_unchecked_active_users()) {
        try {
            let api_user_data = await check_user_api(user.email)
            console.log(api_user_data)

            if (api_user_data["api_user_active"]) {
                console.log(`Deactivated user ${user.email} in Mailcow, not found in LDAP`)
                await edit_user_api(user.email, {active: 0})
            }
            console.log(`Deactivated user ${user.email} in filedb, not found in LDAP`)
            await user_set_active_to_filedb(user.email, 0)
        } catch (error) {
            console.log(`Exception throw during handling of ${user}: ${error}`)
        }
    }

}

function read_config() {
    let required_config_keys = [
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

    for (let config_key of required_config_keys) {
        if (!(config_key in process.env)) throw new Error(`Required environment value ${config_key} is not set`)
        console.log(`Required environment value ${config_key} has been set`)

        config[config_key.replace('LDAP-MAILCOW_', '')] = process.env[config_key]
    }

    if ('LDAP-MAILCOW_LDAP_FILTER' in process.env && !('LDAP-MAILCOW_SOGO_LDAP_FILTER' in process.env))
        throw new Error('LDAP-MAILCOW_SOGO_LDAP_FILTER is required when you specify LDAP-MAILCOW_LDAP_FILTER')

    if ('LDAP-MAILCOW_SOGO_LDAP_FILTER' in process.env && !('LDAP-MAILCOW_LDAP_FILTER' in process.env))
        throw new Error('LDAP-MAILCOW_LDAP_FILTER is required when you specify LDAP-MAILCOW_SOGO_LDAP_FILTER')

    if ('LDAP-MAILCOW_LDAP_FILTER' in process.env) {
        config['LDAP_FILTER'] = process.env['LDAP-MAILCOW_LDAP_FILTER']
    } else {
        config['LDAP_FILTER'] = '(&(objectClass=user)(objectCategory=person))'
    }

    if ('LDAP-MAILCOW_SOGO_LDAP_FILTER' in process.env) {
        config['SOGO_LDAP_FILTER'] = process.env['LDAP-MAILCOW_SOGO_LDAP_FILTER']
    } else {
        config['SOGO_LDAP_FILTER'] = "objectClass='user' AND objectCategory='person'"
    }
}

function apply_config(config_file: any, config_data: any) {
    if (fs.existsSync(config_file)) {
        let old_data = fs.readFileSync(config_file)
        if (old_data === config_data) {
            console.log(`Config file ${config_file} unchanged`)
            return false
        }

        let backup_index = 1
        let backup_file = `${config_file}.ldap_mailcow_bak.000`
        while (fs.existsSync(backup_file)) {
            let zero_filled = '000' + backup_index;
            zero_filled = zero_filled.substring(zero_filled.length - 3);
            backup_file = `${config_file}.ldap_mailcow_bak.${zero_filled}`;
            backup_index++;
        }

        fs.renameSync(config_file, backup_file)
        console.log(`Backed up ${config_file} to ${backup_file}`)
    } else {
        console.log(`path ${config_file} does not exist`)
    }

    fs.mkdirSync(path.dirname(config_file), {recursive: true})
    fs.writeFileSync(config_file, config_data)

    console.log(`Saved generated config file to ${config_file}`)
    return true
}

async function read_dovecot_passdb_conf_template() {
    const options = {
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
    await replaceInFile(options)
}

async function read_sogo_plist_ldap_template() {
    const options = {
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
    await replaceInFile(options)
}