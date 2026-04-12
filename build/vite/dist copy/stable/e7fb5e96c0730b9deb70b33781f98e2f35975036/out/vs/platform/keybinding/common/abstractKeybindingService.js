/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as arrays from '../../../base/common/arrays.js';
import { IntervalTimer, TimeoutTimer } from '../../../base/common/async.js';
import { illegalState } from '../../../base/common/errors.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { IME } from '../../../base/common/ime.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import * as nls from '../../../nls.js';
import { NoMatchingKb } from './keybindingResolver.js';
const HIGH_FREQ_COMMANDS = /^(cursor|delete|undo|redo|tab|editor\.action\.clipboard)/;
export class AbstractKeybindingService extends Disposable {
    get onDidUpdateKeybindings() {
        return this._onDidUpdateKeybindings ? this._onDidUpdateKeybindings.event : Event.None; // Sinon stubbing walks properties on prototype
    }
    get inChordMode() {
        return this._currentChords.length > 0;
    }
    constructor(_contextKeyService, _commandService, _telemetryService, _notificationService, _logService) {
        super();
        this._contextKeyService = _contextKeyService;
        this._commandService = _commandService;
        this._telemetryService = _telemetryService;
        this._notificationService = _notificationService;
        this._logService = _logService;
        this._onDidUpdateKeybindings = this._register(new Emitter());
        this._currentChords = [];
        this._currentChordChecker = new IntervalTimer();
        this._currentChordStatusMessage = null;
        this._ignoreSingleModifiers = KeybindingModifierSet.EMPTY;
        this._currentSingleModifier = null;
        this._currentSingleModifierClearTimeout = new TimeoutTimer();
        this._currentlyDispatchingCommandId = null;
        this._logging = false;
    }
    dispose() {
        super.dispose();
    }
    getDefaultKeybindingsContent() {
        return '';
    }
    toggleLogging() {
        this._logging = !this._logging;
        return this._logging;
    }
    _log(str) {
        if (this._logging) {
            this._logService.info(`[KeybindingService]: ${str}`);
        }
    }
    getDefaultKeybindings() {
        return this._getResolver().getDefaultKeybindings();
    }
    getKeybindings() {
        return this._getResolver().getKeybindings();
    }
    customKeybindingsCount() {
        return 0;
    }
    lookupKeybindings(commandId) {
        return arrays.coalesce(this._getResolver().lookupKeybindings(commandId).map(item => item.resolvedKeybinding));
    }
    lookupKeybinding(commandId, context, enforceContextCheck = false) {
        const result = this._getResolver().lookupPrimaryKeybinding(commandId, context || this._contextKeyService, enforceContextCheck);
        if (!result) {
            return undefined;
        }
        return result.resolvedKeybinding;
    }
    dispatchEvent(e, target) {
        return this._dispatch(e, target);
    }
    // TODO@ulugbekna: update namings to align with `_doDispatch`
    // TODO@ulugbekna: this fn doesn't seem to take into account single-modifier keybindings, eg `shift shift`
    softDispatch(e, target) {
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
    _scheduleLeaveChordMode() {
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
    _expectAnotherChord(firstChord, keypressLabel) {
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
    _leaveChordMode() {
        if (this._currentChordStatusMessage) {
            this._currentChordStatusMessage.close();
            this._currentChordStatusMessage = null;
        }
        this._currentChordChecker.cancel();
        this._currentChords = [];
        IME.enable();
    }
    dispatchByUserSettingsLabel(userSettingsLabel, target) {
        this._log(`/ Dispatching keybinding triggered via menu entry accelerator - ${userSettingsLabel}`);
        const keybindings = this.resolveUserBinding(userSettingsLabel);
        if (keybindings.length === 0) {
            this._log(`\\ Could not resolve - ${userSettingsLabel}`);
        }
        else {
            this._doDispatch(keybindings[0], target, /*isSingleModiferChord*/ false);
        }
    }
    _dispatch(e, target) {
        return this._doDispatch(this.resolveKeyboardEvent(e), target, /*isSingleModiferChord*/ false);
    }
    _singleModifierDispatch(e, target) {
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
                return this._doDispatch(keybinding, target, /*isSingleModiferChord*/ true);
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
    _doDispatch(userKeypress, target, isSingleModiferChord = false) {
        let shouldPreventDefault = false;
        if (userKeypress.hasMultipleChords()) { // warn - because user can press a single chord at a time
            console.warn('Unexpected keyboard event mapped to multiple chords');
            return false;
        }
        let userPressedChord = null;
        let currentChords = null;
        if (isSingleModiferChord) {
            // The keybinding is the second keypress of a single modifier chord, e.g. "shift shift".
            // A single modifier can only occur when the same modifier is pressed in short sequence,
            // hence we disregard `_currentChord` and use the same modifier instead.
            const [dispatchKeyname,] = userKeypress.getSingleModifierDispatchChords();
            userPressedChord = dispatchKeyname;
            currentChords = dispatchKeyname ? [dispatchKeyname] : []; // TODO@ulugbekna: in the `else` case we assign an empty array - make sure `resolve` can handle an empty array well
        }
        else {
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
            case 0 /* ResultKind.NoMatchingKb */: {
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
            case 1 /* ResultKind.MoreChordsNeeded */: {
                this._logService.trace('KeybindingService#dispatch', keypressLabel, `[ Several keybindings match - more chords needed ]`);
                shouldPreventDefault = true;
                this._expectAnotherChord(userPressedChord, keypressLabel);
                this._log(this._currentChords.length === 1 ? `+ Entering multi-chord mode...` : `+ Continuing multi-chord mode...`);
                return shouldPreventDefault;
            }
            case 2 /* ResultKind.KbFound */: {
                this._logService.trace('KeybindingService#dispatch', keypressLabel, `[ Will dispatch command ${resolveResult.commandId} ]`);
                if (resolveResult.commandId === null || resolveResult.commandId === '') {
                    if (this.inChordMode) {
                        const currentChordsLabel = this._currentChords.map(({ label }) => label).join(', ');
                        this._log(`+ Leaving chord mode: Nothing bound to "${currentChordsLabel}, ${keypressLabel}".`);
                        this._notificationService.status(nls.localize('missing.chord', "The key combination ({0}, {1}) is not a command.", currentChordsLabel, keypressLabel), { hideAfter: 10 * 1000 /* 10s */ });
                        this._leaveChordMode();
                        shouldPreventDefault = true;
                    }
                }
                else {
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
                        }
                        else {
                            this._commandService.executeCommand(resolveResult.commandId, resolveResult.commandArgs).then(undefined, err => this._notificationService.warn(err));
                        }
                    }
                    finally {
                        this._currentlyDispatchingCommandId = null;
                    }
                    if (!HIGH_FREQ_COMMANDS.test(resolveResult.commandId)) {
                        this._telemetryService.publicLog2('workbenchActionExecuted', { id: resolveResult.commandId, from: 'keybinding', detail: userKeypress.getUserSettingsLabel() ?? undefined });
                    }
                }
                return shouldPreventDefault;
            }
        }
    }
    mightProducePrintableCharacter(event) {
        if (event.ctrlKey || event.metaKey) {
            // ignore ctrl/cmd-combination but not shift/alt-combinatios
            return false;
        }
        // weak check for certain ranges. this is properly implemented in a subclass
        // with access to the KeyboardMapperFactory.
        if ((event.keyCode >= 31 /* KeyCode.KeyA */ && event.keyCode <= 56 /* KeyCode.KeyZ */)
            || (event.keyCode >= 21 /* KeyCode.Digit0 */ && event.keyCode <= 30 /* KeyCode.Digit9 */)) {
            return true;
        }
        return false;
    }
    appendKeybinding(label, commandId, context, enforceContextCheck) {
        if (commandId) {
            const keybindingLabel = this.lookupKeybinding(commandId, context, enforceContextCheck)?.getLabel();
            if (keybindingLabel) {
                return nls.localize({ key: 'keybindingLabel', comment: ['UI element label', 'A keybinding label'] }, "{0} ({1})", label, keybindingLabel);
            }
        }
        return label;
    }
}
class KeybindingModifierSet {
    static { this.EMPTY = new KeybindingModifierSet(null); }
    constructor(source) {
        this._ctrlKey = source ? source.ctrlKey : false;
        this._shiftKey = source ? source.shiftKey : false;
        this._altKey = source ? source.altKey : false;
        this._metaKey = source ? source.metaKey : false;
    }
    has(modifier) {
        switch (modifier) {
            case 'ctrl': return this._ctrlKey;
            case 'shift': return this._shiftKey;
            case 'alt': return this._altKey;
            case 'meta': return this._metaKey;
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWJzdHJhY3RLZXliaW5kaW5nU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2Fic3RyYWN0S2V5YmluZGluZ1NlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxLQUFLLE1BQU0sTUFBTSxnQ0FBZ0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsYUFBYSxFQUFFLFlBQVksRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQzVFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUM5RCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUdsRCxPQUFPLEVBQUUsVUFBVSxFQUFlLE1BQU0sbUNBQW1DLENBQUM7QUFDNUUsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQkFBaUIsQ0FBQztBQUt2QyxPQUFPLEVBQW9ELFlBQVksRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBV3pHLE1BQU0sa0JBQWtCLEdBQUcsMERBQTBELENBQUM7QUFFdEYsTUFBTSxPQUFnQix5QkFBMEIsU0FBUSxVQUFVO0lBS2pFLElBQUksc0JBQXNCO1FBQ3pCLE9BQU8sSUFBSSxDQUFDLHVCQUF1QixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsdUJBQXVCLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsK0NBQStDO0lBQ3ZJLENBQUM7SUFvQkQsSUFBVyxXQUFXO1FBQ3JCLE9BQU8sSUFBSSxDQUFDLGNBQWMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO0lBQ3ZDLENBQUM7SUFFRCxZQUNTLGtCQUFzQyxFQUNwQyxlQUFnQyxFQUNoQyxp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