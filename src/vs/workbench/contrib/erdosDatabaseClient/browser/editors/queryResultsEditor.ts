/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { EditorPane } from '../../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IProgressService, ProgressLocation } from '../../../../../platform/progress/common/progress.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { QueryResults } from '../components/QueryResults.js';
import { QueryResultsInput } from './queryResultsInput.js';
import { IQueryResult, IExportOptions, IDatabaseConnection } from '../../common/erdosDatabaseClientApi.js';
import { IDatabaseClientService } from '../services/databaseClientService.js';
import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { Root } from 'react-dom/client';
import { ErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';
import { ErdosReactServices } from '../../../../../base/browser/erdosReactServices.js';

/**
 * Query Results Editor - wraps the QueryResults React component in VS Code's EditorPane system.
 * Opens when double-clicking tables in DatabaseTree to view data, running queries from connection forms,
 * or executing stored procedures or functions.
 */
export class QueryResultsEditor extends EditorPane {

	public static readonly ID = 'workbench.editors.erdosQueryResultsEditor';

	private _reactRoot?: Root;
	private _container?: HTMLElement;
	private _currentInput?: QueryResultsInput;
	private _currentConnection?: IDatabaseConnection;
	private _currentResults?: IQueryResult;

	constructor(
		group: IEditorGroup,
		@ICommandService private readonly _commandService: ICommandService,
		@IProgressService private readonly _progressService: IProgressService,
		@ITelemetryService protected readonly _telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IDatabaseClientService private readonly _databaseClientService: IDatabaseClientService
	) {
		super(QueryResultsEditor.ID, group, _telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		// Store the container element
		this._container = parent;

		// Ensure parent container supports proper layout
		parent.style.height = '100%';
		parent.style.overflow = 'hidden';

		// Initial render with empty state
		this._renderReact();
	}

	override async setInput(input: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		// Call parent method
		await super.setInput(input, options, context, token);

		// Ensure input is QueryResultsInput
		if (!(input instanceof QueryResultsInput)) {
			throw new Error('QueryResultsEditor can only handle QueryResultsInput');
		}

		this._currentInput = input;

		// Load connection and data from service
		await this._loadData();
	}

	private async _loadData(): Promise<void> {
		if (!this._currentInput) {
			return;
		}

		try {
			// Get connection details from service
			this._currentConnection = await this._databaseClientService.getConnection(this._currentInput.connectionId);


			// If there's a query, execute it
			if (this._currentInput.query) {
				this._currentResults = await this._databaseClientService.executeQuery(
					this._currentInput.connectionId, 
					this._currentInput.query
				);

				// No need to update breadcrumb path - it comes from the extension
			}

			// Re-render with loaded data
			this._renderReact();
		} catch (error) {
			// Failed to load data - silently ignore
		}
	}

	override clearInput(): void {
		super.clearInput();
		this._currentInput = undefined;
		this._renderReact();
	}

	override dispose(): void {
		this._destroyReactComponent();
		super.dispose();
	}

	override layout(dimension: { width: number; height: number }): void {
		// React components handle their own layout
		// The container will automatically resize
	}

	private _renderReact(): void {
		if (!this._container) {
			return;
		}

		// Destroy existing React component
		this._destroyReactComponent();

		// Create new React root
		this._reactRoot = ReactDOM.createRoot(this._container);

		const props = this._currentInput ? {
			connectionId: this._currentInput.connectionId,
			connection: this._currentConnection,
			breadcrumbPath: this._currentInput.breadcrumbPath || (this._currentConnection ? [this._currentConnection.name] : undefined),
			initialQuery: this._currentInput.lastExecutedQuery, // Always use the last executed query for this tab
			initialResults: this._currentResults,
			onExecuteQuery: this._handleExecuteQuery.bind(this),
			onExportData: this._handleExportData.bind(this),
			onSaveModify: this._handleSaveModify.bind(this),
			onCount: this._handleCount.bind(this),
			onCopyToClipboard: this._handleCopyToClipboard.bind(this),
			onShowMessage: this._handleShowMessage.bind(this),
			onShowProgress: this._handleShowProgress.bind(this),
			onSaveCellModify: this._handleSaveCellModify.bind(this),
			onEsSort: this._handleEsSort.bind(this)
		} : {
			onExecuteQuery: this._handleExecuteQuery.bind(this),
			onExportData: this._handleExportData.bind(this),
			onSaveModify: this._handleSaveModify.bind(this),
			onCount: this._handleCount.bind(this),
			onCopyToClipboard: this._handleCopyToClipboard.bind(this),
			onShowMessage: this._handleShowMessage.bind(this),
			onShowProgress: this._handleShowProgress.bind(this),
			onSaveCellModify: this._handleSaveCellModify.bind(this),
			onEsSort: this._handleEsSort.bind(this)
		};

		// Render the QueryResults component with services context
		this._reactRoot.render(
			React.createElement(
				ErdosReactServicesContext.Provider,
				{ value: ErdosReactServices.services },
				React.createElement(QueryResults, props)
			)
		);
	}

	private _destroyReactComponent(): void {
		if (this._reactRoot) {
			this._reactRoot.unmount();
			this._reactRoot = undefined;
		}
	}

	private async _handleExecuteQuery(sql: string, options?: {
		pageSize?: number;
		pageNum?: number;
		recordHistory?: boolean;
	}): Promise<IQueryResult> {
		if (!this._currentInput) {
			throw new Error('No connection available');
		}

		try {
			const result = await this._databaseClientService.executeQuery(
				this._currentInput.connectionId,
				sql,
				options
			);
			
			// Update current results and store the executed query in the input
			this._currentResults = result;
			if (this._currentInput) {
				this._currentInput.updateLastExecutedQuery(sql); // Store the executed query in the tab's input
			}

			return result;
		} catch (error) {
			
			// Log telemetry for query execution errors
			this._telemetryService.publicLog2<{ error: string; connectionId: string }, {
				owner: 'erdos-database-client';
				comment: 'Query execution error tracking';
				error: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Error message from query execution' };
				connectionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Database connection identifier' };
			}>('erdos.queryExecutionError', {
				error: error.message || 'Unknown error',
				connectionId: this._currentInput.connectionId
			});

			throw error;
		}
	}

	private async _handleExportData(options: {
		type: 'csv' | 'json' | 'xlsx' | 'sql';
		withOutLimit: boolean;
		sql: string;
		table?: string;
	}): Promise<{ success: boolean; filename?: string; message?: string }> {
		if (!this._currentInput) {
			throw new Error('No connection available');
		}

		try {
			const exportOptions: IExportOptions = {
				type: options.type,
				withOutLimit: options.withOutLimit,
				sql: options.sql,
				table: options.table
			};

			const result = await this._commandService.executeCommand<{ success: boolean; filename?: string; message?: string }>(
				'erdos.exportData',
				this._currentInput.connectionId,
				exportOptions
			);

			if (!result) {
				throw new Error('Export operation returned no result');
			}

			return result;
		} catch (error) {
			this._telemetryService.publicLog2<{ error: string; type: string }, {
				owner: 'erdos-database-client';
				comment: 'Data export error tracking';
				error: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Error message from export operation' };
				type: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Export file type (csv, json, xlsx, sql)' };
			}>('erdos.exportError', {
				error: error.message || 'Unknown error',
				type: options.type
			});

			throw error;
		}
	}

	private async _handleSaveModify(sql: string): Promise<void> {
		if (!this._currentInput) {
			throw new Error('No connection available');
		}

		try {
			await this._commandService.executeCommand(
				'erdos.executeQuery',
				this._currentInput.connectionId,
				sql,
				{ recordHistory: false }
			);
		} catch (error) {
			this._telemetryService.publicLog2<{ error: string }, {
				owner: 'erdos-database-client';
				comment: 'Save modifications error tracking';
				error: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Error message from save operation' };
			}>('erdos.saveModifyError', {
				error: error.message || 'Unknown error'
			});

			throw error;
		}
	}

	private async _handleCount(sql: string): Promise<number> {
		if (!this._currentInput) {
			throw new Error('No connection available');
		}

		try {
			// Transform the query to a COUNT query
			const countSql = `SELECT COUNT(*) as count FROM (${sql.replace(/;$/, '')}) as subquery`;
			
			const result = await this._commandService.executeCommand<IQueryResult>(
				'erdos.executeQuery',
				this._currentInput.connectionId,
				countSql,
				{ recordHistory: false }
			);

			if (!result || !result.data || result.data.length === 0) {
				throw new Error('Count query returned no result');
			}

			return parseInt(result.data[0].count || '0', 10);
		} catch (error) {
			this._telemetryService.publicLog2<{ error: string }, {
				owner: 'erdos-database-client';
				comment: 'Count query error tracking';
				error: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Error message from count operation' };
			}>('erdos.countError', {
				error: error.message || 'Unknown error'
			});

			throw error;
		}
	}

	private async _handleCopyToClipboard(value: string): Promise<void> {
		try {
			await this._commandService.executeCommand('workbench.action.terminal.copySelection', value);
		} catch (error) {
			// Fallback to browser clipboard API
			try {
				await navigator.clipboard.writeText(value);
			} catch (clipboardError) {
				throw new Error('Failed to copy to clipboard');
			}
		}
	}

	private _handleShowMessage(message: string, type: 'info' | 'warning' | 'error' | 'success'): void {
		// Messages silently ignored - no notifications
	}

	private async _handleShowProgress(title: string, task: () => Promise<void>): Promise<void> {
		return this._progressService.withProgress({
			location: ProgressLocation.Window,
			title,
			cancellable: false
		}, task);
	}

	private async _handleSaveCellModify(sql: string): Promise<void> {
		if (!this._currentInput) {
			throw new Error('No connection available');
		}

		try {
			await this._databaseClientService.saveModify(this._currentInput.connectionId, sql);
			// Changes saved successfully - silently
		} catch (error) {
			this._telemetryService.publicLog2<{ error: string }, {
				owner: 'erdos-database-client';
				comment: 'Save cell modifications error tracking';
				error: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Error message from save operation' };
			}>('erdos.saveCellModifyError', {
				error: error.message || 'Unknown error'
			});

			throw error;
		}
	}

	private async _handleEsSort(originalSql: string, sort: any[]): Promise<IQueryResult> {
		if (!this._currentInput) {
			throw new Error('No connection available');
		}

		try {
			const result = await this._databaseClientService.esSort(
				this._currentInput.connectionId,
				originalSql,
				sort
			);
			
			// Update current results but DON'T re-render - let React component handle the result
			this._currentResults = result;
			// DO NOT call this._renderReact() here - it destroys the component state!

			return result;
		} catch (error) {
			
			this._telemetryService.publicLog2<{ error: string }, {
				owner: 'erdos-database-client';
				comment: 'ElasticSearch sort error tracking';
				error: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Error message from sort operation' };
			}>('erdos.esSortError', {
				error: error.message || 'Unknown error'
			});

			throw error;
		}
	}
}
