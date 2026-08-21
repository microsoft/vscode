/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ChatPetAchievementsEditor } from '../../../../contrib/chat/browser/chatPetAchievementsEditor.js';
import { ChatPetAchievementsEditorInput } from '../../../../contrib/chat/browser/chatPetAchievementsEditorInput.js';
import { chatPetAchievements, ChatPetAccessoryIds, ChatPetAchievementIds } from '../../../../contrib/chat/browser/chatPetAchievements.js';
import { IChatPetService } from '../../../../contrib/chat/browser/chatPetService.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';
import { configureChatPetFixtureFileRoot, FixtureChatPetService, IChatPetFixtureOptions } from './chatPetFixtureUtils.js';

interface IAchievementsEditorFixtureOptions extends IChatPetFixtureOptions {
	readonly width?: number;
	readonly height?: number;
}

function createMockEditorGroup(): IEditorGroup {
	return new class extends mock<IEditorGroup>() {
		override windowId = mainWindow.vscodeWindowId;
	}();
}

async function renderAchievementsEditor(context: ComponentFixtureContext, options: IAchievementsEditorFixtureOptions): Promise<void> {
	const width = options.width ?? 900;
	const height = options.height ?? 600;
	context.container.style.width = `${width}px`;
	context.container.style.height = `${height}px`;
	configureChatPetFixtureFileRoot(context.disposableStore);

	const chatPetService = context.disposableStore.add(new FixtureChatPetService(options));
	const instantiationService = createEditorServices(context.disposableStore, {
		colorTheme: context.theme,
		additionalServices: registry => {
			registerWorkbenchServices(registry);
			registry.defineInstance(IChatPetService, chatPetService);
		},
	});
	const editor = context.disposableStore.add(instantiationService.createInstance(ChatPetAchievementsEditor, createMockEditorGroup()));
	editor.create(context.container);
	editor.layout(new Dimension(width, height));
	const input = context.disposableStore.add(ChatPetAchievementsEditorInput.getOrCreate());
	await editor.setInput(input, undefined, {}, CancellationToken.None);
}

export default defineThemedFixtureGroup({ path: 'chat/petAchievements/standaloneModal/' }, {
	AllLocked: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderAchievementsEditor(context, { enabled: true }),
	}),
	MixedNoHat: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderAchievementsEditor(context, {
			enabled: true,
			unlockedAchievements: [ChatPetAchievementIds.RequestRevision, ChatPetAchievementIds.FirstChatMessage],
			unseenAchievements: [ChatPetAchievementIds.FirstChatMessage],
		}),
	}),
	MixedSelected: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		render: context => renderAchievementsEditor(context, {
			enabled: true,
			unlockedAchievements: [ChatPetAchievementIds.RequestRevision, ChatPetAchievementIds.FirstChatMessage],
			unseenAchievements: [ChatPetAchievementIds.FirstChatMessage],
			selectedAccessory: ChatPetAccessoryIds.TopHatMonocle,
		}),
	}),
	MediumMixed: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderAchievementsEditor(context, {
			enabled: true,
			unlockedAchievements: [ChatPetAchievementIds.RequestRevision, ChatPetAchievementIds.FirstChatMessage],
			unseenAchievements: [ChatPetAchievementIds.FirstChatMessage],
			selectedAccessory: ChatPetAccessoryIds.CowboyHat,
			width: 700,
			height: 500,
		}),
	}),
	AllUnlocked: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderAchievementsEditor(context, {
			enabled: true,
			unlockedAchievements: chatPetAchievements.map(achievement => achievement.id),
			selectedAccessory: ChatPetAccessoryIds.Crown,
			variant: 'insiders',
		}),
	}),
	NarrowMixed: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderAchievementsEditor(context, {
			enabled: true,
			unlockedAchievements: [ChatPetAchievementIds.IntegratedBrowserShared],
			width: 550,
			height: 500,
		}),
	}),
});
