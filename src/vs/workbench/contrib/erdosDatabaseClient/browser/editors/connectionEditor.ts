/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { EditorPane } from '../../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { ERDOS_DATABASE_EXPLORER_VIEW_ID } from '../erdosDatabaseClient.contribution.js';
import { DatabaseExplorerView } from '../views/databaseExplorerView.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { ConnectionForm } from '../components/ConnectionForm.js';
import { ConnectionInput } from './connectionInput.js';
import { IDatabaseConnection } from '../../common/erdosDatabaseClientApi.js';
import { IDatabaseClientService } from '../services/databaseClientService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { Root } from 'react-dom/client';
import { ErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';
import { ErdosReactServices } from '../../../../../base/browser/erdosReactServices.js';

/**
 * Connection Editor - wraps the ConnectionForm React component in VS Code's EditorPane system.
 * Opens when creating new connections or editing existing ones from the Databases pane.
 */
export class ConnectionEditor extends EditorPane {

	public static readonly ID = 'workbench.editors.erdosConnectionEditor';

	private _reactRoot?: Root;
	private _container?: HTMLElement;
	private _currentInput?: ConnectionInput;

	constructor(
		group: IEditorGroup,
		@ITelemetryService protected readonly _telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IViewsService private readonly _viewsService: IViewsService,
		@IDatabaseClientService private readonly _databaseClientService: IDatabaseClientService,
		@INotificationService private readonly _notificationService: INotificationService
	) {
		super(ConnectionEditor.ID, group, _telemetryService, themeService, storageService);
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

		if (!(input instanceof ConnectionInput)) {
			throw new Error('Invalid input for ConnectionEditor');
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
			initialConnection: this._currentInput?.initialConnection,
			onTestConnection: this._handleTestConnection.bind(this),
			onSaveConnection: this._handleSaveConnection.bind(this),
			onBrowseFile: this._handleBrowseFile.bind(this),
			onShowNotification: this._handleShowNotification.bind(this)
		};

		this._reactRoot.render(
			React.createElement(
				ErdosReactServicesContext.Provider,
				{ value: ErdosReactServices.services },
				React.createElement(ConnectionForm, props)
			)
		);
	}

	private _destroyReactComponent(): void {
		if (this._reactRoot) {
			this._reactRoot.unmount();
			this._reactRoot = undefined;
		}
	}

	private async _handleTestConnection(config: IDatabaseConnection): Promise<{ success: boolean; message: string }> {
		try {
			const result = await this._databaseClientService.testConnection(config);
			return result;
		} catch (error: any) {
			this._telemetryService.publicLog2<{ error: string; dbType: string; host: string }, {
				owner: 'erdos-database-client';
				comment: 'Connection test error tracking';
				error: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Error message from connection test' };
				dbType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Database type being tested' };
				host: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Database host being tested' };
			}>('erdos.testConnectionError', {
				error: error.message || 'Unknown error',
				dbType: config.dbType,
				host: config.host
			});

			throw error;
		}
	}

	private async _handleSaveConnection(config: IDatabaseConnection): Promise<{ success: boolean; connectionId: string }> {
		try {
			const result = await this._databaseClientService.saveConnection(config);

			// Update the input with the saved connection
			if (this._currentInput && result.success) {
				const updatedConnection = { ...config, id: result.connectionId };
				this._currentInput.updateConnection(updatedConnection);
			}

			// Refresh the database explorer tree view to show the new connection
			if (result.success) {
				const explorerView = this._viewsService.getViewWithId(ERDOS_DATABASE_EXPLORER_VIEW_ID);
				
				if (explorerView && explorerView instanceof DatabaseExplorerView) {
					explorerView.refresh();
				}
			}

			return result;
		} catch (error: any) {
			this._telemetryService.publicLog2<{ error: string; dbType: string; host: string; connectionName: string }, {
				owner: 'erdos-database-client';
				comment: 'Connection save error tracking';
				error: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Error message from connection save' };
				dbType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Database type being saved' };
				host: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Database host being saved' };
				connectionName: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Connection name being saved' };
			}>('erdos.saveConnectionError', {
				error: error.message || 'Unknown error',
				dbType: config.dbType,
				host: config.host,
				connectionName: config.name
			});

			throw error;
		}
	}

	private async _handleBrowseFile(filters?: { [name: string]: string[] }): Promise<string | null> {
		try {
			const result = await this._databaseClientService.browseFile(filters);
			return result;
		} catch (error: any) {
			this._telemetryService.publicLog2<{ error: string }, {
				owner: 'erdos-database-client';
				comment: 'File browse error tracking';
				error: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Error message from file browse' };
			}>('erdos.browseFileError', {
				error: error.message || 'Unknown error'
			});

			throw error;
		}
	}

	private _handleShowNotification(message: string, type: 'success' | 'error' | 'info'): void {
		switch (type) {
			case 'error':
				this._notificationService.error(message);
				break;
			case 'success':
				this._notificationService.info(message);
				break;
			case 'info':
			default:
				this._notificationService.info(message);
				break;
		}
	}
}
