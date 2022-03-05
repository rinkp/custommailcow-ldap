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

export type ActiveUserSetting = 0 | 1 | 2;