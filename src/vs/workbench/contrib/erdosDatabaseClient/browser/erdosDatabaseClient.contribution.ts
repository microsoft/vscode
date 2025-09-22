/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { IViewContainersRegistry, IViewsRegistry, Extensions as ViewContainerExtensions, ViewContainer, ViewContainerLocation } from '../../../common/views.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { EditorExtensions } from '../../../common/editor.js';
import { IEditorPaneRegistry, EditorPaneDescriptor } from '../../../browser/editor.js';
import { localize } from '../../../../nls.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';

// CSS imports for React components
import '../media/sharedComponents.css';
import '../media/connection.css';
import '../media/results.css';
import '../media/design.css';
// import '../media/schemaComparison.css';
import '../media/forward.css';
// import '../media/redis.css'; // COMMENTED OUT
import '../media/status.css';
import '../media/terminal.css';
import '../media/cellEditors.css';
import '../media/data-grid.css';
import '../media/common.css';

// Import services and components
import { DatabaseClientService, IDatabaseClientService } from './services/databaseClientService.js';
import { DatabaseExplorerView } from './views/databaseExplorerView.js';
import { QueryHistoryView } from './views/queryHistoryView.js';
import { Action2, registerAction2, MenuId } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { localize2 } from '../../../../nls.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { URI } from '../../../../base/common/uri.js';

// Import editor resolver service and related types
import { IEditorResolverService, EditorInputFactoryFunction, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { IResourceEditorInput } from '../../../../platform/editor/common/editor.js';
import { EditorInputWithOptions } from '../../../common/editor.js';

// Import editors and inputs
import { QueryResultsEditor } from './editors/queryResultsEditor.js';
import { QueryResultsInput } from './editors/queryResultsInput.js';
import { TableDesignEditor } from './editors/tableDesignEditor.js';
import { TableDesignInput } from './editors/tableDesignInput.js';
import { ConnectionEditor } from './editors/connectionEditor.js';
import { ConnectionInput } from './editors/connectionInput.js';
import { SSHTerminalEditor } from './editors/sshTerminalEditor.js';
import { SSHTerminalInput } from './editors/sshTerminalInput.js';
import { PortForwardingEditor } from './editors/portForwardingEditor.js';
import { PortForwardingInput } from './editors/portForwardingInput.js';
// import { SchemaComparisonEditor } from './editors/schemaComparisonEditor.js';
// import { SchemaComparisonInput } from './editors/schemaComparisonInput.js';
// import { RedisKeyEditor } from './editors/redisKeyEditor.js'; // COMMENTED OUT
// import { RedisKeyInput } from './editors/redisKeyInput.js'; // COMMENTED OUT
import { DatabaseStatusEditor, DatabaseStatusEditorInput } from './editors/databaseStatusEditor.js';
import { DatabaseType } from './editors/databaseStatusEditor.js';
import { IDatabaseConnection } from '../common/erdosDatabaseClientApi.js';

// Constants
export const ERDOS_DATABASE_CLIENT_VIEW_CONTAINER_ID = 'erdosDatabaseClient';
export const ERDOS_DATABASE_EXPLORER_VIEW_ID = 'erdosDatabaseClient.explorer';
export const ERDOS_QUERY_HISTORY_VIEW_ID = 'erdosDatabaseClient.history';

// Register the database view icon
const databaseViewIcon = registerIcon(
	'erdos-database-view-icon',
	Codicon.database,
	localize('erdosDatabaseViewIcon', 'View icon of the Erdos database client view.')
);

/**
 * Erdos Database Client Contribution
 * Registers the database client service and initializes the database client functionality
 */
class ErdosDatabaseClientContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.erdosDatabaseClient';

	constructor(
		@IDatabaseClientService databaseClientService: IDatabaseClientService
	) {
		super();
		// Service is automatically initialized when injected
	}
}

// 8.1 Register View Container - Creates the "Databases" pane in AuxiliaryBar (right sidebar) next to Plots and Help
const VIEW_CONTAINER: ViewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: ERDOS_DATABASE_CLIENT_VIEW_CONTAINER_ID,
	title: {
		value: localize('erdos.databaseClient', "Databases"),
		original: 'Databases'
	},
	icon: databaseViewIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [ERDOS_DATABASE_CLIENT_VIEW_CONTAINER_ID, {
		mergeViewWithContainerWhenSingleView: false
	}]),
	storageId: ERDOS_DATABASE_CLIENT_VIEW_CONTAINER_ID,
	hideIfEmpty: true,
	order: 3 // Position after Plots (1) and Help (2)
}, ViewContainerLocation.AuxiliaryBar, {
	doNotRegisterOpenCommand: false,
	isDefault: false
});

// 8.2 Register Views - DatabaseExplorerView and QueryHistoryView inside the pane
Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews([{
	id: ERDOS_DATABASE_EXPLORER_VIEW_ID,
	name: {
		value: localize('erdos.databaseClient.explorer', "Connections"),
		original: 'Connections'
	},
	containerIcon: databaseViewIcon,
	canMoveView: true,
	canToggleVisibility: true,
	ctorDescriptor: new SyncDescriptor(DatabaseExplorerView),
	order: 1,
	weight: 60
}, {
	id: ERDOS_QUERY_HISTORY_VIEW_ID,
	name: {
		value: localize('erdos.databaseClient.history', "Query History"),
		original: 'Query History'
	},
	containerIcon: databaseViewIcon,
	canMoveView: true,
	canToggleVisibility: true,
	ctorDescriptor: new SyncDescriptor(QueryHistoryView),
	order: 2,
	weight: 40
}], VIEW_CONTAINER);

// 8.3 Register Configuration Schema - Register the database-client.connections configuration
Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'database-client',
	title: localize('databaseClient', 'Database Client'),
	type: 'object',
	properties: {
		'database-client.connections': {
			type: 'array',
			default: [],
			description: localize('databaseClient.connections', 'Database connections configuration'),
			items: {
				type: 'object',
				properties: {
					id: { type: 'string', description: 'Unique connection identifier' },
					name: { type: 'string', description: 'Connection display name' },
					dbType: { type: 'string', description: 'Database type' },
					host: { type: 'string', description: 'Database host' },
					port: { type: 'number', description: 'Database port' },
					database: { type: 'string', description: 'Database name' },
					schema: { type: 'string', description: 'Database schema' },
					user: { type: 'string', description: 'Database user' },
					password: { type: 'string', description: 'Database password' },
					options: { type: 'object', description: 'Additional connection options' }
				}
			}
		},
		'database-client.queryHistory': {
			type: 'array',
			default: [],
			description: localize('databaseClient.queryHistory', 'Query history storage'),
			items: {
				type: 'object',
				properties: {
					id: { type: 'string', description: 'Unique history item identifier' },
					sql: { type: 'string', description: 'SQL query text' },
					connectionId: { type: 'string', description: 'Connection identifier' },
					connectionName: { type: 'string', description: 'Connection display name' },
					database: { type: 'string', description: 'Database name' },
					timestamp: { type: 'number', description: 'Execution timestamp' },
					executionTime: { type: 'number', description: 'Execution time in milliseconds' },
					resultCount: { type: 'number', description: 'Number of results returned' }
				}
			}
		}
	}
});

// 8.4 Register Editors - All the database client editors
const editorPaneRegistry = Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane);

// Query Results Editor
editorPaneRegistry.registerEditorPane(
	EditorPaneDescriptor.create(
		QueryResultsEditor,
		QueryResultsEditor.ID,
		localize('queryResultsEditor', 'Query Results')
	),
	[new SyncDescriptor(QueryResultsInput)]
);

// Table Design Editor
editorPaneRegistry.registerEditorPane(
	EditorPaneDescriptor.create(
		TableDesignEditor,
		TableDesignEditor.ID,
		localize('tableDesignEditor', 'Table Design')
	),
	[new SyncDescriptor(TableDesignInput)]
);

// Connection Editor
editorPaneRegistry.registerEditorPane(
	EditorPaneDescriptor.create(
		ConnectionEditor,
		ConnectionEditor.ID,
		localize('connectionEditor', 'Database Connection')
	),
	[new SyncDescriptor(ConnectionInput)]
);

// SSH Terminal Editor
editorPaneRegistry.registerEditorPane(
	EditorPaneDescriptor.create(
		SSHTerminalEditor,
		SSHTerminalEditor.ID,
		localize('sshTerminalEditor', 'SSH Terminal')
	),
	[new SyncDescriptor(SSHTerminalInput)]
);

// Port Forwarding Editor
editorPaneRegistry.registerEditorPane(
	EditorPaneDescriptor.create(
		PortForwardingEditor,
		PortForwardingEditor.ID,
		localize('portForwardingEditor', 'Port Forwarding')
	),
	[new SyncDescriptor(PortForwardingInput)]
);

// Schema Comparison Editor
// editorPaneRegistry.registerEditorPane(
// 	EditorPaneDescriptor.create(
// 		SchemaComparisonEditor,
// 		SchemaComparisonEditor.ID,
// 		localize('schemaComparisonEditor', 'Schema Comparison')
// 	),
// 	[new SyncDescriptor(SchemaComparisonInput)]
// );

/* REDIS KEY EDITOR COMMENTED OUT
// Redis Key Editor
editorPaneRegistry.registerEditorPane(
	EditorPaneDescriptor.create(
		RedisKeyEditor,
		RedisKeyEditor.ID,
		localize('redisKeyEditor', 'Redis Key')
	),
	[new SyncDescriptor(RedisKeyInput)]
);
END REDIS KEY EDITOR COMMENTED OUT */

// Database Status Editor
editorPaneRegistry.registerEditorPane(
	EditorPaneDescriptor.create(
		DatabaseStatusEditor,
		DatabaseStatusEditor.ID,
		localize('databaseStatusEditor', 'Database Status')
	),
	[new SyncDescriptor(DatabaseStatusEditorInput)]
);

// Register the Database Client Service as a singleton
registerSingleton(IDatabaseClientService, DatabaseClientService, InstantiationType.Delayed);

// Register the workbench contribution
registerWorkbenchContribution2(ErdosDatabaseClientContribution.ID, ErdosDatabaseClientContribution, WorkbenchPhase.AfterRestored);

/**
 * Editor Input Factory Registration
 * Creates editor inputs from URIs, with fallback to extract data from URI
 */
class DatabaseClientEditorFactoryContribution extends Disposable implements IWorkbenchContribution {
	
	static readonly ID = 'workbench.contrib.erdosDatabaseClientEditorFactory';

	constructor(
		@IEditorResolverService private readonly editorResolverService: IEditorResolverService
	) {
		super();
		this.registerEditorFactories();
	}

	private registerEditorFactories(): void {
		// Query Results Editor Factory
		const queryResultsFactory: EditorInputFactoryFunction = async ({ resource, options }: IResourceEditorInput): Promise<EditorInputWithOptions> => {
			let connectionId = '';
			let query = '';
			let breadcrumbPath: string[] | undefined;
			let initialResults: any;
			
			// Extract connectionId from URI path: /connectionId/timestamp
			if (resource.scheme === 'erdos-query-results') {
				const pathParts = resource.path.split('/').filter((p: string) => p);
				connectionId = pathParts[0] || '';
				
				// Extract query and breadcrumb from URI query string
				if (resource.query) {
					const params = new URLSearchParams(resource.query);
					query = params.get('sql') || '';
					
					const breadcrumbJson = params.get('breadcrumb');
					if (breadcrumbJson) {
						try {
							breadcrumbPath = JSON.parse(breadcrumbJson);
						} catch (e) {
							console.warn('Failed to parse breadcrumb path from URI:', e);
						}
					}

					// Extract initial results if available
					const resultsJson = params.get('results');
					if (resultsJson) {
						try {
							initialResults = JSON.parse(resultsJson);
						} catch (e) {
							console.warn('Failed to parse initial results from URI:', e);
						}
					}
				}
			}
			
			const input = new QueryResultsInput(connectionId, query, resource, breadcrumbPath, initialResults);
			return { editor: input, options: { pinned: true, ...options } };
		};

		// Connection Editor Factory
		// NOTE: This factory should ONLY be used for new connections via the "Add Connection" button
		// Edit connections are handled directly by the erdos.internal.openConnectionEditor command
		const connectionFactory: EditorInputFactoryFunction = async ({ resource, options }: IResourceEditorInput): Promise<EditorInputWithOptions> => {
			
			// Only handle new connection case - no fallbacks or backups
			if (resource.scheme === 'erdos-connection' && resource.path === '/new') {
				const input = new ConnectionInput(undefined, true, resource);
				return { editor: input, options: { pinned: true, ...options } };
			}
			
			// If we get here, something is wrong - this factory should only handle new connections
			throw new Error(`Connection factory called with unexpected resource: ${resource.toString()}`);
		};

		// Register Query Results Editor factory
		this.editorResolverService.registerEditor(
			'erdos-query-results',
			{
				id: 'workbench.editors.erdosQueryResultsEditor',
				label: 'Query Results Editor',
				priority: RegisteredEditorPriority.default
			},
			{
				singlePerResource: false,
				canSupportResource: (resource: URI) => resource.scheme === 'erdos-query-results'
			},
			{
				createEditorInput: queryResultsFactory
			}
		);

		// Register Connection Editor factory
		this.editorResolverService.registerEditor(
			'erdos-connection',
			{
				id: 'workbench.editors.erdosConnectionEditor',
				label: 'Connection Editor',
				priority: RegisteredEditorPriority.default
			},
			{
				singlePerResource: false,
				canSupportResource: (resource: URI) => resource.scheme === 'erdos-connection'
			},
			{
				createEditorInput: connectionFactory
			}
		);

		// Database Status Editor Factory
		const databaseStatusFactory: EditorInputFactoryFunction = async ({ resource, options }: IResourceEditorInput): Promise<EditorInputWithOptions> => {
			let connectionId = '';
			let connectionName = '';
			let databaseType: DatabaseType = DatabaseType.MySQL;
			
			// Extract connectionId from URI path: /connectionId/status
			if (resource.scheme === 'erdos-database-status') {
				const pathParts = resource.path.split('/').filter((p: string) => p);
				connectionId = pathParts[0] || '';
				
				// Try to get connection details from query parameters if available
				if (resource.query) {
					const params = new URLSearchParams(resource.query);
					connectionName = params.get('connectionName') || connectionId;
					const dbTypeString = params.get('databaseType');
					if (dbTypeString) {
						switch (dbTypeString.toUpperCase()) {
							case 'MYSQL':
								databaseType = DatabaseType.MySQL;
								break;
							case 'POSTGRESQL':
								databaseType = DatabaseType.PostgreSQL;
								break;
							case 'SQLSERVER':
								databaseType = DatabaseType.SqlServer;
								break;
							case 'SQLITE':
								databaseType = DatabaseType.SQLite;
								break;
							/* REDIS CASE COMMENTED OUT
							case 'REDIS':
								databaseType = DatabaseType.Redis;
								break;
							END REDIS CASE COMMENTED OUT */
							case 'MONGODB':
								databaseType = DatabaseType.MongoDB;
								break;
							case 'ELASTICSEARCH':
								databaseType = DatabaseType.ElasticSearch;
								break;
						}
					}
				}
			}
			
			// If connectionName is still empty, use connectionId as fallback
			if (!connectionName) {
				connectionName = connectionId;
			}
			
			const input = new DatabaseStatusEditorInput(connectionId, connectionName, databaseType, resource);
			return { editor: input, options: { pinned: true, ...options } };
		};

		// Register Database Status Editor factory
		this.editorResolverService.registerEditor(
			'erdos-database-status',
			{
				id: 'workbench.editors.erdosDatabaseStatusEditor',
				label: 'Database Status Editor',
				priority: RegisteredEditorPriority.default
			},
			{
				singlePerResource: false,
				canSupportResource: (resource: URI) => resource.scheme === 'erdos-database-status'
			},
			{
				createEditorInput: databaseStatusFactory
			}
		);
	}
}

// Register the editor factory contribution
registerWorkbenchContribution2(DatabaseClientEditorFactoryContribution.ID, DatabaseClientEditorFactoryContribution, WorkbenchPhase.AfterRestored);

// Register view title actions

// Database Explorer Actions - Top right order: Add, Refresh, Open History, Database Sync Struc, Edit Connection Config
registerAction2(class AddConnectionAction extends Action2 {
	constructor() {
		super({
			id: 'erdos.database.addConnection',
			title: localize2('erdos.database.addConnection', 'Add Connection'),
			icon: Codicon.add,
			menu: {
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.equals('view', ERDOS_DATABASE_EXPLORER_VIEW_ID),
				group: 'navigation',
				order: 1
			}
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		const view = viewsService.getViewWithId(ERDOS_DATABASE_EXPLORER_VIEW_ID);
		if (view && view instanceof DatabaseExplorerView) {
			await view.addNewConnection();
		}
	}
});

registerAction2(class RefreshAction extends Action2 {
	constructor() {
		super({
			id: 'erdos.database.refresh',
			title: localize2('erdos.database.refresh', 'Refresh'),
			icon: Codicon.refresh,
			menu: {
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.equals('view', ERDOS_DATABASE_EXPLORER_VIEW_ID),
				group: 'navigation',
				order: 2
			}
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		const explorerView = viewsService.getViewWithId(ERDOS_DATABASE_EXPLORER_VIEW_ID);
		if (explorerView && explorerView instanceof DatabaseExplorerView) {
			explorerView.refresh();
		}
	}
});

registerAction2(class HistoryOpenAction extends Action2 {
	constructor() {
		super({
			id: 'erdos.database.openHistory',
			title: localize2('erdos.database.openHistory', 'Open History'),
			icon: Codicon.history,
			menu: {
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.equals('view', ERDOS_DATABASE_EXPLORER_VIEW_ID),
				group: 'navigation',
				order: 3
			}
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		await viewsService.openView(ERDOS_QUERY_HISTORY_VIEW_ID, true);
	}
});

// registerAction2(class DatabaseSyncStrucAction extends Action2 {
// 	constructor() {
// 		super({
// 			id: 'erdos.database.syncStructure',
// 			title: localize2('erdos.database.syncStructure', 'Database Sync Struc'),
// 			icon: Codicon.sync,
// 			menu: {
// 				id: MenuId.ViewTitle,
// 				when: ContextKeyExpr.equals('view', ERDOS_DATABASE_EXPLORER_VIEW_ID),
// 				group: 'navigation',
// 				order: 4
// 			}
// 		});
// 	}
// 	async run(accessor: ServicesAccessor): Promise<void> {
// 		const commandService = accessor.get(ICommandService);
// 		await commandService.executeCommand('erdos.syncDatabaseStructure');
// 	}
// });

registerAction2(class ConnectionConfigAction extends Action2 {
	constructor() {
		super({
			id: 'erdos.database.connectionConfig',
			title: localize2('erdos.database.connectionConfig', 'Edit Connection Config'),
			icon: Codicon.settingsGear,
			menu: {
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.equals('view', ERDOS_DATABASE_EXPLORER_VIEW_ID),
				group: 'navigation',
				order: 5
			}
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		const view = viewsService.getViewWithId(ERDOS_DATABASE_EXPLORER_VIEW_ID);
		if (view && view instanceof DatabaseExplorerView) {
			await view.addNewConnection();
		}
	}
});

// Database Explorer More Actions Menu (... dropdown) - Schema Comparison, New Query
// registerAction2(class StructDiffAction extends Action2 {
// 	constructor() {
// 		super({
// 			id: 'erdos.database.schemaComparison',
// 			title: localize2('erdos.database.schemaComparison', 'Schema Comparison'),
// 			icon: Codicon.diff,
// 			menu: {
// 				id: MenuId.ViewTitle,
// 				when: ContextKeyExpr.equals('view', ERDOS_DATABASE_EXPLORER_VIEW_ID),
// 				group: 'secondary',
// 				order: 1
// 			}
// 		});
// 	}
// 	async run(accessor: ServicesAccessor): Promise<void> {
// 		const editorService = accessor.get(IEditorService);
// 		
// 		// Create a schema comparison input with empty values - the React component will handle connection/database selection
// 		const input = new SchemaComparisonInput(
// 			'', // fromConnection - empty, user will select
// 			'', // fromDatabase - empty, user will select
// 			'', // toConnection - empty, user will select  
// 			'', // toDatabase - empty, user will select
// 			undefined, // initialComparison - will be populated when user runs comparison
// 			URI.file('schema-comparison.json') // resource
// 		);
// 		
// 		// Open the schema comparison editor
// 		await editorService.openEditor(input, { pinned: true });
// 	}
// });

registerAction2(class NewQueryAction extends Action2 {
	constructor() {
		super({
			id: 'erdos.database.newQuery',
			title: localize2('erdos.database.newQuery', 'New Query'),
			icon: Codicon.newFile,
			menu: {
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.equals('view', ERDOS_DATABASE_EXPLORER_VIEW_ID),
				group: 'secondary',
				order: 2
			}
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const commandService = accessor.get(ICommandService);
		await commandService.executeCommand('workbench.action.files.newUntitledFile', { languageId: 'sql' });
	}
});

// Query History Actions - refresh, clear history, edit connection config (no ... menu)
registerAction2(class RefreshHistoryAction extends Action2 {
	constructor() {
		super({
			id: 'erdos.history.refresh',
			title: localize2('erdos.history.refresh', 'Refresh'),
			icon: Codicon.refresh,
			menu: {
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.equals('view', ERDOS_QUERY_HISTORY_VIEW_ID),
				group: 'navigation',
				order: 1
			}
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		const historyView = viewsService.getViewWithId(ERDOS_QUERY_HISTORY_VIEW_ID);
		if (historyView && historyView instanceof QueryHistoryView) {
			historyView.refresh();
		}
	}
});

registerAction2(class HistoryClearAction extends Action2 {
	constructor() {
		super({
			id: 'erdos.history.clear',
			title: localize2('erdos.history.clear', 'Clear History'),
			icon: Codicon.clearAll,
			menu: {
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.equals('view', ERDOS_QUERY_HISTORY_VIEW_ID),
				group: 'navigation',
				order: 2
			}
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		const historyView = viewsService.getViewWithId(ERDOS_QUERY_HISTORY_VIEW_ID);
		if (historyView && historyView instanceof QueryHistoryView) {
			await historyView.clearHistory();
		}
	}
});


// External refresh command for query history (called from extension)
registerAction2(class ExternalRefreshHistoryAction extends Action2 {
	constructor() {
		super({
			id: 'erdos.refreshQueryHistory',
			title: localize2('erdos.refreshQueryHistory', 'Refresh Query History'),
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		const historyView = viewsService.getViewWithId(ERDOS_QUERY_HISTORY_VIEW_ID);
		if (historyView && historyView instanceof QueryHistoryView) {
			historyView.refresh();
		}
	}
});

// Internal command to open connection editor (called from extension)
registerAction2(class OpenConnectionEditorAction extends Action2 {
	constructor() {
		super({
			id: 'erdos.internal.openConnectionEditor',
			title: localize2('erdos.internal.openConnectionEditor', 'Open Connection Editor (Internal)'),
		});
	}
	async run(accessor: ServicesAccessor, options?: { connection?: any; isEdit?: boolean }): Promise<void> {
		const editorService = accessor.get(IEditorService);
		
		if (options && options.connection && options.isEdit) {
			// Transform the connection node into proper IDatabaseConnection format
			const connectionNode = options.connection;
			
			const properConnection: IDatabaseConnection = {
				id: connectionNode.key || connectionNode.id,
				name: connectionNode.name,
				dbType: connectionNode.dbType,
				host: connectionNode.host,
				port: connectionNode.port,
				database: connectionNode.database,
				schema: connectionNode.schema,
				user: connectionNode.user,
				password: connectionNode.password,
				ssh: connectionNode.ssh,
				ssl: connectionNode.ssl,
				options: {
					connectTimeout: connectionNode.connectTimeout,
					requestTimeout: connectionNode.requestTimeout,
					includeDatabases: connectionNode.includeDatabases,
					timezone: connectionNode.timezone,
					// MongoDB specific
					srv: connectionNode.srv,
					useConnectionString: connectionNode.useConnectionString,
					connectionUrl: connectionNode.connectionUrl,
					// ElasticSearch specific  
					elasticUrl: connectionNode.elasticUrl,
					esAuth: connectionNode.esAuth,
					esUsername: connectionNode.esUsername,
					esPassword: connectionNode.esPassword,
					esToken: connectionNode.esToken,
					...connectionNode.options
				}
			};
			
			const resource = URI.file(`connection-${properConnection.id}.json`);
			const input = new ConnectionInput(properConnection, false, resource);
			
			await editorService.openEditor(input, { pinned: true });
		}
	}
});

// Server Info command handler (called from extension)
registerAction2(class ServerInfoAction extends Action2 {
	constructor() {
		super({
			id: 'erdos.database.serverInfo',
			title: localize2('database.server.info', 'Server Info'),
		});
	}
	async run(accessor: ServicesAccessor, connectionId?: string, connectionName?: string, databaseType?: string): Promise<void> {
		if (!connectionId || !connectionName) {
			return;
		}

		const editorService = accessor.get(IEditorService);
		
		// Convert string database type to enum
		let dbType: DatabaseType = DatabaseType.MySQL; // default
		switch (databaseType?.toUpperCase()) {
			case 'MYSQL':
				dbType = DatabaseType.MySQL;
				break;
			case 'POSTGRESQL':
				dbType = DatabaseType.PostgreSQL;
				break;
			case 'SQLSERVER':
				dbType = DatabaseType.SqlServer;
				break;
			case 'SQLITE':
				dbType = DatabaseType.SQLite;
				break;
			/* REDIS CASE COMMENTED OUT
			case 'REDIS':
				dbType = DatabaseType.Redis;
				break;
			END REDIS CASE COMMENTED OUT */
			case 'MONGODB':
				dbType = DatabaseType.MongoDB;
				break;
			case 'ELASTICSEARCH':
				dbType = DatabaseType.ElasticSearch;
				break;
		}

		// Create and open the database status editor
		const resource = URI.from({
			scheme: 'erdos-database-status',
			path: `/${connectionId}/status`
		});
		const input = new DatabaseStatusEditorInput(connectionId, connectionName, dbType, resource);
		await editorService.openEditor(input, { pinned: true });
	}
});