/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { IHTMLContentElement } from 'vs/base/common/htmlContent';
import { Keybinding } from 'vs/base/common/keyCodes';
import { KeybindingLabels } from 'vs/base/common/keybinding';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import { isFalsyOrEmpty } from 'vs/base/common/arrays';
import { ICommandService, CommandsRegistry, ICommandHandlerDescription } from 'vs/platform/commands/common/commands';
import { KeybindingResolver, IResolveResult } from 'vs/platform/keybinding/common/keybindingResolver';
import { IKeybindingEvent, IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextKeyService, IContextKeyServiceTarget } from 'vs/platform/contextkey/common/contextkey';
import { IStatusbarService } from 'vs/platform/statusbar/common/statusbar';
import { IMessageService } from 'vs/platform/message/common/message';
import Event, { Emitter } from 'vs/base/common/event';

export abstract class AbstractKeybindingService implements IKeybindingService {
	public _serviceBrand: any;

	protected toDispose: IDisposable[] = [];

	private _currentChord: number;
	private _currentChordStatusMessage: IDisposable;
	protected _onDidUpdateKeybindings: Emitter<IKeybindingEvent>;

	private _contextKeyService: IContextKeyService;
	protected _commandService: ICommandService;
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

		this._currentChord = 0;
		this._currentChordStatusMessage = null;
		this._onDidUpdateKeybindings = new Emitter<IKeybindingEvent>();
		this.toDispose.push(this._onDidUpdateKeybindings);
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}

	protected abstract _getResolver(): KeybindingResolver;

	get onDidUpdateKeybindings(): Event<IKeybindingEvent> {
		return this._onDidUpdateKeybindings ? this._onDidUpdateKeybindings.event : Event.None; // Sinon stubbing walks properties on prototype
	}

	public getLabelFor(keybinding: Keybinding): string {
		return KeybindingLabels._toUSLabel(keybinding);
	}

	public getHTMLLabelFor(keybinding: Keybinding): IHTMLContentElement[] {
		return KeybindingLabels._toUSHTMLLabel(keybinding);
	}

	public getAriaLabelFor(keybinding: Keybinding): string {
		return KeybindingLabels._toUSAriaLabel(keybinding);
	}

	public getElectronAcceleratorFor(keybinding: Keybinding): string {
		return KeybindingLabels._toElectronAccelerator(keybinding);
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

	public resolve(keybinding: Keybinding, target: IContextKeyServiceTarget): IResolveResult {
		if (keybinding.isModifierKey()) {
			return null;
		}

		const contextValue = this._contextKeyService.getContextValue(target);
		return this._getResolver().resolve(contextValue, this._currentChord, keybinding.value);
	}

	protected _dispatch(keybinding: Keybinding, target: IContextKeyServiceTarget): boolean {
		// Check modifier key here and cancel early, it's also checked in resolve as the function
		// is used externally.
		let shouldPreventDefault = false;
		if (keybinding.isModifierKey()) {
			return shouldPreventDefault;
		}

		const resolveResult = this.resolve(keybinding, target);

		if (resolveResult && resolveResult.enterChord) {
			shouldPreventDefault = true;
			this._currentChord = resolveResult.enterChord;
			if (this._statusService) {
				let firstPartLabel = this.getLabelFor(new Keybinding(this._currentChord));
				this._currentChordStatusMessage = this._statusService.setStatusMessage(nls.localize('first.chord', "({0}) was pressed. Waiting for second key of chord...", firstPartLabel));
			}
			return shouldPreventDefault;
		}

		if (this._statusService && this._currentChord) {
			if (!resolveResult || !resolveResult.commandId) {
				let firstPartLabel = this.getLabelFor(new Keybinding(this._currentChord));
				let chordPartLabel = this.getLabelFor(keybinding);
				this._statusService.setStatusMessage(nls.localize('missing.chord', "The key combination ({0}, {1}) is not a command.", firstPartLabel, chordPartLabel), 10 * 1000 /* 10s */);
				shouldPreventDefault = true;
			}
		}
		if (this._currentChordStatusMessage) {
			this._currentChordStatusMessage.dispose();
			this._currentChordStatusMessage = null;
		}
		this._currentChord = 0;

		if (resolveResult && resolveResult.commandId) {
			if (!/^\^/.test(resolveResult.commandId)) {
				shouldPreventDefault = true;
			}
			let commandId = resolveResult.commandId.replace(/^\^/, '');
			this._commandService.executeCommand(commandId, resolveResult.commandArgs || {}).done(undefined, err => {
				this._messageService.show(Severity.Warning, err);
			});
		}

		return shouldPreventDefault;
	}
}
