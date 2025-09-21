/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import {
	IDatabaseConnection,
	IQueryResult,
	ITableDesign,
	IColumnInfo,
	IRedisServerInfo,
	IRedisKey,
	ISSHTerminalConfig,
	IForwardRule,
	IDatabaseStatus,
	ISchemaComparison,
	ISchemaDiff,
	IExportOptions,
	IImportOptions,
	ITreeNode,
	IHistoryItem
} from '../../common/erdosDatabaseClientApi.js';

// Service interface with proper VS Code service pattern
export const IDatabaseClientService = createDecorator<IDatabaseClientService>('databaseClientService');

export interface IDatabaseClientService {
	readonly _serviceBrand: undefined;

	// Connection Management
	getConnections(): Promise<IDatabaseConnection[]>;
	getConnection(connectionId: string): Promise<IDatabaseConnection>;
	testConnection(config: IDatabaseConnection): Promise<{ success: boolean; message: string }>;
	saveConnection(config: IDatabaseConnection): Promise<{ success: boolean; connectionId: string }>;
	deleteConnection(connectionId: string): Promise<void>;
	onConnectionChange: Event<IDatabaseConnection>;

	// Tree Data
	getTreeNodes(connectionId?: string): Promise<ITreeNode[]>;
	refreshTreeNode(nodeId: string): Promise<ITreeNode[]>;

	// Query Execution
	executeQuery(connectionId: string, sql: string, options?: {
		pageSize?: number;
		pageNum?: number;
		recordHistory?: boolean;
	}): Promise<IQueryResult>;
	getQueryHistory(connectionId: string): Promise<string[]>;
	
	// Cell Editing and Sorting
	saveModify(connectionId: string, sql: string): Promise<void>;
	esSort(connectionId: string, originalSql: string, sort: any[]): Promise<IQueryResult>;

	// Table Operations
	getTableDesign(connectionId: string, database: string, table: string): Promise<ITableDesign>;
	updateTable(connectionId: string, database: string, oldName: string, newName: string, comment?: string): Promise<void>;
	addColumn(connectionId: string, database: string, table: string, column: IColumnInfo): Promise<void>;
	updateColumn(connectionId: string, database: string, table: string, column: IColumnInfo): Promise<void>;
	deleteColumn(connectionId: string, database: string, table: string, columnName: string): Promise<void>;
	addIndex(connectionId: string, database: string, table: string, index: { column: string; type: string }): Promise<void>;
	deleteIndex(connectionId: string, database: string, table: string, indexName: string): Promise<void>;

	// Redis Operations
	getRedisStatus(connectionId: string): Promise<IRedisServerInfo>;
	getRedisKeys(connectionId: string, pattern?: string, database?: number): Promise<string[]>;
	getRedisKey(connectionId: string, keyName: string): Promise<IRedisKey>;
	setRedisKey(connectionId: string, keyName: string, value: any, ttl?: number): Promise<void>;
	deleteRedisKey(connectionId: string, keyName: string): Promise<void>;
	renameRedisKey(connectionId: string, oldName: string, newName: string): Promise<void>;
	executeRedisCommand(connectionId: string, command: string, args?: string[]): Promise<any>;

	// SSH Terminal
	createSSHTerminal(config: ISSHTerminalConfig): Promise<string>; // Returns terminal ID

	// Port Forwarding
	getForwardingRules(connectionId: string): Promise<IForwardRule[]>;
	createForwardingRule(connectionId: string, rule: Omit<IForwardRule, 'id' | 'state'>): Promise<string>;
	startForwarding(ruleId: string): Promise<void>;
	stopForwarding(ruleId: string): Promise<void>;
	deleteForwardingRule(ruleId: string): Promise<void>;

	// Database Status
	getDatabaseStatus(connectionId: string): Promise<IDatabaseStatus>;

	// Schema Comparison
	compareSchemas(fromConnection: string, fromDatabase: string, toConnection: string, toDatabase: string): Promise<ISchemaComparison>;
	syncSchemas(connectionId: string, sqlList: ISchemaDiff[]): Promise<void>;

	// Export/Import
	exportData(connectionId: string, options: IExportOptions): Promise<{ success: boolean; filename?: string; message?: string }>;
	importData(connectionId: string, options: IImportOptions): Promise<{ success: boolean; message?: string }>;

	// Tree View Operations (second set from API - for view components)
	getTreeNodesForView(nodeId?: string): Promise<ITreeNode[]>;
	refreshTreeNodeForView(nodeId: string): Promise<void>;
	getQueryHistoryForView(): Promise<IHistoryItem[]>;
	saveQueryToHistory(query: string, connectionId: string): Promise<void>;
	deleteHistoryItem(historyId: string): Promise<void>;
	clearHistory(): Promise<void>;
	
	// Missing overload for getQueryHistory without parameters
	getQueryHistoryItems(): Promise<IHistoryItem[]>;

	// File Operations
	browseFile(filters?: { [name: string]: string[] }): Promise<string | null>;
	saveFile(content: string, filename?: string, filters?: { [name: string]: string[] }): Promise<string | null>;
	uploadFile(connectionId: string, localPath: string, remotePath: string): Promise<{ success: boolean; message?: string }>;
	downloadFile(connectionId: string, remotePath: string, localPath?: string): Promise<{ success: boolean; localPath?: string; message?: string }>;

	// User Input
	showInputBox(prompt: string, defaultValue?: string, validateInput?: (value: string) => string | null): Promise<string | null>;
	showQuickPick(items: string[], options?: { placeHolder?: string; canPickMany?: boolean }): Promise<string | string[] | null>;

	// Notifications
	showMessage(message: string, type: 'info' | 'warning' | 'error'): Promise<void>;
	showProgress(title: string, task: () => Promise<void>): Promise<void>;
}

/**
 * Database Client Service Implementation
 * Bridges React components to extension backend via VS Code commands
 */
export class DatabaseClientService implements IDatabaseClientService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@ICommandService private readonly commandService: ICommandService,
		@ITelemetryService private readonly telemetryService: ITelemetryService
	) {}

	// Connection Management
	async getConnections(): Promise<IDatabaseConnection[]> {
		this.telemetryService.publicLog('erdos.databaseClient.getConnections');
		const result = await this.commandService.executeCommand<IDatabaseConnection[]>('erdos.getConnections');
		return result || [];
	}

	async getConnection(connectionId: string): Promise<IDatabaseConnection> {
		this.telemetryService.publicLog('erdos.databaseClient.getConnection', { connectionId });
		const result = await this.commandService.executeCommand<IDatabaseConnection>('erdos.getConnection', connectionId);
		if (!result) {
			throw new Error(`Connection ${connectionId} not found`);
		}
		return result;
	}

	async testConnection(config: IDatabaseConnection): Promise<{ success: boolean; message: string }> {
		this.telemetryService.publicLog('erdos.databaseClient.testConnection', { dbType: config.dbType });
		const result = await this.commandService.executeCommand<{ success: boolean; message: string }>('erdos.testConnection', config);
		return result || { success: false, message: 'Test connection failed' };
	}

	async saveConnection(config: IDatabaseConnection): Promise<{ success: boolean; connectionId: string }> {
		this.telemetryService.publicLog('erdos.databaseClient.saveConnection', { dbType: config.dbType });
		const result = await this.commandService.executeCommand<{ success: boolean; connectionId: string }>('erdos.saveConnection', config);
		return result || { success: false, connectionId: '' };
	}

	async deleteConnection(connectionId: string): Promise<void> {
		this.telemetryService.publicLog('erdos.databaseClient.deleteConnection', { connectionId });
		await this.commandService.executeCommand('erdos.deleteConnection', connectionId);
	}

	get onConnectionChange(): Event<IDatabaseConnection> {
		// Note: Event will be implemented when extension commands are registered
		throw new Error('onConnectionChange event not yet implemented - requires extension command registration');
	}

	// Tree Data
	async getTreeNodes(connectionId?: string): Promise<ITreeNode[]> {
		this.telemetryService.publicLog('erdos.databaseClient.getTreeNodes', { connectionId });
		const result = await this.commandService.executeCommand<ITreeNode[]>('erdos.getTreeNodes', connectionId);
		return result || [];
	}

	async refreshTreeNode(nodeId: string): Promise<ITreeNode[]> {
		this.telemetryService.publicLog('erdos.databaseClient.refreshTreeNode', { nodeId });
		const result = await this.commandService.executeCommand<ITreeNode[]>('erdos.refreshTreeNode', nodeId);
		return result || [];
	}

	// Query Execution
	async executeQuery(connectionId: string, sql: string, options?: {
		pageSize?: number;
		pageNum?: number;
		recordHistory?: boolean;
	}): Promise<IQueryResult> {
		this.telemetryService.publicLog('erdos.databaseClient.executeQuery', { 
			connectionId, 
			sqlLength: sql.length, 
			pageSize: options?.pageSize 
		});
		
		const result = await this.commandService.executeCommand<IQueryResult>('erdos.executeQuery', connectionId, sql, options);
		
		if (!result) {
			throw new Error('Query execution failed');
		}
		return result;
	}

	async getQueryHistory(connectionId: string): Promise<string[]> {
		this.telemetryService.publicLog('erdos.databaseClient.getQueryHistory', { connectionId });
		const result = await this.commandService.executeCommand<string[]>('erdos.getQueryHistory', connectionId);
		return result || [];
	}
	
	// Cell Editing and Sorting
	async saveModify(connectionId: string, sql: string): Promise<void> {
		this.telemetryService.publicLog('erdos.databaseClient.saveModify', { connectionId, sqlLength: sql.length });
		await this.commandService.executeCommand('erdos.saveModify', connectionId, sql);
	}
	
	async esSort(connectionId: string, originalSql: string, sort: any[]): Promise<IQueryResult> {
		this.telemetryService.publicLog('erdos.databaseClient.esSort', { connectionId, sortFields: sort.length });
		
		const result = await this.commandService.executeCommand<IQueryResult>('erdos.esSort', connectionId, originalSql, sort);
		
		if (!result) {
			throw new Error('ElasticSearch sort failed');
		}
		return result;
	}

	// Table Operations
	async getTableDesign(connectionId: string, database: string, table: string): Promise<ITableDesign> {
		this.telemetryService.publicLog('erdos.databaseClient.getTableDesign', { connectionId, database, table });
		const result = await this.commandService.executeCommand<ITableDesign>('erdos.getTableDesign', connectionId, database, table);
		if (!result) {
			throw new Error(`Table design for ${database}.${table} not found`);
		}
		return result;
	}

	async updateTable(connectionId: string, database: string, oldName: string, newName: string, comment?: string): Promise<void> {
		this.telemetryService.publicLog('erdos.databaseClient.updateTable', { connectionId, database, oldName, newName });
		await this.commandService.executeCommand('erdos.updateTable', connectionId, database, oldName, newName, comment);
	}

	async addColumn(connectionId: string, database: string, table: string, column: IColumnInfo): Promise<void> {
		this.telemetryService.publicLog('erdos.databaseClient.addColumn', { connectionId, database, table, columnName: column.name });
		await this.commandService.executeCommand('erdos.addColumn', connectionId, database, table, column);
	}

	async updateColumn(connectionId: string, database: string, table: string, column: IColumnInfo): Promise<void> {
		this.telemetryService.publicLog('erdos.databaseClient.updateColumn', { connectionId, database, table, columnName: column.name });
		await this.commandService.executeCommand('erdos.updateColumn', connectionId, database, table, column);
	}

	async deleteColumn(connectionId: string, database: string, table: string, columnName: string): Promise<void> {
		this.telemetryService.publicLog('erdos.databaseClient.deleteColumn', { connectionId, database, table, columnName });
		await this.commandService.executeCommand('erdos.deleteColumn', connectionId, database, table, columnName);
	}

	async addIndex(connectionId: string, database: string, table: string, index: { column: string; type: string }): Promise<void> {
		this.telemetryService.publicLog('erdos.databaseClient.addIndex', { connectionId, database, table, column: index.column, type: index.type });
		await this.commandService.executeCommand('erdos.addIndex', connectionId, database, table, index);
	}

	async deleteIndex(connectionId: string, database: string, table: string, indexName: string): Promise<void> {
		this.telemetryService.publicLog('erdos.databaseClient.deleteIndex', { connectionId, database, table, indexName });
		await this.commandService.executeCommand('erdos.deleteIndex', connectionId, database, table, indexName);
	}

	// Redis Operations
	async getRedisStatus(connectionId: string): Promise<IRedisServerInfo> {
		this.telemetryService.publicLog('erdos.databaseClient.getRedisStatus', { connectionId });
		const result = await this.commandService.executeCommand<IRedisServerInfo>('erdos.getRedisStatus', connectionId);
		if (!result) {
			throw new Error(`Redis status for connection ${connectionId} not available`);
		}
		return result;
	}

	async getRedisKeys(connectionId: string, pattern?: string, database?: number): Promise<string[]> {
		this.telemetryService.publicLog('erdos.databaseClient.getRedisKeys', { connectionId, pattern, database });
		const result = await this.commandService.executeCommand<string[]>('erdos.getRedisKeys', connectionId, pattern, database);
		return result || [];
	}

	async getRedisKey(connectionId: string, keyName: string): Promise<IRedisKey> {
		this.telemetryService.publicLog('erdos.databaseClient.getRedisKey', { connectionId, keyName });
		const result = await this.commandService.executeCommand<IRedisKey>('erdos.getRedisKey', connectionId, keyName);
		if (!result) {
			throw new Error(`Redis key ${keyName} not found`);
		}
		return result;
	}

	async setRedisKey(connectionId: string, keyName: string, value: any, ttl?: number): Promise<void> {
		this.telemetryService.publicLog('erdos.databaseClient.setRedisKey', { connectionId, keyName, ttl });
		await this.commandService.executeCommand('erdos.setRedisKey', connectionId, keyName, value, ttl);
	}

	async deleteRedisKey(connectionId: string, keyName: string): Promise<void> {
		this.telemetryService.publicLog('erdos.databaseClient.deleteRedisKey', { connectionId, keyName });
		await this.commandService.executeCommand('erdos.deleteRedisKey', connectionId, keyName);
	}

	async renameRedisKey(connectionId: string, oldName: string, newName: string): Promise<void> {
		this.telemetryService.publicLog('erdos.databaseClient.renameRedisKey', { connectionId, oldName, newName });
		await this.commandService.executeCommand('erdos.renameRedisKey', connectionId, oldName, newName);
	}

	async executeRedisCommand(connectionId: string, command: string, args?: string[]): Promise<any> {
		this.telemetryService.publicLog('erdos.databaseClient.executeRedisCommand', { connectionId, command, argsCount: args?.length });
		return await this.commandService.executeCommand('erdos.executeRedisCommand', connectionId, command, args);
	}

	// SSH Terminal
	async createSSHTerminal(config: ISSHTerminalConfig): Promise<string> {
		this.telemetryService.publicLog('erdos.databaseClient.createSSHTerminal', { host: config.host, port: config.port });
		const result = await this.commandService.executeCommand<string>('erdos.createSSHTerminal', config);
		if (!result) {
			throw new Error('Failed to create SSH terminal');
		}
		return result;
	}

	// Port Forwarding
	async getForwardingRules(connectionId: string): Promise<IForwardRule[]> {
		this.telemetryService.publicLog('erdos.databaseClient.getForwardingRules', { connectionId });
		const result = await this.commandService.executeCommand<IForwardRule[]>('erdos.getForwardingRules', connectionId);
		return result || [];
	}

	async createForwardingRule(connectionId: string, rule: Omit<IForwardRule, 'id' | 'state'>): Promise<string> {
		this.telemetryService.publicLog('erdos.databaseClient.createForwardingRule', { connectionId, localPort: rule.localPort, remotePort: rule.remotePort });
		const result = await this.commandService.executeCommand<string>('erdos.createForwardingRule', connectionId, rule);
		if (!result) {
			throw new Error('Failed to create forwarding rule');
		}
		return result;
	}

	async startForwarding(ruleId: string): Promise<void> {
		this.telemetryService.publicLog('erdos.databaseClient.startForwarding', { ruleId });
		await this.commandService.executeCommand('erdos.startForwarding', ruleId);
	}

	async stopForwarding(ruleId: string): Promise<void> {
		this.telemetryService.publicLog('erdos.databaseClient.stopForwarding', { ruleId });
		await this.commandService.executeCommand('erdos.stopForwarding', ruleId);
	}

	async deleteForwardingRule(ruleId: string): Promise<void> {
		this.telemetryService.publicLog('erdos.databaseClient.deleteForwardingRule', { ruleId });
		await this.commandService.executeCommand('erdos.deleteForwardingRule', ruleId);
	}

	// Database Status
	async getDatabaseStatus(connectionId: string): Promise<IDatabaseStatus> {
		this.telemetryService.publicLog('erdos.databaseClient.getDatabaseStatus', { connectionId });
		const result = await this.commandService.executeCommand<IDatabaseStatus>('erdos.getDatabaseStatus', connectionId);
		if (!result) {
			throw new Error(`Database status for connection ${connectionId} not available`);
		}
		return result;
	}

	// Schema Comparison
	async compareSchemas(fromConnection: string, fromDatabase: string, toConnection: string, toDatabase: string): Promise<ISchemaComparison> {
		this.telemetryService.publicLog('erdos.databaseClient.compareSchemas', { fromConnection, fromDatabase, toConnection, toDatabase });
		const result = await this.commandService.executeCommand<ISchemaComparison>('erdos.compareSchemas', fromConnection, fromDatabase, toConnection, toDatabase);
		if (!result) {
			throw new Error('Schema comparison failed');
		}
		return result;
	}

	async syncSchemas(connectionId: string, sqlList: ISchemaDiff[]): Promise<void> {
		this.telemetryService.publicLog('erdos.databaseClient.syncSchemas', { connectionId, sqlCount: sqlList.length });
		await this.commandService.executeCommand('erdos.syncSchemas', connectionId, sqlList);
	}

	// Export/Import
	async exportData(connectionId: string, options: IExportOptions): Promise<{ success: boolean; filename?: string; message?: string }> {
		this.telemetryService.publicLog('erdos.databaseClient.exportData', { connectionId, type: options.type });
		const result = await this.commandService.executeCommand<{ success: boolean; filename?: string; message?: string }>('erdos.exportData', connectionId, options);
		return result || { success: false, message: 'Export failed' };
	}

	async importData(connectionId: string, options: IImportOptions): Promise<{ success: boolean; message?: string }> {
		this.telemetryService.publicLog('erdos.databaseClient.importData', { connectionId, type: options.type });
		const result = await this.commandService.executeCommand<{ success: boolean; message?: string }>('erdos.importData', connectionId, options);
		return result || { success: false, message: 'Import failed' };
	}

	// Tree View Operations (renamed to avoid conflicts with main API)
	async getTreeNodesForView(nodeId?: string): Promise<ITreeNode[]> {
		this.telemetryService.publicLog('erdos.databaseClient.getTreeNodesForView', { nodeId });
		const result = await this.commandService.executeCommand<ITreeNode[]>('erdos.getTreeNodesForView', nodeId);
		return result || [];
	}

	async refreshTreeNodeForView(nodeId: string): Promise<void> {
		this.telemetryService.publicLog('erdos.databaseClient.refreshTreeNodeForView', { nodeId });
		await this.commandService.executeCommand('erdos.refreshTreeNodeForView', nodeId);
	}

	async getQueryHistoryForView(): Promise<IHistoryItem[]> {
		this.telemetryService.publicLog('erdos.databaseClient.getQueryHistoryForView', undefined);
		const result = await this.commandService.executeCommand<IHistoryItem[]>('erdos.getQueryHistoryForView');
		return result || [];
	}

	async saveQueryToHistory(query: string, connectionId: string): Promise<void> {
		this.telemetryService.publicLog('erdos.databaseClient.saveQueryToHistory', { queryLength: query.length, connectionId });
		await this.commandService.executeCommand('erdos.saveQueryToHistory', query, connectionId);
	}

	async deleteHistoryItem(historyId: string): Promise<void> {
		this.telemetryService.publicLog('erdos.databaseClient.deleteHistoryItem', { historyId });
		await this.commandService.executeCommand('erdos.deleteHistoryItem', historyId);
	}

	async clearHistory(): Promise<void> {
		this.telemetryService.publicLog('erdos.databaseClient.clearHistory', undefined);
		await this.commandService.executeCommand('erdos.clearHistory');
	}

	// Missing overload implementation
	async getQueryHistoryItems(): Promise<IHistoryItem[]> {
		this.telemetryService.publicLog('erdos.databaseClient.getQueryHistoryItems');
		const result = await this.commandService.executeCommand<IHistoryItem[]>('erdos.getQueryHistoryItems');
		return result || [];
	}

	// File Operations
	async browseFile(filters?: { [name: string]: string[] }): Promise<string | null> {
		this.telemetryService.publicLog('erdos.databaseClient.browseFile', { filtersCount: filters ? Object.keys(filters).length : 0 });
		const result = await this.commandService.executeCommand<string | null>('erdos.browseFile', filters);
		return result || null;
	}

	async saveFile(content: string, filename?: string, filters?: { [name: string]: string[] }): Promise<string | null> {
		this.telemetryService.publicLog('erdos.databaseClient.saveFile', { contentLength: content.length, filename });
		const result = await this.commandService.executeCommand<string | null>('erdos.saveFile', content, filename, filters);
		return result || null;
	}

	async uploadFile(connectionId: string, localPath: string, remotePath: string): Promise<{ success: boolean; message?: string }> {
		this.telemetryService.publicLog('erdos.databaseClient.uploadFile', { connectionId, localPath, remotePath });
		const result = await this.commandService.executeCommand<{ success: boolean; message?: string }>('erdos.uploadFile', connectionId, localPath, remotePath);
		return result || { success: false, message: 'Upload failed' };
	}

	async downloadFile(connectionId: string, remotePath: string, localPath?: string): Promise<{ success: boolean; localPath?: string; message?: string }> {
		this.telemetryService.publicLog('erdos.databaseClient.downloadFile', { connectionId, remotePath, localPath });
		const result = await this.commandService.executeCommand<{ success: boolean; localPath?: string; message?: string }>('erdos.downloadFile', connectionId, remotePath, localPath);
		return result || { success: false, message: 'Download failed' };
	}

	// User Input
	async showInputBox(prompt: string, defaultValue?: string, validateInput?: (value: string) => string | null): Promise<string | null> {
		this.telemetryService.publicLog('erdos.databaseClient.showInputBox', { prompt });
		const result = await this.commandService.executeCommand<string | null>('erdos.showInputBox', prompt, defaultValue, validateInput);
		return result || null;
	}

	async showQuickPick(items: string[], options?: { placeHolder?: string; canPickMany?: boolean }): Promise<string | string[] | null> {
		this.telemetryService.publicLog('erdos.databaseClient.showQuickPick', { itemsCount: items.length, canPickMany: options?.canPickMany });
		const result = await this.commandService.executeCommand<string | string[] | null>('erdos.showQuickPick', items, options);
		return result || null;
	}

	// Notifications
	async showMessage(message: string, type: 'info' | 'warning' | 'error'): Promise<void> {
		this.telemetryService.publicLog('erdos.databaseClient.showMessage', { type });
		await this.commandService.executeCommand('erdos.showMessage', message, type);
	}

	async showProgress(title: string, task: () => Promise<void>): Promise<void> {
		this.telemetryService.publicLog('erdos.databaseClient.showProgress', { title });
		await this.commandService.executeCommand('erdos.showProgress', title, task);
	}
}