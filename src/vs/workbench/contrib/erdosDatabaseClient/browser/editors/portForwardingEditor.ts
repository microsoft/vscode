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
import { PortForwarding } from '../components/PortForwarding.js';
import { PortForwardingInput } from './portForwardingInput.js';
import { IForwardRule } from '../../common/erdosDatabaseClientApi.js';
import { IDatabaseClientService } from '../services/databaseClientService.js';
import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { Root } from 'react-dom/client';
import { ErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';
import { ErdosReactServices } from '../../../../../base/browser/erdosReactServices.js';

/**
 * Port Forwarding Editor - wraps the PortForwarding React component in VS Code's EditorPane system.
 * Opens when managing SSH port forwarding rules from the Databases pane.
 */
export class PortForwardingEditor extends EditorPane {

	public static readonly ID = 'workbench.editors.erdosPortForwardingEditor';

	private _reactRoot?: Root;
	private _container?: HTMLElement;
	private _currentInput?: PortForwardingInput;

	constructor(
		group: IEditorGroup,
		@ITelemetryService protected readonly _telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IDatabaseClientService private readonly _databaseClientService: IDatabaseClientService
	) {
		super(PortForwardingEditor.ID, group, _telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		this._container = parent;
		this._renderReact();
	}

	override async setInput(input: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);

		if (!(input instanceof PortForwardingInput)) {
			throw new Error('Invalid input for PortForwardingEditor');
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

		const props = this._currentInput ? {
			connectionId: this._currentInput.connectionId,
			sshConfig: this._currentInput.sshConfig,
			onGetForwardingRules: this._handleGetForwardingRules.bind(this),
			onCreateForwardingRule: this._handleCreateForwardingRule.bind(this),
			onStartForwarding: this._handleStartForwarding.bind(this),
			onStopForwarding: this._handleStopForwarding.bind(this),
			onDeleteForwardingRule: this._handleDeleteForwardingRule.bind(this),
			onShowMessage: this._handleShowMessage.bind(this)
		} : {
			connectionId: '',
			onGetForwardingRules: this._handleGetForwardingRules.bind(this),
			onCreateForwardingRule: this._handleCreateForwardingRule.bind(this),
			onStartForwarding: this._handleStartForwarding.bind(this),
			onStopForwarding: this._handleStopForwarding.bind(this),
			onDeleteForwardingRule: this._handleDeleteForwardingRule.bind(this),
			onShowMessage: this._handleShowMessage.bind(this)
		};

		this._reactRoot.render(
			React.createElement(
				ErdosReactServicesContext.Provider,
				{ value: ErdosReactServices.services },
				React.createElement(PortForwarding, props)
			)
		);
	}

	private _destroyReactComponent(): void {
		if (this._reactRoot) {
			this._reactRoot.unmount();
			this._reactRoot = undefined;
		}
	}

	private async _handleGetForwardingRules(connectionId: string): Promise<IForwardRule[]> {
		try {
			const result = await this._databaseClientService.getForwardingRules(connectionId);
			return result;
		} catch (error: any) {
			this._telemetryService.publicLog2<{ error: string; connectionId: string }, {
				owner: 'erdos-database-client';
				comment: 'Get forwarding rules error tracking';
				error: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Error message from get forwarding rules' };
				connectionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Database connection identifier' };
			}>('erdos.getForwardingRulesError', {
				error: error.message || 'Unknown error',
				connectionId
			});

			throw error;
		}
	}

	private async _handleCreateForwardingRule(connectionId: string, rule: Omit<IForwardRule, 'id' | 'state'>): Promise<string> {
		try {
			const result = await this._databaseClientService.createForwardingRule(connectionId, rule);
			return result;
		} catch (error: any) {
			this._telemetryService.publicLog2<{ error: string; connectionId: string; ruleName: string }, {
				owner: 'erdos-database-client';
				comment: 'Create forwarding rule error tracking';
				error: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Error message from create forwarding rule' };
				connectionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Database connection identifier' };
				ruleName: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Forwarding rule name' };
			}>('erdos.createForwardingRuleError', {
				error: error.message || 'Unknown error',
				connectionId,
				ruleName: rule.name
			});

			throw error;
		}
	}

	private async _handleStartForwarding(ruleId: string): Promise<void> {
		try {
			await this._databaseClientService.startForwarding(ruleId);
		} catch (error: any) {
			this._telemetryService.publicLog2<{ error: string; ruleId: string }, {
				owner: 'erdos-database-client';
				comment: 'Start forwarding error tracking';
				error: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Error message from start forwarding' };
				ruleId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Forwarding rule identifier' };
			}>('erdos.startForwardingError', {
				error: error.message || 'Unknown error',
				ruleId
			});

			throw error;
		}
	}

	private async _handleStopForwarding(ruleId: string): Promise<void> {
		try {
			await this._databaseClientService.stopForwarding(ruleId);
		} catch (error: any) {
			this._telemetryService.publicLog2<{ error: string; ruleId: string }, {
				owner: 'erdos-database-client';
				comment: 'Stop forwarding error tracking';
				error: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Error message from stop forwarding' };
				ruleId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Forwarding rule identifier' };
			}>('erdos.stopForwardingError', {
				error: error.message || 'Unknown error',
				ruleId
			});

			throw error;
		}
	}

	private async _handleDeleteForwardingRule(ruleId: string): Promise<void> {
		try {
			await this._databaseClientService.deleteForwardingRule(ruleId);
		} catch (error: any) {
			this._telemetryService.publicLog2<{ error: string; ruleId: string }, {
				owner: 'erdos-database-client';
				comment: 'Delete forwarding rule error tracking';
				error: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Error message from delete forwarding rule' };
				ruleId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Forwarding rule identifier' };
			}>('erdos.deleteForwardingRuleError', {
				error: error.message || 'Unknown error',
				ruleId
			});

			throw error;
		}
	}

	private _handleShowMessage(message: string, type: 'info' | 'warning' | 'error' | 'success'): void {
		// Messages silently ignored - no notifications
	}
}
