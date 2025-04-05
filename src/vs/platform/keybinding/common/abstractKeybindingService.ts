/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from '../../../base/common/actions.js';
import * as arrays from '../../../base/common/arrays.js';
import { IntervalTimer, TimeoutTimer } from '../../../base/common/async.js';
import { illegalState } from '../../../base/common/errors.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { IME } from '../../../base/common/ime.js';
import { KeyCode } from '../../../base/common/keyCodes.js';
import { Keybinding, ResolvedChord, ResolvedKeybinding, SingleModifierChord } from '../../../base/common/keybindings.js';
import { Disposable, IDisposable } from '../../../base/common/lifecycle.js';
import * as nls from '../../../nls.js';

import { ICommandService } from '../../commands/common/commands.js';
import { IContextKeyService, IContextKeyServiceTarget } from '../../contextkey/common/contextkey.js';
import { IKeybindingService, IKeyboardEvent, KeybindingsSchemaContribution } from './keybinding.js';
import { ResolutionResult, KeybindingResolver, ResultKind, NoMatchingKb } from './keybindingResolver.js';
import { ResolvedKeybindingItem } from './resolvedKeybindingItem.js';
import { ILogService } from '../../log/common/log.js';
import { INotificationService } from '../../notification/common/notification.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';

interface CurrentChord {
	keypress: string;
	label: string | null;
}

const HIGH_FREQ_COMMANDS = /^(cursor|delete|undo|redo|tab|editor\.action\.clipboard)/;

export abstract class AbstractKeybindingService extends Disposable implements IKeybindingService {

	public _serviceBrand: undefined;

	protected readonly _onDidUpdateKeybindings: Emitter<void> = this._register(new Emitter<void>());
	get onDidUpdateKeybindings(): Event<void> {
		return this._onDidUpdateKeybindings ? this._onDidUpdateKeybindings.event : Event.None; // Sinon stubbing walks properties on prototype
	}

	/** recently recorded keypresses that can trigger a keybinding;
	 *
	 * example: say, there's "cmd+k cmd+i" keybinding;
	 * the user pressed "cmd+k" (before they press "cmd+i")
	 * "cmd+k" would be stored in this array, when on pressing "cmd+i", the service
	 * would invoke the command bound by the keybinding
	 */
	private _currentChords: CurrentChord[];

	private _currentChordChecker: IntervalTimer;
	private _currentChordStatusMessage: IDisposable | null;
	private _ignoreSingleModifiers: KeybindingModifierSet;
	private _currentSingleModifier: SingleModifierChord | null;
	private _currentSingleModifierClearTimeout: TimeoutTimer;
	protected _currentlyDispatchingCommandId: string | null;

	protected _logging: boolean;

	public get inChordMode(): boolean {
		return this._currentChords.length > 0;
	}

	constructor(
		private _contextKeyService: IContextKeyService,
		protected _commandService: ICommandService,
		protected _telemetryService: ITelemetryService,
		private _notificationService: INotificationService,
		protected _logService: ILogService,
	) {
		super();

		this._currentChords = [];
		this._currentChordChecker = new IntervalTimer();
		this._currentChordStatusMessage = null;
		this._ignoreSingleModifiers = KeybindingModifierSet.EMPTY;
		this._currentSingleModifier = null;
		this._currentSingleModifierClearTimeout = new TimeoutTimer();
		this._currentlyDispatchingCommandId = null;
		this._logging = false;
	}

	public override dispose(): void {
		super.dispose();
	}

	protected abstract _getResolver(): KeybindingResolver;
	protected abstract _documentHasFocus(): boolean;
	public abstract resolveKeybinding(keybinding: Keybinding): ResolvedKeybinding[];
	public abstract resolveKeyboardEvent(keyboardEvent: IKeyboardEvent): ResolvedKeybinding;
	public abstract resolveUserBinding(userBinding: string): ResolvedKeybinding[];
	public abstract registerSchemaContribution(contribution: KeybindingsSchemaContribution): void;
	public abstract _dumpDebugInfo(): string;
	public abstract _dumpDebugInfoJSON(): string;

	public getDefaultKeybindingsContent(): string {
		return '';
	}

	public toggleLogging(): boolean {
		this._logging = !this._logging;
		return this._logging;
	}

	protected _log(str: string): void {
		if (this._logging) {
			this._logService.info(`[KeybindingService]: ${str}`);
		}
	}

	public getDefaultKeybindings(): readonly ResolvedKeybindingItem[] {
		return this._getResolver().getDefaultKeybindings();
	}

	public getKeybindings(): readonly ResolvedKeybindingItem[] {
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

	public lookupKeybinding(commandId: string, context?: IContextKeyService, enforceContextCheck = false): ResolvedKeybinding | undefined {
		const result = this._getResolver().lookupPrimaryKeybinding(commandId, context || this._contextKeyService, enforceContextCheck);
		if (!result) {
			return undefined;
		}
		return result.resolvedKeybinding;
	}

	public dispatchEvent(e: IKeyboardEvent, target: IContextKeyServiceTarget): boolean {
		return this._dispatch(e, target);
	}

	// TODO@ulugbekna: update namings to align with `_doDispatch`
	// TODO@ulugbekna: this fn doesn't seem to take into account single-modifier keybindings, eg `shift shift`
	public softDispatch(e: IKeyboardEvent, target: IContextKeyServiceTarget): ResolutionResult {
		this._log(`/ Soft dispatching keyboard event`);
		const keybinding = this.resolveKeyboardEvent(e);
		if (keybinding.hasMultipleChords()) {
			console.warn('keyboard event should not be mapped to multiple chords');
			return NoMatchingKb;
		}
		const [firstChord,] = keybinding.getDispatchChords();
		if (firstChord === null) {
			// cannot be dispatched, probably only modifier keys
			this._log(`\\ Keyboard event cannot be dispatched`);
			return NoMatchingKb;
		}

		const contextValue = this._contextKeyService.getContext(target);
		const currentChords = this._currentChords.map((({ keypress }) => keypress));
		return this._getResolver().resolve(contextValue, currentChords, firstChord);
	}

	private _scheduleLeaveChordMode(): void {
		const chordLastInteractedTime = Date.now();
		this._currentChordChecker.cancelAndSet(() => {

			if (!this._documentHasFocus()) {
				// Focus has been lost => leave chord mode
				this._leaveChordMode();
				return;
			}

			if (Date.now() - chordLastInteractedTime > 5000) {
				// 5 seconds elapsed => leave chord mode
				this._leaveChordMode();
			}

		}, 500);
	}

	private _expectAnotherChord(firstChord: string, keypressLabel: string | null): void {

		this._currentChords.push({ keypress: firstChord, label: keypressLabel });

		switch (this._currentChords.length) {
			case 0:
				throw illegalState('impossible');
			case 1:
				// TODO@ulugbekna: revise this message and the one below (at least, fix terminology)
				this._currentChordStatusMessage = this._notificationService.status(nls.localize('first.chord', "({0}) was pressed. Waiting for second key of chord...", keypressLabel));
				break;
			default: {
				const fullKeypressLabel = this._currentChords.map(({ label }) => label).join(', ');
				this._currentChordStatusMessage = this._notificationService.status(nls.localize('next.chord', "({0}) was pressed. Waiting for next key of chord...", fullKeypressLabel));
			}
		}

		this._scheduleLeaveChordMode();

		if (IME.enabled) {
			IME.disable();
		}
	}

	private _leaveChordMode(): void {
		if (this._currentChordStatusMessage) {
			this._currentChordStatusMessage.dispose();
			this._currentChordStatusMessage = null;
		}
		this._currentChordChecker.cancel();
		this._currentChords = [];
		IME.enable();
	}

	public dispatchByUserSettingsLabel(userSettingsLabel: string, target: IContextKeyServiceTarget): void {
		this._log(`/ Dispatching keybinding triggered via menu entry accelerator - ${userSettingsLabel}`);
		const keybindings = this.resolveUserBinding(userSettingsLabel);
		if (keybindings.length === 0) {
			this._log(`\\ Could not resolve - ${userSettingsLabel}`);
		} else {
			this._doDispatch(keybindings[0], target, /*isSingleModiferChord*/false);
		}
	}

	protected _dispatch(e: IKeyboardEvent, target: IContextKeyServiceTarget): boolean {
		return this._doDispatch(this.resolveKeyboardEvent(e), target, /*isSingleModiferChord*/false);
	}

	protected _singleModifierDispatch(e: IKeyboardEvent, target: IContextKeyServiceTarget): boolean {
		const keybinding = this.resolveKeyboardEvent(e);
		const [singleModifier,] = keybinding.getSingleModifierDispatchChords();

		if (singleModifier) {

			if (this._ignoreSingleModifiers.has(singleModifier)) {
				this._log(`+ Ignoring single modifier ${singleModifier} due to it being pressed together with other keys.`);
				this._ignoreSingleModifiers = KeybindingModifierSet.EMPTY;
				this._currentSingleModifierClearTimeout.cancel();
				this._currentSingleModifier = null;
				return false;
			}

			this._ignoreSingleModifiers = KeybindingModifierSet.EMPTY;

			if (this._currentSingleModifier === null) {
				// we have a valid `singleModifier`, store it for the next keyup, but clear it in 300ms
				this._log(`+ Storing single modifier for possible chord ${singleModifier}.`);
				this._currentSingleModifier = singleModifier;
				this._currentSingleModifierClearTimeout.cancelAndSet(() => {
					this._log(`+ Clearing single modifier due to 300ms elapsed.`);
					this._currentSingleModifier = null;
				}, 300);
				return false;
			}

			if (singleModifier === this._currentSingleModifier) {
				// bingo!
				this._log(`/ Dispatching single modifier chord ${singleModifier} ${singleModifier}`);
				this._currentSingleModifierClearTimeout.cancel();
				this._currentSingleModifier = null;
				return this._doDispatch(keybinding, target, /*isSingleModiferChord*/true);
			}

			this._log(`+ Clearing single modifier due to modifier mismatch: ${this._currentSingleModifier} ${singleModifier}`);
			this._currentSingleModifierClearTimeout.cancel();
			this._currentSingleModifier = null;
			return false;
		}

		// When pressing a modifier and holding it pressed with any other modifier or key combination,
		// the pressed modifiers should no longer be considered for single modifier dispatch.
		const [firstChord,] = keybinding.getChords();
		this._ignoreSingleModifiers = new KeybindingModifierSet(firstChord);

		if (this._currentSingleModifier !== null) {
			this._log(`+ Clearing single modifier due to other key up.`);
		}
		this._currentSingleModifierClearTimeout.cancel();
		this._currentSingleModifier = null;
		return false;
	}

	private _doDispatch(userKeypress: ResolvedKeybinding, target: IContextKeyServiceTarget, isSingleModiferChord = false): boolean {
		let shouldPreventDefault = false;

		if (userKeypress.hasMultipleChords()) { // warn - because user can press a single chord at a time
			console.warn('Unexpected keyboard event mapped to multiple chords');
			return false;
		}

		let userPressedChord: string | null = null;
		let currentChords: string[] | null = null;

		if (isSingleModiferChord) {
			// The keybinding is the second keypress of a single modifier chord, e.g. "shift shift".
			// A single modifier can only occur when the same modifier is pressed in short sequence,
			// hence we disregard `_currentChord` and use the same modifier instead.
			const [dispatchKeyname,] = userKeypress.getSingleModifierDispatchChords();
			userPressedChord = dispatchKeyname;
			currentChords = dispatchKeyname ? [dispatchKeyname] : []; // TODO@ulugbekna: in the `else` case we assign an empty array - make sure `resolve` can handle an empty array well
		} else {
			[userPressedChord,] = userKeypress.getDispatchChords();
			currentChords = this._currentChords.map(({ keypress }) => keypress);
		}

		if (userPressedChord === null) {
			this._log(`\\ Keyboard event cannot be dispatched in keydown phase.`);
			// cannot be dispatched, probably only modifier keys
			return shouldPreventDefault;
		}

		const contextValue = this._contextKeyService.getContext(target);
		const keypressLabel = userKeypress.getLabel();

		const resolveResult = this._getResolver().resolve(contextValue, currentChords, userPressedChord);

		switch (resolveResult.kind) {

			case ResultKind.NoMatchingKb: {

				this._logService.trace('KeybindingService#dispatch', keypressLabel, `[ No matching keybinding ]`);

				if (this.inChordMode) {
					const currentChordsLabel = this._currentChords.map(({ label }) => label).join(', ');
					this._log(`+ Leaving multi-chord mode: Nothing bound to "${currentChordsLabel}, ${keypressLabel}".`);
					this._notificationService.status(nls.localize('missing.chord', "The key combination ({0}, {1}) is not a command.", currentChordsLabel, keypressLabel), { hideAfter: 10 * 1000 /* 10s */ });
					this._leaveChordMode();

					shouldPreventDefault = true;
				}
				return shouldPreventDefault;
			}

			case ResultKind.MoreChordsNeeded: {

				this._logService.trace('KeybindingService#dispatch', keypressLabel, `[ Several keybindings match - more chords needed ]`);

				shouldPreventDefault = true;
				this._expectAnotherChord(userPressedChord, keypressLabel);
				this._log(this._currentChords.length === 1 ? `+ Entering multi-chord mode...` : `+ Continuing multi-chord mode...`);
				return shouldPreventDefault;
			}

			case ResultKind.KbFound: {

				this._logService.trace('KeybindingService#dispatch', keypressLabel, `[ Will dispatch command ${resolveResult.commandId} ]`);

				if (resolveResult.commandId === null || resolveResult.commandId === '') {

					if (this.inChordMode) {
						const currentChordsLabel = this._currentChords.map(({ label }) => label).join(', ');
						this._log(`+ Leaving chord mode: Nothing bound to "${currentChordsLabel}, ${keypressLabel}".`);
						this._notificationService.status(nls.localize('missing.chord', "The key combination ({0}, {1}) is not a command.", currentChordsLabel, keypressLabel), { hideAfter: 10 * 1000 /* 10s */ });
						this._leaveChordMode();
						shouldPreventDefault = true;
					}

				} else {
					if (this.inChordMode) {
						this._leaveChordMode();
					}

					if (!resolveResult.isBubble) {
						shouldPreventDefault = true;
					}

					this._log(`+ Invoking command ${resolveResult.commandId}.`);
					this._currentlyDispatchingCommandId = resolveResult.commandId;
					try {
						if (typeof resolveResult.commandArgs === 'undefined') {
							this._commandService.executeCommand(resolveResult.commandId).then(undefined, err => this._notificationService.warn(err));
						} else {
							this._commandService.executeCommand(resolveResult.commandId, resolveResult.commandArgs).then(undefined, err => this._notificationService.warn(err));
						}
					} finally {
						this._currentlyDispatchingCommandId = null;
					}

					if (!HIGH_FREQ_COMMANDS.test(resolveResult.commandId)) {
						this._telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: resolveResult.commandId, from: 'keybinding', detail: userKeypress.getUserSettingsLabel() ?? undefined });
					}
				}

				return shouldPreventDefault;
			}
		}
	}

	abstract enableKeybindingHoldMode(commandId: string): Promise<void> | undefined;

	mightProducePrintableCharacter(event: IKeyboardEvent): boolean {
		if (event.ctrlKey || event.metaKey) {
			// ignore ctrl/cmd-combination but not shift/alt-combinatios
			return false;
		}
		// weak check for certain ranges. this is properly implemented in a subclass
		// with access to the KeyboardMapperFactory.
		if ((event.keyCode >= KeyCode.KeyA && event.keyCode <= KeyCode.KeyZ)
			|| (event.keyCode >= KeyCode.Digit0 && event.keyCode <= KeyCode.Digit9)) {
			return true;
		}
		return false;
	}
}

class KeybindingModifierSet {

	public static EMPTY = new KeybindingModifierSet(null);

	private readonly _ctrlKey: boolean;
	private readonly _shiftKey: boolean;
	private readonly _altKey: boolean;
	private readonly _metaKey: boolean;

	constructor(source: ResolvedChord | null) {
		this._ctrlKey = source ? source.ctrlKey : false;
		this._shiftKey = source ? source.shiftKey : false;
		this._altKey = source ? source.altKey : false;
		this._metaKey = source ? source.metaKey : false;
	}

	has(modifier: SingleModifierChord) {
		switch (modifier) {
			case 'ctrl': return this._ctrlKey;
			case 'shift': return this._shiftKey;
			case 'alt': return this._altKey;
			case 'meta': return this._metaKey;
		}
	}
}
