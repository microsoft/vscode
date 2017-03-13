/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { IHTMLContentElement } from 'vs/base/common/htmlContent';
import { ResolvedKeybinding, SimpleKeybinding, Keybinding, KeyCode, KeyCodeUtils } from 'vs/base/common/keyCodes';
import { PrintableKeypress, UILabelProvider, AriaLabelProvider, ElectronAcceleratorLabelProvider } from 'vs/platform/keybinding/common/keybindingLabels';
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
import { KeybindingIO, OutputBuilder } from 'vs/platform/keybinding/common/keybindingIO';
import { NormalizedKeybindingItem } from 'vs/platform/keybinding/common/normalizedKeybindingItem';
import { OS, OperatingSystem } from 'vs/base/common/platform';

/**
 * Do not instantiate. Use KeybindingService to get a ResolvedKeybinding.
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
		const [firstPart, chordPart] = PrintableKeypress.fromKeybinding2(this._actual, USLayoutResolvedKeybinding._usKeyCodeToUILabel, this._os);
		return UILabelProvider.toLabel2(firstPart, chordPart, this._os);
	}

	public getAriaLabel(): string {
		const [firstPart, chordPart] = PrintableKeypress.fromKeybinding2(this._actual, USLayoutResolvedKeybinding._usKeyCodeToAriaLabel, this._os);
		return AriaLabelProvider.toLabel2(firstPart, chordPart, this._os);
	}

	public getHTMLLabel(): IHTMLContentElement[] {
		const [firstPart, chordPart] = PrintableKeypress.fromKeybinding2(this._actual, USLayoutResolvedKeybinding._usKeyCodeToUILabel, this._os);
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

		const [firstPart, chordPart] = PrintableKeypress.fromKeybinding2(this._actual, USLayoutResolvedKeybinding._usKeyCodeToElectronAccelerator, this._os);
		return ElectronAcceleratorLabelProvider.toLabel2(firstPart, chordPart, this._os);
	}

	public getUserSettingsLabel(): string {
		return KeybindingIO.writeKeybinding(this._actual, this._os);
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
		const resolver = this._getResolver();
		const defaultKeybindings = resolver.getDefaultKeybindings();
		const boundCommands = resolver.getDefaultBoundCommands();
		return (
			AbstractKeybindingService._getDefaultKeybindings(defaultKeybindings)
			+ '\n\n'
			+ AbstractKeybindingService._getAllCommandsAsComment(boundCommands)
		);
	}

	private static _getDefaultKeybindings(defaultKeybindings: NormalizedKeybindingItem[]): string {
		let out = new OutputBuilder();
		out.writeLine('[');

		let lastIndex = defaultKeybindings.length - 1;
		defaultKeybindings.forEach((k, index) => {
			KeybindingIO.writeKeybindingItem(out, k, OS);
			if (index !== lastIndex) {
				out.writeLine(',');
			} else {
				out.writeLine();
			}
		});
		out.writeLine(']');
		return out.toString();
	}

	private static _getAllCommandsAsComment(boundCommands: Map<string, boolean>): string {
		const commands = CommandsRegistry.getCommands();
		const unboundCommands: string[] = [];

		for (let id in commands) {
			if (id[0] === '_' || id.indexOf('vscode.') === 0) { // private command
				continue;
			}
			if (typeof commands[id].description === 'object'
				&& !isFalsyOrEmpty((<ICommandHandlerDescription>commands[id].description).args)) { // command with args
				continue;
			}
			if (boundCommands.get(id) === true) {
				continue;
			}
			unboundCommands.push(id);
		}

		let pretty = unboundCommands.sort().join('\n// - ');

		return '// ' + nls.localize('unboundCommands', "Here are other available commands: ") + '\n// - ' + pretty;
	}

	public customKeybindingsCount(): number {
		return 0;
	}

	public lookupKeybindings(commandId: string): Keybinding[] {
		return this._getResolver().lookupKeybindings(commandId).map(item => item.keybinding);
	}

	public lookupKeybinding(commandId: string): ResolvedKeybinding {
		let result = this._getResolver().lookupPrimaryKeybinding(commandId);
		if (!result) {
			return null;
		}
		return this._createResolvedKeybinding(result.keybinding);
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
