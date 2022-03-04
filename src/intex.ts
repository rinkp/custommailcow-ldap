import { Client } from 'ldapts';
import {set_session_time} from "./filedb";
import {replaceInFile} from 'replace-in-file'
import fs from 'fs'
import path from "path";

// type config

let config : any;

async function initialization() {
    read_config()

    let passdb_conf = read_dovecot_passdb_conf_template();
    let plist_ldap = read_sogo_plist_ldap_template();
    let extra_conf = fs.readFileSync('templates/dovecot/extra.conf');

    let passdb_conf_changed = apply_config('conf/dovecot/ldap/passdb.conf', passdb_conf)
    let extra_conf_changed = apply_config('conf/dovecot/extra.conf', extra_conf)
    let plist_ldap_changed = apply_config('conf/sogo/plist_ldap', plist_ldap)

    if (passdb_conf_changed || extra_conf_changed || plist_ldap_changed)
        console.log("One or more config files have been changed, please make sure to restart dovecot-mailcow and sogo-mailcow!")


    // while (true) {
        sync()
        // let interval = parseInt(config['SYNC_INTERVAL'])
        // console.log(`Sync finished, sleeping ${interval} seconds before next cycle`)
        // await delay(interval)
    // }

}

initialization().then(r => console.log("Finished!"))

function delay(ms: number) {
    return new Promise( resolve => setTimeout(resolve, ms) );
}

async function sync() {
    let ldap_connector = new Client({
        url: config['LDAP_URI'],
    })
    await ldap_connector.bind(config['LDAP_BIND_DN'], config['LDAP_BIND_DN_PASSWORD'])

    let ldap_results = ldap_connector.search(config['LDAP_BASE_DN'],{
        scope: 'sub',
        filter: config['LDAP_FILTER']
        // TODO -> wat hiermee doen?
        // ['mail', 'displayName', 'userAccountControl']
    })

    set_session_time()
    console.log(ldap_results)
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

    for (let config_key in required_config_keys) {
        if (!(config_key in process.env)) throw new Error(`Required environment value ${config_key} is not set`)
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
            let zero_filled = ('000' + backup_index).substring(-3);
            backup_file = `${config_file}.ldap_mailcow_bak.${zero_filled}`;
            backup_index++;
        }

        fs.renameSync(config_file, backup_file)
        console.log(`Backed up ${config_file} to ${backup_file}`)
    }

    fs.mkdirSync(path.dirname(config_file), { recursive: true})
    fs.writeFileSync(config_file, config_data)

    console.log(`Saved generated config file to ${config_file}`)
    return true
}

async function read_dovecot_passdb_conf_template() {
    const options = {
        files: 'templates/dovecot/ldap/passdb.conf',
        from: ['$ldap_gc_uri', '$ldap_domain', '$ldap_domain', '$ldap_bind_dn', '$ldap_bind_dn_password'],
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
        files: 'templates/sogo/plist_ldap',
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