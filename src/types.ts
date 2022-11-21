export interface ContainerConfig {
    LDAP_URI: string,
    LDAP_BIND_DN: string,
    LDAP_BIND_DN_PASSWORD: string,
    LDAP_BASE_DN: string,
    LDAP_FILTER: string,
    SOGO_LDAP_FILTER: string,
    LDAP_GC_URI: string,
    LDAP_DOMAIN: string,
    API_HOST: string,
    API_KEY: string,
    SYNC_INTERVAL: string,
    DOVEADM_API_KEY: string,
    DOVEADM_API_HOST: string
}

export interface UserDataDB {
    exists: boolean
    isActive: ActiveUserSetting
    inactiveCount: number
}

export interface UserDataAPI {
    exists: boolean,
    isActive: number,
    displayName?: string,
}

export interface LDAPResults {
    mail?: string
    displayName?: string
    userAccountControl?: number
    mailPermRO?: string
    mailPermRW?: string
    mailPermROInbox?: string
    mailPermROSent?: string
    mailPermSOB?: string
    memberFlattened?: string[]
}

export enum MailcowPermissions {
    mailPermRO = "mailPermRO",
    mailPermRW = "mailPermRW",
    mailPermROInbox = "mailPermROInbox",
    mailPermROSent = "mailPermROSent",
    mailPermSOB = "mailPermSOB"
}

export type ActiveUserSetting = 0 | 1 | 2;

export interface ACLResults {
    newUsers?: string[];
    removedUsers?: string[];
}

export interface SOBList {
    email: string;
    mailPermSOB: string;
}

export interface DoveadmExchanges {
    doveadmExchange: DoveadmExchange[]
}

export interface DoveadmExchange {
    doveadmRequestData: DoveadmRequestData
}

export interface DoveadmRequestData {
    type: string,
    data: DoveadmExchangeResult[],
    tag: string
}

export interface DoveadmExchangeResult {
    mailbox?: string
    user?: string
    id?: string
    right?: DoveadmRights[]
}

export enum DoveadmRights {
    admin = "admin",
    lookup = "lookup",
    read = "read",
    write = "write",
    write_seen = "write-seen",
    write_deleted = "write-deleted",
    insert = "insert",
    post = "post",
    expunge = "expunge",
    create = "create",
    delete = "delete"
}
