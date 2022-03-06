export interface Config {
    LDAP_URI: string,
    LDAP_BIND_DN: string,
    LDAP_BIND_DN_PASSWORD: string,
    LDAP_BASE_DN: string,
    LDAP_FILTER: string,
    SOGO_LDAP_FILTER: string,
    LDAP_GC_URI: string,
    LDAP_DOMAIN: string,
}

export interface DBUserData {
    db_user_exists: boolean
    db_user_active: number
}

export interface APIUserData {
    api_user_exists: boolean,
    api_user_active: number,
    api_name?: string,
}

export type ActiveUserSetting = 0 | 1 | 2;