/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService, ConfigurationTargetToString } from '../../../../../platform/configuration/common/configuration.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { TerminalSettingId } from '../../../../../platform/terminal/common/terminal.js';
import { TerminalChatAgentToolsSettingId } from '../../chatAgentTools/common/terminalChatAgentToolsConfiguration.js';

const terminalProfileSettings = [
	{ settingId: TerminalChatAgentToolsSettingId.TerminalProfileLinux, profileType: 'chat', os: 'linux' },
	{ settingId: TerminalChatAgentToolsSettingId.TerminalProfileMacOs, profileType: 'chat', os: 'osx' },
	{ settingId: TerminalChatAgentToolsSettingId.TerminalProfileWindows, profileType: 'chat', os: 'windows' },
	{ settingId: TerminalSettingId.AutomationProfileLinux, profileType: 'automation', os: 'linux' },
	{ settingId: TerminalSettingId.AutomationProfileMacOs, profileType: 'automation', os: 'osx' },
	{ settingId: TerminalSettingId.AutomationProfileWindows, profileType: 'automation', os: 'windows' },
	{ settingId: TerminalSettingId.DefaultProfileLinux, profileType: 'default', os: 'linux' },
	{ settingId: TerminalSettingId.DefaultProfileMacOs, profileType: 'default', os: 'osx' },
	{ settingId: TerminalSettingId.DefaultProfileWindows, profileType: 'default', os: 'windows' },
] as const;

type TerminalProfileSetting = typeof terminalProfileSettings[number];

export class TerminalProfileConfigurationTelemetry extends Disposable {
	private readonly _configuredSettings = new Map<TerminalProfileSetting['settingId'], boolean>();

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super();

		for (const setting of terminalProfileSettings) {
			this._configuredSettings.set(setting.settingId, this._isConfigured(configurationService, setting.settingId));
		}

		this._register(configurationService.onDidChangeConfiguration(event => {
			for (const setting of terminalProfileSettings) {
				if (!event.affectsConfiguration(setting.settingId)) {
					continue;
				}

				this._reportSettingChanged(configurationService, telemetryService, setting, ConfigurationTargetToString(event.source) ?? 'UNKNOWN');
			}
		}));
	}

	private _reportSettingChanged(
		configurationService: IConfigurationService,
		telemetryService: ITelemetryService,
		setting: TerminalProfileSetting,
		source: string,
	): void {
		type TerminalProfileSettingChangedEvent = {
			settingId: TerminalProfileSetting['settingId'];
			profileType: TerminalProfileSetting['profileType'];
			os: TerminalProfileSetting['os'];
			configured: boolean;
			changeType: 'added' | 'changed' | 'removed';
			source: string;
		};
		type TerminalProfileSettingChangedClassification = {
			owner: 'anthonykim1';
			comment: 'Tracks changes to terminal profile settings without collecting profile names, paths, arguments, environment variables, or other profile contents.';
			settingId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The terminal profile setting that changed.' };
			profileType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the changed setting controls chat, automation, or default terminals.' };
			os: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The operating system targeted by the changed setting.' };
			configured: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the setting resolves to a configured profile after the change.' };
			changeType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the effective profile setting was added, changed, or removed.' };
			source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The configuration target that caused the change.' };
		};

		const configured = this._isConfigured(configurationService, setting.settingId);
		const wasConfigured = this._configuredSettings.get(setting.settingId) ?? false;
		const changeType = configured ? (wasConfigured ? 'changed' : 'added') : (wasConfigured ? 'removed' : 'changed');
		this._configuredSettings.set(setting.settingId, configured);

		telemetryService.publicLog2<TerminalProfileSettingChangedEvent, TerminalProfileSettingChangedClassification>('terminal/profileSettingChanged', {
			...setting,
			configured,
			changeType,
			source,
		});
	}

	private _isConfigured(configurationService: IConfigurationService, settingId: TerminalProfileSetting['settingId']): boolean {
		const value = configurationService.getValue(settingId);
		return value !== null && value !== undefined;
	}
}
