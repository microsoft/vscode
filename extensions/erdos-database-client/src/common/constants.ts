import * as vscode from "vscode";

export class Constants {
    public static CONFIG_PREFIX = "database-client"
    public static RES_PATH = ""; // Will be set by ServiceManager
}

export class Pattern {
    public static TABLE_PATTERN = "\\b(from|join|update|into)\\b\\s*\\[?((\\w|\\.|-|`|\"|')+)\\]?";
    public static DML_PATTERN = "\\b(update|into)\\b\\s*`{0,1}(\\w|\\.|-)+`{0,1}";
    public static MULTI_PATTERN = /\b(TRIGGER|PROCEDURE|FUNCTION)\b/ig
}

export enum CacheKey {
    // all connections
    CONNECTIONS = "connections",
    COLLAPSE_STATE = "connections.cache.collapseState",
    // history
    GLOBAL_HISTORY="sql.history"
}

export enum ConfigKey {
    HIGHLIGHT_SQL_BLOCK = "highlightSQLBlock",
    DEFAULT_LIMIT = "defaultSelectLimit",
    PREFER_CONNECTION_NAME = "preferConnectionName",
    DISABLE_SQL_CODELEN = "disableSqlCodeLen",
}

export enum CodeCommand {
    RecordHistory = "database.history.record",
    Refresh = "database.refresh",
    HistoryOpen = "database.history.open",
    SettingOpen = "database.setting.open",
    ServerInfo = "database.server.info",
    NameCopy = "database.name.copy",
    ConnectionAdd = "database.connection.add",
    ConnectionEdit = "database.connection.edit",
    ConnectionConfig = "database.connection.config",
    ConnectionOpen = "database.connection.open",
    ConnectionDisable = "database.connection.disable",
    ConnectionDelete = "database.connection.delete",
    HostCopy = "database.host.copy",
    StructDiff = "database.struct.diff",
    DataExport = "database.data.export",
    StructExport = "database.struct.export",
    DocumentGenerate = "database.document.generate",
    DataImport = "database.data.import",
    SshFolderNew = "database.ssh.folder.new",
    SshFileNew = "database.ssh.file.new",
    SshHostCopy = "database.ssh.host.copy",
    SshForwardPort = "database.ssh.forward.port",
    SshFileUpload = "database.ssh.file.upload",
    SshFolderOpen = "database.ssh.folder.open",
    SshPathCopy = "database.ssh.path.copy",
    SshSocksPort = "database.ssh.socks.port",
    SshFileDelete = "database.ssh.file.delete",
    SshFileOpen = "database.ssh.file.open",
    SshFileDownload = "database.ssh.file.download",
    SshTerminalHear = "database.ssh.terminal.hear",
    DbActive = "database.db.active",
    DbTruncate = "database.db.truncate",
    DatabaseAdd = "database.database.add",
    DbDrop = "database.db.drop",
    ChangeTableName = "database.changeTableName",
    ChangeUser = "database.change.user",
    UserGrant = "database.user.grant",
    UserSql = "database.user.sql",
    HistoryView = "database.history.view",
    HistoryCopy = "database.history.copy",
    HistoryRun = "database.history.run",
    HistoryDelete = "database.history.delete",
    HistoryClear = "database.history.clear",
    RunQuery = "database.runQuery",
    RunAllQuery = "database.runAllQuery",
    QuerySwitch = "database.query.switch",
    QueryRun = "database.query.run",
    QueryOpen = "database.query.open",
    QueryAdd = "database.query.add",
    QueryRename = "database.query.rename",
    RedisConnectionStatus = "database.redis.connection.status",
    ConnectionTerminal = "database.connection.terminal",
    RedisKeyDetail = "database.redis.key.detail",
    RedisKeyDel = "database.redis.key.del",
    ShowEsIndex = "database.show.esIndex",
    TableTruncate = "database.table.truncate",
    TableDrop = "database.table.drop",
    TableSource = "database.table.source",
    ViewSource = "database.view.source",
    TableShow = "database.table.show",
    ColumnUp = "database.column.up",
    ColumnDown = "database.column.down",
    ColumnAdd = "database.column.add",
    ColumnUpdate = "database.column.update",
    ColumnDrop = "database.column.drop",
    TableFind = "database.table.find",
    CodeLensRun = "database.codeLens.run",
    TableDesign = "database.table.design",
    ShowProcedure = "database.show.procedure",
    ShowFunction = "database.show.function",
    ShowTrigger = "database.show.trigger",
    TemplateSql = "database.template.sql",
    TemplateTable = "database.template.table",
    TemplateView = "database.template.view",
    TemplateProcedure = "database.template.procedure",
    TemplateTrigger = "database.template.trigger",
    TemplateFunction = "database.template.function",
    TemplateUser = "database.template.user",
    DeleteUser = "database.delete.user",
    DeleteView = "database.delete.view",
    DeleteProcedure = "database.delete.procedure",
    DeleteFunction = "database.delete.function",
    DeleteTrigger = "database.delete.trigger"
}

export class Cursor {
    public static FIRST_POSITION = new vscode.Position(0, 0);
    public static getRangeStartTo(end: vscode.Position): vscode.Range {
        return new vscode.Range(this.FIRST_POSITION, end);
    }
}

export enum Confirm {
    YES = "YES", NO = "NO"
}

export enum DatabaseType {
    MYSQL = "MySQL", PG = "PostgreSQL", SQLITE = "SQLite",
    MSSQL = "SqlServer", MONGO_DB = "MongoDB",
    ES = "ElasticSearch", REDIS = "Redis", SSH = "SSH", FTP = "FTP",
    EXASOL = "Exasol"
}

export enum ModelType {
    MONGO_CONNECTION="mongoConnection",MONGO_TABLE="mongoTable",
    /**
     * ftp
     */
     FTP_CONNECTION="ftpConnection", FTP_FOLDER = 'ftpFolder', FTP_FILE = "ftpFile",FTP_Link = "ftpLink",
    /**
     * ssh
     */
    SSH_CONNECTION="sshConnection", FOLDER = 'folder', FILE = "file",Link = "link",
    /**
     * redis
     */
    REDIS_CONNECTION = "redisConnection", REDIS_FOLDER = "redisFolder", REDIS_KEY = "redisKey",
    /**
     * ElasticSearch
     */
    ES_CONNECTION = "esConnection", ES_INDEX = "esIndex", ES_COLUMN = "esColumn",
    /**
     * database
     */
    CONNECTION = "connection",CATALOG = "catalog", SCHEMA = "database", USER_GROUP = "userGroup", USER = "user",
    TABLE = "table", COLUMN = "column", INFO = "info", TABLE_GROUP = "tableGroup",
    VIEW = "view", VIEW_GROUP = "viewGroup",  TRIGGER_GROUP = "triggerGroup", TRIGGER = "trigger",
    PROCEDURE_GROUP = "procedureGroup", PROCEDURE = "procedure", FUNCTION_GROUP = "functionGroup", FUNCTION = "function",
    QUERY_GROUP = "queryGroup", QUERY = "query",
    DIAGRAM_GROUP = "diagramGroup", DIAGRAM = "diagram"
}

export enum MessageType {
    DATA = 'DATA',
    DML = 'DML',
    DDL = 'DDL',
    MESSAGE_BLOCK = 'MESSAGE_BLOCK',
    ERROR = "ERROR",
    RUN = "RUN",
    MESSAGE = "MESSAGE",
    NEXT_PAGE = "NEXT_PAGE",
    COUNT = "COUNT",
    EXPORT_DONE = "EXPORT_DONE",
    THEME = "theme"
}

export enum Template {
    table = "sql-template.sql",
    alter = "alter-template.sql"
}


export enum RedisType {
    hash = 'hash', list = 'list', string = 'string', zset = 'zset', set = 'set'
}