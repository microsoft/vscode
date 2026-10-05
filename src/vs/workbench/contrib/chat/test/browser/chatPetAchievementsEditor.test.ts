/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { Dimension } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { FileAccess, Schemas } from '../../../../../base/common/network.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { EditorInputCapabilities } from '../../../../common/editor.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { TestChatEntitlementService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { CHAT_PET_OPEN_ACHIEVEMENTS_COMMAND_ID, ChatPetAccessoryId, ChatPetAccessoryIds, ChatPetAchievementId, ChatPetAchievementIds } from '../../browser/chatPetAchievements.js';
import '../../browser/chatPetAchievements.contribution.js';
import { ChatPetAchievementsEditorInput } from '../../browser/chatPetAchievementsEditorInput.js';
import { ChatPetAchievementsEditor } from '../../browser/chatPetAchievementsEditor.js';
import { ChatPetAchievementsWidget } from '../../browser/chatPetAchievementsWidget.js';
import { ChatPetService, ChatPetVariant, IChatPetService } from '../../browser/chatPetService.js';
import { CHAT_PET_CHANGE_COLOR_COMMAND_ID, getChatPetBodyColor } from '../../browser/chatPetColors.js';

suite('Chat Pet Achievements Editor', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		if (mainWindow.location.protocol === `${Schemas.file}:`) {
			// Keep preview assets on the file: origin of the Electron test document.
			sinon.stub(FileAccess, 'asBrowserUri').callsFake(resource => FileAccess.asFileUri(resource));
		}
	});
	teardown(() => sinon.restore());

	test('opens a standalone modal editor input', async () => {
		let openedInput: ChatPetAchievementsEditorInput | undefined;
		let pinned: boolean | undefined;
		const editorService = {
			openEditor: async (input: ChatPetAchievementsEditorInput, options: { readonly pinned?: boolean }) => {
				openedInput = input;
				pinned = options.pinned;
				return undefined;
			},
		};
		const chatPetService = new class extends mock<IChatPetService>() {
			override readonly enabled = constObservable(true);
		}();
		const accessor = {
			get: (service: typeof IEditorService | typeof IChatPetService | typeof IChatEntitlementService) => {
				if (service === IChatPetService) {
					return chatPetService;
				}
				if (service === IChatEntitlementService) {
					return new TestChatEntitlementService();
				}
				assert.strictEqual(service, IEditorService);
				return editorService;
			},
		} as ServicesAccessor;
		const command = CommandsRegistry.getCommand(CHAT_PET_OPEN_ACHIEVEMENTS_COMMAND_ID);
		assert.ok(command);

		await command.handler(accessor);
		assert.ok(openedInput);
		store.add(openedInput);
		assert.deepStrictEqual({
			name: openedInput.getName(),
			pinned,
			singleton: openedInput.hasCapability(EditorInputCapabilities.Singleton),
			requiresModal: openedInput.hasCapability(EditorInputCapabilities.RequiresModal),
			modalOptions: openedInput.getModalEditorOptions(),
		}, {
			name: 'Customize Blobby',
			pinned: true,
			singleton: true,
			requiresModal: true,
			modalOptions: { compactHeader: true },
		});
	});

	test('does not open while the pet is disabled', async () => {
		let openCount = 0;
		const accessor = {
			get: (service: typeof IEditorService | typeof IChatPetService) => service === IChatPetService
				? new class extends mock<IChatPetService>() { override readonly enabled = constObservable(false); }()
				: new class extends mock<IEditorService>() {
					override async openEditor(): Promise<undefined> {
						openCount++;
						return undefined;
					}
				}(),
		} as ServicesAccessor;
		const command = CommandsRegistry.getCommand(CHAT_PET_OPEN_ACHIEVEMENTS_COMMAND_ID);
		assert.ok(command);

		await command.handler(accessor);

		assert.strictEqual(openCount, 0);
	});

	test('shows locked hints and rewards without revealing achievement names', () => {
		const parent = mainWindow.document.createElement('div');
		parent.style.setProperty('--vscode-fontSize-heading3', '13px');
		parent.style.setProperty('--vscode-fontSize-label1', '12px');
		mainWindow.document.body.appendChild(parent);
		store.add(toDisposable(() => parent.remove()));
		const chatPetService = new class extends mock<IChatPetService>() {
			override readonly enabled = constObservable(true);
			override readonly unlockedAchievements = constObservable<readonly ChatPetAchievementId[]>([]);
			override readonly unseenAchievements = constObservable<readonly ChatPetAchievementId[]>([]);
			override readonly selectedAccessory = constObservable<ChatPetAccessoryId | undefined>(undefined);
			override readonly color = constObservable<ChatPetVariant>('stable');
		}();
		store.add(new ChatPetAchievementsWidget(
			parent,
			() => { },
			chatPetService,
			new TestThemeService(),
			store.add(new NullLogService()),
			new class extends mock<ICommandService>() { }(),
		));

		const lockedCard = parent.querySelector<HTMLElement>(`[data-accessory-id="${ChatPetAccessoryIds.TopHatMonocle}"]`);
		assert.ok(lockedCard);
		const title = lockedCard.querySelector('h3');
		const state = lockedCard.querySelector('.chat-pet-achievement-state');
		const hint = lockedCard.querySelector('.chat-pet-achievement-description');
		const reward = lockedCard.querySelector('.chat-pet-achievement-reward');
		assert.deepStrictEqual({
			title: title?.textContent,
			state: state?.textContent,
			hint: hint?.textContent,
			reward: reward?.textContent,
			ariaLabel: lockedCard.getAttribute('aria-label'),
			containsAchievementName: lockedCard.textContent?.includes('Second Draft'),
			fontSizes: {
				title: title && mainWindow.getComputedStyle(title).fontSize,
				state: state && mainWindow.getComputedStyle(state).fontSize,
				hint: hint && mainWindow.getComputedStyle(hint).fontSize,
				reward: reward && mainWindow.getComputedStyle(reward).fontSize,
			},
		}, {
			title: 'Locked',
			state: 'Hint',
			hint: 'An earlier request may deserve a second pass.',
			reward: 'Rewards: Grand Top Hat & Monocle',
			ariaLabel: 'Locked. Hint: An earlier request may deserve a second pass. Rewards: Grand Top Hat & Monocle.',
			containsAchievementName: false,
			fontSizes: {
				title: '13px',
				state: '12px',
				hint: '12px',
				reward: '12px',
			},
		});
	});

	test('renders each unlocked hat as its own achievement card', () => {
		const parent = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(parent);
		store.add(toDisposable(() => parent.remove()));
		const selectedAccessory = observableValue<ChatPetAccessoryId | undefined>(store, undefined);
		let selected: ChatPetAccessoryId | undefined;
		const chatPetService = new class extends mock<IChatPetService>() {
			override readonly enabled = constObservable(true);
			override readonly unlockedAchievements = constObservable<readonly ChatPetAchievementId[]>([
				ChatPetAchievementIds.FirstChatMessage,
				ChatPetAchievementIds.AgentChangesReviewed,
			]);
			override readonly unseenAchievements = constObservable<readonly ChatPetAchievementId[]>([]);
			override readonly selectedAccessory = selectedAccessory;
			override readonly color = constObservable<ChatPetVariant>('stable');

			override markAchievementSeen(): boolean {
				return false;
			}

			override setAccessory(accessory: ChatPetAccessoryId | undefined): void {
				selected = accessory;
				selectedAccessory.set(accessory, undefined);
			}
		}();
		store.add(new ChatPetAchievementsWidget(
			parent,
			() => { },
			chatPetService,
			new TestThemeService(),
			store.add(new NullLogService()),
			new class extends mock<ICommandService>() { }(),
		));

		const unlockedCards = Array.from(parent.querySelectorAll<HTMLElement>('.chat-pet-achievement-card.monaco-button:not(.locked)'));
		const bambooHatCard = parent.querySelector<HTMLElement>(`[data-accessory-id="${ChatPetAccessoryIds.BambooHat}"]`);
		assert.ok(bambooHatCard);
		bambooHatCard.click();

		assert.deepStrictEqual({
			unlockedCardIds: unlockedCards.map(card => card.dataset.accessoryId),
			unlockedCardCursors: unlockedCards.map(card => mainWindow.getComputedStyle(card).cursor),
			lockedCardCursors: [...new Set(Array.from(parent.querySelectorAll<HTMLElement>('.chat-pet-achievement-card.locked')).map(card => mainWindow.getComputedStyle(card).cursor))],
			contentCursors: Array.from(bambooHatCard.querySelectorAll<HTMLElement>('h3, p, canvas')).map(element => mainWindow.getComputedStyle(element).cursor),
			roadmapCursor: mainWindow.getComputedStyle(parent.querySelector<HTMLElement>('.chat-pet-achievement-roadmap')!).cursor,
			firstMessageTitleCount: Array.from(parent.querySelectorAll('h3')).filter(title => title.textContent === 'Welcome to the Wild West').length,
			trustButVerifyTitleCount: Array.from(parent.querySelectorAll('h3')).filter(title => title.textContent === 'Trust but Verify').length,
			selected,
			bambooHatSelected: bambooHatCard.getAttribute('aria-pressed'),
			bambooHatAriaLabel: bambooHatCard.getAttribute('aria-label'),
			bambooHatState: bambooHatCard.querySelector('.chat-pet-achievement-state')?.textContent,
		}, {
			unlockedCardIds: [
				'none',
				ChatPetAccessoryIds.CowboyHat,
				ChatPetAccessoryIds.BambooHat,
			],
			unlockedCardCursors: ['pointer', 'pointer', 'pointer'],
			lockedCardCursors: ['default'],
			contentCursors: ['pointer', 'pointer', 'pointer', 'pointer'],
			roadmapCursor: 'default',
			firstMessageTitleCount: 1,
			trustButVerifyTitleCount: 1,
			selected: ChatPetAccessoryIds.BambooHat,
			bambooHatSelected: 'true',
			bambooHatAriaLabel: 'Trust but Verify. Reward: Bamboo Hat. Wearing',
			bambooHatState: 'Wearing',
		});
	});

	test('requests modal close when Escape is pressed on a selectable card', () => {
		const parent = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(parent);
		store.add(toDisposable(() => parent.remove()));
		let closeCount = 0;
		const chatPetService = new class extends mock<IChatPetService>() {
			override readonly enabled = constObservable(true);
			override readonly unlockedAchievements = constObservable<readonly ChatPetAchievementId[]>([ChatPetAchievementIds.FirstChatMessage]);
			override readonly unseenAchievements = constObservable<readonly ChatPetAchievementId[]>([]);
			override readonly selectedAccessory = constObservable<ChatPetAccessoryId | undefined>(undefined);
			override readonly color = constObservable<ChatPetVariant>('stable');
		}();
		const widget = store.add(new ChatPetAchievementsWidget(
			parent,
			() => closeCount++,
			chatPetService,
			new TestThemeService(),
			store.add(new NullLogService()),
			new class extends mock<ICommandService>() { }(),
		));

		const noHatCard = parent.querySelector<HTMLElement>('[data-accessory-id="none"]');
		const cowboyCard = parent.querySelector<HTMLElement>(`[data-accessory-id="${ChatPetAccessoryIds.CowboyHat}"]`);
		assert.ok(noHatCard);
		assert.ok(cowboyCard);
		noHatCard.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
		cowboyCard.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
		widget.dispose();

		assert.strictEqual(closeCount, 2);
	});

	test('unlocks a keyboard-accessible color reward without changing the selected hat', async () => {
		const parent = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(parent);
		store.add(toDisposable(() => parent.remove()));
		const service = store.add(new ChatPetService(store.add(new TestStorageService()), new NullTelemetryServiceShape(), new NullLogService()));
		service.toggle();
		service.unlockAchievement(ChatPetAchievementIds.FirstChatMessage);
		service.setAccessory(ChatPetAccessoryIds.CowboyHat);
		const commands: string[] = [];
		store.add(new ChatPetAchievementsWidget(
			parent,
			() => { },
			service,
			new TestThemeService(),
			new NullLogService(),
			new class extends mock<ICommandService>() {
				override async executeCommand<T>(id: string): Promise<T | undefined> {
					commands.push(id);
					return undefined;
				}
			}(),
		));
		const locked = parent.querySelector<HTMLElement>('[data-achievement-id="blobby"]');
		const lockedState = { title: locked?.querySelector('h3')?.textContent, disabled: locked?.getAttribute('aria-disabled') };
		service.unlockAchievement(ChatPetAchievementIds.Blobby);
		const card = parent.querySelector<HTMLElement>('[data-achievement-id="blobby"]');
		assert.ok(card);
		card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		await Promise.resolve();
		assert.deepStrictEqual({
			lockedState,
			commands,
			label: card.getAttribute('aria-label'),
			pressed: card.getAttribute('aria-pressed'),
			hat: service.selectedAccessory.get(),
			unseen: service.unseenAchievements.get().includes(ChatPetAchievementIds.Blobby),
		}, {
			lockedState: { title: 'Locked', disabled: 'true' },
			commands: [CHAT_PET_CHANGE_COLOR_COMMAND_ID],
			label: 'True Name. Reward: Color Customization. Change Color',
			pressed: null,
			hat: ChatPetAccessoryIds.CowboyHat,
			unseen: false,
		});
	});

	test('navigates between Achievements and Color with editor options and accessible tab keys', async () => {
		const parent = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(parent);
		store.add(toDisposable(() => parent.remove()));
		const storage = store.add(new TestStorageService());
		const service = store.add(new ChatPetService(storage, new NullTelemetryServiceShape(), new NullLogService()));
		service.toggle();
		const theme = new TestThemeService();
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IChatPetService, service);
		instantiationService.stub(IThemeService, theme);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() { }());
		const entitlement = new TestChatEntitlementService();
		let closeCount = 0;
		const editor = store.add(new ChatPetAchievementsEditor(
			new class extends mock<IEditorGroup>() {
				override windowId = mainWindow.vscodeWindowId;
				override async closeEditor(): Promise<boolean> { closeCount++; return true; }
			}(),
			new NullTelemetryServiceShape(),
			theme,
			storage,
			instantiationService,
			store.add(new ContextKeyService(new TestConfigurationService())),
			service,
			entitlement,
		));
		editor.create(parent);
		editor.layout(new Dimension(800, 600));
		await editor.setInput(store.add(ChatPetAchievementsEditorInput.getOrCreate()), { tab: 'color' }, {}, CancellationToken.None);
		const colorTab = parent.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
		assert.ok(colorTab);
		editor.focus();
		const page = parent.querySelector<HTMLElement>('.chat-pet-achievements-editor');
		assert.deepStrictEqual({
			pageFocused: mainWindow.document.activeElement === page,
			tabFocused: colorTab === mainWindow.document.activeElement,
			role: page?.getAttribute('role'),
			label: page?.getAttribute('aria-label'),
			selectedTabReachable: colorTab.tabIndex,
		}, {
			pageFocused: true,
			tabFocused: false,
			role: 'group',
			label: 'Customize Blobby',
			selectedTabReachable: 0,
		});
		const initialTab = colorTab.textContent;
		colorTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', keyCode: 37, bubbles: true }));
		const afterLeft = parent.querySelector('[role="tab"][aria-selected="true"]')?.textContent;
		const activeTab = parent.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
		activeTab?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', keyCode: 35, bubbles: true }));
		const afterEnd = parent.querySelector('[role="tab"][aria-selected="true"]')?.textContent;
		colorTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', keyCode: 35, bubbles: true }));
		const repeatedEnd = parent.querySelector('[role="tab"][aria-selected="true"]')?.textContent;
		editor.setOptions({ tab: 'achievements' });
		assert.deepStrictEqual({
			initialTab,
			afterLeft,
			afterEnd,
			repeatedEnd,
			afterOptions: parent.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
			tabStops: Array.from(parent.querySelectorAll<HTMLElement>('[role="tab"]')).map(tab => tab.tabIndex),
			visiblePanels: parent.querySelectorAll('[role="tabpanel"]:not([hidden])').length,
			colorsDisposed: parent.querySelector('.chat-pet-colors-widget') === null,
		}, { initialTab: 'Color', afterLeft: 'Achievements', afterEnd: 'Color', repeatedEnd: 'Color', afterOptions: 'Achievements', tabStops: [0, -1], visiblePanels: 1, colorsDisposed: true });

		service.unlockAchievement(ChatPetAchievementIds.Blobby);
		editor.setOptions({ tab: 'color' });
		const customInput = parent.querySelector<HTMLInputElement>('input[aria-label="Custom hex color"]');
		assert.ok(customInput);
		customInput.value = '#123456';
		customInput.dispatchEvent(new Event('input', { bubbles: true }));
		editor.clearInput();
		await editor.setInput(ChatPetAchievementsEditorInput.getOrCreate(), { tab: 'color' }, {}, CancellationToken.None);
		assert.strictEqual(parent.querySelector<HTMLInputElement>('input[aria-label="Custom hex color"]')?.value, getChatPetBodyColor(service.color.get()));
		entitlement.sentimentObs.set({ hidden: true }, undefined);
		assert.strictEqual(closeCount, 1, 'The open customization editor closes when AI features are hidden');
	});
});
