/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { ResolvedKeybinding } from '../../../../../base/common/keybindings.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ResolvedKeybindingItem } from '../../../../../platform/keybinding/common/resolvedKeybindingItem.js';
import { createUSLayoutResolvedKeybinding } from '../../../../../platform/keybinding/test/common/keybindingsTestUtils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { NotificationMessage } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { InMemoryStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { AgentsWindowOpenSource } from '../../../../../platform/window/common/window.js';
import { IChatTipProvider, IChatTipService } from '../../../../../workbench/contrib/chat/browser/chatTipService.js';
import { OPEN_AGENTS_WINDOW_COMMAND_ID } from '../../../../../workbench/contrib/chat/common/constants.js';
import { IKeybindingEditingService } from '../../../../../workbench/services/keybinding/common/keybindingEditing.js';
import { ENABLE_OPEN_AGENTS_WINDOW_SYSTEM_WIDE_KEYBINDING_COMMAND_ID, OPEN_AGENTS_WINDOW_SYSTEM_WIDE_KEYBINDING, OpenAgentsWindowSystemWideKeybindingTip } from '../../electron-browser/openAgentsWindowKeybindingTip.js';

function resolveOpenAgentsWindowKeybinding(): ResolvedKeybinding {
	const resolved = createUSLayoutResolvedKeybinding(KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.KeyA, OperatingSystem.Macintosh);
	assert.ok(resolved);
	return resolved;
}

class TestKeybindingService extends mock<IKeybindingService>() {

	private readonly _onDidUpdateKeybindings = new Emitter<void>();
	override readonly onDidUpdateKeybindings = this._onDidUpdateKeybindings.event;
	keybindings: readonly ResolvedKeybindingItem[] = [];

	override getKeybindings(): readonly ResolvedKeybindingItem[] {
		return this.keybindings;
	}

	override resolveUserBinding(userBinding: string): ResolvedKeybinding[] {
		assert.strictEqual(userBinding, OPEN_AGENTS_WINDOW_SYSTEM_WIDE_KEYBINDING);
		return [resolveOpenAgentsWindowKeybinding()];
	}

	update(keybindings: readonly ResolvedKeybindingItem[]): void {
		this.keybindings = keybindings;
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
	hideTipsForSessionCount = 0;

	override registerTipProvider(provider: IChatTipProvider) {
		this.provider = provider;
		return Disposable.None;
	}

	override hideTipsForSession(): void {
		this.hideTipsForSessionCount++;
	}
}

class RecordingNotificationService extends TestNotificationService {

	readonly errors: string[] = [];

	override error(error: NotificationMessage) {
		this.errors.push(String(error));
		return super.error(error);
	}
}

suite('OpenAgentsWindowSystemWideKeybindingTip', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createTip(supported: boolean = true) {
		const chatTipService = new TestChatTipService();
		const keybindingService = store.add(new TestKeybindingService());
		const keybindingEditingService = new RecordingKeybindingEditingService();
		const storageService = store.add(new InMemoryStorageService());
		const notificationService = new RecordingNotificationService();
		const tip = store.add(new OpenAgentsWindowSystemWideKeybindingTip(
			supported,
			chatTipService,
			keybindingService,
			keybindingEditingService,
			storageService,
			notificationService,
			new NullLogService(),
		));
		return { tip, provider: chatTipService.provider!, chatTipService, keybindingService, keybindingEditingService, storageService, notificationService };
	}

	function systemWideKeybinding(command: string): ResolvedKeybindingItem {
		return new ResolvedKeybindingItem(resolveOpenAgentsWindowKeybinding(), command, undefined, undefined, false, null, false, true);
	}

	test('offers the macOS Enable action until a user system-wide binding exists', () => {
		const fixture = createTip();
		const offered = fixture.provider.provideTip();
		fixture.keybindingService.update([systemWideKeybinding(OPEN_AGENTS_WINDOW_COMMAND_ID)]);

		assert.deepStrictEqual({
			tipId: offered?.id,
			content: offered?.content.value,
			enabledCommands: offered?.enabledCommands,
			afterBinding: fixture.provider.provideTip(),
			unsupported: createTip(false).provider.provideTip(),
		}, {
			tipId: 'sessions.openAgentsWindowSystemWideKeybinding',
			content: '**Tip:** Open the Agents window while VS Code is running with `⌃⌘A`, even when another app is active. [Enable](command:sessions.action.enableOpenAgentsWindowSystemWideKeybinding)',
			enabledCommands: [ENABLE_OPEN_AGENTS_WINDOW_SYSTEM_WIDE_KEYBINDING_COMMAND_ID],
			afterBinding: undefined,
			unsupported: undefined,
		});
	});

	test('clearing dismissed tips restores the provider tip', () => {
		const fixture = createTip();
		fixture.provider.dismissTip('sessions.openAgentsWindowSystemWideKeybinding');
		const dismissedTip = fixture.provider.provideTip();

		fixture.provider.clearDismissedTips?.();

		assert.deepStrictEqual({
			dismissedTip,
			restoredTipId: fixture.provider.provideTip()?.id,
			storedDismissal: fixture.storageService.getBoolean('sessions.openAgentsWindowSystemWideKeybindingTip.dismissed', StorageScope.APPLICATION),
		}, {
			dismissedTip: undefined,
			restoredTipId: 'sessions.openAgentsWindowSystemWideKeybinding',
			storedDismissal: undefined,
		});
	});

	test('Enable reports a conflict when another system-wide binding owns the accelerator', async () => {
		const fixture = createTip();
		fixture.keybindingService.update([
			systemWideKeybinding('workbench.action.quickOpen'),
			systemWideKeybinding(OPEN_AGENTS_WINDOW_COMMAND_ID),
		]);
		const command = CommandsRegistry.getCommand(ENABLE_OPEN_AGENTS_WINDOW_SYSTEM_WIDE_KEYBINDING_COMMAND_ID);
		assert.ok(command);
		const instantiationService = store.add(new TestInstantiationService());

		await instantiationService.invokeFunction(accessor => command.handler(accessor));

		assert.deepStrictEqual({
			additions: fixture.keybindingEditingService.additions,
			errors: fixture.notificationService.errors,
			hideTipsForSessionCount: fixture.chatTipService.hideTipsForSessionCount,
			tipId: fixture.provider.provideTip()?.id,
		}, {
			additions: [],
			errors: ['Unable to enable ⌃⌘A because another system-wide keybinding already uses it.'],
			hideTipsForSessionCount: 0,
			tipId: 'sessions.openAgentsWindowSystemWideKeybinding',
		});
	});

	test('Enable adds the system-wide user keybinding and hides tips for the session', async () => {
		const fixture = createTip();
		const command = CommandsRegistry.getCommand(ENABLE_OPEN_AGENTS_WINDOW_SYSTEM_WIDE_KEYBINDING_COMMAND_ID);
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
			hideTipsForSessionCount: fixture.chatTipService.hideTipsForSessionCount,
			tip: fixture.provider.provideTip(),
		}, {
			additions: [{
				key: OPEN_AGENTS_WINDOW_SYSTEM_WIDE_KEYBINDING,
				when: undefined,
				command: OPEN_AGENTS_WINDOW_COMMAND_ID,
				args: { source: AgentsWindowOpenSource.KeyboardShortcut },
				systemWide: true,
			}],
			hideTipsForSessionCount: 1,
			tip: undefined,
		});
	});
});
