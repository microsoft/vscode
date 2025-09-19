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
    // sql
    DATBASE_CONECTIONS = "mysql.connections",
    DATABASE_SATE = "mysql.database.cache.collapseState",
    // nosql
    NOSQL_CONNECTION = "redis.connections",
    COLLAPSE_SATE = "redis.cache.collapseState",
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
    RecordHistory = "mysql.history.record",
    Refresh = "mysql.refresh",
    HistoryOpen = "mysql.history.open",
    SettingOpen = "mysql.setting.open",
    ServerInfo = "mysql.server.info",
    NameCopy = "mysql.name.copy",
    ConnectionAdd = "mysql.connection.add",
    ConnectionEdit = "mysql.connection.edit",
    ConnectionConfig = "mysql.connection.config",
    ConnectionOpen = "mysql.connection.open",
    ConnectionDisable = "mysql.connection.disable",
    ConnectionDelete = "mysql.connection.delete",
    HostCopy = "mysql.host.copy",
    StructDiff = "mysql.struct.diff",
    DataExport = "mysql.data.export",
    StructExport = "mysql.struct.export",
    DocumentGenerate = "mysql.document.generate",
    DataImport = "mysql.data.import",
    SshFolderNew = "mysql.ssh.folder.new",
    SshFileNew = "mysql.ssh.file.new",
    SshHostCopy = "mysql.ssh.host.copy",
    SshForwardPort = "mysql.ssh.forward.port",
    SshFileUpload = "mysql.ssh.file.upload",
    SshFolderOpen = "mysql.ssh.folder.open",
    SshPathCopy = "mysql.ssh.path.copy",
    SshSocksPort = "mysql.ssh.socks.port",
    SshFileDelete = "mysql.ssh.file.delete",
    SshFileOpen = "mysql.ssh.file.open",
    SshFileDownload = "mysql.ssh.file.download",
    SshTerminalHear = "mysql.ssh.terminal.hear",
    DbActive = "mysql.db.active",
    DbTruncate = "mysql.db.truncate",
    DatabaseAdd = "mysql.database.add",
    DbDrop = "mysql.db.drop",
    ChangeTableName = "mysql.changeTableName",
    ChangeUser = "mysql.change.user",
    UserGrant = "mysql.user.grant",
    UserSql = "mysql.user.sql",
    HistoryView = "mysql.history.view",
    HistoryCopy = "mysql.history.copy",
    HistoryRun = "mysql.history.run",
    HistoryDelete = "mysql.history.delete",
    HistoryClear = "mysql.history.clear",
    RunQuery = "mysql.runQuery",
    RunAllQuery = "mysql.runAllQuery",
    QuerySwitch = "mysql.query.switch",
    QueryRun = "mysql.query.run",
    QueryOpen = "mysql.query.open",
    QueryAdd = "mysql.query.add",
    QueryRename = "mysql.query.rename",
    RedisConnectionStatus = "mysql.redis.connection.status",
    ConnectionTerminal = "mysql.connection.terminal",
    RedisKeyDetail = "mysql.redis.key.detail",
    RedisKeyDel = "mysql.redis.key.del",
    ShowEsIndex = "mysql.show.esIndex",
    TableTruncate = "mysql.table.truncate",
    TableDrop = "mysql.table.drop",
    TableSource = "mysql.table.source",
    ViewSource = "mysql.view.source",
    TableShow = "mysql.table.show",
    ColumnUp = "mysql.column.up",
    ColumnDown = "mysql.column.down",
    ColumnAdd = "mysql.column.add",
    ColumnUpdate = "mysql.column.update",
    ColumnDrop = "mysql.column.drop",
    TableFind = "mysql.table.find",
    CodeLensRun = "mysql.codeLens.run",
    TableDesign = "mysql.table.design",
    ShowProcedure = "mysql.show.procedure",
    ShowFunction = "mysql.show.function",
    ShowTrigger = "mysql.show.trigger",
    TemplateSql = "mysql.template.sql",
    TemplateTable = "mysql.template.table",
    TemplateView = "mysql.template.view",
    TemplateProcedure = "mysql.template.procedure",
    TemplateTrigger = "mysql.template.trigger",
    TemplateFunction = "mysql.template.function",
    TemplateUser = "mysql.template.user",
    DeleteUser = "mysql.delete.user",
    DeleteView = "mysql.delete.view",
    DeleteProcedure = "mysql.delete.procedure",
    DeleteFunction = "mysql.delete.function",
    DeleteTrigger = "mysql.delete.trigger"
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