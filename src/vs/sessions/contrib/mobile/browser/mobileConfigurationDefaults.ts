/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationDefaults } from '../../../../platform/configuration/common/configurationRegistry.js';
import { PROMPT_TIMELINE_DISPLAY_SETTING } from '../../../../workbench/contrib/chat/common/promptTimeline.js';
import { CloudSandboxEnabledSettingId } from '../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING, NEW_SESSION_WELCOME_PHRASES_SETTING } from '../../chat/common/constants.js';

/** Presentation defaults owned by the mobile entry; explicit user values and policy still win. */
export const mobileConfigurationDefaults: IConfigurationDefaults = {
	overrides: {
		[CloudSandboxEnabledSettingId]: true,
		// Desktop composer experiments must not change the mobile presentation between builds.
		[EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING]: false,
		[NEW_SESSION_WELCOME_PHRASES_SETTING]: false,
		// The prompt timeline rail is a 16px gutter handle that opens on hover;
		// on a touch screen it is an unreachable target beside the transcript.
		[PROMPT_TIMELINE_DISPLAY_SETTING]: 'off',
	},
	donotCache: true,
	preventExperimentOverride: true,
	source: 'mobileDefaults',
};
