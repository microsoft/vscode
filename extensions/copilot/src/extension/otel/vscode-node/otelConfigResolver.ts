/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { workspace, type ConfigurationChangeEvent, type Event } from 'vscode';
import { IOTelConfigResolver, IOTelSettingsReader, IResolvedOTelConfig, resolveOTelConfigFromSettings, snapshotOTelEnv } from '../../../platform/otel/common/otelConfigResolution';
import { Disposable } from '../../../util/vs/base/common/lifecycle';

export const OTEL_SETTINGS_SECTION = 'github.copilot.chat.otel';

interface OTelConfigurationSource {
	getConfiguration(section: string): IOTelSettingsReader;
	readonly onDidChangeConfiguration: Event<Pick<ConfigurationChangeEvent, 'affectsConfiguration'>>;
}

export class VSCodeOTelConfigResolver extends Disposable implements IOTelConfigResolver {
	declare readonly _serviceBrand: undefined;
	private readonly _env: Record<string, string | undefined>;
	private _currentResolution: IResolvedOTelConfig;
	private _captureIdentityAllowed: boolean;
	readonly activeResolution: IResolvedOTelConfig;

	constructor(
		env: Record<string, string | undefined>,
		private readonly _extensionVersion: string,
		private readonly _sessionId: string,
		private readonly _configurationSource: OTelConfigurationSource = workspace,
	) {
		super();
		this._env = snapshotOTelEnv(env);
		this.activeResolution = this._currentResolution = this._readConfiguration();
		this._captureIdentityAllowed = this.activeResolution.config.captureIdentity;
		this._register(this._configurationSource.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(OTEL_SETTINGS_SECTION)) {
				this._currentResolution = this._readConfiguration();
				// Observe even a transient denial between exports, independently of debounced reload notices.
				this._captureIdentityAllowed &&= this._currentResolution.config.captureIdentity;
			}
		}));
	}

	get captureIdentityAllowed(): boolean {
		return this._captureIdentityAllowed;
	}

	resolve(): IResolvedOTelConfig {
		return this._currentResolution;
	}

	private _readConfiguration(): IResolvedOTelConfig {
		return resolveOTelConfigFromSettings(this._configurationSource.getConfiguration(OTEL_SETTINGS_SECTION), this._env, this._extensionVersion, this._sessionId);
	}
}
