/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { SESSIONS_APPLICATION_BADGE_DEFAULT, SESSIONS_APPLICATION_BADGE_OPTIONS_DEFAULT, SESSIONS_APPLICATION_BADGE_OPTIONS_SETTING, SESSIONS_APPLICATION_BADGE_SETTING, SessionsApplicationBadge } from './sessionsApplicationBadge.js';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'sessions',
	properties: {
		[SESSIONS_APPLICATION_BADGE_SETTING]: {
			type: 'boolean',
			tags: ['preview'],
			markdownDescription: localize('sessions.showApplicationBadge', "Controls whether the application icon shows a badge with the number of unarchived sessions matching {0}. The badge appears on the dock icon on macOS, on the launcher icon on Linux and over the taskbar icon on Windows.", `\`#${SESSIONS_APPLICATION_BADGE_OPTIONS_SETTING}#\``),
			default: SESSIONS_APPLICATION_BADGE_DEFAULT,
			experiment: { mode: 'auto' }
		},
		[SESSIONS_APPLICATION_BADGE_OPTIONS_SETTING]: {
			type: 'object',
			tags: ['preview'],
			markdownDescription: localize('sessions.applicationBadge', "Controls which unarchived sessions are counted in the application badge when {0} is enabled. Sessions matching more than one enabled option are counted once.", `\`#${SESSIONS_APPLICATION_BADGE_SETTING}#\``),
			additionalProperties: false,
			properties: {
				inputNeeded: {
					type: 'boolean',
					description: localize('sessions.applicationBadge.inputNeeded', "Count sessions that need input or approval."),
					default: SESSIONS_APPLICATION_BADGE_OPTIONS_DEFAULT.inputNeeded,
				},
				unread: {
					type: 'boolean',
					description: localize('sessions.applicationBadge.unread', "Count unread sessions that are no longer in progress."),
					default: SESSIONS_APPLICATION_BADGE_OPTIONS_DEFAULT.unread,
				},
				ciFailing: {
					type: 'boolean',
					description: localize('sessions.applicationBadge.ciFailing', "Count sessions with failing CI checks on an open, non-draft pull request that are no longer in progress and are not being handled by Agent Merge."),
					default: SESSIONS_APPLICATION_BADGE_OPTIONS_DEFAULT.ciFailing,
				},
			},
			default: SESSIONS_APPLICATION_BADGE_OPTIONS_DEFAULT,
		},
	},
});

registerWorkbenchContribution2(SessionsApplicationBadge.ID, SessionsApplicationBadge, WorkbenchPhase.AfterRestored);
