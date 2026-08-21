/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { chatPetAchievements, ChatPetAchievementIds } from '../../../../contrib/chat/browser/chatPetAchievements.js';
import { IChatPetService } from '../../../../contrib/chat/browser/chatPetService.js';
// eslint-disable-next-line local/code-import-patterns
import { SessionsChatPetAchievementBadges } from '../../../../../sessions/contrib/accountMenu/browser/chatPetAchievementBadges.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { configureChatPetFixtureFileRoot, FixtureChatPetService, IChatPetFixtureOptions } from '../chat/chatPetFixtureUtils.js';

function renderAchievementBadges(context: ComponentFixtureContext, options: IChatPetFixtureOptions): void {
	context.container.classList.add('agent-sessions-workbench');
	context.container.style.width = '400px';
	configureChatPetFixtureFileRoot(context.disposableStore);

	const chatPetService = context.disposableStore.add(new FixtureChatPetService(options));
	const instantiationService = createEditorServices(context.disposableStore, {
		colorTheme: context.theme,
		additionalServices: registry => {
			registry.defineInstance(IChatPetService, chatPetService);
		},
	});
	const panel = DOM.append(context.container, DOM.$('.sessions-account-titlebar-panel'));
	panel.style.width = '400px';
	const widget = context.disposableStore.add(instantiationService.createInstance(SessionsChatPetAchievementBadges, panel, () => { }));
	if (widget.element.classList.contains('hidden') !== !options.enabled) {
		throw new Error('Pet achievement badges fixture visibility did not match pet enablement.');
	}
}

export default defineThemedFixtureGroup({ path: 'sessions/accountMenu/petAchievementBadges/' }, {
	NoBadges: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderAchievementBadges(context, { enabled: true }),
	}),
	Partial: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderAchievementBadges(context, {
			enabled: true,
			unlockedAchievements: [
				ChatPetAchievementIds.RequestRevision,
				ChatPetAchievementIds.IntegratedBrowserShared,
				ChatPetAchievementIds.McpServerPresent,
			],
		}),
	}),
	AllBadges: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		render: context => renderAchievementBadges(context, {
			enabled: true,
			unlockedAchievements: chatPetAchievements.map(achievement => achievement.id),
			variant: 'insiders',
		}),
	}),
});
