/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ChatPetAchievementsEditor } from '../../../../contrib/chat/browser/chatPetAchievementsEditor.js';
import { ChatPetAchievementsEditorInput, ChatPetCustomizationTab } from '../../../../contrib/chat/browser/chatPetAchievementsEditorInput.js';
import { chatPetAchievements, ChatPetAccessoryIds, ChatPetAchievementIds } from '../../../../contrib/chat/browser/chatPetAchievements.js';
import { IChatPetService } from '../../../../contrib/chat/browser/chatPetService.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { TestChatEntitlementService } from '../../../common/workbenchTestServices.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';
import { configureChatPetFixtureFileRoot, FixtureChatPetService, IChatPetFixtureOptions } from './chatPetFixtureUtils.js';

interface IAchievementsEditorFixtureOptions extends IChatPetFixtureOptions {
	readonly width?: number;
	readonly height?: number;
	readonly tab?: ChatPetCustomizationTab;
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
			registry.defineInstance(IChatEntitlementService, new TestChatEntitlementService());
		},
	});
	const editor = context.disposableStore.add(instantiationService.createInstance(ChatPetAchievementsEditor, createMockEditorGroup()));
	editor.create(context.container);
	editor.layout(new Dimension(width, height));
	const input = context.disposableStore.add(ChatPetAchievementsEditorInput.getOrCreate());
	await editor.setInput(input, { tab: options.tab }, {}, CancellationToken.None);
	if (options.tab === 'color') {
		await new Promise<void>((resolve, reject) => {
			const deadline = mainWindow.performance.now() + 5_000;
			const check = () => {
				const previews = Array.from(context.container.querySelectorAll<HTMLCanvasElement>('.chat-pet-color-preview'));
				const scrollbars = Array.from(context.container.querySelectorAll<HTMLElement>('.scrollbar'));
				const scrollbarsSettled = scrollbars.every(scrollbar => scrollbar.classList.contains('invisible') && mainWindow.getComputedStyle(scrollbar).opacity === '0');
				if (scrollbarsSettled && previews.length === 11 && previews.every(preview => preview.getContext('2d')?.getImageData(0, 0, preview.width, preview.height).data.some((value, index) => index % 4 === 3 && value !== 0))) {
					resolve();
				} else if (mainWindow.performance.now() >= deadline) {
					reject(new Error('Color customization previews and scrollbars did not finish rendering.'));
				} else {
					mainWindow.requestAnimationFrame(check);
				}
			};
			check();
		});
	}
}

export default defineThemedFixtureGroup({ path: 'chat/petAchievements/standaloneModal/' }, {
	ColorLocked: defineComponentFixture({
		labels: { kind: 'screenshot' },
		virtualTime: { enabled: false },
		render: context => renderAchievementsEditor(context, { enabled: true, tab: 'color' }),
	}),
	ColorUnlocked: defineComponentFixture({
		labels: { kind: 'screenshot' },
		virtualTime: { enabled: false },
		render: context => renderAchievementsEditor(context, {
			enabled: true,
			tab: 'color',
			unlockedAchievements: [ChatPetAchievementIds.Blobby],
			color: '#a277e6',
		}),
	}),
	ColorNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		virtualTime: { enabled: false },
		render: context => renderAchievementsEditor(context, {
			enabled: true,
			tab: 'color',
			unlockedAchievements: [ChatPetAchievementIds.Blobby],
			color: '#abc123',
			width: 360,
			height: 640,
		}),
	}),
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
