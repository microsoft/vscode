/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { IHTMLContentElement } from 'vs/base/common/htmlContent';
import { ResolvedKeybinding, SimpleKeybinding, Keybinding, KeyCode, KeyCodeUtils, USER_SETTINGS } from 'vs/base/common/keyCodes';
import { PrintableKeypress, UILabelProvider, AriaLabelProvider, ElectronAcceleratorLabelProvider, UserSettingsLabelProvider } from 'vs/platform/keybinding/common/keybindingLabels';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { KeybindingResolver, IResolveResult } from 'vs/platform/keybinding/common/keybindingResolver';
import { IKeybindingEvent, IKeybindingService, IKeybindingItem2, KeybindingSource } from 'vs/platform/keybinding/common/keybinding';
import { IContextKeyService, IContextKeyServiceTarget } from 'vs/platform/contextkey/common/contextkey';
import { IStatusbarService } from 'vs/platform/statusbar/common/statusbar';
import { IMessageService } from 'vs/platform/message/common/message';
import Event, { Emitter } from 'vs/base/common/event';
import { OperatingSystem } from 'vs/base/common/platform';

/**
 * Do not instantiate. Use KeybindingService to get a ResolvedKeybinding seeded with information about the current kb layout.
 */
export class USLayoutResolvedKeybinding extends ResolvedKeybinding {

	private readonly _actual: Keybinding;
	private readonly _os: OperatingSystem;

	constructor(actual: Keybinding, os: OperatingSystem) {
		super();
		this._actual = actual;
		this._os = os;
	}

	private static _usKeyCodeToUILabel(keyCode: KeyCode, OS: OperatingSystem): string {
		if (OS === OperatingSystem.Macintosh) {
			switch (keyCode) {
				case KeyCode.LeftArrow:
					return '←';
				case KeyCode.UpArrow:
					return '↑';
				case KeyCode.RightArrow:
					return '→';
				case KeyCode.DownArrow:
					return '↓';
			}
		}
		return KeyCodeUtils.toString(keyCode);
	}

	private static _usKeyCodeToAriaLabel(keyCode: KeyCode, OS: OperatingSystem): string {
		return KeyCodeUtils.toString(keyCode);
	}

	public getLabel(): string {
		const [firstPart, chordPart] = PrintableKeypress.fromKeybinding(this._actual, USLayoutResolvedKeybinding._usKeyCodeToUILabel, this._os);
		return UILabelProvider.toLabel2(firstPart, chordPart, this._os);
	}

	public getAriaLabel(): string {
		const [firstPart, chordPart] = PrintableKeypress.fromKeybinding(this._actual, USLayoutResolvedKeybinding._usKeyCodeToAriaLabel, this._os);
		return AriaLabelProvider.toLabel2(firstPart, chordPart, this._os);
	}

	public getHTMLLabel(): IHTMLContentElement[] {
		const [firstPart, chordPart] = PrintableKeypress.fromKeybinding(this._actual, USLayoutResolvedKeybinding._usKeyCodeToUILabel, this._os);
		return UILabelProvider.toHTMLLabel2(firstPart, chordPart, this._os);
	}

	private static _usKeyCodeToElectronAccelerator(keyCode: KeyCode, OS: OperatingSystem): string {
		switch (keyCode) {
			case KeyCode.UpArrow:
				return 'Up';
			case KeyCode.DownArrow:
				return 'Down';
			case KeyCode.LeftArrow:
				return 'Left';
			case KeyCode.RightArrow:
				return 'Right';
		}

		return KeyCodeUtils.toString(keyCode);
	}

	public getElectronAccelerator(): string {
		if (this._actual.isChord()) {
			// Electron cannot handle chords
			return null;
		}

		let keyCode = this._actual.getKeyCode();
		if (keyCode >= KeyCode.NUMPAD_0 && keyCode <= KeyCode.NUMPAD_DIVIDE) {
			// Electron cannot handle numpad keys
			return null;
		}

		const [firstPart, chordPart] = PrintableKeypress.fromKeybinding(this._actual, USLayoutResolvedKeybinding._usKeyCodeToElectronAccelerator, this._os);
		return ElectronAcceleratorLabelProvider.toLabel2(firstPart, chordPart, this._os);
	}

	private static _usKeyCodeToUserSettings(keyCode: KeyCode, OS: OperatingSystem): string {
		return USER_SETTINGS.fromKeyCode(keyCode);
	}

	public getUserSettingsLabel(): string {
		const [firstPart, chordPart] = PrintableKeypress.fromKeybinding(this._actual, USLayoutResolvedKeybinding._usKeyCodeToUserSettings, this._os);

		let result = UserSettingsLabelProvider.toLabel2(firstPart, chordPart, this._os);
		return result.toLowerCase();
	}

	public isChord(): boolean {
		return this._actual.isChord();
	}

	public hasCtrlModifier(): boolean {
		if (this._actual.isChord()) {
			return false;
		}
		if (this._os === OperatingSystem.Macintosh) {
			return this._actual.hasWinCtrl();
		} else {
			return this._actual.hasCtrlCmd();
		}
	}

	public hasShiftModifier(): boolean {
		if (this._actual.isChord()) {
			return false;
		}
		return this._actual.hasShift();
	}

	public hasAltModifier(): boolean {
		if (this._actual.isChord()) {
			return false;
		}
		return this._actual.hasAlt();
	}

	public hasMetaModifier(): boolean {
		if (this._actual.isChord()) {
			return false;
		}
		if (this._os === OperatingSystem.Macintosh) {
			return this._actual.hasCtrlCmd();
		} else {
			return this._actual.hasWinCtrl();
		}
	}

	public getDispatchParts(): [string, string] {
		let keypressFirstPart: string;
		let keypressChordPart: string;
		if (this._actual === null) {
			keypressFirstPart = null;
			keypressChordPart = null;
		} else if (this._actual.isChord()) {
			keypressFirstPart = this._actual.extractFirstPart().value.toString();
			keypressChordPart = this._actual.extractChordPart().value.toString();
		} else {
			keypressFirstPart = this._actual.value.toString();
			keypressChordPart = null;
		}
		return [keypressFirstPart, keypressChordPart];
	}
}

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
