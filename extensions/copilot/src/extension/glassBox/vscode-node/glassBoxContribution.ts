/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { ILogService } from '../../../platform/log/common/logService';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { IExtensionContribution } from '../../common/contributions';
import { IGlassBoxService } from '../common/glassBoxService';
import { GlassBoxPanel } from './glassBoxPanel';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';

const OPEN_COMMAND = 'github.copilot.chat.glassBox.open';
const CONTEXT_KEY = 'github.copilot.chat.glassBox.enabled';
const SETTING_KEY = 'github.copilot.chat.glassBox.devtools.enabled';

/**
 * Contribution that wires up the Glass Box AI DevTools panel,
 * registers commands, and manages the webview lifecycle.
 */
export class GlassBoxContribution extends Disposable implements IExtensionContribution {
	readonly id = 'glassBox';

	private _panel: GlassBoxPanel | undefined;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IGlassBoxService private readonly _glassBoxService: IGlassBoxService,
		@IVSCodeExtensionContext private readonly _extensionContext: IVSCodeExtensionContext,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();

		// Set the context key so commands/menus can be gated
		vscode.commands.executeCommand('setContext', CONTEXT_KEY, true);

		// If already enabled at startup, begin collection immediately so data is captured
		// from the very first request — not just after the panel is opened.
		if (this._configurationService.getConfig(ConfigKey.Advanced.GlassBoxEnabled)) {
			this._glassBoxService.setEnabled(true);
		}

		// React to setting changes at runtime
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(SETTING_KEY)) {
				if (this._configurationService.getConfig(ConfigKey.Advanced.GlassBoxEnabled)) {
					this._glassBoxService.setEnabled(true);
					this._logService.info('GlassBox: DevTools enabled — capturing requests');
				} else {
					this._glassBoxService.setEnabled(false);
					this._logService.info('GlassBox: DevTools disabled — capture stopped');
				}
			}
		}));

		this._registerCommands();
		this._logService.info('GlassBox: DevTools contribution initialized');
	}

	private _registerCommands(): void {
		// Command to open the Glass Box panel
		this._register(vscode.commands.registerCommand(OPEN_COMMAND, async () => {
			if (!this._isEnabled()) {
				await this._promptToEnable();
				return;
			}
			this._ensurePanel();
			this._panel!.show();
			this._telemetryService.sendMSFTTelemetryEvent('glassbox.panel.opened');
		}));
	}

	private _isEnabled(): boolean {
		return this._configurationService.getConfig(ConfigKey.Advanced.GlassBoxEnabled);
	}

	private async _promptToEnable(): Promise<void> {
		const action = await vscode.window.showInformationMessage(
			'Glass Box AI DevTools is disabled. Enable it in Settings to capture and inspect Copilot request internals.',
			'Enable in Settings',
		);
		if (action === 'Enable in Settings') {
			vscode.commands.executeCommand('workbench.action.openSettings', SETTING_KEY);
		}
	}

	private _ensurePanel(): void {
		if (!this._panel) {
			this._glassBoxService.setEnabled(true);
			this._panel = this._register(
				this._instantiationService.createInstance(GlassBoxPanel, this._extensionContext.extensionUri)
			);
		}
	}
}
