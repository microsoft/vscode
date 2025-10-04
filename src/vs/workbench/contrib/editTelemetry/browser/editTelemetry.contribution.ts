/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditTelemetryContribution } from './editTelemetryContribution.js';
import { EDIT_TELEMETRY_SETTING_ID, STATS_SETTING_ID } from './settingIds.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { localize } from '../../../../nls.js';
import { EDIT_TELEMETRY_DETAILS_SETTING_ID, EDIT_TELEMETRY_SHOW_DECORATIONS, EDIT_TELEMETRY_SHOW_STATUS_BAR } from './settings.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IAiEditTelemetryService } from './telemetry/aiEditTelemetry/aiEditTelemetryService.js';
import { AiEditTelemetryServiceImpl } from './telemetry/aiEditTelemetry/aiEditTelemetryServiceImpl.js';

registerWorkbenchContribution2('EditTelemetryContribution', EditTelemetryContribution, WorkbenchPhase.AfterRestored);

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'task',
	order: 100,
	title: localize('editTelemetry', "Edit Telemetry"),
	type: 'object',
	properties: {
		[EDIT_TELEMETRY_SETTING_ID]: {
			markdownDescription: localize('telemetry.editStats.enabled', "Controls whether to enable telemetry for edit statistics (only sends statistics if general telemetry is enabled)."),
			type: 'boolean',
			default: true,
			tags: ['experimental'],
		},
		[STATS_SETTING_ID]: {
			markdownDescription: localize('editor.stats.enabled', "Controls which statistics to display in the editor status bar. 'aiStats' shows the average amount of code inserted by AI vs manual typing over a 24 hour period. 'premiumQuota' shows GitHub Copilot Premium request quota usage."),
			type: 'string',
			enum: ['off', 'aiStats', 'premiumQuota'],
			enumDescriptions: [
				localize('editor.stats.off', "Do not show statistics in the status bar."),
				localize('editor.stats.aiStats', "Show AI vs manual typing statistics."),
				localize('editor.stats.premiumQuota', "Show GitHub Copilot Premium request quota usage.")
			],
			default: 'aiStats',
			tags: ['experimental'],
			experiment: {
				mode: 'auto'
			}
		},
		[EDIT_TELEMETRY_DETAILS_SETTING_ID]: {
			markdownDescription: localize('telemetry.editStats.detailed.enabled', "Controls whether to enable telemetry for detailed edit statistics (only sends statistics if general telemetry is enabled)."),
			type: 'boolean',
			default: false,
			tags: ['experimental'],
			experiment: {
				mode: 'auto'
			}
		},
		[EDIT_TELEMETRY_SHOW_STATUS_BAR]: {
			markdownDescription: localize('telemetry.editStats.showStatusBar', "Controls whether to show the status bar for edit telemetry."),
			type: 'boolean',
			default: false,
			tags: ['experimental'],
		},
		[EDIT_TELEMETRY_SHOW_DECORATIONS]: {
			markdownDescription: localize('telemetry.editStats.showDecorations', "Controls whether to show decorations for edit telemetry."),
			type: 'boolean',
			default: false,
			tags: ['experimental'],
		},
	}
});

registerSingleton(IAiEditTelemetryService, AiEditTelemetryServiceImpl, InstantiationType.Delayed);
