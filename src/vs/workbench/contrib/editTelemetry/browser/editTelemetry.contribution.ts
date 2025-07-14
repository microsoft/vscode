/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditTelemetryService } from './editTelemetryService.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { localize } from '../../../../nls.js';
import { EDIT_TELEMETRY_DETAILS_SETTING_ID, EDIT_TELEMETRY_SETTING_ID, EDIT_TELEMETRY_SHOW_DECORATIONS, EDIT_TELEMETRY_SHOW_STATUS_BAR } from './settings.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';

registerWorkbenchContribution2('EditTelemetryService', EditTelemetryService, WorkbenchPhase.AfterRestored);

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
		[EDIT_TELEMETRY_DETAILS_SETTING_ID]: {
			markdownDescription: localize('telemetry.editStats.detailed.enabled', "Controls whether to enable telemetry for detailed edit statistics (only sends statistics if general telemetry is enabled)."),
			type: 'boolean',
			default: false,
			tags: ['experimental', 'onExP'],
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
