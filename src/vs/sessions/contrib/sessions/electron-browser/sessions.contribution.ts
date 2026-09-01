/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { SESSIONS_APPLICATION_BADGE_SETTING, SessionsApplicationBadge } from './sessionsApplicationBadge.js';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'sessions',
	properties: {
		[SESSIONS_APPLICATION_BADGE_SETTING]: {
			type: 'boolean',
			tags: ['preview'],
			description: localize('sessions.showApplicationBadge', "Controls whether the application icon shows a badge with the number of unarchived sessions that are unread and no longer in progress, need input, or are no longer in progress and have failing CI checks on an open, non-draft pull request. The badge appears on the dock icon on macOS, on the launcher icon on Linux and over the taskbar icon on Windows."),
			default: false,
			experiment: { mode: 'auto' }
		},
	},
});

registerWorkbenchContribution2(SessionsApplicationBadge.ID, SessionsApplicationBadge, WorkbenchPhase.AfterRestored);
