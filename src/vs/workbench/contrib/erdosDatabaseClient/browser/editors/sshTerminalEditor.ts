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
import { SSHTerminal } from '../components/SSHTerminal.js';
import { SSHTerminalInput } from './sshTerminalInput.js';
import { ISSHTerminalConfig } from '../../common/erdosDatabaseClientApi.js';
import { IDatabaseClientService } from '../services/databaseClientService.js';
import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { Root } from 'react-dom/client';
import { ErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';
import { ErdosReactServices } from '../../../../../base/browser/erdosReactServices.js';

/**
 * SSH Terminal Editor - wraps the SSHTerminal React component in VS Code's EditorPane system.
 * Opens when launching SSH connections from database connections or port forwarding.
 */
export class SSHTerminalEditor extends EditorPane {

	public static readonly ID = 'workbench.editors.erdosSSHTerminalEditor';

	private _reactRoot?: Root;
	private _container?: HTMLElement;
	private _currentInput?: SSHTerminalInput;

	constructor(
		group: IEditorGroup,
		@ITelemetryService protected readonly _telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IDatabaseClientService private readonly _databaseClientService: IDatabaseClientService
	) {
		super(SSHTerminalEditor.ID, group, _telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		// Store the container element
		this._container = parent;

		// Initial render with empty state
		this._renderReact();
	}

	override async setInput(input: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		// Call parent method
		await super.setInput(input, options, context, token);

		// Validate input type
		if (!(input instanceof SSHTerminalInput)) {
			throw new Error('Invalid input for SSHTerminalEditor');
		}

		this._currentInput = input;

		// Re-render with new input
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
			config: this._currentInput.config,
			onCreateSSHTerminal: this._handleCreateSSHTerminal.bind(this),
			onShowMessage: this._handleShowMessage.bind(this)
		} : {
			config: {
				host: '',
				port: 22,
				username: ''
			} as ISSHTerminalConfig,
			onCreateSSHTerminal: this._handleCreateSSHTerminal.bind(this),
			onShowMessage: this._handleShowMessage.bind(this)
		};

		// Render the SSHTerminal component with services context
		this._reactRoot.render(
			React.createElement(
				ErdosReactServicesContext.Provider,
				{ value: ErdosReactServices.services },
				React.createElement(SSHTerminal, props)
			)
		);
	}

	private _destroyReactComponent(): void {
		if (this._reactRoot) {
			this._reactRoot.unmount();
			this._reactRoot = undefined;
		}
	}

	private async _handleCreateSSHTerminal(config: ISSHTerminalConfig): Promise<string> {
		try {
			// This calls the service which:
			// 1. Creates a new XtermTerminal instance
			// 2. Calls XtermTerminal.openMethod(sshConfig) 
			// 3. Opens a webview panel with real xterm.js terminal
			// 4. Establishes actual SSH connection using ssh2.Client
			// 5. Returns terminal ID for reference
			const terminalId = await this._databaseClientService.createSSHTerminal(config);

			// Log successful SSH terminal creation
			this._telemetryService.publicLog2<{ host: string; port: number; username: string }, {
				owner: 'erdos-database-client';
				comment: 'SSH terminal creation tracking';
				host: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'SSH host address' };
				port: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'SSH port number' };
				username: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'SSH username' };
			}>('erdos.sshTerminalCreated', {
				host: config.host,
				port: config.port,
				username: config.username
			});

			return terminalId;
		} catch (error: any) {
			this._telemetryService.publicLog2<{ error: string; host: string; port: number }, {
				owner: 'erdos-database-client';
				comment: 'SSH terminal creation error tracking';
				error: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Error message from SSH terminal creation' };
				host: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'SSH host address' };
				port: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'SSH port number' };
			}>('erdos.sshTerminalCreationError', {
				error: error.message || 'Unknown error',
				host: config.host,
				port: config.port
			});

			throw error;
		}
	}

	private _handleShowMessage(message: string, type: 'info' | 'warning' | 'error' | 'success'): void {
		// Messages silently ignored - no notifications
	}
}
