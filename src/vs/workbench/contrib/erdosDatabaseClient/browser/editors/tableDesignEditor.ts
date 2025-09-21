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
import { TableDesigner } from '../components/TableDesigner.js';
import { TableDesignInput } from './tableDesignInput.js';
import { ITableDesign, IColumnInfo, DatabaseType, IDatabaseConnection } from '../../common/erdosDatabaseClientApi.js';
import { IDatabaseClientService } from '../services/databaseClientService.js';

// Local interfaces matching the component expectations
interface ComponentColumnInfo {
	name: string;
	type: string;
	comment: string;
	maxLength: number;
	defaultValue: string;
	isPrimary: boolean;
	isUnique: boolean;
	nullable: string;
	isAutoIncrement: boolean;
	originalName?: string;
}

interface ComponentIndexInfo {
	index_name: string;
	column_name: string;
	non_unique: boolean;
	index_type: string;
}
import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { Root } from 'react-dom/client';
import { ErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';
import { ErdosReactServices } from '../../../../../base/browser/erdosReactServices.js';

/**
 * Table Design Editor - wraps the TableDesigner React component in VS Code's EditorPane system.
 * Opens when editing table structure from DatabaseTree context menu or when creating new tables.
 */
export class TableDesignEditor extends EditorPane {

	public static readonly ID = 'workbench.editors.erdosTableDesignEditor';

	private _reactRoot?: Root;
	private _container?: HTMLElement;
	private _currentInput?: TableDesignInput;
	private _currentConnection?: IDatabaseConnection;
	private _currentDesign?: ITableDesign;

	constructor(
		group: IEditorGroup,
		@ITelemetryService protected readonly _telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IDatabaseClientService private readonly _databaseClientService: IDatabaseClientService
	) {
		super(TableDesignEditor.ID, group, _telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		// Store the container element
		this._container = parent;
		// Ensure parent container supports scrolling
		parent.style.height = '100%';
		parent.style.overflow = 'hidden';

		// Initial render with empty state
		this._renderReact();
	}

	override async setInput(input: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		// Call parent method
		await super.setInput(input, options, context, token);

		// Validate input type
		if (!(input instanceof TableDesignInput)) {
			throw new Error('Invalid input for TableDesignEditor');
		}

		this._currentInput = input;
		
		// Load data from service
		await this._loadData();
	}

	private async _loadData(): Promise<void> {
		if (!this._currentInput) {
			return;
		}

		try {
			// Load connection info
			this._currentConnection = await this._databaseClientService.getConnection(this._currentInput.connectionId);

			// Load table design if not provided in input
			if (!this._currentInput.initialDesign) {
				this._currentDesign = await this._databaseClientService.getTableDesign(
					this._currentInput.connectionId,
					this._currentInput.database,
					this._currentInput.table
				);
			} else {
				this._currentDesign = this._currentInput.initialDesign;
			}

			// Re-render with loaded data
			this._renderReact();

		} catch (error) {
			// Failed to load table design - silently ignore
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
			connection: this._currentConnection, // Pass loaded connection
			tableName: this._currentInput.table,
			database: this._currentInput.database,
			initialDesign: this._currentDesign, // Pass loaded design
			onLoadTable: this._handleLoadTable.bind(this),
			onUpdateTable: this._handleUpdateTable.bind(this),
			onAddColumn: this._handleAddColumn.bind(this),
			onUpdateColumn: this._handleUpdateColumn.bind(this),
			onDeleteColumn: this._handleDeleteColumn.bind(this),
			onAddIndex: this._handleAddIndex.bind(this),
			onDeleteIndex: this._handleDeleteIndex.bind(this),
			onShowMessage: this._handleShowMessage.bind(this)
		} : {
			onLoadTable: this._handleLoadTable.bind(this),
			onUpdateTable: this._handleUpdateTable.bind(this),
			onAddColumn: this._handleAddColumn.bind(this),
			onUpdateColumn: this._handleUpdateColumn.bind(this),
			onDeleteColumn: this._handleDeleteColumn.bind(this),
			onAddIndex: this._handleAddIndex.bind(this),
			onDeleteIndex: this._handleDeleteIndex.bind(this),
			onShowMessage: this._handleShowMessage.bind(this)
		};

		// Render the TableDesigner component with services context
		this._reactRoot.render(
			React.createElement(
				ErdosReactServicesContext.Provider,
				{ value: ErdosReactServices.services },
				React.createElement(TableDesigner, props)
			)
		);
	}

	private _destroyReactComponent(): void {
		if (this._reactRoot) {
			this._reactRoot.unmount();
			this._reactRoot = undefined;
		}
	}

	private async _handleUpdateTable(tableName: string, comment: string): Promise<void> {
		if (!this._currentInput) {
			throw new Error('No active connection for table update.');
		}

		try {
			await this._databaseClientService.updateTable(
				this._currentInput.connectionId,
				this._currentInput.database,
				this._currentInput.table,
				tableName,
				comment
			);
		} catch (error: any) {
			this._telemetryService.publicLog2<{ error: string; connectionId: string; table: string }, {
				owner: 'erdos-database-client';
				comment: 'Table update error tracking';
				error: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Error message from table update' };
				connectionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Database connection identifier' };
				table: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Table name being updated' };
			}>('erdos.tableUpdateError', {
				error: error.message || 'Unknown error',
				connectionId: this._currentInput.connectionId,
				table: this._currentInput.table
			});

			throw error;
		}
	}

	private async _handleAddColumn(column: ComponentColumnInfo): Promise<void> {
		if (!this._currentInput) {
			throw new Error('No active connection for adding column.');
		}

		// Convert component type to API type
		const apiColumn: IColumnInfo = {
			name: column.name,
			type: column.type,
			comment: column.comment,
			maxLength: column.maxLength,
			defaultValue: column.defaultValue,
			isPrimary: column.isPrimary,
			isUnique: column.isUnique,
			nullable: column.nullable as 'YES' | 'NO',
			isAutoIncrement: column.isAutoIncrement
		};

		try {
			await this._databaseClientService.addColumn(
				this._currentInput.connectionId,
				this._currentInput.database,
				this._currentInput.table,
				apiColumn
			);
		} catch (error: any) {
			this._telemetryService.publicLog2<{ error: string; columnName: string }, {
				owner: 'erdos-database-client';
				comment: 'Column addition error tracking';
				error: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Error message from column addition' };
				columnName: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Name of column being added' };
			}>('erdos.addColumnError', {
				error: error.message || 'Unknown error',
				columnName: column.name
			});

			throw error;
		}
	}

	private async _handleUpdateColumn(column: ComponentColumnInfo): Promise<void> {
		if (!this._currentInput) {
			throw new Error('No active connection for updating column.');
		}

		// Convert component type to API type
		const apiColumn: IColumnInfo = {
			name: column.name,
			type: column.type,
			comment: column.comment,
			maxLength: column.maxLength,
			defaultValue: column.defaultValue,
			isPrimary: column.isPrimary,
			isUnique: column.isUnique,
			nullable: column.nullable as 'YES' | 'NO',
			isAutoIncrement: column.isAutoIncrement,
			originalName: column.originalName
		};

		try {
			await this._databaseClientService.updateColumn(
				this._currentInput.connectionId,
				this._currentInput.database,
				this._currentInput.table,
				apiColumn
			);
		} catch (error: any) {
			this._telemetryService.publicLog2<{ error: string; columnName: string }, {
				owner: 'erdos-database-client';
				comment: 'Column update error tracking';
				error: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Error message from column update' };
				columnName: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Name of column being updated' };
			}>('erdos.updateColumnError', {
				error: error.message || 'Unknown error',
				columnName: column.name
			});

			throw error;
		}
	}

	private async _handleDeleteColumn(columnName: string): Promise<void> {
		if (!this._currentInput) {
			throw new Error('No active connection for deleting column.');
		}

		try {
			await this._databaseClientService.deleteColumn(
				this._currentInput.connectionId,
				this._currentInput.database,
				this._currentInput.table,
				columnName
			);
		} catch (error: any) {
			this._telemetryService.publicLog2<{ error: string; columnName: string }, {
				owner: 'erdos-database-client';
				comment: 'Column deletion error tracking';
				error: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Error message from column deletion' };
				columnName: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Name of column being deleted' };
			}>('erdos.deleteColumnError', {
				error: error.message || 'Unknown error',
				columnName: columnName
			});

			throw error;
		}
	}

	private async _handleAddIndex(index: { column: string; type: string }): Promise<void> {
		if (!this._currentInput) {
			throw new Error('No active connection for adding index.');
		}

		try {
			await this._databaseClientService.addIndex(
				this._currentInput.connectionId,
				this._currentInput.database,
				this._currentInput.table,
				index
			);
		} catch (error: any) {
			this._telemetryService.publicLog2<{ error: string; indexColumn: string }, {
				owner: 'erdos-database-client';
				comment: 'Index addition error tracking';
				error: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Error message from index addition' };
				indexColumn: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Column name for index being added' };
			}>('erdos.addIndexError', {
				error: error.message || 'Unknown error',
				indexColumn: index.column
			});

			throw error;
		}
	}

	private async _handleDeleteIndex(indexName: string): Promise<void> {
		if (!this._currentInput) {
			throw new Error('No active connection for deleting index.');
		}

		try {
			await this._databaseClientService.deleteIndex(
				this._currentInput.connectionId,
				this._currentInput.database,
				this._currentInput.table,
				indexName
			);
		} catch (error: any) {
			this._telemetryService.publicLog2<{ error: string; indexName: string }, {
				owner: 'erdos-database-client';
				comment: 'Index deletion error tracking';
				error: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Error message from index deletion' };
				indexName: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Name of index being deleted' };
			}>('erdos.deleteIndexError', {
				error: error.message || 'Unknown error',
				indexName: indexName
			});

			throw error;
		}
	}

	private async _handleLoadTable(table: string): Promise<{ columns: ComponentColumnInfo[]; indexes: ComponentIndexInfo[]; comment: string; dbType: DatabaseType }> {
		if (!this._currentInput) {
			throw new Error('No active connection for loading table design.');
		}

		try {
			const design = await this._databaseClientService.getTableDesign(
				this._currentInput.connectionId,
				this._currentInput.database,
				table
			);

			// Update the input with the new design
			this._currentInput.updateDesign(design);

			// Convert API types to component types
			const componentColumns: ComponentColumnInfo[] = (design.columns || []).map(col => ({
				name: col.name,
				type: col.type,
				comment: col.comment || '',
				maxLength: col.maxLength || 0,
				defaultValue: col.defaultValue || '',
				isPrimary: col.isPrimary,
				isUnique: col.isUnique,
				nullable: col.nullable, // This is already 'YES'|'NO' from API
				isAutoIncrement: col.isAutoIncrement
			}));

			const componentIndexes: ComponentIndexInfo[] = (design.indexes || []).map(idx => ({
				index_name: idx.index_name,
				column_name: idx.column_name,
				non_unique: idx.non_unique,
				index_type: idx.index_type
			}));

			return {
				columns: componentColumns,
				indexes: componentIndexes,
				comment: design.comment || '',
				dbType: design.dbType
			};
		} catch (error: any) {
			this._telemetryService.publicLog2<{ error: string; table: string }, {
				owner: 'erdos-database-client';
				comment: 'Table design load error tracking';
				error: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Error message from table design load' };
				table: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Table name being loaded' };
			}>('erdos.tableDesignLoadError', {
				error: error.message || 'Unknown error',
				table: table
			});

			throw error;
		}
	}

	private _handleShowMessage(message: string, type: 'info' | 'warning' | 'error' | 'success'): void {
		// Messages silently ignored - no notifications
	}
}
