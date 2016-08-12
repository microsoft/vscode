/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./keybindings';
import * as nls from 'vs/nls';
import {IHTMLContentElement} from 'vs/base/common/htmlContent';
import {KeyCode, Keybinding} from 'vs/base/common/keyCodes';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import {isFalsyOrEmpty} from 'vs/base/common/arrays';
import * as dom from 'vs/base/browser/dom';
import {IKeyboardEvent, StandardKeyboardEvent} from 'vs/base/browser/keyboardEvent';
import {ICommandService, CommandsRegistry, ICommandHandler, ICommandHandlerDescription} from 'vs/platform/commands/common/commands';
import {KeybindingResolver} from 'vs/platform/keybinding/common/keybindingResolver';
import {IKeybindingItem, IKeybindingService} from 'vs/platform/keybinding/common/keybinding';
import {IContextKeyService} from 'vs/platform/contextkey/common/contextkey';
import {KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';
import {IStatusbarService} from 'vs/platform/statusbar/common/statusbar';
import {IMessageService} from 'vs/platform/message/common/message';

export abstract class KeybindingService implements IKeybindingService {
	public _serviceBrand: any;

	private _toDispose: IDisposable[] = [];
	private _cachedResolver: KeybindingResolver;
	private _firstTimeComputingResolver: boolean;
	private _currentChord: number;
	private _currentChordStatusMessage: IDisposable;

	private _contextKeyService: IContextKeyService;
	private _commandService: ICommandService;
	private _statusService: IStatusbarService;
	private _messageService: IMessageService;

	constructor(
		contextKeyService: IContextKeyService,
		commandService: ICommandService,
		messageService: IMessageService,
		statusService?: IStatusbarService
	) {
		this._contextKeyService = contextKeyService;
		this._commandService = commandService;
		this._statusService = statusService;
		this._messageService = messageService;

		this._cachedResolver = null;
		this._firstTimeComputingResolver = true;
		this._currentChord = 0;
		this._currentChordStatusMessage = null;
	}

	public dispose(): void {
		this._toDispose = dispose(this._toDispose);
	}

	protected _beginListening(domNode: HTMLElement): void {
		this._toDispose.push(dom.addDisposableListener(domNode, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			let keyEvent = new StandardKeyboardEvent(e);
			this._dispatch(keyEvent);
		}));
	}

	private _getResolver(): KeybindingResolver {
		if (!this._cachedResolver) {
			this._cachedResolver = new KeybindingResolver(KeybindingsRegistry.getDefaultKeybindings(), this._getExtraKeybindings(this._firstTimeComputingResolver));
			this._firstTimeComputingResolver = false;
		}
		return this._cachedResolver;
	}

	public getLabelFor(keybinding: Keybinding): string {
		return keybinding._toUSLabel();
	}

	public getHTMLLabelFor(keybinding: Keybinding): IHTMLContentElement[] {
		return keybinding._toUSHTMLLabel();
	}

	public getAriaLabelFor(keybinding: Keybinding): string {
		return keybinding._toUSAriaLabel();
	}

	public getElectronAcceleratorFor(keybinding: Keybinding): string {
		return keybinding._toElectronAccelerator();
	}

		protected updateResolver(): void {
		this._cachedResolver = null;
	}

	protected _getExtraKeybindings(isFirstTime: boolean): IKeybindingItem[] {
		return [];
	}

	public getDefaultKeybindings(): string {
		return this._getResolver().getDefaultKeybindings() + '\n\n' + this._getAllCommandsAsComment();
	}

	public customKeybindingsCount(): number {
		return 0;
	}

	public lookupKeybindings(commandId: string): Keybinding[] {
		return this._getResolver().lookupKeybinding(commandId);
	}

	private _getAllCommandsAsComment(): string {
		const commands = CommandsRegistry.getCommands();
		const unboundCommands: string[] = [];
		const boundCommands = this._getResolver().getDefaultBoundCommands();

		for (let id in commands) {
			if (id[0] === '_' || id.indexOf('vscode.') === 0) { // private command
				continue;
			}
			if (typeof commands[id].description === 'object'
				&& !isFalsyOrEmpty((<ICommandHandlerDescription>commands[id].description).args)) { // command with args
				continue;
			}
			if (boundCommands[id]) {
				continue;
			}
			unboundCommands.push(id);
		}

		let pretty = unboundCommands.sort().join('\n// - ');

		return '// ' + nls.localize('unboundCommands', "Here are other available commands: ") + '\n// - ' + pretty;
	}

	protected _getCommandHandler(commandId: string): ICommandHandler {
		return CommandsRegistry.getCommand(commandId).handler;
	}

	private _dispatch(e: IKeyboardEvent): void {
		let isModifierKey = (e.keyCode === KeyCode.Ctrl || e.keyCode === KeyCode.Shift || e.keyCode === KeyCode.Alt || e.keyCode === KeyCode.Meta);
		if (isModifierKey) {
			return;
		}

		let contextValue = this._contextKeyService.getContextValue(e.target);
		// console.log(JSON.stringify(contextValue, null, '\t'));

		let resolveResult = this._getResolver().resolve(contextValue, this._currentChord, e.asKeybinding());

		if (resolveResult && resolveResult.enterChord) {
			e.preventDefault();
			this._currentChord = resolveResult.enterChord;
			if (this._statusService) {
				let firstPartLabel = this.getLabelFor(new Keybinding(this._currentChord));
				this._currentChordStatusMessage = this._statusService.setStatusMessage(nls.localize('first.chord', "({0}) was pressed. Waiting for second key of chord...", firstPartLabel));
			}
			return;
		}

		if (this._statusService && this._currentChord) {
			if (!resolveResult || !resolveResult.commandId) {
				let firstPartLabel = this.getLabelFor(new Keybinding(this._currentChord));
				let chordPartLabel = this.getLabelFor(new Keybinding(e.asKeybinding()));
				this._statusService.setStatusMessage(nls.localize('missing.chord', "The key combination ({0}, {1}) is not a command.", firstPartLabel, chordPartLabel), 10 * 1000 /* 10s */);
				e.preventDefault();
			}
		}
		if (this._currentChordStatusMessage) {
			this._currentChordStatusMessage.dispose();
			this._currentChordStatusMessage = null;
		}
		this._currentChord = 0;

		if (resolveResult && resolveResult.commandId) {
			if (!/^\^/.test(resolveResult.commandId)) {
				e.preventDefault();
			}
			let commandId = resolveResult.commandId.replace(/^\^/, '');
			this._commandService.executeCommand(commandId, {}).done(undefined, err => {
				this._messageService.show(Severity.Warning, err);
			});
		}
	}


}
