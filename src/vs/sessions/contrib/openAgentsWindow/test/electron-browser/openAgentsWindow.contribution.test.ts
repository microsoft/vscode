/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { KeyChord, KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { ResolvedKeybinding } from '../../../../../base/common/keybindings.js';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mock } from '../../../../../base/test/common/mock.js';
import sinon from 'sinon';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { KeybindingsRegistry } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ResolvedKeybindingItem } from '../../../../../platform/keybinding/common/resolvedKeybindingItem.js';
import { createUSLayoutResolvedKeybinding } from '../../../../../platform/keybinding/test/common/keybindingsTestUtils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { INativeHostService, INativeSystemWideKeybinding, INativeSystemWideKeybindingResult, IOpenAgentsWindowOptions } from '../../../../../platform/native/common/native.js';
import { INotification, INotificationHandle } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { AgentsWindowOpenSource } from '../../../../../platform/window/common/window.js';
import { OPEN_AGENTS_WINDOW_COMMAND_ID } from '../../../../../workbench/contrib/chat/common/constants.js';
import { OpenAgentsWindowSystemWideKeybindingContribution } from '../../electron-browser/openAgentsWindow.contribution.js';
import { registerOpenAgentsWindowCommand } from '../../electron-browser/openAgentsWindowCommand.js';

class TestKeybindingService extends mock<IKeybindingService>() {

	private readonly updateEmitter = new Emitter<void>();
	override readonly onDidUpdateKeybindings = this.updateEmitter.event;
	keybindings: readonly ResolvedKeybindingItem[] = [];

	override getKeybindings(): readonly ResolvedKeybindingItem[] {
		return this.keybindings;
	}

	update(keybindings: readonly ResolvedKeybindingItem[]): void {
		this.keybindings = keybindings;
		this.updateEmitter.fire();
	}

	dispose(): void {
		this.updateEmitter.dispose();
	}
}

class TestNativeHostService extends mock<INativeHostService>() {

	readonly keybindingPayloads: INativeSystemWideKeybinding[][] = [];
	readonly openAgentsWindowOptions: (IOpenAgentsWindowOptions | undefined)[] = [];
	failed: string[] = [];
	syncResult: Promise<INativeSystemWideKeybindingResult> | undefined;
	syncError: Error | undefined;

	override async syncSystemWideKeybindings(keybindings: INativeSystemWideKeybinding[]): Promise<INativeSystemWideKeybindingResult> {
		this.keybindingPayloads.push(keybindings);
		if (this.syncError) {
			throw this.syncError;
		}
		if (this.syncResult) {
			return this.syncResult;
		}
		return { failed: this.failed };
	}

	override async openAgentsWindow(options?: IOpenAgentsWindowOptions): Promise<void> {
		this.openAgentsWindowOptions.push(options);
	}
}

class RecordingNotificationService extends TestNotificationService {

	readonly notifications: INotification[] = [];

	override notify(notification: INotification): INotificationHandle {
		this.notifications.push(notification);
		return super.notify(notification);
	}
}

class RecordingLogService extends NullLogService {

	readonly warnings: string[] = [];

	override warn(message: string, ...args: unknown[]): void {
		this.warnings.push([message, ...args].join(' '));
	}
}

suite('OpenAgentsWindowSystemWideKeybindingContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let clock: sinon.SinonFakeTimers;

	setup(() => {
		clock = sinon.useFakeTimers();
	});

	teardown(() => {
		clock.restore();
	});

	function resolve(encoded: number): ResolvedKeybinding {
		const resolved = createUSLayoutResolvedKeybinding(encoded, OperatingSystem.Macintosh);
		assert.ok(resolved);
		return resolved;
	}

	function item(encoded: number, command: string, options?: { readonly args?: unknown; readonly when?: string; readonly systemWide?: boolean }): ResolvedKeybindingItem {
		return new ResolvedKeybindingItem(
			resolve(encoded),
			command,
			options?.args,
			options?.when ? ContextKeyExpr.deserialize(options.when) : undefined,
			false,
			null,
			false,
			options?.systemWide ?? true,
		);
	}

	async function createContribution(keybindings: readonly ResolvedKeybindingItem[] = [], failed: string[] = []) {
		const keybindingService = store.add(new TestKeybindingService());
		keybindingService.keybindings = keybindings;
		const nativeHostService = new TestNativeHostService();
		nativeHostService.failed = failed;
		const notificationService = new RecordingNotificationService();
		const logService = new RecordingLogService();
		const contribution = store.add(new OpenAgentsWindowSystemWideKeybindingContribution(
			keybindingService,
			nativeHostService,
			notificationService,
			logService,
		));
		await clock.tickAsync(0);
		return { contribution, keybindingService, nativeHostService, notificationService, logService };
	}

	test('mirrors only a globally selected direct Open Agents Window binding', async () => {
		const { nativeHostService } = await createContribution([
			item(KeyMod.CtrlCmd | KeyCode.KeyA, 'other.command'),
			item(KeyMod.CtrlCmd | KeyCode.KeyA, OPEN_AGENTS_WINDOW_COMMAND_ID),
			item(KeyMod.CtrlCmd | KeyCode.KeyB, 'runCommands', { args: { commands: [OPEN_AGENTS_WINDOW_COMMAND_ID] } }),
			item(KeyMod.CtrlCmd | KeyCode.KeyC, OPEN_AGENTS_WINDOW_COMMAND_ID, { args: { source: AgentsWindowOpenSource.KeyboardShortcut }, when: 'editorFocus' }),
		]);

		assert.deepStrictEqual(nativeHostService.keybindingPayloads, [[{
			accelerator: 'Cmd+C',
			commandId: OPEN_AGENTS_WINDOW_COMMAND_ID,
			args: { source: AgentsWindowOpenSource.KeyboardShortcut },
			userSettingsLabel: 'cmd+c',
		}]]);
	});

	test('skips unchanged payloads and clears removed ownership', async () => {
		const openAgentsWindowBinding = item(KeyMod.CtrlCmd | KeyCode.KeyA, OPEN_AGENTS_WINDOW_COMMAND_ID);
		const { keybindingService, nativeHostService } = await createContribution([openAgentsWindowBinding]);

		keybindingService.update([openAgentsWindowBinding]);
		await clock.tickAsync(200);
		keybindingService.update([]);
		await clock.tickAsync(200);

		assert.deepStrictEqual(nativeHostService.keybindingPayloads, [[{
			accelerator: 'Cmd+A',
			commandId: OPEN_AGENTS_WINDOW_COMMAND_ID,
			args: undefined,
			userSettingsLabel: 'cmd+a',
		}], []]);
	});

	test('pushes the initial empty payload to clear stale ownership after reload', async () => {
		const { nativeHostService } = await createContribution();

		assert.deepStrictEqual(nativeHostService.keybindingPayloads, [[]]);
	});

	test('retries registration failures without repeating notifications and still clears removed ownership', async () => {
		const openAgentsWindowBinding = item(KeyMod.CtrlCmd | KeyCode.KeyA, OPEN_AGENTS_WINDOW_COMMAND_ID, { when: 'editorFocus' });
		const { keybindingService, nativeHostService, notificationService } = await createContribution([openAgentsWindowBinding], ['cmd+a']);

		keybindingService.update([openAgentsWindowBinding]);
		await clock.tickAsync(200);
		nativeHostService.failed = [];
		keybindingService.update([]);
		await clock.tickAsync(200);

		assert.deepStrictEqual({
			payloads: nativeHostService.keybindingPayloads,
			notifications: notificationService.notifications.map(notification => notification.message),
		}, {
			payloads: [[{
				accelerator: 'Cmd+A',
				commandId: OPEN_AGENTS_WINDOW_COMMAND_ID,
				args: undefined,
				userSettingsLabel: 'cmd+a',
			}], [{
				accelerator: 'Cmd+A',
				commandId: OPEN_AGENTS_WINDOW_COMMAND_ID,
				args: undefined,
				userSettingsLabel: 'cmd+a',
			}], []],
			notifications: [
				'Some system-wide keybindings could not be registered (cmd+a); the key combination may already be taken by the operating system or another application.'
			],
		});
	});

	test('retries unchanged payload after an IPC error', async () => {
		const openAgentsWindowBinding = item(KeyMod.CtrlCmd | KeyCode.KeyA, OPEN_AGENTS_WINDOW_COMMAND_ID);
		const keybindingService = store.add(new TestKeybindingService());
		keybindingService.keybindings = [openAgentsWindowBinding];
		const nativeHostService = new TestNativeHostService();
		nativeHostService.syncError = new Error('transient');
		store.add(new OpenAgentsWindowSystemWideKeybindingContribution(
			keybindingService,
			nativeHostService,
			new RecordingNotificationService(),
			new RecordingLogService(),
		));
		await clock.tickAsync(0);

		nativeHostService.syncError = undefined;
		keybindingService.update([openAgentsWindowBinding]);
		await clock.tickAsync(200);
		assert.deepStrictEqual(nativeHostService.keybindingPayloads, [[{
			accelerator: 'Cmd+A',
			commandId: OPEN_AGENTS_WINDOW_COMMAND_ID,
			args: undefined,
			userSettingsLabel: 'cmd+a',
		}], [{
			accelerator: 'Cmd+A',
			commandId: OPEN_AGENTS_WINDOW_COMMAND_ID,
			args: undefined,
			userSettingsLabel: 'cmd+a',
		}]]);
	});

	test('resends a previously successful payload after a later IPC error', async () => {
		const firstBinding = item(KeyMod.CtrlCmd | KeyCode.KeyA, OPEN_AGENTS_WINDOW_COMMAND_ID);
		const secondBinding = item(KeyMod.CtrlCmd | KeyCode.KeyB, OPEN_AGENTS_WINDOW_COMMAND_ID);
		const { keybindingService, nativeHostService } = await createContribution([firstBinding]);

		nativeHostService.syncError = new Error('applied then disconnected');
		keybindingService.update([secondBinding]);
		await clock.tickAsync(200);

		nativeHostService.syncError = undefined;
		keybindingService.update([firstBinding]);
		await clock.tickAsync(200);

		assert.deepStrictEqual(nativeHostService.keybindingPayloads, [[{
			accelerator: 'Cmd+A',
			commandId: OPEN_AGENTS_WINDOW_COMMAND_ID,
			args: undefined,
			userSettingsLabel: 'cmd+a',
		}], [{
			accelerator: 'Cmd+B',
			commandId: OPEN_AGENTS_WINDOW_COMMAND_ID,
			args: undefined,
			userSettingsLabel: 'cmd+b',
		}], [{
			accelerator: 'Cmd+A',
			commandId: OPEN_AGENTS_WINDOW_COMMAND_ID,
			args: undefined,
			userSettingsLabel: 'cmd+a',
		}]]);
	});

	test('does not report an in-flight result after disposal', async () => {
		const result = new DeferredPromise<INativeSystemWideKeybindingResult>();
		const keybindingService = store.add(new TestKeybindingService());
		keybindingService.keybindings = [item(KeyMod.CtrlCmd | KeyCode.KeyA, OPEN_AGENTS_WINDOW_COMMAND_ID)];
		const nativeHostService = new TestNativeHostService();
		nativeHostService.syncResult = result.p;
		const notificationService = new RecordingNotificationService();
		const contribution = new OpenAgentsWindowSystemWideKeybindingContribution(
			keybindingService,
			nativeHostService,
			notificationService,
			new RecordingLogService(),
		);
		await clock.tickAsync(0);

		contribution.dispose();
		result.complete({ failed: ['cmd+a'] });
		await clock.tickAsync(0);

		assert.deepStrictEqual(notificationService.notifications, []);
	});

	test('logs rejected direct Open Agents Window bindings', async () => {
		const { logService } = await createContribution([
			item(KeyMod.CtrlCmd | KeyCode.KeyA, 'other.command'),
			item(KeyMod.CtrlCmd | KeyCode.KeyA, OPEN_AGENTS_WINDOW_COMMAND_ID),
			item(KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyC), OPEN_AGENTS_WINDOW_COMMAND_ID),
		]);

		assert.deepStrictEqual(logService.warnings, [
			`[OpenAgentsWindowSystemWideKeybinding] 'cmd+k cmd+c' cannot be registered as a system-wide shortcut (only single key combinations are supported).`,
			`[OpenAgentsWindowSystemWideKeybinding] duplicate system-wide accelerator for 'cmd+a', keeping the first binding.`,
		]);
	});

	test('registers the command handler without adding a default keybinding or command palette entry', async () => {
		const defaultKeybindingsBefore = KeybindingsRegistry.getDefaultKeybindings().filter(keybinding => keybinding.command === OPEN_AGENTS_WINDOW_COMMAND_ID);
		const commandPaletteItemsBefore = MenuRegistry.getMenuItems(MenuId.CommandPalette).filter(isIMenuItem).filter(item => item.command.id === OPEN_AGENTS_WINDOW_COMMAND_ID);
		const nativeHostService = new TestNativeHostService();
		store.add(registerOpenAgentsWindowCommand());
		const command = CommandsRegistry.getCommand(OPEN_AGENTS_WINDOW_COMMAND_ID);
		assert.ok(command);

		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(INativeHostService, nativeHostService);
		await instantiationService.invokeFunction(accessor => command.handler(accessor, { source: AgentsWindowOpenSource.KeyboardShortcut }));

		assert.deepStrictEqual({
			openAgentsWindowOptions: nativeHostService.openAgentsWindowOptions,
			defaultKeybindingDelta: KeybindingsRegistry.getDefaultKeybindings().filter(keybinding => keybinding.command === OPEN_AGENTS_WINDOW_COMMAND_ID).length - defaultKeybindingsBefore.length,
			commandPaletteDelta: MenuRegistry.getMenuItems(MenuId.CommandPalette).filter(isIMenuItem).filter(item => item.command.id === OPEN_AGENTS_WINDOW_COMMAND_ID).length - commandPaletteItemsBefore.length,
		}, {
			openAgentsWindowOptions: [{ source: AgentsWindowOpenSource.KeyboardShortcut }],
			defaultKeybindingDelta: 0,
			commandPaletteDelta: 0,
		});
	});
});
