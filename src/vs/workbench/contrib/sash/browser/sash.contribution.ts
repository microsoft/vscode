/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MAX_TIMEOUT_DELAY } from '../../../../base/common/async.js';
import { isIOS } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { workbenchConfigurationNodeBase } from '../../../common/configuration.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { SashGrippersController, SashSettingsController } from './sash.js';

// Sash size contribution
registerWorkbenchContribution2(SashSettingsController.ID, SashSettingsController, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(SashGrippersController.ID, SashGrippersController, WorkbenchPhase.AfterRestored);

// Sash size configuration contribution
Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration)
	.registerConfiguration({
		...workbenchConfigurationNodeBase,
		properties: {
			'workbench.sash.autoHideGrippers': {
				type: 'boolean',
				default: true,
				markdownDescription: localize('sashAutoHideGrippers', "Controls whether sash grippers between views and editors hide when the mouse is idle and reappear when the mouse moves. Use {0} to configure the delay. Disable to keep grippers visible. Mouse movement inside nested frames embedded in webviews, such as Simple Browser pages, is not detected. Hover and drag feedback is unaffected.", '`#workbench.sash.autoHideGrippersDelay#`')
			},
			'workbench.sash.autoHideGrippersDelay': {
				type: 'number',
				default: 2000,
				minimum: 0,
				maximum: MAX_TIMEOUT_DELAY,
				markdownDescription: localize('sashAutoHideGrippersDelay', "Controls how long to wait in milliseconds without mouse movement before fading out sash grippers. Applies when {0} is enabled.", '`#workbench.sash.autoHideGrippers#`')
			},
			'workbench.sash.size': {
				type: 'number',
				default: isIOS ? 20 : 4,
				minimum: 1,
				maximum: 20,
				description: localize('sashSize', "Controls the feedback area size in pixels of the dragging area in between views/editors. Set it to a larger value if you feel it's hard to resize views using the mouse.")
			},
			'workbench.sash.hoverDelay': {
				type: 'number',
				default: 300,
				minimum: 0,
				maximum: 2000,
				description: localize('sashHoverDelay', "Controls the hover feedback delay in milliseconds of the dragging area in between views/editors.")
			},
		}
	});
