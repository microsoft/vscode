/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../../base/common/event.js';
import { KeyCode, KeyMod } from '../../../../../../base/common/keyCodes.js';
import { ResolvedKeybinding } from '../../../../../../base/common/keybindings.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { ResolvedKeybindingItem } from '../../../../../../platform/keybinding/common/resolvedKeybindingItem.js';
import { createUSLayoutResolvedKeybinding } from '../../../../../../platform/keybinding/test/common/keybindingsTestUtils.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { NotificationMessage } from '../../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../../platform/notification/test/common/testNotificationService.js';
import { InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IKeybindingEditingService } from '../../../../../services/keybinding/common/keybindingEditing.js';
import { IAppWindowScreenshotService } from '../../../../screenshotTool/electron-browser/appWindowScreenshot.js';
import { IChatTipProvider, IChatTipService } from '../../../browser/chatTipService.js';
import { ATTACH_APP_WINDOW_SCREENSHOT_COMMAND_ID } from '../../../common/constants.js';
import { AppWindowScreenshotKeybindingTip, ENABLE_APP_WINDOW_SCREENSHOT_SYSTEM_WIDE_KEYBINDING_COMMAND_ID } from '../../../electron-browser/actions/chatAppWindowScreenshotKeybindingTip.js';

function resolveKeybinding(): ResolvedKeybinding {
	const resolved = createUSLayoutResolvedKeybinding(KeyMod.WinCtrl | KeyMod.CtrlCmd | KeyCode.KeyS, OperatingSystem.Macintosh);
	assert.ok(resolved);
	return resolved;
}

class TestKeybindingService extends mock<IKeybindingService>() {

	private readonly _onDidUpdateKeybindings = new Emitter<void>();
	override readonly onDidUpdateKeybindings = this._onDidUpdateKeybindings.event;
	private _keybindings: readonly ResolvedKeybindingItem[] = [];

	override getKeybindings(): readonly ResolvedKeybindingItem[] {
		return this._keybindings;
	}

	override lookupKeybinding(commandId: string): ResolvedKeybinding | undefined {
		return commandId === ATTACH_APP_WINDOW_SCREENSHOT_COMMAND_ID ? resolveKeybinding() : undefined;
	}

	override resolveUserBinding(userBinding: string): ResolvedKeybinding[] {
		assert.strictEqual(userBinding, 'ctrl+cmd+s');
		return [resolveKeybinding()];
	}

	update(keybindings: readonly ResolvedKeybindingItem[]): void {
		this._keybindings = keybindings;
		this._onDidUpdateKeybindings.fire();
	}

	dispose(): void {
		this._onDidUpdateKeybindings.dispose();
	}
}

class RecordingKeybindingEditingService extends mock<IKeybindingEditingService>() {

	readonly additions: { readonly item: ResolvedKeybindingItem; readonly key: string; readonly when: string | undefined }[] = [];

	override async addKeybinding(item: ResolvedKeybindingItem, key: string, when: string | undefined): Promise<void> {
		this.additions.push({ item, key, when });
	}
}

class TestChatTipService extends mock<IChatTipService>() {

	provider: IChatTipProvider | undefined;

	override registerTipProvider(provider: IChatTipProvider) {
		this.provider = provider;
		return Disposable.None;
	}
}

class RecordingNotificationService extends TestNotificationService {

	readonly errors: string[] = [];

	override error(error: NotificationMessage) {
		this.errors.push(String(error));
		return super.error(error);
	}
}

suite('AppWindowScreenshotKeybindingTip', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createTip(hasCaptured: boolean) {
		const chatTipService = new TestChatTipService();
		const keybindingService = store.add(new TestKeybindingService());
		const keybindingEditingService = new RecordingKeybindingEditingService();
		const notificationService = new RecordingNotificationService();
		const appWindowScreenshotService = new class extends mock<IAppWindowScreenshotService>() {
			override hasCaptured = hasCaptured;
		};
		store.add(new AppWindowScreenshotKeybindingTip(
			chatTipService,
			keybindingService,
			keybindingEditingService,
			store.add(new InMemoryStorageService()),
			notificationService,
			new NullLogService(),
			appWindowScreenshotService,
		));
		return { provider: chatTipService.provider!, keybindingService, keybindingEditingService, notificationService, appWindowScreenshotService };
	}

	function userSystemWideKeybinding(): ResolvedKeybindingItem {
		return new ResolvedKeybindingItem(resolveKeybinding(), ATTACH_APP_WINDOW_SCREENSHOT_COMMAND_ID, undefined, undefined, false, null, false, true);
	}

	test('offers the keybinding in all apps from the first chat after a screenshot, until the user enables it', () => {
		const fixture = createTip(false);
		const beforeScreenshot = fixture.provider.provideTip();
		fixture.appWindowScreenshotService.hasCaptured = true;
		const sameChat = fixture.provider.provideTip();
		fixture.provider.resetSession?.();
		const offer = fixture.provider.provideTip();
		fixture.keybindingService.update([userSystemWideKeybinding()]);

		assert.deepStrictEqual({
			beforeScreenshot,
			sameChat,
			offer: { id: offer?.id, content: offer?.content.value, enabledCommands: offer?.enabledCommands },
			afterEnabled: fixture.provider.provideTip(),
		}, {
			beforeScreenshot: undefined,
			sameChat: undefined,
			offer: {
				id: 'chat.appWindowScreenshotSystemWideKeybinding',
				content: '**Tip:** [Enable ⌃⌘S in all apps](command:workbench.action.chat.enableAppWindowScreenshotSystemWideKeybinding). It then attaches a screenshot of whichever app is focused.',
				enabledCommands: [ENABLE_APP_WINDOW_SCREENSHOT_SYSTEM_WIDE_KEYBINDING_COMMAND_ID],
			},
			afterEnabled: undefined,
		});
	});

	test('Enable adds the keybinding of the command as a system-wide user keybinding and confirms it', async () => {
		const fixture = createTip(true);
		const command = CommandsRegistry.getCommand(ENABLE_APP_WINDOW_SCREENSHOT_SYSTEM_WIDE_KEYBINDING_COMMAND_ID);
		assert.ok(command);
		const instantiationService = store.add(new TestInstantiationService());

		await instantiationService.invokeFunction(accessor => command.handler(accessor));

		assert.deepStrictEqual({
			additions: fixture.keybindingEditingService.additions.map(addition => ({
				key: addition.key,
				when: addition.when,
				command: addition.item.command,
				args: addition.item.commandArgs,
				systemWide: addition.item.systemWide,
			})),
			errors: fixture.notificationService.errors,
			confirmation: fixture.provider.provideTip()?.content.value,
		}, {
			additions: [{ key: 'ctrl+cmd+s', when: undefined, command: ATTACH_APP_WINDOW_SCREENSHOT_COMMAND_ID, args: undefined, systemWide: true }],
			errors: [],
			confirmation: '**Shortcut enabled:** Press ⌃⌘S in any app to attach a screenshot of that app. [Manage Shortcut](command:workbench.action.openGlobalKeybindings?%5B%22%40command%3Aworkbench.action.chat.attachAppWindowScreenshot%22%5D)',
		});
	});
});
