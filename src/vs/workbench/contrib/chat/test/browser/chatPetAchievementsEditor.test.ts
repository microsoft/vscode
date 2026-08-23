/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { EditorInputCapabilities } from '../../../../common/editor.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { CHAT_PET_OPEN_ACHIEVEMENTS_COMMAND_ID, ChatPetAccessoryId, ChatPetAccessoryIds, ChatPetAchievementId, ChatPetAchievementIds } from '../../browser/chatPetAchievements.js';
import '../../browser/chatPetAchievements.contribution.js';
import { ChatPetAchievementsEditorInput } from '../../browser/chatPetAchievementsEditorInput.js';
import { ChatPetAchievementsWidget } from '../../browser/chatPetAchievementsWidget.js';
import { ChatPetVariant, IChatPetService } from '../../browser/chatPetService.js';

suite('Chat Pet Achievements Editor', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

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
			get: (service: typeof IEditorService | typeof IChatPetService) => {
				if (service === IChatPetService) {
					return chatPetService;
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
			name: 'Achievements',
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
			override readonly variant = constObservable<ChatPetVariant>('stable');
		}();
		const widget = store.add(new ChatPetAchievementsWidget(
			parent,
			() => closeCount++,
			chatPetService,
			new TestThemeService(),
			store.add(new NullLogService()),
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
});
