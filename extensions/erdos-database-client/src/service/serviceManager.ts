import { CacheKey, DatabaseType, Constants } from "../common/constants";
import * as path from "path";
import { SqlCodeLensProvider } from "../provider/codelen/sqlCodeLensProvider";
import * as vscode from "vscode";
import { ExtensionContext } from "vscode";
import { FileManager } from "../common/filesManager";
import { Global } from "../common/global";
import { CompletionProvider } from "../provider/complete/completionProvider";
import { SqlFormattingProvider } from "../provider/sqlFormattingProvider";
import { TableInfoHoverProvider } from "../provider/tableInfoHoverProvider";
import { DbTreeDataProvider as DbTreeDataProvider } from "../provider/treeDataProvider";
import { ConnectService } from "./connect/connectService";
import { MysqlStatusService } from "./status/mysqlStatusService";
import { StatusService } from "./status/statusService";
import { ViewManager } from "../common/viewManager";
import { DatabaseCache } from "../service/common/databaseCache";
import { HistoryRecorder } from "../service/common/historyRecorder";
import { HistoryProvider } from "../provider/history/historyProvider";
import { EsDialect } from "./dialect/esDialect";
import { MongoDialect } from "./dialect/mongoDialect";
import { MssqlDIalect } from "./dialect/mssqlDIalect";
import { MysqlDialect } from "./dialect/mysqlDialect";
import { PostgreSqlDialect } from "./dialect/postgreSqlDialect";
import { SqlDialect } from "./dialect/sqlDialect";
import { DumpService } from "./dump/dumpService";
import { MysqlImportService } from "./import/mysqlImportService";
import { PostgresqlImortService } from "./import/postgresqlImortService";
import { SqlServerImportService } from "./import/sqlServerImportService";
import { EsPageService } from "./page/esPageService";
import { MssqlPageService } from "./page/mssqlPageService";
import { MysqlPageSerivce } from "./page/mysqlPageSerivce";
import { PageService } from "./page/pageService";
import { PostgreSqlPageService } from "./page/postgreSqlPageService";
import { MysqlSettingService } from "./setting/MysqlSettingService";
import { SettingService } from "./setting/settingService";
import ConnectionProvider from "../model/ssh/connectionProvider";
import { SqliTeDialect } from "./dialect/sqliteDialect";
import { MongoPageService } from "./page/mongoPageService";
import { HighlightCreator } from "../provider/codelen/highlightCreator";
import { SQLSymbolProvide } from "../provider/sqlSymbolProvide";
import { MysqlDumpService } from "./dump/mysqlDumpService";
import { ExasolDialect } from './dialect/exasolDialect';

export class ServiceManager {

    public static instance: ServiceManager;
    public connectService = new ConnectService();
    public historyService = new HistoryRecorder();
    public provider: DbTreeDataProvider;
    public nosqlProvider: DbTreeDataProvider;
    public settingService: SettingService;
    public statusService: StatusService;
    public codeLenProvider: SqlCodeLensProvider;
    private isInit = false;

    constructor(private readonly context: ExtensionContext) {
        Global.context = context;
        Constants.RES_PATH = path.join(context.extensionPath, "resources");
        DatabaseCache.initCache();
        ViewManager.initExtesnsionPath(context.extensionPath);
        FileManager.init(context)
        new ConnectionProvider();
    }

    public init(): vscode.Disposable[] {
        if (this.isInit) { return [] }
        const codeLenProvider = new SqlCodeLensProvider();
        this.codeLenProvider = codeLenProvider;
        new HighlightCreator()
        const res: vscode.Disposable[] = [
            vscode.languages.registerDocumentRangeFormattingEditProvider([
                { language: 'sql', scheme: 'file' },
                { language: 'sql', scheme: 'untitled' },
                { language: 'sql', scheme: 'inmemory' },
                { language: 'sql', pattern: '**/*.sql' }
            ], new SqlFormattingProvider()),
            vscode.languages.registerCodeLensProvider([
                { language: 'sql', scheme: 'file' },
                { language: 'sql', scheme: 'untitled' },
                { language: 'sql', scheme: 'inmemory' },
                { language: 'sql', pattern: '**/*.sql' }
            ], codeLenProvider),
            vscode.languages.registerDocumentSymbolProvider([
                { language: 'sql', scheme: 'file' },
                { language: 'sql', scheme: 'untitled' },
                { language: 'sql', scheme: 'inmemory' },
                { language: 'sql', pattern: '**/*.sql' }
            ], new SQLSymbolProvide()),
            vscode.languages.registerHoverProvider([
                { language: 'sql', scheme: 'file' },
                { language: 'sql', scheme: 'untitled' },
                { language: 'sql', scheme: 'inmemory' },
                { language: 'sql', pattern: '**/*.sql' }
            ], new TableInfoHoverProvider()),
            vscode.languages.registerCompletionItemProvider([
                { language: 'sql', scheme: 'file' },
                { language: 'sql', scheme: 'untitled' },
                { language: 'sql', scheme: 'inmemory' },
                { language: 'sql', pattern: '**/*.sql' }
            ], new CompletionProvider(), ' ', '.', ">", "<", "=", "(")
        ]

        this.initMysqlService();
        
        // Create tree data provider instances (required by contrib system for data bridge)
        this.initTreeView();
        this.initTreeProvider();
        
        ServiceManager.instance = this;
        this.isInit = true
        return res
    }


    private initTreeView() {
        // Create tree data provider instances for contrib system data bridge
        // These are not registered as VS Code tree views - contrib system handles the UI
        this.provider = new DbTreeDataProvider(this.context, CacheKey.DATBASE_CONECTIONS);
    }

    private initTreeProvider() {
        // Create tree data provider instances for contrib system data bridge  
        // These are not registered as VS Code tree views - contrib system handles the UI
        this.nosqlProvider = new DbTreeDataProvider(this.context, CacheKey.NOSQL_CONNECTION);
    }


    private initMysqlService() {
        this.settingService = new MysqlSettingService();
        this.statusService = new MysqlStatusService()
    }

    public static getDumpService(dbType: DatabaseType): DumpService {
        if (!dbType) dbType = DatabaseType.MYSQL
        switch (dbType) {
            case DatabaseType.MYSQL:
                return new MysqlDumpService()
        }
        return new DumpService()
    }

    public static getImportService(dbType: DatabaseType) {
        if (!dbType) dbType = DatabaseType.MYSQL
        switch (dbType) {
            case DatabaseType.MSSQL:
                return new SqlServerImportService()
            case DatabaseType.PG:
                return new PostgresqlImortService();
        }
        return new MysqlImportService()
    }

    public static getDialect(dbType: DatabaseType): SqlDialect {
        if (!dbType) dbType = DatabaseType.MYSQL
        switch (dbType) {
            case DatabaseType.MSSQL:
                return new MssqlDIalect()
            case DatabaseType.SQLITE:
                return new SqliTeDialect()
            case DatabaseType.PG:
                return new PostgreSqlDialect();
            case DatabaseType.ES:
                return new EsDialect();
            case DatabaseType.MONGO_DB:
                return new MongoDialect();
            case DatabaseType.EXASOL:
                return new ExasolDialect();
        }
        return new MysqlDialect()
    }

    public static getPageService(databaseType: DatabaseType): PageService {
        if (!databaseType) databaseType = DatabaseType.MYSQL
        switch (databaseType) {
            case DatabaseType.MSSQL:
                return new MssqlPageService();
            case DatabaseType.PG:
                return new PostgreSqlPageService();
            case DatabaseType.MONGO_DB:
                return new MongoPageService();
            case DatabaseType.ES:
                return new EsPageService();
            case DatabaseType.EXASOL:
                return new MysqlPageSerivce();
        }

        return new MysqlPageSerivce();
    }

}