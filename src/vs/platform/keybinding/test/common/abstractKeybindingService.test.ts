/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { ResolvedKeybinding, KeyCode, KeyMod, KeyChord, Keybinding, createKeybinding, createSimpleKeybinding, SimpleKeybinding } from 'vs/base/common/keyCodes';
import { AbstractKeybindingService } from 'vs/platform/keybinding/common/abstractKeybindingService';
import { USLayoutResolvedKeybinding } from 'vs/platform/keybinding/common/usLayoutResolvedKeybinding';
import { IDisposable } from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { KeybindingResolver } from 'vs/platform/keybinding/common/keybindingResolver';
import { IContext, ContextKeyExpr, IContextKeyService, IContextKeyServiceTarget } from 'vs/platform/contextkey/common/contextkey';
import { IStatusbarService } from 'vs/platform/statusbar/common/statusbar';
import { IMessageService } from 'vs/platform/message/common/message';
import { TPromise } from 'vs/base/common/winjs.base';
import { ResolvedKeybindingItem } from 'vs/platform/keybinding/common/resolvedKeybindingItem';
import { OS } from 'vs/base/common/platform';
import { IKeyboardEvent } from 'vs/platform/keybinding/common/keybinding';

const createContext = ctx => ({ getValue: key => ctx[key] });

suite('AbstractKeybindingService', () => {

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

		protected _getResolver(): KeybindingResolver {
			return this._resolver;
		}

		public resolveKeybinding(kb: Keybinding): ResolvedKeybinding[] {
			return [new USLayoutResolvedKeybinding(kb, OS)];
		}

		public resolveKeyboardEvent(keyboardEvent: IKeyboardEvent): ResolvedKeybinding {
			let keybinding = new SimpleKeybinding(
				keyboardEvent.ctrlKey,
				keyboardEvent.shiftKey,
				keyboardEvent.altKey,
				keyboardEvent.metaKey,
				keyboardEvent.keyCode
			);
			return this.resolveKeybinding(keybinding)[0];
		}

		public resolveUserBinding(userBinding: string): ResolvedKeybinding[] {
			return [];
		}

		public testDispatch(kb: number): boolean {
			const keybinding = createSimpleKeybinding(kb, OS);
			return this._dispatch({
				ctrlKey: keybinding.ctrlKey,
				shiftKey: keybinding.shiftKey,
				altKey: keybinding.altKey,
				metaKey: keybinding.metaKey,
				keyCode: keybinding.keyCode,
				code: null
			}, null);
		}
	}

	let createTestKeybindingService: (items: ResolvedKeybindingItem[], contextValue?: any) => TestKeybindingService = null;
	let currentContextValue: IContext = null;
	let executeCommandCalls: { commandId: string; args: any[]; }[] = null;
	let showMessageCalls: { sev: Severity, message: any; }[] = null;
	let statusMessageCalls: string[] = null;
	let statusMessageCallsDisposed: string[] = null;

	setup(() => {
		executeCommandCalls = [];
		showMessageCalls = [];
		statusMessageCalls = [];
		statusMessageCallsDisposed = [];

		createTestKeybindingService = (items: ResolvedKeybindingItem[]): TestKeybindingService => {

			let contextKeyService: IContextKeyService = {
				_serviceBrand: undefined,
				dispose: undefined,
				onDidChangeContext: undefined,
				createKey: undefined,
				contextMatchesRules: undefined,
				getContextKeyValue: undefined,
				createScoped: undefined,
				getContext: (target: IContextKeyServiceTarget): any => {
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

	function kbItem(keybinding: number, command: string, when: ContextKeyExpr = null): ResolvedKeybindingItem {
		const resolvedKeybinding = (keybinding !== 0 ? new USLayoutResolvedKeybinding(createKeybinding(keybinding, OS), OS) : null);
		return new ResolvedKeybindingItem(
			resolvedKeybinding,
			command,
			null,
			when,
			true
		);
	}

	function toUsLabel(keybinding: number): string {
		const usResolvedKeybinding = new USLayoutResolvedKeybinding(createKeybinding(keybinding, OS), OS);
		return usResolvedKeybinding.getLabel();
	}

	test('issue #16498: chord mode is quit for invalid chords', () => {

		let kbService = createTestKeybindingService([
			kbItem(KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_X), 'chordCommand'),
			kbItem(KeyCode.Backspace, 'simpleCommand'),
		]);

		// send Ctrl/Cmd + K
		let shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KEY_K);
		assert.equal(shouldPreventDefault, true);
		assert.deepEqual(executeCommandCalls, []);
		assert.deepEqual(showMessageCalls, []);
		assert.deepEqual(statusMessageCalls, [
			`(${toUsLabel(KeyMod.CtrlCmd | KeyCode.KEY_K)}) was pressed. Waiting for second key of chord...`
		]);
		assert.deepEqual(statusMessageCallsDisposed, []);
		executeCommandCalls = [];
		showMessageCalls = [];
		statusMessageCalls = [];
		statusMessageCallsDisposed = [];

		// send backspace
		shouldPreventDefault = kbService.testDispatch(KeyCode.Backspace);
		assert.equal(shouldPreventDefault, true);
		assert.deepEqual(executeCommandCalls, []);
		assert.deepEqual(showMessageCalls, []);
		assert.deepEqual(statusMessageCalls, [
			`The key combination (${toUsLabel(KeyMod.CtrlCmd | KeyCode.KEY_K)}, ${toUsLabel(KeyCode.Backspace)}) is not a command.`
		]);
		assert.deepEqual(statusMessageCallsDisposed, [
			`(${toUsLabel(KeyMod.CtrlCmd | KeyCode.KEY_K)}) was pressed. Waiting for second key of chord...`
		]);
		executeCommandCalls = [];
		showMessageCalls = [];
		statusMessageCalls = [];
		statusMessageCallsDisposed = [];

		// send backspace
		shouldPreventDefault = kbService.testDispatch(KeyCode.Backspace);
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

	test('issue #16833: Keybinding service should not testDispatch on modifier keys', () => {

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
			let shouldPreventDefault = kbService.testDispatch(keybinding);
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
		currentContextValue = createContext({
			key1: true
		});
		let shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KEY_K);
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
		currentContextValue = createContext({});
		shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KEY_K);
		assert.equal(shouldPreventDefault, true);
		assert.deepEqual(executeCommandCalls, []);
		assert.deepEqual(showMessageCalls, []);
		assert.deepEqual(statusMessageCalls, [
			`(${toUsLabel(KeyMod.CtrlCmd | KeyCode.KEY_K)}) was pressed. Waiting for second key of chord...`
		]);
		assert.deepEqual(statusMessageCallsDisposed, []);
		executeCommandCalls = [];
		showMessageCalls = [];
		statusMessageCalls = [];
		statusMessageCallsDisposed = [];

		// send Ctrl/Cmd + X
		currentContextValue = createContext({});
		shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KEY_X);
		assert.equal(shouldPreventDefault, true);
		assert.deepEqual(executeCommandCalls, [{
			commandId: 'chordCommand',
			args: [{}]
		}]);
		assert.deepEqual(showMessageCalls, []);
		assert.deepEqual(statusMessageCalls, []);
		assert.deepEqual(statusMessageCallsDisposed, [
			`(${toUsLabel(KeyMod.CtrlCmd | KeyCode.KEY_K)}) was pressed. Waiting for second key of chord...`
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
		currentContextValue = createContext({});
		let shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KEY_K);
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
		currentContextValue = createContext({
			key1: true
		});
		shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KEY_K);
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
		currentContextValue = createContext({
			key1: true
		});
		shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KEY_X);
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
		currentContextValue = createContext({});
		let shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KEY_K);
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
