/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { KeyChord, KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { createSimpleKeybinding, ResolvedKeybinding, KeyCodeChord, Keybinding } from '../../../../base/common/keybindings.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { OS } from '../../../../base/common/platform.js';
import Severity from '../../../../base/common/severity.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ICommandService } from '../../../commands/common/commands.js';
import { ContextKeyExpr, ContextKeyExpression, IContext, IContextKeyService, IContextKeyServiceTarget } from '../../../contextkey/common/contextkey.js';
import { AbstractKeybindingService } from '../../common/abstractKeybindingService.js';
import { IKeyboardEvent } from '../../common/keybinding.js';
import { KeybindingResolver } from '../../common/keybindingResolver.js';
import { ResolvedKeybindingItem } from '../../common/resolvedKeybindingItem.js';
import { USLayoutResolvedKeybinding } from '../../common/usLayoutResolvedKeybinding.js';
import { createUSLayoutResolvedKeybinding } from './keybindingsTestUtils.js';
import { NullLogService } from '../../../log/common/log.js';
import { INotification, INotificationService, IPromptChoice, IPromptOptions, IStatusMessageOptions, NoOpNotification } from '../../../notification/common/notification.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';

function createContext(ctx: any) {
	return {
		getValue: (key: string) => {
			return ctx[key];
		}
	};
}

suite('AbstractKeybindingService', () => {

	class TestKeybindingService extends AbstractKeybindingService {
		private _resolver: KeybindingResolver;

		constructor(
			resolver: KeybindingResolver,
			contextKeyService: IContextKeyService,
			commandService: ICommandService,
			notificationService: INotificationService
		) {
			super(contextKeyService, commandService, NullTelemetryService, notificationService, new NullLogService());
			this._resolver = resolver;
		}

		protected _getResolver(): KeybindingResolver {
			return this._resolver;
		}

		protected _documentHasFocus(): boolean {
			return true;
		}

		public resolveKeybinding(kb: Keybinding): ResolvedKeybinding[] {
			return USLayoutResolvedKeybinding.resolveKeybinding(kb, OS);
		}

		public resolveKeyboardEvent(keyboardEvent: IKeyboardEvent): ResolvedKeybinding {
			const chord = new KeyCodeChord(
				keyboardEvent.ctrlKey,
				keyboardEvent.shiftKey,
				keyboardEvent.altKey,
				keyboardEvent.metaKey,
				keyboardEvent.keyCode
			).toKeybinding();
			return this.resolveKeybinding(chord)[0];
		}

		public resolveUserBinding(userBinding: string): ResolvedKeybinding[] {
			return [];
		}

		public testDispatch(kb: number): boolean {
			const keybinding = createSimpleKeybinding(kb, OS);
			return this._dispatch({
				_standardKeyboardEventBrand: true,
				ctrlKey: keybinding.ctrlKey,
				shiftKey: keybinding.shiftKey,
				altKey: keybinding.altKey,
				metaKey: keybinding.metaKey,
				altGraphKey: false,
				keyCode: keybinding.keyCode,
				code: null!
			}, null!);
		}

		public _dumpDebugInfo(): string {
			return '';
		}

		public _dumpDebugInfoJSON(): string {
			return '';
		}

		public registerSchemaContribution() {
			// noop
		}

		public enableKeybindingHoldMode() {
			return undefined;
		}
	}

	let createTestKeybindingService: (items: ResolvedKeybindingItem[], contextValue?: any) => TestKeybindingService = null!;
	let currentContextValue: IContext | null = null;
	let executeCommandCalls: { commandId: string; args: any[] }[] = null!;
	let showMessageCalls: { sev: Severity; message: any }[] = null!;
	let statusMessageCalls: string[] | null = null;
	let statusMessageCallsDisposed: string[] | null = null;


	teardown(() => {
		currentContextValue = null;
		executeCommandCalls = null!;
		showMessageCalls = null!;
		createTestKeybindingService = null!;
		statusMessageCalls = null;
		statusMessageCallsDisposed = null;
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		executeCommandCalls = [];
		showMessageCalls = [];
		statusMessageCalls = [];
		statusMessageCallsDisposed = [];

		createTestKeybindingService = (items: ResolvedKeybindingItem[]): TestKeybindingService => {

			const contextKeyService: IContextKeyService = {
				_serviceBrand: undefined,
				onDidChangeContext: undefined!,
				bufferChangeEvents() { },
				createKey: undefined!,
				contextMatchesRules: undefined!,
				getContextKeyValue: undefined!,
				createScoped: undefined!,
				createOverlay: undefined!,
				getContext: (target: IContextKeyServiceTarget): any => {
					return currentContextValue;
				},
				updateParent: () => { }
			};

			const commandService: ICommandService = {
				_serviceBrand: undefined,
				onWillExecuteCommand: () => Disposable.None,
				onDidExecuteCommand: () => Disposable.None,
				executeCommand: (commandId: string, ...args: any[]): Promise<any> => {
					executeCommandCalls.push({
						commandId: commandId,
						args: args
					});
					return Promise.resolve(undefined);
				}
			};

			const notificationService: INotificationService = {
				_serviceBrand: undefined,
				onDidAddNotification: undefined!,
				onDidRemoveNotification: undefined!,
				onDidChangeFilter: undefined!,
				notify: (notification: INotification) => {
					showMessageCalls.push({ sev: notification.severity, message: notification.message });
					return new NoOpNotification();
				},
				info: (message: any) => {
					showMessageCalls.push({ sev: Severity.Info, message });
					return new NoOpNotification();
				},
				warn: (message: any) => {
					showMessageCalls.push({ sev: Severity.Warning, message });
					return new NoOpNotification();
				},
				error: (message: any) => {
					showMessageCalls.push({ sev: Severity.Error, message });
					return new NoOpNotification();
				},
				prompt(severity: Severity, message: string, choices: IPromptChoice[], options?: IPromptOptions) {
					throw new Error('not implemented');
				},
				status(message: string, options?: IStatusMessageOptions) {
					statusMessageCalls!.push(message);
					return {
						dispose: () => {
							statusMessageCallsDisposed!.push(message);
						}
					};
				},
				setFilter() {
					throw new Error('not implemented');
				},
				getFilter() {
					throw new Error('not implemented');
				},
				getFilters() {
					throw new Error('not implemented');
				},
				removeFilter() {
					throw new Error('not implemented');
				}
			};

			const resolver = new KeybindingResolver(items, [], () => { });

			return new TestKeybindingService(resolver, contextKeyService, commandService, notificationService);
		};
	});

	function kbItem(keybinding: number | number[], command: string | null, when?: ContextKeyExpression): ResolvedKeybindingItem {
		return new ResolvedKeybindingItem(
			createUSLayoutResolvedKeybinding(keybinding, OS),
			command,
			null,
			when,
			true,
			null,
			false
		);
	}

	function toUsLabel(keybinding: number): string {
		return createUSLayoutResolvedKeybinding(keybinding, OS)!.getLabel()!;
	}

	suite('simple tests: single- and multi-chord keybindings are dispatched', () => {

		test('a single-chord keybinding is dispatched correctly; this test makes sure the dispatch in general works before we test empty-string/null command ID', () => {

			const key = KeyMod.CtrlCmd | KeyCode.KeyK;
			const kbService = createTestKeybindingService([
				kbItem(key, 'myCommand'),
			]);

			currentContextValue = createContext({});
			const shouldPreventDefault = kbService.testDispatch(key);
			assert.deepStrictEqual(shouldPreventDefault, true);
			assert.deepStrictEqual(executeCommandCalls, ([{ commandId: "myCommand", args: [null] }]));
			assert.deepStrictEqual(showMessageCalls, []);
			assert.deepStrictEqual(statusMessageCalls, []);
			assert.deepStrictEqual(statusMessageCallsDisposed, []);

			kbService.dispose();
		});

		test('a multi-chord keybinding is dispatched correctly', () => {

			const chord0 = KeyMod.CtrlCmd | KeyCode.KeyK;
			const chord1 = KeyMod.CtrlCmd | KeyCode.KeyI;
			const key = [chord0, chord1];
			const kbService = createTestKeybindingService([
				kbItem(key, 'myCommand'),
			]);

			currentContextValue = createContext({});

			let shouldPreventDefault = kbService.testDispatch(chord0);
			assert.deepStrictEqual(shouldPreventDefault, true);
			assert.deepStrictEqual(executeCommandCalls, []);
			assert.deepStrictEqual(showMessageCalls, []);
			assert.deepStrictEqual(statusMessageCalls, ([`(${toUsLabel(chord0)}) was pressed. Waiting for second key of chord...`]));
			assert.deepStrictEqual(statusMessageCallsDisposed, []);

			shouldPreventDefault = kbService.testDispatch(chord1);
			assert.deepStrictEqual(shouldPreventDefault, true);
			assert.deepStrictEqual(executeCommandCalls, ([{ commandId: "myCommand", args: [null] }]));
			assert.deepStrictEqual(showMessageCalls, []);
			assert.deepStrictEqual(statusMessageCalls, ([`(${toUsLabel(chord0)}) was pressed. Waiting for second key of chord...`]));
			assert.deepStrictEqual(statusMessageCallsDisposed, ([`(${toUsLabel(chord0)}) was pressed. Waiting for second key of chord...`]));

			kbService.dispose();
		});
	});

	suite('keybindings with empty-string/null command ID', () => {

		test('a single-chord keybinding with an empty string command ID unbinds the keybinding (shouldPreventDefault = false)', () => {

			const kbService = createTestKeybindingService([
				kbItem(KeyMod.CtrlCmd | KeyCode.KeyK, 'myCommand'),
				kbItem(KeyMod.CtrlCmd | KeyCode.KeyK, ''),
			]);

			// send Ctrl/Cmd + K
			currentContextValue = createContext({});
			const shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyK);
			assert.deepStrictEqual(shouldPreventDefault, false);
			assert.deepStrictEqual(executeCommandCalls, []);
			assert.deepStrictEqual(showMessageCalls, []);
			assert.deepStrictEqual(statusMessageCalls, []);
			assert.deepStrictEqual(statusMessageCallsDisposed, []);

			kbService.dispose();
		});

		test('a single-chord keybinding with a null command ID unbinds the keybinding (shouldPreventDefault = false)', () => {

			const kbService = createTestKeybindingService([
				kbItem(KeyMod.CtrlCmd | KeyCode.KeyK, 'myCommand'),
				kbItem(KeyMod.CtrlCmd | KeyCode.KeyK, null),
			]);

			// send Ctrl/Cmd + K
			currentContextValue = createContext({});
			const shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyK);
			assert.deepStrictEqual(shouldPreventDefault, false);
			assert.deepStrictEqual(executeCommandCalls, []);
			assert.deepStrictEqual(showMessageCalls, []);
			assert.deepStrictEqual(statusMessageCalls, []);
			assert.deepStrictEqual(statusMessageCallsDisposed, []);

			kbService.dispose();
		});

		test('a multi-chord keybinding with an empty-string command ID keeps the keybinding (shouldPreventDefault = true)', () => {

			const chord0 = KeyMod.CtrlCmd | KeyCode.KeyK;
			const chord1 = KeyMod.CtrlCmd | KeyCode.KeyI;
			const key = [chord0, chord1];
			const kbService = createTestKeybindingService([
				kbItem(key, 'myCommand'),
				kbItem(key, ''),
			]);

			currentContextValue = createContext({});

			let shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyK);
			assert.deepStrictEqual(shouldPreventDefault, true);
			assert.deepStrictEqual(executeCommandCalls, []);
			assert.deepStrictEqual(showMessageCalls, []);
			assert.deepStrictEqual(statusMessageCalls, ([`(${toUsLabel(chord0)}) was pressed. Waiting for second key of chord...`]));
			assert.deepStrictEqual(statusMessageCallsDisposed, []);

			shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyI);
			assert.deepStrictEqual(shouldPreventDefault, true);
			assert.deepStrictEqual(executeCommandCalls, []);
			assert.deepStrictEqual(showMessageCalls, []);
			assert.deepStrictEqual(statusMessageCalls, ([`(${toUsLabel(chord0)}) was pressed. Waiting for second key of chord...`, `The key combination (${toUsLabel(chord0)}, ${toUsLabel(chord1)}) is not a command.`]));
			assert.deepStrictEqual(statusMessageCallsDisposed, ([`(${toUsLabel(chord0)}) was pressed. Waiting for second key of chord...`]));

			kbService.dispose();
		});

		test('a multi-chord keybinding with a null command ID keeps the keybinding (shouldPreventDefault = true)', () => {

			const chord0 = KeyMod.CtrlCmd | KeyCode.KeyK;
			const chord1 = KeyMod.CtrlCmd | KeyCode.KeyI;
			const key = [chord0, chord1];
			const kbService = createTestKeybindingService([
				kbItem(key, 'myCommand'),
				kbItem(key, null),
			]);

			currentContextValue = createContext({});

			let shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyK);
			assert.deepStrictEqual(shouldPreventDefault, true);
			assert.deepStrictEqual(executeCommandCalls, []);
			assert.deepStrictEqual(showMessageCalls, []);
			assert.deepStrictEqual(statusMessageCalls, ([`(${toUsLabel(chord0)}) was pressed. Waiting for second key of chord...`]));
			assert.deepStrictEqual(statusMessageCallsDisposed, []);

			shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyI);
			assert.deepStrictEqual(shouldPreventDefault, true);
			assert.deepStrictEqual(executeCommandCalls, []);
			assert.deepStrictEqual(showMessageCalls, []);
			assert.deepStrictEqual(statusMessageCalls, ([`(${toUsLabel(chord0)}) was pressed. Waiting for second key of chord...`, `The key combination (${toUsLabel(chord0)}, ${toUsLabel(chord1)}) is not a command.`]));
			assert.deepStrictEqual(statusMessageCallsDisposed, ([`(${toUsLabel(chord0)}) was pressed. Waiting for second key of chord...`]));

			kbService.dispose();
		});

	});

	test('issue #16498: chord mode is quit for invalid chords', () => {

		const kbService = createTestKeybindingService([
			kbItem(KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyX), 'chordCommand'),
			kbItem(KeyCode.Backspace, 'simpleCommand'),
		]);

		// send Ctrl/Cmd + K
		let shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyK);
		assert.strictEqual(shouldPreventDefault, true);
		assert.deepStrictEqual(executeCommandCalls, []);
		assert.deepStrictEqual(showMessageCalls, []);
		assert.deepStrictEqual(statusMessageCalls, [
			`(${toUsLabel(KeyMod.CtrlCmd | KeyCode.KeyK)}) was pressed. Waiting for second key of chord...`
		]);
		assert.deepStrictEqual(statusMessageCallsDisposed, []);
		executeCommandCalls = [];
		showMessageCalls = [];
		statusMessageCalls = [];
		statusMessageCallsDisposed = [];

		// send backspace
		shouldPreventDefault = kbService.testDispatch(KeyCode.Backspace);
		assert.strictEqual(shouldPreventDefault, true);
		assert.deepStrictEqual(executeCommandCalls, []);
		assert.deepStrictEqual(showMessageCalls, []);
		assert.deepStrictEqual(statusMessageCalls, [
			`The key combination (${toUsLabel(KeyMod.CtrlCmd | KeyCode.KeyK)}, ${toUsLabel(KeyCode.Backspace)}) is not a command.`
		]);
		assert.deepStrictEqual(statusMessageCallsDisposed, [
			`(${toUsLabel(KeyMod.CtrlCmd | KeyCode.KeyK)}) was pressed. Waiting for second key of chord...`
		]);
		executeCommandCalls = [];
		showMessageCalls = [];
		statusMessageCalls = [];
		statusMessageCallsDisposed = [];

		// send backspace
		shouldPreventDefault = kbService.testDispatch(KeyCode.Backspace);
		assert.strictEqual(shouldPreventDefault, true);
		assert.deepStrictEqual(executeCommandCalls, [{
			commandId: 'simpleCommand',
			args: [null]
		}]);
		assert.deepStrictEqual(showMessageCalls, []);
		assert.deepStrictEqual(statusMessageCalls, []);
		assert.deepStrictEqual(statusMessageCallsDisposed, []);
		executeCommandCalls = [];
		showMessageCalls = [];
		statusMessageCalls = [];
		statusMessageCallsDisposed = [];

		kbService.dispose();
	});

	test('issue #16833: Keybinding service should not testDispatch on modifier keys', () => {

		const kbService = createTestKeybindingService([
			kbItem(KeyCode.Ctrl, 'nope'),
			kbItem(KeyCode.Meta, 'nope'),
			kbItem(KeyCode.Alt, 'nope'),
			kbItem(KeyCode.Shift, 'nope'),

			kbItem(KeyMod.CtrlCmd, 'nope'),
			kbItem(KeyMod.WinCtrl, 'nope'),
			kbItem(KeyMod.Alt, 'nope'),
			kbItem(KeyMod.Shift, 'nope'),
		]);

		function assertIsIgnored(keybinding: number): void {
			const shouldPreventDefault = kbService.testDispatch(keybinding);
			assert.strictEqual(shouldPreventDefault, false);
			assert.deepStrictEqual(executeCommandCalls, []);
			assert.deepStrictEqual(showMessageCalls, []);
			assert.deepStrictEqual(statusMessageCalls, []);
			assert.deepStrictEqual(statusMessageCallsDisposed, []);
			executeCommandCalls = [];
			showMessageCalls = [];
			statusMessageCalls = [];
			statusMessageCallsDisposed = [];
		}

		assertIsIgnored(KeyCode.Ctrl);
		assertIsIgnored(KeyCode.Meta);
		assertIsIgnored(KeyCode.Alt);
		assertIsIgnored(KeyCode.Shift);

		assertIsIgnored(KeyMod.CtrlCmd);
		assertIsIgnored(KeyMod.WinCtrl);
		assertIsIgnored(KeyMod.Alt);
		assertIsIgnored(KeyMod.Shift);

		kbService.dispose();
	});

	test('can trigger command that is sharing keybinding with chord', () => {

		const kbService = createTestKeybindingService([
			kbItem(KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyX), 'chordCommand'),
			kbItem(KeyMod.CtrlCmd | KeyCode.KeyK, 'simpleCommand', ContextKeyExpr.has('key1')),
		]);


		// send Ctrl/Cmd + K
		currentContextValue = createContext({
			key1: true
		});
		let shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyK);
		assert.strictEqual(shouldPreventDefault, true);
		assert.deepStrictEqual(executeCommandCalls, [{
			commandId: 'simpleCommand',
			args: [null]
		}]);
		assert.deepStrictEqual(showMessageCalls, []);
		assert.deepStrictEqual(statusMessageCalls, []);
		assert.deepStrictEqual(statusMessageCallsDisposed, []);
		executeCommandCalls = [];
		showMessageCalls = [];
		statusMessageCalls = [];
		statusMessageCallsDisposed = [];

		// send Ctrl/Cmd + K
		currentContextValue = createContext({});
		shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyK);
		assert.strictEqual(shouldPreventDefault, true);
		assert.deepStrictEqual(executeCommandCalls, []);
		assert.deepStrictEqual(showMessageCalls, []);
		assert.deepStrictEqual(statusMessageCalls, [
			`(${toUsLabel(KeyMod.CtrlCmd | KeyCode.KeyK)}) was pressed. Waiting for second key of chord...`
		]);
		assert.deepStrictEqual(statusMessageCallsDisposed, []);
		executeCommandCalls = [];
		showMessageCalls = [];
		statusMessageCalls = [];
		statusMessageCallsDisposed = [];

		// send Ctrl/Cmd + X
		currentContextValue = createContext({});
		shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyX);
		assert.strictEqual(shouldPreventDefault, true);
		assert.deepStrictEqual(executeCommandCalls, [{
			commandId: 'chordCommand',
			args: [null]
		}]);
		assert.deepStrictEqual(showMessageCalls, []);
		assert.deepStrictEqual(statusMessageCalls, []);
		assert.deepStrictEqual(statusMessageCallsDisposed, [
			`(${toUsLabel(KeyMod.CtrlCmd | KeyCode.KeyK)}) was pressed. Waiting for second key of chord...`
		]);
		executeCommandCalls = [];
		showMessageCalls = [];
		statusMessageCalls = [];
		statusMessageCallsDisposed = [];

		kbService.dispose();
	});

	test('cannot trigger chord if command is overwriting', () => {

		const kbService = createTestKeybindingService([
			kbItem(KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyX), 'chordCommand', ContextKeyExpr.has('key1')),
			kbItem(KeyMod.CtrlCmd | KeyCode.KeyK, 'simpleCommand'),
		]);


		// send Ctrl/Cmd + K
		currentContextValue = createContext({});
		let shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyK);
		assert.strictEqual(shouldPreventDefault, true);
		assert.deepStrictEqual(executeCommandCalls, [{
			commandId: 'simpleCommand',
			args: [null]
		}]);
		assert.deepStrictEqual(showMessageCalls, []);
		assert.deepStrictEqual(statusMessageCalls, []);
		assert.deepStrictEqual(statusMessageCallsDisposed, []);
		executeCommandCalls = [];
		showMessageCalls = [];
		statusMessageCalls = [];
		statusMessageCallsDisposed = [];

		// send Ctrl/Cmd + K
		currentContextValue = createContext({
			key1: true
		});
		shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyK);
		assert.strictEqual(shouldPreventDefault, true);
		assert.deepStrictEqual(executeCommandCalls, [{
			commandId: 'simpleCommand',
			args: [null]
		}]);
		assert.deepStrictEqual(showMessageCalls, []);
		assert.deepStrictEqual(statusMessageCalls, []);
		assert.deepStrictEqual(statusMessageCallsDisposed, []);
		executeCommandCalls = [];
		showMessageCalls = [];
		statusMessageCalls = [];
		statusMessageCallsDisposed = [];

		// send Ctrl/Cmd + X
		currentContextValue = createContext({
			key1: true
		});
		shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyX);
		assert.strictEqual(shouldPreventDefault, false);
		assert.deepStrictEqual(executeCommandCalls, []);
		assert.deepStrictEqual(showMessageCalls, []);
		assert.deepStrictEqual(statusMessageCalls, []);
		assert.deepStrictEqual(statusMessageCallsDisposed, []);
		executeCommandCalls = [];
		showMessageCalls = [];
		statusMessageCalls = [];
		statusMessageCallsDisposed = [];

		kbService.dispose();
	});

	test('can have spying command', () => {

		const kbService = createTestKeybindingService([
			kbItem(KeyMod.CtrlCmd | KeyCode.KeyK, '^simpleCommand'),
		]);

		// send Ctrl/Cmd + K
		currentContextValue = createContext({});
		const shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyK);
		assert.strictEqual(shouldPreventDefault, false);
		assert.deepStrictEqual(executeCommandCalls, [{
			commandId: 'simpleCommand',
			args: [null]
		}]);
		assert.deepStrictEqual(showMessageCalls, []);
		assert.deepStrictEqual(statusMessageCalls, []);
		assert.deepStrictEqual(statusMessageCallsDisposed, []);
		executeCommandCalls = [];
		showMessageCalls = [];
		statusMessageCalls = [];
		statusMessageCallsDisposed = [];

		kbService.dispose();
	});
});
