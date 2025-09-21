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
import { RedisKeyViewer } from '../components/RedisKeyViewer.js';
import { RedisKeyInput } from './redisKeyInput.js';
import { IRedisKey, IDatabaseConnection } from '../../common/erdosDatabaseClientApi.js';
import { IDatabaseClientService } from '../services/databaseClientService.js';
import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { Root } from 'react-dom/client';
import { ErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';
import { ErdosReactServices } from '../../../../../base/browser/erdosReactServices.js';

/**
 * Redis Key Editor - wraps the RedisKeyViewer React component in VS Code's EditorPane system.
 * Opens when viewing or editing Redis keys from the DatabaseTree.
 */
export class RedisKeyEditor extends EditorPane {

	public static readonly ID = 'workbench.editors.erdosRedisKeyEditor';

	private _reactRoot?: Root;
	private _container?: HTMLElement;
	private _currentInput?: RedisKeyInput;
	private _currentConnection?: IDatabaseConnection;
	private _currentKeyData?: IRedisKey;

	constructor(
		group: IEditorGroup,
		@ITelemetryService protected readonly _telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IDatabaseClientService private readonly _databaseClientService: IDatabaseClientService
	) {
		super(RedisKeyEditor.ID, group, _telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		this._container = parent;
		this._renderReact();
	}

	override async setInput(input: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);

		if (!(input instanceof RedisKeyInput)) {
			throw new Error('Invalid input for RedisKeyEditor');
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

			// Load key data if not provided in input
			if (!this._currentInput.initialKeyData) {
				this._currentKeyData = await this._databaseClientService.getRedisKey(
					this._currentInput.connectionId,
					this._currentInput.keyName
				);
			} else {
				this._currentKeyData = this._currentInput.initialKeyData;
			}

			// Re-render with loaded data
			this._renderReact();

		} catch (error) {
			// Failed to load Redis key - silently ignore
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
	}

	private _renderReact(): void {
		if (!this._container) {
			return;
		}

		this._destroyReactComponent();
		this._reactRoot = ReactDOM.createRoot(this._container);

		const props = this._currentInput ? {
			connectionId: this._currentInput.connectionId,
			connection: this._currentConnection, // Pass loaded connection
			keyName: this._currentInput.keyName,
			initialKeyData: this._currentKeyData, // Pass loaded key data
			onGetRedisKey: this._handleGetRedisKey.bind(this),
			onSetRedisKey: this._handleSetRedisKey.bind(this),
			onDeleteRedisKey: this._handleDeleteRedisKey.bind(this),
			onRenameRedisKey: this._handleRenameRedisKey.bind(this),
			onExecuteRedisCommand: this._handleExecuteRedisCommand.bind(this),
			onShowMessage: this._handleShowMessage.bind(this)
		} : {
			connectionId: '',
			onGetRedisKey: this._handleGetRedisKey.bind(this),
			onSetRedisKey: this._handleSetRedisKey.bind(this),
			onDeleteRedisKey: this._handleDeleteRedisKey.bind(this),
			onRenameRedisKey: this._handleRenameRedisKey.bind(this),
			onExecuteRedisCommand: this._handleExecuteRedisCommand.bind(this),
			onShowMessage: this._handleShowMessage.bind(this)
		};

		this._reactRoot.render(
			React.createElement(
				ErdosReactServicesContext.Provider,
				{ value: ErdosReactServices.services },
				React.createElement(RedisKeyViewer, props)
			)
		);
	}

	private _destroyReactComponent(): void {
		if (this._reactRoot) {
			this._reactRoot.unmount();
			this._reactRoot = undefined;
		}
	}

	private async _handleGetRedisKey(connectionId: string, keyName: string): Promise<IRedisKey> {
		try {
			const result = await this._databaseClientService.getRedisKey(connectionId, keyName);

			// Update the input with the new key data
			if (this._currentInput) {
				this._currentInput.updateKeyData(result);
			}

			// Update local cache
			this._currentKeyData = result;

			return result;
		} catch (error: any) {
			this._telemetryService.publicLog2<{ error: string; connectionId: string; keyName: string }, {
				owner: 'erdos-database-client';
				comment: 'Redis key retrieval error tracking';
				error: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Error message from Redis key retrieval' };
				connectionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Redis connection identifier' };
				keyName: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Redis key name' };
			}>('erdos.getRedisKeyError', {
				error: error.message || 'Unknown error',
				connectionId,
				keyName
			});

			throw error;
		}
	}

	private async _handleSetRedisKey(connectionId: string, keyName: string, value: any, ttl?: number): Promise<void> {
		try {
			await this._databaseClientService.setRedisKey(connectionId, keyName, value, ttl);
		} catch (error: any) {
			this._telemetryService.publicLog2<{ error: string; connectionId: string; keyName: string }, {
				owner: 'erdos-database-client';
				comment: 'Redis key update error tracking';
				error: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Error message from Redis key update' };
				connectionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Redis connection identifier' };
				keyName: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Redis key name' };
			}>('erdos.setRedisKeyError', {
				error: error.message || 'Unknown error',
				connectionId,
				keyName
			});

			throw error;
		}
	}

	private async _handleDeleteRedisKey(connectionId: string, keyName: string): Promise<void> {
		try {
			await this._databaseClientService.deleteRedisKey(connectionId, keyName);
		} catch (error: any) {
			this._telemetryService.publicLog2<{ error: string; connectionId: string; keyName: string }, {
				owner: 'erdos-database-client';
				comment: 'Redis key deletion error tracking';
				error: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Error message from Redis key deletion' };
				connectionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Redis connection identifier' };
				keyName: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Redis key name' };
			}>('erdos.deleteRedisKeyError', {
				error: error.message || 'Unknown error',
				connectionId,
				keyName
			});

			throw error;
		}
	}

	private async _handleRenameRedisKey(connectionId: string, oldName: string, newName: string): Promise<void> {
		try {
			await this._databaseClientService.renameRedisKey(connectionId, oldName, newName);

			// Update the current input with the new key name
			if (this._currentInput && this._currentInput.keyName === oldName) {
				// Create a new input with the updated key name
				const newInput = new RedisKeyInput(
					this._currentInput.connectionId,
					newName,
					this._currentInput.initialKeyData,
					this._currentInput.resource
				);
				this._currentInput = newInput;
				this._renderReact();
			}
		} catch (error: any) {
			this._telemetryService.publicLog2<{ error: string; connectionId: string; oldName: string; newName: string }, {
				owner: 'erdos-database-client';
				comment: 'Redis key rename error tracking';
				error: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Error message from Redis key rename' };
				connectionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Redis connection identifier' };
				oldName: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Original Redis key name' };
				newName: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'New Redis key name' };
			}>('erdos.renameRedisKeyError', {
				error: error.message || 'Unknown error',
				connectionId,
				oldName,
				newName
			});

			throw error;
		}
	}

	private async _handleExecuteRedisCommand(connectionId: string, command: string, args?: string[]): Promise<any> {
		try {
			const result = await this._databaseClientService.executeRedisCommand(connectionId, command, args);
			return result;
		} catch (error: any) {
			this._telemetryService.publicLog2<{ error: string; connectionId: string; command: string }, {
				owner: 'erdos-database-client';
				comment: 'Redis command execution error tracking';
				error: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Error message from Redis command execution' };
				connectionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Redis connection identifier' };
				command: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Redis command name' };
			}>('erdos.executeRedisCommandError', {
				error: error.message || 'Unknown error',
				connectionId,
				command
			});

			throw error;
		}
	}

	private _handleShowMessage(message: string, type: 'info' | 'warning' | 'error' | 'success'): void {
		// Messages silently ignored - no notifications
	}
}
