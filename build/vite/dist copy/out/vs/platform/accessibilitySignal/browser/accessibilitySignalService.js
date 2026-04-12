/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { addDisposableListener } from '../../../base/browser/dom.js';
import { CachedFunction } from '../../../base/common/cache.js';
import { getStructuralKey } from '../../../base/common/equals.js';
import { Disposable, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { FileAccess } from '../../../base/common/network.js';
import { derived, observableFromEvent, ValueWithChangeEventFromObservable } from '../../../base/common/observable.js';
import { localize } from '../../../nls.js';
import { IAccessibilityService } from '../../accessibility/common/accessibility.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { observableConfigValue } from '../../observable/common/platformObservableUtils.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
export const IAccessibilitySignalService = createDecorator('accessibilitySignalService');
/** Make sure you understand the doc comments of the method you want to call when using this token! */
export const AcknowledgeDocCommentsToken = Symbol('AcknowledgeDocCommentsToken');
let AccessibilitySignalService = class AccessibilitySignalService extends Disposable {
    constructor(configurationService, accessibilityService, telemetryService) {
        super();
        this.configurationService = configurationService;
        this.accessibilityService = accessibilityService;
        this.telemetryService = telemetryService;
        this.sounds = new Map();
        this.screenReaderAttached = observableFromEvent(this, this.accessibilityService.onDidChangeScreenReaderOptimized, () => /** @description accessibilityService.onDidChangeScreenReaderOptimized */ this.accessibilityService.isScreenReaderOptimized());
        this.sentTelemetry = new Set();
        this.playingSounds = new Set();
        this._signalConfigValue = new CachedFunction((signal) => observableConfigValue(signal.settingsKey, { sound: 'off', announcement: 'off' }, this.configurationService));
        this._signalEnabledState = new CachedFunction({ getCacheKey: getStructuralKey }, (arg) => {
            return derived(reader => {
                /** @description sound enabled */
                const setting = this._signalConfigValue.get(arg.signal).read(reader);
                if (arg.modality === 'sound' || arg.modality === undefined) {
                    if (arg.signal.managesOwnEnablement || checkEnabledState(setting.sound, () => this.screenReaderAttached.read(reader), arg.userGesture)) {
                        return true;
                    }
                }
                if (arg.modality === 'announcement' || arg.modality === undefined) {
                    if (checkEnabledState(setting.announcement, () => this.screenReaderAttached.read(reader), arg.userGesture)) {
                        return true;
                    }
                }
                return false;
            }).recomputeInitiallyAndOnChange(this._store);
        });
    }
    getEnabledState(signal, userGesture, modality) {
        return new ValueWithChangeEventFromObservable(this._signalEnabledState.get({ signal, userGesture, modality }));
    }
    async playSignal(signal, options = {}) {
        const shouldPlayAnnouncement = options.modality === 'announcement' || options.modality === undefined;
        const announcementMessage = options.customAlertMessage ?? signal.announcementMessage;
        if (shouldPlayAnnouncement && this.isAnnouncementEnabled(signal, options.userGesture) && announcementMessage) {
            this.accessibilityService.status(announcementMessage);
        }
        const shouldPlaySound = options.modality === 'sound' || options.modality === undefined;
        if (shouldPlaySound && this.isSoundEnabled(signal, options.userGesture)) {
            this.sendSignalTelemetry(signal, options.source);
            await this.playSound(signal.sound.getSound(), options.allowManyInParallel);
        }
    }
    async playSignals(signals) {
        for (const signal of signals) {
            this.sendSignalTelemetry('signal' in signal ? signal.signal : signal, 'source' in signal ? signal.source : undefined);
        }
        const signalArray = signals.map(s => 'signal' in s ? s.signal : s);
        const announcements = signalArray.filter(signal => this.isAnnouncementEnabled(signal)).map(s => s.announcementMessage);
        if (announcements.length) {
            this.accessibilityService.status(announcements.join(', '));
        }
        // Some sounds are reused. Don't play the same sound twice.
        const sounds = new Set(signalArray.filter(signal => this.isSoundEnabled(signal)).map(signal => signal.sound.getSound()));
        await Promise.all(Array.from(sounds).map(sound => this.playSound(sound, true)));
    }
    sendSignalTelemetry(signal, source) {
        const isScreenReaderOptimized = this.accessibilityService.isScreenReaderOptimized();
        const key = signal.name + (source ? `::${source}` : '') + (isScreenReaderOptimized ? '{screenReaderOptimized}' : '');
        // Only send once per user session
        if (this.sentTelemetry.has(key) || this.getVolumeInPercent() === 0) {
            return;
        }
        this.sentTelemetry.add(key);
        this.telemetryService.publicLog2('signal.played', {
            signal: signal.name,
            source: source ?? '',
            isScreenReaderOptimized,
        });
    }
    getVolumeInPercent() {
        const volume = this.configurationService.getValue('accessibility.signalOptions.volume');
        if (typeof volume !== 'number') {
            return 50;
        }
        return Math.max(Math.min(volume, 100), 0);
    }
    async playSound(sound, allowManyInParallel = false) {
        if (!allowManyInParallel && this.playingSounds.has(sound)) {
            return;
        }
        this.playingSounds.add(sound);
        const url = FileAccess.asBrowserUri(`vs/platform/accessibilitySignal/browser/media/${sound.fileName}`).toString(true);
        try {
            const sound = this.sounds.get(url);
            if (sound) {
                sound.volume = this.getVolumeInPercent() / 100;
                sound.currentTime = 0;
                await sound.play();
            }
            else {
                const playedSound = await playAudio(url, this.getVolumeInPercent() / 100);
                this.sounds.set(url, playedSound);
            }
        }
        catch (e) {
            if (!e.message.includes('play() can only be initiated by a user gesture')) {
                // tracking this issue in #178642, no need to spam the console
                console.error('Error while playing sound', e);
            }
        }
        finally {
            this.playingSounds.delete(sound);
        }
    }
    playSignalLoop(signal, milliseconds) {
        let playing = true;
        const playSound = () => {
            if (playing) {
                this.playSignal(signal, { allowManyInParallel: true }).finally(() => {
                    setTimeout(() => {
                        if (playing) {
                            playSound();
                        }
                    }, milliseconds);
                });
            }
        };
        playSound();
        return toDisposable(() => playing = false);
    }
    isAnnouncementEnabled(signal, userGesture) {
        if (!signal.announcementMessage) {
            return false;
        }
        return this._signalEnabledState.get({ signal, userGesture: !!userGesture, modality: 'announcement' }).get();
    }
    isSoundEnabled(signal, userGesture) {
        return this._signalEnabledState.get({ signal, userGesture: !!userGesture, modality: 'sound' }).get();
    }
    onSoundEnabledChanged(signal) {
        return this.getEnabledState(signal, false).onDidChange;
    }
    getDelayMs(signal, modality, mode) {
        if (!this.configurationService.getValue('accessibility.signalOptions.debouncePositionChanges')) {
            return 0;
        }
        let value;
        if (signal.name === AccessibilitySignal.errorAtPosition.name && mode === 'positional') {
            value = this.configurationService.getValue('accessibility.signalOptions.experimental.delays.errorAtPosition');
        }
        else if (signal.name === AccessibilitySignal.warningAtPosition.name && mode === 'positional') {
            value = this.configurationService.getValue('accessibility.signalOptions.experimental.delays.warningAtPosition');
        }
        else {
            value = this.configurationService.getValue('accessibility.signalOptions.experimental.delays.general');
        }
        return modality === 'sound' ? value.sound : value.announcement;
    }
};
AccessibilitySignalService = __decorate([
    __param(0, IConfigurationService),
    __param(1, IAccessibilityService),
    __param(2, ITelemetryService)
], AccessibilitySignalService);
export { AccessibilitySignalService };
function checkEnabledState(state, getScreenReaderAttached, isTriggeredByUserGesture) {
    return state === 'on' || state === 'always' || (state === 'auto' && getScreenReaderAttached()) || state === 'userGesture' && isTriggeredByUserGesture;
}
/**
 * Play the given audio url.
 * @volume value between 0 and 1
 */
async function playAudio(url, volume) {
    const disposables = new DisposableStore();
    try {
        return await doPlayAudio(url, volume, disposables);
    }
    finally {
        disposables.dispose();
    }
}
function doPlayAudio(url, volume, disposables) {
    return new Promise((resolve, reject) => {
        const audio = new Audio(url);
        audio.volume = volume;
        disposables.add(addDisposableListener(audio, 'ended', () => {
            resolve(audio);
        }));
        disposables.add(addDisposableListener(audio, 'error', (e) => {
            // When the error event fires, ended might not be called
            reject(e.error);
        }));
        audio.play().catch(e => {
            // When play fails, the error event is not fired.
            reject(e);
        });
    });
}
/**
 * Corresponds to the audio files in ./media.
*/
export class Sound {
    static register(options) {
        const sound = new Sound(options.fileName);
        return sound;
    }
    static { this.error = Sound.register({ fileName: 'error.mp3' }); }
    static { this.warning = Sound.register({ fileName: 'warning.mp3' }); }
    static { this.success = Sound.register({ fileName: 'success.mp3' }); }
    static { this.foldedArea = Sound.register({ fileName: 'foldedAreas.mp3' }); }
    static { this.break = Sound.register({ fileName: 'break.mp3' }); }
    static { this.quickFixes = Sound.register({ fileName: 'quickFixes.mp3' }); }
    static { this.taskCompleted = Sound.register({ fileName: 'taskCompleted.mp3' }); }
    static { this.taskFailed = Sound.register({ fileName: 'taskFailed.mp3' }); }
    static { this.terminalBell = Sound.register({ fileName: 'terminalBell.mp3' }); }
    static { this.diffLineInserted = Sound.register({ fileName: 'diffLineInserted.mp3' }); }
    static { this.diffLineDeleted = Sound.register({ fileName: 'diffLineDeleted.mp3' }); }
    static { this.diffLineModified = Sound.register({ fileName: 'diffLineModified.mp3' }); }
    static { this.requestSent = Sound.register({ fileName: 'requestSent.mp3' }); }
    static { this.responseReceived1 = Sound.register({ fileName: 'responseReceived1.mp3' }); }
    static { this.responseReceived2 = Sound.register({ fileName: 'responseReceived2.mp3' }); }
    static { this.responseReceived3 = Sound.register({ fileName: 'responseReceived3.mp3' }); }
    static { this.responseReceived4 = Sound.register({ fileName: 'responseReceived4.mp3' }); }
    static { this.clear = Sound.register({ fileName: 'clear.mp3' }); }
    static { this.save = Sound.register({ fileName: 'save.mp3' }); }
    static { this.format = Sound.register({ fileName: 'format.mp3' }); }
    static { this.voiceRecordingStarted = Sound.register({ fileName: 'voiceRecordingStarted.mp3' }); }
    static { this.voiceRecordingStopped = Sound.register({ fileName: 'voiceRecordingStopped.mp3' }); }
    static { this.progress = Sound.register({ fileName: 'progress.mp3' }); }
    static { this.chatEditModifiedFile = Sound.register({ fileName: 'chatEditModifiedFile.mp3' }); }
    static { this.editsKept = Sound.register({ fileName: 'editsKept.mp3' }); }
    static { this.editsUndone = Sound.register({ fileName: 'editsUndone.mp3' }); }
    static { this.nextEditSuggestion = Sound.register({ fileName: 'nextEditSuggestion.mp3' }); }
    static { this.terminalCommandSucceeded = Sound.register({ fileName: 'terminalCommandSucceeded.mp3' }); }
    static { this.chatUserActionRequired = Sound.register({ fileName: 'chatUserActionRequired.mp3' }); }
    static { this.codeActionTriggered = Sound.register({ fileName: 'codeActionTriggered.mp3' }); }
    static { this.codeActionApplied = Sound.register({ fileName: 'codeActionApplied.mp3' }); }
    constructor(fileName) {
        this.fileName = fileName;
    }
}
export class SoundSource {
    constructor(randomOneOf) {
        this.randomOneOf = randomOneOf;
    }
    getSound(deterministic = false) {
        if (deterministic || this.randomOneOf.length === 1) {
            return this.randomOneOf[0];
        }
        else {
            const index = Math.floor(Math.random() * this.randomOneOf.length);
            return this.randomOneOf[index];
        }
    }
}
export class AccessibilitySignal {
    constructor(sound, name, legacySoundSettingsKey, settingsKey, legacyAnnouncementSettingsKey, announcementMessage, managesOwnEnablement = false) {
        this.sound = sound;
        this.name = name;
        this.legacySoundSettingsKey = legacySoundSettingsKey;
        this.settingsKey = settingsKey;
        this.legacyAnnouncementSettingsKey = legacyAnnouncementSettingsKey;
        this.announcementMessage = announcementMessage;
        this.managesOwnEnablement = managesOwnEnablement;
    }
    static { this._signals = new Set(); }
    static register(options) {
        const soundSource = new SoundSource('randomOneOf' in options.sound ? options.sound.randomOneOf : [options.sound]);
        const signal = new AccessibilitySignal(soundSource, options.name, options.legacySoundSettingsKey, options.settingsKey, options.legacyAnnouncementSettingsKey, options.announcementMessage, options.managesOwnEnablement);
        AccessibilitySignal._signals.add(signal);
        return signal;
    }
    static get allAccessibilitySignals() {
        return [...this._signals];
    }
    static { this.errorAtPosition = AccessibilitySignal.register({
        name: localize('accessibilitySignals.positionHasError.name', 'Error at Position'),
        sound: Sound.error,
        announcementMessage: localize('accessibility.signals.positionHasError', 'Error'),
        settingsKey: 'accessibility.signals.positionHasError',
        delaySettingsKey: 'accessibility.signalOptions.delays.errorAtPosition'
    }); }
    static { this.warningAtPosition = AccessibilitySignal.register({
        name: localize('accessibilitySignals.positionHasWarning.name', 'Warning at Position'),
        sound: Sound.warning,
        announcementMessage: localize('accessibility.signals.positionHasWarning', 'Warning'),
        settingsKey: 'accessibility.signals.positionHasWarning',
        delaySettingsKey: 'accessibility.signalOptions.delays.warningAtPosition'
    }); }
    static { this.errorOnLine = AccessibilitySignal.register({
        name: localize('accessibilitySignals.lineHasError.name', 'Error on Line'),
        sound: Sound.error,
        legacySoundSettingsKey: 'audioCues.lineHasError',
        legacyAnnouncementSettingsKey: 'accessibility.alert.error',
        announcementMessage: localize('accessibility.signals.lineHasError', 'Error on Line'),
        settingsKey: 'accessibility.signals.lineHasError',
    }); }
    static { this.warningOnLine = AccessibilitySignal.register({
        name: localize('accessibilitySignals.lineHasWarning.name', 'Warning on Line'),
        sound: Sound.warning,
        legacySoundSettingsKey: 'audioCues.lineHasWarning',
        legacyAnnouncementSettingsKey: 'accessibility.alert.warning',
        announcementMessage: localize('accessibility.signals.lineHasWarning', 'Warning on Line'),
        settingsKey: 'accessibility.signals.lineHasWarning',
    }); }
    static { this.foldedArea = AccessibilitySignal.register({
        name: localize('accessibilitySignals.lineHasFoldedArea.name', 'Folded Area on Line'),
        sound: Sound.foldedArea,
        legacySoundSettingsKey: 'audioCues.lineHasFoldedArea',
        legacyAnnouncementSettingsKey: 'accessibility.alert.foldedArea',
        announcementMessage: localize('accessibility.signals.lineHasFoldedArea', 'Folded'),
        settingsKey: 'accessibility.signals.lineHasFoldedArea',
    }); }
    static { this.break = AccessibilitySignal.register({
        name: localize('accessibilitySignals.lineHasBreakpoint.name', 'Breakpoint on Line'),
        sound: Sound.break,
        legacySoundSettingsKey: 'audioCues.lineHasBreakpoint',
        legacyAnnouncementSettingsKey: 'accessibility.alert.breakpoint',
        announcementMessage: localize('accessibility.signals.lineHasBreakpoint', 'Breakpoint'),
        settingsKey: 'accessibility.signals.lineHasBreakpoint',
    }); }
    static { this.inlineSuggestion = AccessibilitySignal.register({
        name: localize('accessibilitySignals.lineHasInlineSuggestion.name', 'Inline Suggestion on Line'),
        sound: Sound.quickFixes,
        legacySoundSettingsKey: 'audioCues.lineHasInlineSuggestion',
        settingsKey: 'accessibility.signals.lineHasInlineSuggestion',
    }); }
    static { this.nextEditSuggestion = AccessibilitySignal.register({
        name: localize('accessibilitySignals.nextEditSuggestion.name', 'Next Edit Suggestion on Line'),
        sound: Sound.nextEditSuggestion,
        legacySoundSettingsKey: 'audioCues.nextEditSuggestion',
        settingsKey: 'accessibility.signals.nextEditSuggestion',
        announcementMessage: localize('accessibility.signals.nextEditSuggestion', 'Next Edit Suggestion'),
    }); }
    static { this.terminalQuickFix = AccessibilitySignal.register({
        name: localize('accessibilitySignals.terminalQuickFix.name', 'Terminal Quick Fix'),
        sound: Sound.quickFixes,
        legacySoundSettingsKey: 'audioCues.terminalQuickFix',
        legacyAnnouncementSettingsKey: 'accessibility.alert.terminalQuickFix',
        announcementMessage: localize('accessibility.signals.terminalQuickFix', 'Quick Fix'),
        settingsKey: 'accessibility.signals.terminalQuickFix',
    }); }
    static { this.onDebugBreak = AccessibilitySignal.register({
        name: localize('accessibilitySignals.onDebugBreak.name', 'Debugger Stopped on Breakpoint'),
        sound: Sound.break,
        legacySoundSettingsKey: 'audioCues.onDebugBreak',
        legacyAnnouncementSettingsKey: 'accessibility.alert.onDebugBreak',
        announcementMessage: localize('accessibility.signals.onDebugBreak', 'Breakpoint'),
        settingsKey: 'accessibility.signals.onDebugBreak',
    }); }
    static { this.noInlayHints = AccessibilitySignal.register({
        name: localize('accessibilitySignals.noInlayHints', 'No Inlay Hints on Line'),
        sound: Sound.error,
        legacySoundSettingsKey: 'audioCues.noInlayHints',
        legacyAnnouncementSettingsKey: 'accessibility.alert.noInlayHints',
        announcementMessage: localize('accessibility.signals.noInlayHints', 'No Inlay Hints'),
        settingsKey: 'accessibility.signals.noInlayHints',
    }); }
    static { this.taskCompleted = AccessibilitySignal.register({
        name: localize('accessibilitySignals.taskCompleted', 'Task Completed'),
        sound: Sound.taskCompleted,
        legacySoundSettingsKey: 'audioCues.taskCompleted',
        legacyAnnouncementSettingsKey: 'accessibility.alert.taskCompleted',
        announcementMessage: localize('accessibility.signals.taskCompleted', 'Task Completed'),
        settingsKey: 'accessibility.signals.taskCompleted',
    }); }
    static { this.taskFailed = AccessibilitySignal.register({
        name: localize('accessibilitySignals.taskFailed', 'Task Failed'),
        sound: Sound.taskFailed,
        legacySoundSettingsKey: 'audioCues.taskFailed',
        legacyAnnouncementSettingsKey: 'accessibility.alert.taskFailed',
        announcementMessage: localize('accessibility.signals.taskFailed', 'Task Failed'),
        settingsKey: 'accessibility.signals.taskFailed',
    }); }
    static { this.terminalCommandFailed = AccessibilitySignal.register({
        name: localize('accessibilitySignals.terminalCommandFailed', 'Terminal Command Failed'),
        sound: Sound.error,
        legacySoundSettingsKey: 'audioCues.terminalCommandFailed',
        legacyAnnouncementSettingsKey: 'accessibility.alert.terminalCommandFailed',
        announcementMessage: localize('accessibility.signals.terminalCommandFailed', 'Command Failed'),
        settingsKey: 'accessibility.signals.terminalCommandFailed',
    }); }
    static { this.terminalCommandSucceeded = AccessibilitySignal.register({
        name: localize('accessibilitySignals.terminalCommandSucceeded', 'Terminal Command Succeeded'),
        sound: Sound.terminalCommandSucceeded,
        announcementMessage: localize('accessibility.signals.terminalCommandSucceeded', 'Command Succeeded'),
        settingsKey: 'accessibility.signals.terminalCommandSucceeded',
    }); }
    static { this.terminalBell = AccessibilitySignal.register({
        name: localize('accessibilitySignals.terminalBell', 'Terminal Bell'),
        sound: Sound.terminalBell,
        legacySoundSettingsKey: 'audioCues.terminalBell',
        legacyAnnouncementSettingsKey: 'accessibility.alert.terminalBell',
        announcementMessage: localize('accessibility.signals.terminalBell', 'Terminal Bell'),
        settingsKey: 'accessibility.signals.terminalBell',
    }); }
    static { this.notebookCellCompleted = AccessibilitySignal.register({
        name: localize('accessibilitySignals.notebookCellCompleted', 'Notebook Cell Completed'),
        sound: Sound.taskCompleted,
        legacySoundSettingsKey: 'audioCues.notebookCellCompleted',
        legacyAnnouncementSettingsKey: 'accessibility.alert.notebookCellCompleted',
        announcementMessage: localize('accessibility.signals.notebookCellCompleted', 'Notebook Cell Completed'),
        settingsKey: 'accessibility.signals.notebookCellCompleted',
    }); }
    static { this.notebookCellFailed = AccessibilitySignal.register({
        name: localize('accessibilitySignals.notebookCellFailed', 'Notebook Cell Failed'),
        sound: Sound.taskFailed,
        legacySoundSettingsKey: 'audioCues.notebookCellFailed',
        legacyAnnouncementSettingsKey: 'accessibility.alert.notebookCellFailed',
        announcementMessage: localize('accessibility.signals.notebookCellFailed', 'Notebook Cell Failed'),
        settingsKey: 'accessibility.signals.notebookCellFailed',
    }); }
    static { this.diffLineInserted = AccessibilitySignal.register({
        name: localize('accessibilitySignals.diffLineInserted', 'Diff Line Inserted'),
        sound: Sound.diffLineInserted,
        legacySoundSettingsKey: 'audioCues.diffLineInserted',
        settingsKey: 'accessibility.signals.diffLineInserted',
    }); }
    static { this.diffLineDeleted = AccessibilitySignal.register({
        name: localize('accessibilitySignals.diffLineDeleted', 'Diff Line Deleted'),
        sound: Sound.diffLineDeleted,
        legacySoundSettingsKey: 'audioCues.diffLineDeleted',
        settingsKey: 'accessibility.signals.diffLineDeleted',
    }); }
    static { this.diffLineModified = AccessibilitySignal.register({
        name: localize('accessibilitySignals.diffLineModified', 'Diff Line Modified'),
        sound: Sound.diffLineModified,
        legacySoundSettingsKey: 'audioCues.diffLineModified',
        settingsKey: 'accessibility.signals.diffLineModified',
    }); }
    static { this.chatEditModifiedFile = AccessibilitySignal.register({
        name: localize('accessibilitySignals.chatEditModifiedFile', 'Chat Edit Modified File'),
        sound: Sound.chatEditModifiedFile,
        announcementMessage: localize('accessibility.signals.chatEditModifiedFile', 'File Modified from Chat Edits'),
        settingsKey: 'accessibility.signals.chatEditModifiedFile',
    }); }
    static { this.chatRequestSent = AccessibilitySignal.register({
        name: localize('accessibilitySignals.chatRequestSent', 'Chat Request Sent'),
        sound: Sound.requestSent,
        legacySoundSettingsKey: 'audioCues.chatRequestSent',
        legacyAnnouncementSettingsKey: 'accessibility.alert.chatRequestSent',
        announcementMessage: localize('accessibility.signals.chatRequestSent', 'Chat Request Sent'),
        settingsKey: 'accessibility.signals.chatRequestSent',
    }); }
    static { this.chatResponseReceived = AccessibilitySignal.register({
        name: localize('accessibilitySignals.chatResponseReceived', 'Chat Response Received'),
        legacySoundSettingsKey: 'audioCues.chatResponseReceived',
        sound: {
            randomOneOf: [
                Sound.responseReceived1,
                Sound.responseReceived2,
                Sound.responseReceived3,
                Sound.responseReceived4
            ]
        },
        settingsKey: 'accessibility.signals.chatResponseReceived'
    }); }
    static { this.codeActionTriggered = AccessibilitySignal.register({
        name: localize('accessibilitySignals.codeActionRequestTriggered', 'Code Action Request Triggered'),
        sound: Sound.codeActionTriggered,
        legacySoundSettingsKey: 'audioCues.codeActionRequestTriggered',
        legacyAnnouncementSettingsKey: 'accessibility.alert.codeActionRequestTriggered',
        announcementMessage: localize('accessibility.signals.codeActionRequestTriggered', 'Code Action Request Triggered'),
        settingsKey: 'accessibility.signals.codeActionTriggered',
    }); }
    static { this.codeActionApplied = AccessibilitySignal.register({
        name: localize('accessibilitySignals.codeActionApplied', 'Code Action Applied'),
        legacySoundSettingsKey: 'audioCues.codeActionApplied',
        sound: Sound.codeActionApplied,
        settingsKey: 'accessibility.signals.codeActionApplied'
    }); }
    static { this.progress = AccessibilitySignal.register({
        name: localize('accessibilitySignals.progress', 'Progress'),
        sound: Sound.progress,
        legacySoundSettingsKey: 'audioCues.chatResponsePending',
        legacyAnnouncementSettingsKey: 'accessibility.alert.progress',
        announcementMessage: localize('accessibility.signals.progress', 'Progress'),
        settingsKey: 'accessibility.signals.progress'
    }); }
    static { this.clear = AccessibilitySignal.register({
        name: localize('accessibilitySignals.clear', 'Clear'),
        sound: Sound.clear,
        legacySoundSettingsKey: 'audioCues.clear',
        legacyAnnouncementSettingsKey: 'accessibility.alert.clear',
        announcementMessage: localize('accessibility.signals.clear', 'Clear'),
        settingsKey: 'accessibility.signals.clear'
    }); }
    static { this.save = AccessibilitySignal.register({
        name: localize('accessibilitySignals.save', 'Save'),
        sound: Sound.save,
        legacySoundSettingsKey: 'audioCues.save',
        legacyAnnouncementSettingsKey: 'accessibility.alert.save',
        announcementMessage: localize('accessibility.signals.save', 'Save'),
        settingsKey: 'accessibility.signals.save'
    }); }
    static { this.format = AccessibilitySignal.register({
        name: localize('accessibilitySignals.format', 'Format'),
        sound: Sound.format,
        legacySoundSettingsKey: 'audioCues.format',
        legacyAnnouncementSettingsKey: 'accessibility.alert.format',
        announcementMessage: localize('accessibility.signals.format', 'Format'),
        settingsKey: 'accessibility.signals.format'
    }); }
    static { this.voiceRecordingStarted = AccessibilitySignal.register({
        name: localize('accessibilitySignals.voiceRecordingStarted', 'Voice Recording Started'),
        sound: Sound.voiceRecordingStarted,
        legacySoundSettingsKey: 'audioCues.voiceRecordingStarted',
        settingsKey: 'accessibility.signals.voiceRecordingStarted'
    }); }
    static { this.voiceRecordingStopped = AccessibilitySignal.register({
        name: localize('accessibilitySignals.voiceRecordingStopped', 'Voice Recording Stopped'),
        sound: Sound.voiceRecordingStopped,
        legacySoundSettingsKey: 'audioCues.voiceRecordingStopped',
        settingsKey: 'accessibility.signals.voiceRecordingStopped'
    }); }
    static { this.editsKept = AccessibilitySignal.register({
        name: localize('accessibilitySignals.editsKept', 'Edits Kept'),
        sound: Sound.editsKept,
        announcementMessage: localize('accessibility.signals.editsKept', 'Edits Kept'),
        settingsKey: 'accessibility.signals.editsKept',
    }); }
    static { this.editsUndone = AccessibilitySignal.register({
        name: localize('accessibilitySignals.editsUndone', 'Undo Edits'),
        sound: Sound.editsUndone,
        announcementMessage: localize('accessibility.signals.editsUndone', 'Edits Undone'),
        settingsKey: 'accessibility.signals.editsUndone',
    }); }
    static { this.chatUserActionRequired = AccessibilitySignal.register({
        name: localize('accessibilitySignals.chatUserActionRequired', 'Chat User Action Required'),
        sound: Sound.chatUserActionRequired,
        announcementMessage: localize('accessibility.signals.chatUserActionRequired', 'Chat User Action Required'),
        settingsKey: 'accessibility.signals.chatUserActionRequired'
    }); }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5U2lnbmFsL2Jyb3dzZXIvYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDckUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRWxFLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFlLFlBQVksRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzNHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLGtDQUFrQyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDdEgsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQzNDLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM5RSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUMzRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUV4RSxNQUFNLENBQUMsTUFBTSwyQkFBMkIsR0FBRyxlQUFlLENBQThCLDRCQUE0QixDQUFDLENBQUM7QUF3QnRILHNHQUFzRztBQUN0RyxNQUFNLENBQUMs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