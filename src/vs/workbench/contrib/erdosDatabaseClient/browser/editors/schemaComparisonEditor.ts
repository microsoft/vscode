/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { EditorPane } from '../../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { SchemaComparison } from '../components/SchemaComparison.js';
import { SchemaComparisonInput } from './schemaComparisonInput.js';
import { ISchemaDiff } from '../../common/erdosDatabaseClientApi.js';
import { IDatabaseClientService } from '../services/databaseClientService.js';
import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { Root } from 'react-dom/client';
import { ErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';
import { ErdosReactServices } from '../../../../../base/browser/erdosReactServices.js';

/**
 * Schema Comparison Editor - wraps the SchemaComparison React component in VS Code's EditorPane system.
 * Opens when comparing database schemas between different connections or databases.
 */
export class SchemaComparisonEditor extends EditorPane {

	public static readonly ID = 'workbench.editors.erdosSchemaComparisonEditor';

	private _reactRoot?: Root;
	private _container?: HTMLElement;
	private _currentInput?: SchemaComparisonInput;

	constructor(
		group: IEditorGroup,
		@ITelemetryService protected readonly _telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IDatabaseClientService private readonly _databaseClientService: IDatabaseClientService
	) {
		super(SchemaComparisonEditor.ID, group, _telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		this._container = parent;
		// Ensure parent container supports scrolling
		parent.style.height = '100%';
		parent.style.overflow = 'hidden';
		this._renderReact();
	}

	override async setInput(input: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);

		if (!(input instanceof SchemaComparisonInput)) {
			throw new Error('Invalid input for SchemaComparisonEditor');
		}

		this._currentInput = input;
		this._renderReact();
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
	}

	private _renderReact(): void {
		if (!this._container) {
			return;
		}

		this._destroyReactComponent();
		this._reactRoot = ReactDOM.createRoot(this._container);

		const props = {
			onLoadConnections: this._handleLoadConnections.bind(this),
			onStartComparison: this._handleStartComparison.bind(this),
			onSyncChanges: this._handleSyncChanges.bind(this),
			onShowMessage: this._handleShowMessage.bind(this)
		};

		this._reactRoot.render(
			React.createElement(
				ErdosReactServicesContext.Provider,
				{ value: ErdosReactServices.services },
				React.createElement(SchemaComparison, props)
			)
		);
	}

	private _destroyReactComponent(): void {
		if (this._reactRoot) {
			this._reactRoot.unmount();
			this._reactRoot = undefined;
		}
	}

	private async _handleLoadConnections(): Promise<{ nodes: any[]; databaseList: Record<string, any[]> }> {
		try {
			const connections = await this._databaseClientService.getTreeNodesForView();

			// Build database list for each connection
			const databaseList: Record<string, any[]> = {};
			for (const connection of connections) {
				try {
					const databases = await this._databaseClientService.getTreeNodesForView(connection.id);
					databaseList[connection.id] = databases;
				} catch (error) {
					// If we can't get databases for a connection, set empty array
					databaseList[connection.id] = [];
				}
			}

			return {
				nodes: connections.map(conn => ({
					uid: conn.id,
					label: conn.label,
					dbType: conn.type // Assuming type maps to dbType
				})),
				databaseList
			};
		} catch (error: any) {
			this._telemetryService.publicLog2<{ error: string }, {
				owner: 'erdos-database-client';
				comment: 'Load connections error tracking';
				error: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Error message from load connections' };
			}>('erdos.loadConnectionsError', {
				error: error.message || 'Unknown error'
			});

			throw error;
		}
	}

	private async _handleStartComparison(option: any): Promise<{ sqlList: any[] }> {
		try {
			const result = await this._databaseClientService.compareSchemas(
				option.from.connection,
				option.from.database,
				option.to.connection,
				option.to.database
			);

			// Update the input with the new comparison
			if (this._currentInput) {
				this._currentInput.updateComparison(result);
			}

			return {
				sqlList: result.sqlList.map(diff => ({
					type: diff.type,
					sql: diff.sql,
					selected: diff.selected
				}))
			};
		} catch (error: any) {
			this._telemetryService.publicLog2<{ error: string; fromConnection: string; toConnection: string }, {
				owner: 'erdos-database-client';
				comment: 'Schema comparison error tracking';
				error: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Error message from schema comparison' };
				fromConnection: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Source connection identifier' };
				toConnection: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Target connection identifier' };
			}>('erdos.schemaComparisonError', {
				error: error.message || 'Unknown error',
				fromConnection: option.from.connection,
				toConnection: option.to.connection
			});

			throw error;
		}
	}

	private async _handleSyncChanges(sqlList: any[], option: any): Promise<void> {
		try {
			// Convert the sqlList back to ISchemaDiff format
			const schemaDiffs: ISchemaDiff[] = sqlList.map(sql => ({
				type: sql.type as 'add' | 'remove' | 'change',
				sql: sql.sql,
				selected: sql.selected
			}));

			await this._databaseClientService.syncSchemas(
				option.to.connection, // Use the target connection for syncing
				schemaDiffs
			);
		} catch (error: any) {
			this._telemetryService.publicLog2<{ error: string; connectionId: string; changeCount: number }, {
				owner: 'erdos-database-client';
				comment: 'Schema sync error tracking';
				error: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Error message from schema sync' };
				connectionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Database connection identifier' };
				changeCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Number of changes being synced' };
			}>('erdos.schemaSyncError', {
				error: error.message || 'Unknown error',
				connectionId: option.to.connection,
				changeCount: sqlList.length
			});

			throw error;
		}
	}


	private _handleShowMessage(message: string, type: 'info' | 'warning' | 'error' | 'success'): void {
		// Messages silently ignored - no notifications
	}
}
