/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { ResolvedKeybinding, Keybinding, createKeybinding, KeyCode, KeyMod, KeyChord } from 'vs/base/common/keyCodes';
import { AbstractKeybindingService } from 'vs/platform/keybinding/common/abstractKeybindingService';
import { KeybindingLabels } from 'vs/platform/keybinding/common/keybindingLabels';
import { IDisposable } from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { KeybindingResolver, NormalizedKeybindingItem } from 'vs/platform/keybinding/common/keybindingResolver';
import { ContextKeyExpr, IContextKeyService, IContextKeyServiceTarget } from 'vs/platform/contextkey/common/contextkey';
import { IStatusbarService } from 'vs/platform/statusbar/common/statusbar';
import { IMessageService } from 'vs/platform/message/common/message';
import { TPromise } from 'vs/base/common/winjs.base';
import { keybindingToKeyPress, keyPressToKeybinding, SimpleKeyPress, KeyPress } from 'vs/platform/keybinding/common/keyPress';
import { IHTMLContentElement } from 'vs/base/common/htmlContent';
import * as platform from 'vs/base/common/platform';
import { ISimpleKeyPress } from 'vs/platform/keybinding/common/keybinding';

suite('AbstractKeybindingService', () => {

	class TestResolvedKeybinding extends ResolvedKeybinding {

		private readonly _label: string;

		constructor(label: string) {
			super();
			this._label = label;
		}

		public getLabel(): string { return this._label; }

		public getAriaLabel(): string { throw new Error('Unexpected'); }

		public getHTMLLabel(): IHTMLContentElement[] { throw new Error('Unexpected'); }

		public getElectronAccelerator(): string { throw new Error('Unexpected'); }

		public getUserSettingsLabel(): string { throw new Error('Unexpected'); }
	}

	class TestKeybindingService extends AbstractKeybindingService {
		private _resolver: KeybindingResolver;

		constructor(
			resolver: KeybindingResolver,
			contextKeyService: IContextKeyService,
			commandService: ICommandService,
			messageService: IMessageService,
			statusService?: IStatusbarService
		) {
			super(contextKeyService, commandService, messageService, statusService);
			this._resolver = resolver;
		}

		public dispatch(keyPress: SimpleKeyPress): boolean {
			return this._dispatch(keyPress, null);
		}

		protected _getResolver(): KeybindingResolver {
			return this._resolver;
		}

		protected _keybindingToKeyPress(keybinding: Keybinding): KeyPress {
			return keybindingToKeyPress(keybinding);
		}

		protected _createResolvedKeybinding(keyPress: KeyPress): ResolvedKeybinding {
			let keybinding = keyPressToKeybinding(keyPress);
			return new TestResolvedKeybinding(KeybindingLabels._toUSLabel(keybinding));
		}

		protected _createSimpleKeyPress(source: ISimpleKeyPress): SimpleKeyPress {
			return SimpleKeyPress.create(
				source.ctrlKey,
				source.shiftKey,
				source.altKey,
				source.metaKey,
				source.keyCode
			);
		}
	}

	let createTestKeybindingService: (items: NormalizedKeybindingItem[], contextValue?: any) => TestKeybindingService = null;
	let currentContextValue: any = null;
	let executeCommandCalls: { commandId: string; args: any[]; }[] = null;
	let showMessageCalls: { sev: Severity, message: any; }[] = null;
	let statusMessageCalls: string[] = null;
	let statusMessageCallsDisposed: string[] = null;

	setup(() => {
		executeCommandCalls = [];
		showMessageCalls = [];
		statusMessageCalls = [];
		statusMessageCallsDisposed = [];

		createTestKeybindingService = (items: NormalizedKeybindingItem[]): TestKeybindingService => {

			let contextKeyService: IContextKeyService = {
				_serviceBrand: undefined,
				dispose: undefined,
				onDidChangeContext: undefined,
				createKey: undefined,
				contextMatchesRules: undefined,
				getContextKeyValue: undefined,
				createScoped: undefined,
				getContextValue: (target: IContextKeyServiceTarget): any => {
					return currentContextValue;
				}
			};

			let commandService: ICommandService = {
				_serviceBrand: undefined,
				onWillExecuteCommand: () => ({ dispose: () => { } }),
				executeCommand: (commandId: string, ...args: any[]): TPromise<any> => {
					executeCommandCalls.push({
						commandId: commandId,
						args: args
					});
					return TPromise.as(void 0);
				}
			};

			let messageService: IMessageService = {
				_serviceBrand: undefined,
				hideAll: undefined,
				confirm: undefined,
				show: (sev: Severity, message: any): () => void => {
					showMessageCalls.push({
						sev: sev,
						message: message
					});
					return null;
				}
			};

			let statusbarService: IStatusbarService = {
				_serviceBrand: undefined,
				addEntry: undefined,
				setStatusMessage: (message: string, autoDisposeAfter?: number, delayBy?: number): IDisposable => {
					statusMessageCalls.push(message);
					return {
						dispose: () => {
							statusMessageCallsDisposed.push(message);
						}
					};
				}
			};

			let resolver = new KeybindingResolver(items, [], false);

			return new TestKeybindingService(resolver, contextKeyService, commandService, messageService, statusbarService);
		};
	});

	teardown(() => {
		currentContextValue = null;
		executeCommandCalls = null;
		showMessageCalls = null;
		createTestKeybindingService = null;
		statusMessageCalls = null;
		statusMessageCallsDisposed = null;
	});

	function kbItem(kb: number, command: string, when: ContextKeyExpr = null): NormalizedKeybindingItem {
		let keybinding = (kb !== 0 ? createKeybinding(kb) : null);
		let keyPress = (keybinding !== null ? keybindingToKeyPress(keybinding) : null);
		return new NormalizedKeybindingItem(keybinding, keyPress, command, null, when, true);
	}

	const ctrlCmdKLabel = platform.isMacintosh ? '⌃K' : 'Ctrl+K';

	test('issue #16498: chord mode is quit for invalid chords', () => {

		let kbService = createTestKeybindingService([
			kbItem(KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_X), 'chordCommand'),
			kbItem(KeyCode.Backspace, 'simpleCommand'),
		]);

		// send Ctrl/Cmd + K
		let shouldPreventDefault = kbService.dispatch(<SimpleKeyPress>keybindingToKeyPress(createKeybinding(KeyMod.CtrlCmd | KeyCode.KEY_K)));
		assert.equal(shouldPreventDefault, true);
		assert.deepEqual(executeCommandCalls, []);
		assert.deepEqual(showMessageCalls, []);
		assert.deepEqual(statusMessageCalls, [
			`(${ctrlCmdKLabel}) was pressed. Waiting for second key of chord...`
		]);
		assert.deepEqual(statusMessageCallsDisposed, []);
		executeCommandCalls = [];
		showMessageCalls = [];
		statusMessageCalls = [];
		statusMessageCallsDisposed = [];

		// send backspace
		shouldPreventDefault = kbService.dispatch(<SimpleKeyPress>keybindingToKeyPress(createKeybinding(KeyCode.Backspace)));
		assert.equal(shouldPreventDefault, true);
		assert.deepEqual(executeCommandCalls, []);
		assert.deepEqual(showMessageCalls, []);
		assert.deepEqual(statusMessageCalls, [
			`The key combination (${ctrlCmdKLabel}, Backspace) is not a command.`
		]);
		assert.deepEqual(statusMessageCallsDisposed, [
			`(${ctrlCmdKLabel}) was pressed. Waiting for second key of chord...`
		]);
		executeCommandCalls = [];
		showMessageCalls = [];
		statusMessageCalls = [];
		statusMessageCallsDisposed = [];

		// send backspace
		shouldPreventDefault = kbService.dispatch(<SimpleKeyPress>keybindingToKeyPress(createKeybinding(KeyCode.Backspace)));
		assert.equal(shouldPreventDefault, true);
		assert.deepEqual(executeCommandCalls, [{
			commandId: 'simpleCommand',
			args: [{}]
		}]);
		assert.deepEqual(showMessageCalls, []);
		assert.deepEqual(statusMessageCalls, []);
		assert.deepEqual(statusMessageCallsDisposed, []);
		executeCommandCalls = [];
		showMessageCalls = [];
		statusMessageCalls = [];
		statusMessageCallsDisposed = [];

		kbService.dispose();
	});

	test('issue #16833: Keybinding service should not dispatch on modifier keys', () => {

		let kbService = createTestKeybindingService([
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
			let shouldPreventDefault = kbService.dispatch(<SimpleKeyPress>keybindingToKeyPress(createKeybinding(keybinding)));
			assert.equal(shouldPreventDefault, false);
			assert.deepEqual(executeCommandCalls, []);
			assert.deepEqual(showMessageCalls, []);
			assert.deepEqual(statusMessageCalls, []);
			assert.deepEqual(statusMessageCallsDisposed, []);
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

		let kbService = createTestKeybindingService([
			kbItem(KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_X), 'chordCommand'),
			kbItem(KeyMod.CtrlCmd | KeyCode.KEY_K, 'simpleCommand', ContextKeyExpr.has('key1')),
		]);


		// send Ctrl/Cmd + K
		currentContextValue = {
			key1: true
		};
		let shouldPreventDefault = kbService.dispatch(<SimpleKeyPress>keybindingToKeyPress(createKeybinding(KeyMod.CtrlCmd | KeyCode.KEY_K)));
		assert.equal(shouldPreventDefault, true);
		assert.deepEqual(executeCommandCalls, [{
			commandId: 'simpleCommand',
			args: [{}]
		}]);
		assert.deepEqual(showMessageCalls, []);
		assert.deepEqual(statusMessageCalls, []);
		assert.deepEqual(statusMessageCallsDisposed, []);
		executeCommandCalls = [];
		showMessageCalls = [];
		statusMessageCalls = [];
		statusMessageCallsDisposed = [];

		// send Ctrl/Cmd + K
		currentContextValue = {};
		shouldPreventDefault = kbService.dispatch(<SimpleKeyPress>keybindingToKeyPress(createKeybinding(KeyMod.CtrlCmd | KeyCode.KEY_K)));
		assert.equal(shouldPreventDefault, true);
		assert.deepEqual(executeCommandCalls, []);
		assert.deepEqual(showMessageCalls, []);
		assert.deepEqual(statusMessageCalls, [
			`(${ctrlCmdKLabel}) was pressed. Waiting for second key of chord...`
		]);
		assert.deepEqual(statusMessageCallsDisposed, []);
		executeCommandCalls = [];
		showMessageCalls = [];
		statusMessageCalls = [];
		statusMessageCallsDisposed = [];

		// send Ctrl/Cmd + X
		currentContextValue = {};
		shouldPreventDefault = kbService.dispatch(<SimpleKeyPress>keybindingToKeyPress(createKeybinding(KeyMod.CtrlCmd | KeyCode.KEY_X)));
		assert.equal(shouldPreventDefault, true);
		assert.deepEqual(executeCommandCalls, [{
			commandId: 'chordCommand',
			args: [{}]
		}]);
		assert.deepEqual(showMessageCalls, []);
		assert.deepEqual(statusMessageCalls, []);
		assert.deepEqual(statusMessageCallsDisposed, [
			`(${ctrlCmdKLabel}) was pressed. Waiting for second key of chord...`
		]);
		executeCommandCalls = [];
		showMessageCalls = [];
		statusMessageCalls = [];
		statusMessageCallsDisposed = [];

		kbService.dispose();
	});

	test('cannot trigger chord if command is overwriting', () => {

		let kbService = createTestKeybindingService([
			kbItem(KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_X), 'chordCommand', ContextKeyExpr.has('key1')),
			kbItem(KeyMod.CtrlCmd | KeyCode.KEY_K, 'simpleCommand'),
		]);


		// send Ctrl/Cmd + K
		currentContextValue = {};
		let shouldPreventDefault = kbService.dispatch(<SimpleKeyPress>keybindingToKeyPress(createKeybinding(KeyMod.CtrlCmd | KeyCode.KEY_K)));
		assert.equal(shouldPreventDefault, true);
		assert.deepEqual(executeCommandCalls, [{
			commandId: 'simpleCommand',
			args: [{}]
		}]);
		assert.deepEqual(showMessageCalls, []);
		assert.deepEqual(statusMessageCalls, []);
		assert.deepEqual(statusMessageCallsDisposed, []);
		executeCommandCalls = [];
		showMessageCalls = [];
		statusMessageCalls = [];
		statusMessageCallsDisposed = [];

		// send Ctrl/Cmd + K
		currentContextValue = {
			key1: true
		};
		shouldPreventDefault = kbService.dispatch(<SimpleKeyPress>keybindingToKeyPress(createKeybinding(KeyMod.CtrlCmd | KeyCode.KEY_K)));
		assert.equal(shouldPreventDefault, true);
		assert.deepEqual(executeCommandCalls, [{
			commandId: 'simpleCommand',
			args: [{}]
		}]);
		assert.deepEqual(showMessageCalls, []);
		assert.deepEqual(statusMessageCalls, []);
		assert.deepEqual(statusMessageCallsDisposed, []);
		executeCommandCalls = [];
		showMessageCalls = [];
		statusMessageCalls = [];
		statusMessageCallsDisposed = [];

		// send Ctrl/Cmd + X
		currentContextValue = {
			key1: true
		};
		shouldPreventDefault = kbService.dispatch(<SimpleKeyPress>keybindingToKeyPress(createKeybinding(KeyMod.CtrlCmd | KeyCode.KEY_X)));
		assert.equal(shouldPreventDefault, false);
		assert.deepEqual(executeCommandCalls, []);
		assert.deepEqual(showMessageCalls, []);
		assert.deepEqual(statusMessageCalls, []);
		assert.deepEqual(statusMessageCallsDisposed, []);
		executeCommandCalls = [];
		showMessageCalls = [];
		statusMessageCalls = [];
		statusMessageCallsDisposed = [];

		kbService.dispose();
	});

	test('can have spying command', () => {

		let kbService = createTestKeybindingService([
			kbItem(KeyMod.CtrlCmd | KeyCode.KEY_K, '^simpleCommand'),
		]);

		// send Ctrl/Cmd + K
		currentContextValue = {};
		let shouldPreventDefault = kbService.dispatch(<SimpleKeyPress>keybindingToKeyPress(createKeybinding(KeyMod.CtrlCmd | KeyCode.KEY_K)));
		assert.equal(shouldPreventDefault, false);
		assert.deepEqual(executeCommandCalls, [{
			commandId: 'simpleCommand',
			args: [{}]
		}]);
		assert.deepEqual(showMessageCalls, []);
		assert.deepEqual(statusMessageCalls, []);
		assert.deepEqual(statusMessageCallsDisposed, []);
		executeCommandCalls = [];
		showMessageCalls = [];
		statusMessageCalls = [];
		statusMessageCallsDisposed = [];

		kbService.dispose();
	});
});
