/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { ResolvedKeybinding, SimpleKeybinding, Keybinding } from 'vs/base/common/keyCodes';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { KeybindingResolver, IResolveResult } from 'vs/platform/keybinding/common/keybindingResolver';
import { IKeybindingEvent, IKeybindingService, IKeybindingItem2, KeybindingSource } from 'vs/platform/keybinding/common/keybinding';
import { IContextKeyService, IContextKeyServiceTarget } from 'vs/platform/contextkey/common/contextkey';
import { IStatusbarService } from 'vs/platform/statusbar/common/statusbar';
import { IMessageService } from 'vs/platform/message/common/message';
import Event, { Emitter } from 'vs/base/common/event';

interface CurrentChord {
	keypress: string;
	label: string;
}

export abstract class AbstractKeybindingService implements IKeybindingService {
	public _serviceBrand: any;

	protected toDispose: IDisposable[] = [];

	private _currentChord: CurrentChord;
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

		this._currentChord = null;
		this._currentChordStatusMessage = null;
		this._onDidUpdateKeybindings = new Emitter<IKeybindingEvent>();
		this.toDispose.push(this._onDidUpdateKeybindings);
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}

	protected abstract _getResolver(): KeybindingResolver;
	protected abstract _createResolvedKeybinding(kb: Keybinding): ResolvedKeybinding;

	get onDidUpdateKeybindings(): Event<IKeybindingEvent> {
		return this._onDidUpdateKeybindings ? this._onDidUpdateKeybindings.event : Event.None; // Sinon stubbing walks properties on prototype
	}

	public resolveKeybinding(keybinding: Keybinding): ResolvedKeybinding {
		return this._createResolvedKeybinding(keybinding);
	}

	public getDefaultKeybindings(): string {
		return '';
	}

	public getKeybindings(): IKeybindingItem2[] {
		return this._getResolver().getKeybindings().map(keybinding => ({
			keybinding: keybinding.resolvedKeybinding,
			command: keybinding.command,
			when: keybinding.when,
			source: keybinding.isDefault ? KeybindingSource.Default : KeybindingSource.User
		}));
	}

	public customKeybindingsCount(): number {
		return 0;
	}

	public lookupKeybindings(commandId: string): ResolvedKeybinding[] {
		return this._getResolver().lookupKeybindings(commandId).map(item => item.resolvedKeybinding);
	}

	public lookupKeybinding(commandId: string): ResolvedKeybinding {
		let result = this._getResolver().lookupPrimaryKeybinding(commandId);
		if (!result) {
			return null;
		}
		return result.resolvedKeybinding;
	}

	public resolve(keybinding: SimpleKeybinding, target: IContextKeyServiceTarget): IResolveResult {
		if (keybinding.isModifierKey()) {
			return null;
		}

		const contextValue = this._contextKeyService.getContextValue(target);
		const currentChord = this._currentChord ? this._currentChord.keypress : null;
		const keypress = keybinding.value.toString();
		return this._getResolver().resolve(contextValue, currentChord, keypress);
	}

	protected _dispatch(keybinding: SimpleKeybinding, target: IContextKeyServiceTarget): boolean {
		// Check modifier key here and cancel early, it's also checked in resolve as the function
		// is used externally.
		let shouldPreventDefault = false;
		if (keybinding.isModifierKey()) {
			return shouldPreventDefault;
		}

		const contextValue = this._contextKeyService.getContextValue(target);
		const currentChord = this._currentChord ? this._currentChord.keypress : null;
		const keypress = keybinding.value.toString();
		const keypressLabel = this._createResolvedKeybinding(keybinding).getLabel();
		const resolveResult = this._getResolver().resolve(contextValue, currentChord, keypress);

		if (resolveResult && resolveResult.enterChord) {
			shouldPreventDefault = true;
			this._currentChord = {
				keypress: keypress,
				label: keypressLabel
			};
			if (this._statusService) {
				this._currentChordStatusMessage = this._statusService.setStatusMessage(nls.localize('first.chord', "({0}) was pressed. Waiting for second key of chord...", keypressLabel));
			}
			return shouldPreventDefault;
		}

		if (this._statusService && this._currentChord) {
			if (!resolveResult || !resolveResult.commandId) {
				this._statusService.setStatusMessage(nls.localize('missing.chord', "The key combination ({0}, {1}) is not a command.", this._currentChord.label, keypressLabel), 10 * 1000 /* 10s */);
				shouldPreventDefault = true;
			}
		}
		if (this._currentChordStatusMessage) {
			this._currentChordStatusMessage.dispose();
			this._currentChordStatusMessage = null;
		}
		this._currentChord = null;

		if (resolveResult && resolveResult.commandId) {
			if (!resolveResult.bubble) {
				shouldPreventDefault = true;
			}
			this._commandService.executeCommand(resolveResult.commandId, resolveResult.commandArgs || {}).done(undefined, err => {
				this._messageService.show(Severity.Warning, err);
			});
		}

		return shouldPreventDefault;
	}
}
