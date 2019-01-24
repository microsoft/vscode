/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as arrays from 'vs/base/common/arrays';
import { IntervalTimer } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { KeyCode, Keybinding, ResolvedKeybinding } from 'vs/base/common/keyCodes';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IContextKeyService, IContextKeyServiceTarget } from 'vs/platform/contextkey/common/contextkey';
import { IKeybindingEvent, IKeybindingService, IKeyboardEvent } from 'vs/platform/keybinding/common/keybinding';
import { IResolveResult, KeybindingResolver } from 'vs/platform/keybinding/common/keybindingResolver';
import { ResolvedKeybindingItem } from 'vs/platform/keybinding/common/resolvedKeybindingItem';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IStatusbarService } from 'vs/platform/statusbar/common/statusbar';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

interface CurrentChord {
	keypress: string;
	label: string | null;
}

export abstract class AbstractKeybindingService extends Disposable implements IKeybindingService {
	public _serviceBrand: any;

	private _currentChord: CurrentChord | null;
	private _currentChordChecker: IntervalTimer;
	private _currentChordStatusMessage: IDisposable | null;
	protected _onDidUpdateKeybindings: Emitter<IKeybindingEvent>;

	private _contextKeyService: IContextKeyService;
	private _statusService: IStatusbarService | undefined;
	private _notificationService: INotificationService;
	protected _commandService: ICommandService;
	protected _telemetryService: ITelemetryService;

	constructor(
		contextKeyService: IContextKeyService,
		commandService: ICommandService,
		telemetryService: ITelemetryService,
		notificationService: INotificationService,
		statusService?: IStatusbarService
	) {
		super();
		this._contextKeyService = contextKeyService;
		this._commandService = commandService;
		this._telemetryService = telemetryService;
		this._statusService = statusService;
		this._notificationService = notificationService;

		this._currentChord = null;
		this._currentChordChecker = new IntervalTimer();
		this._currentChordStatusMessage = null;
		this._onDidUpdateKeybindings = this._register(new Emitter<IKeybindingEvent>());
	}

	public dispose(): void {
		super.dispose();
	}

	get onDidUpdateKeybindings(): Event<IKeybindingEvent> {
		return this._onDidUpdateKeybindings ? this._onDidUpdateKeybindings.event : Event.None; // Sinon stubbing walks properties on prototype
	}

	protected abstract _getResolver(): KeybindingResolver;
	protected abstract _documentHasFocus(): boolean;
	public abstract resolveKeybinding(keybinding: Keybinding): ResolvedKeybinding[];
	public abstract resolveKeyboardEvent(keyboardEvent: IKeyboardEvent): ResolvedKeybinding;
	public abstract resolveUserBinding(userBinding: string): ResolvedKeybinding[];

	public getDefaultKeybindingsContent(): string {
		return '';
	}

	public getDefaultKeybindings(): ResolvedKeybindingItem[] {
		return this._getResolver().getDefaultKeybindings();
	}

	public getKeybindings(): ResolvedKeybindingItem[] {
		return this._getResolver().getKeybindings();
	}

	public customKeybindingsCount(): number {
		return 0;
	}

	public lookupKeybindings(commandId: string): ResolvedKeybinding[] {
		return arrays.coalesce(
			this._getResolver().lookupKeybindings(commandId).map(item => item.resolvedKeybinding)
		);
	}

	public lookupKeybinding(commandId: string): ResolvedKeybinding | undefined {
		let result = this._getResolver().lookupPrimaryKeybinding(commandId);
		if (!result) {
			return undefined;
		}
		return result.resolvedKeybinding || undefined;
	}

	public dispatchEvent(e: IKeyboardEvent, target: IContextKeyServiceTarget): boolean {
		return this._dispatch(e, target);
	}

	public softDispatch(e: IKeyboardEvent, target: IContextKeyServiceTarget): IResolveResult | null {
		const keybinding = this.resolveKeyboardEvent(e);
		if (keybinding.isChord()) {
			console.warn('Unexpected keyboard event mapped to a chord');
			return null;
		}
		const [firstPart,] = keybinding.getDispatchParts();
		if (firstPart === null) {
			// cannot be dispatched, probably only modifier keys
			return null;
		}

		const contextValue = this._contextKeyService.getContext(target);
		const currentChord = this._currentChord ? this._currentChord.keypress : null;
		return this._getResolver().resolve(contextValue, currentChord, firstPart);
	}

	private _enterChordMode(firstPart: string, keypressLabel: string | null): void {
		this._currentChord = {
			keypress: firstPart,
			label: keypressLabel
		};
		if (this._statusService) {
			this._currentChordStatusMessage = this._statusService.setStatusMessage(nls.localize('first.chord', "({0}) was pressed. Waiting for second key of chord...", keypressLabel));
		}
		const chordEnterTime = Date.now();
		this._currentChordChecker.cancelAndSet(() => {

			if (!this._documentHasFocus()) {
				// Focus has been lost => leave chord mode
				this._leaveChordMode();
				return;
			}

			if (Date.now() - chordEnterTime > 5000) {
				// 5 seconds elapsed => leave chord mode
				this._leaveChordMode();
			}

		}, 500);
	}

	private _leaveChordMode(): void {
		if (this._currentChordStatusMessage) {
			this._currentChordStatusMessage.dispose();
			this._currentChordStatusMessage = null;
		}
		this._currentChordChecker.cancel();
		this._currentChord = null;
	}

	public dispatchByUserSettingsLabel(userSettingsLabel: string, target: IContextKeyServiceTarget): void {
		const keybindings = this.resolveUserBinding(userSettingsLabel);
		if (keybindings.length >= 1) {
			this._doDispatch(keybindings[0], target);
		}
	}

	protected _dispatch(e: IKeyboardEvent, target: IContextKeyServiceTarget): boolean {
		return this._doDispatch(this.resolveKeyboardEvent(e), target);
	}

	private _doDispatch(keybinding: ResolvedKeybinding, target: IContextKeyServiceTarget): boolean {
		let shouldPreventDefault = false;

		if (keybinding.isChord()) {
			console.warn('Unexpected keyboard event mapped to a chord');
			return false;
		}
		const [firstPart,] = keybinding.getDispatchParts();
		if (firstPart === null) {
			// cannot be dispatched, probably only modifier keys
			return shouldPreventDefault;
		}

		const contextValue = this._contextKeyService.getContext(target);
		const currentChord = this._currentChord ? this._currentChord.keypress : null;
		const keypressLabel = keybinding.getLabel();
		const resolveResult = this._getResolver().resolve(contextValue, currentChord, firstPart);

		if (resolveResult && resolveResult.enterChord) {
			shouldPreventDefault = true;
			this._enterChordMode(firstPart, keypressLabel);
			return shouldPreventDefault;
		}

		if (this._statusService && this._currentChord) {
			if (!resolveResult || !resolveResult.commandId) {
				this._statusService.setStatusMessage(nls.localize('missing.chord', "The key combination ({0}, {1}) is not a command.", this._currentChord.label, keypressLabel), 10 * 1000 /* 10s */);
				shouldPreventDefault = true;
			}
		}

		this._leaveChordMode();

		if (resolveResult && resolveResult.commandId) {
			if (!resolveResult.bubble) {
				shouldPreventDefault = true;
			}
			if (typeof resolveResult.commandArgs === 'undefined') {
				this._commandService.executeCommand(resolveResult.commandId).then(undefined, err => this._notificationService.warn(err));
			} else {
				this._commandService.executeCommand(resolveResult.commandId, resolveResult.commandArgs).then(undefined, err => this._notificationService.warn(err));
			}
			/* __GDPR__
				"workbenchActionExecuted" : {
					"id" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
					"from": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
				}
			*/
			this._telemetryService.publicLog('workbenchActionExecuted', { id: resolveResult.commandId, from: 'keybinding' });
		}

		return shouldPreventDefault;
	}

	mightProducePrintableCharacter(event: IKeyboardEvent): boolean {
		if (event.ctrlKey || event.metaKey) {
			// ignore ctrl/cmd-combination but not shift/alt-combinatios
			return false;
		}
		// weak check for certain ranges. this is properly implemented in a subclass
		// with access to the KeyboardMapperFactory.
		if ((event.keyCode >= KeyCode.KEY_A && event.keyCode <= KeyCode.KEY_Z)
			|| (event.keyCode >= KeyCode.KEY_0 && event.keyCode <= KeyCode.KEY_9)) {
			return true;
		}
		return false;
	}
}
