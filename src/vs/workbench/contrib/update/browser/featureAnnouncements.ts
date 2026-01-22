/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * This file registers all feature announcements declaratively.
 * To add a new announcement:
 * 1. Add a new registerAnnouncement() call below
 * 2. Include a unique id with version suffix (e.g., 'my-feature-v1')
 * 3. Set appropriate minVersion/maxVersion for targeting
 *
 * Announcements will automatically:
 * - Show as a toast on first launch after update
 * - Appear in the notification bell menu
 * - Track dismissal state to not show again
 */

import { Registry } from '../../../../platform/registry/common/platform.js';
import {
	Extensions,
	IFeatureAnnouncementRegistry
} from '../../../services/notification/common/featureAnnouncementRegistry.js';

// Get the registry
const registry = Registry.as<IFeatureAnnouncementRegistry>(Extensions.FeatureAnnouncements);

/*---------------------------------------------------------------------------------------------
 *  Agent Sessions Announcement (v1.96+)
 *--------------------------------------------------------------------------------------------*/
registry.registerAnnouncement({
	id: 'agent-sessions-v2',
	category: 'NEW IN VS CODE',
	title: 'Agent Sessions',
	minVersion: '1.96.0',
	features: [
		{
			icon: 'list-flat',
			title: 'Manage Running Sessions',
			description: 'View and manage all your active agent sessions from a single location, including local and cloud sessions'
		},
		{
			icon: 'play',
			title: 'Background Execution',
			description: 'Sessions continue running in the background even when you close the chat panel'
		},
		{
			icon: 'extensions',
			title: 'Multi-Provider Support',
			description: 'Connect to different session providers including local background sessions and cloud-based agents'
		}
	],
	learnMoreUrl: 'https://code.visualstudio.com/docs/copilot/agents',
	primaryActionLabel: 'Open Agent Sessions',
	primaryActionCommandId: 'workbench.action.openAgentSessionsWelcome'
});

/*---------------------------------------------------------------------------------------------
 *  Add new announcements below following the same pattern
 *--------------------------------------------------------------------------------------------*/

// Example: Another feature announcement
// registry.registerAnnouncement({
// 	id: 'another-feature-v1',
// 	category: 'NEW IN VS CODE',
// 	title: 'Another Cool Feature',
// 	minVersion: '1.97.0',
// 	features: [
// 		{
// 			icon: 'rocket',
// 			title: 'Feature Title',
// 			description: 'Feature description goes here'
// 		}
// 	],
// 	learnMoreUrl: 'https://code.visualstudio.com/docs/...',
// 	primaryActionLabel: 'Try It',
// 	primaryActionCommandId: 'some.command.id'
// });
