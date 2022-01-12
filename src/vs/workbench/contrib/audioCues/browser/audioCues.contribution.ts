/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { AudioCueContribution } from 'vs/workbench/contrib/audioCues/browser/audioCueContribution';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(AudioCueContribution, LifecyclePhase.Restored);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	'properties': {
		'audioCues.enabled': {
			'type': 'string',
			'description': localize('audioCues.enabled', "Controls whether audio cues are enabled."),
			'enum': ['auto', 'on', 'off'],
			'default': 'auto',
			'enumDescriptions': [
				localize('audioCues.enabled.auto', "Enable audio cues when a screen reader is attached."),
				localize('audioCues.enabled.on', "Enable audio cues."),
				localize('audioCues.enabled.off', "Disable audio cues.")
			],
		}
	}
});
