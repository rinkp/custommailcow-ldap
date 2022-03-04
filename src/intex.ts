import { Client } from 'ldapts';

// type config

let config : any;

function initialization() {
    read_config()
}

initialization()

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

    // TODO -> session time in filedb zetten?

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