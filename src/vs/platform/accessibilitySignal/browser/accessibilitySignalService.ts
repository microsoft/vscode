/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CachedFunction } from '../../../base/common/cache.js';
import { getStructuralKey } from '../../../base/common/equals.js';
import { Event, IValueWithChangeEvent } from '../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { FileAccess } from '../../../base/common/network.js';
import { derived, observableFromEvent, ValueWithChangeEventFromObservable } from '../../../base/common/observable.js';
import { localize } from '../../../nls.js';
import { IAccessibilityService } from '../../accessibility/common/accessibility.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { observableConfigValue } from '../../observable/common/platformObservableUtils.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';

export const IAccessibilitySignalService = createDecorator<IAccessibilitySignalService>('accessibilitySignalService');

export interface IAccessibilitySignalService {
	readonly _serviceBrand: undefined;
	playSignal(signal: AccessibilitySignal, options?: IAccessbilitySignalOptions): Promise<void>;
	playSignals(signals: (AccessibilitySignal | { signal: AccessibilitySignal; source: string })[]): Promise<void>;
	playSignalLoop(signal: AccessibilitySignal, milliseconds: number): IDisposable;

	getEnabledState(signal: AccessibilitySignal, userGesture: boolean, modality?: AccessibilityModality | undefined): IValueWithChangeEvent<boolean>;
	getDelayMs(signal: AccessibilitySignal, modality: AccessibilityModality, mode: 'line' | 'positional'): number;
	/**
	 * Avoid this method and prefer `.playSignal`!
	 * Only use it when you want to play the sound regardless of enablement, e.g. in the settings quick pick.
	 */
	playSound(signal: Sound, allowManyInParallel: boolean, token: typeof AcknowledgeDocCommentsToken): Promise<void>;

	/** @deprecated Use getEnabledState(...).onChange */
	isSoundEnabled(signal: AccessibilitySignal): boolean;
	/** @deprecated Use getEnabledState(...).value */
	isAnnouncementEnabled(signal: AccessibilitySignal): boolean;
	/** @deprecated Use getEnabledState(...).onChange */
	onSoundEnabledChanged(signal: AccessibilitySignal): Event<void>;
}

/** Make sure you understand the doc comments of the method you want to call when using this token! */
export const AcknowledgeDocCommentsToken = Symbol('AcknowledgeDocCommentsToken');

export type AccessibilityModality = 'sound' | 'announcement';

export interface IAccessbilitySignalOptions {
	allowManyInParallel?: boolean;

	modality?: AccessibilityModality;

	/**
	 * The source that triggered the signal (e.g. "diffEditor.cursorPositionChanged").
	 */
	source?: string;

	/**
	 * For actions like save or format, depending on the
	 * configured value, we will only
	 * play the sound if the user triggered the action.
	 */
	userGesture?: boolean;
}

export class AccessibilitySignalService extends Disposable implements IAccessibilitySignalService {
	readonly _serviceBrand: undefined;
	private readonly sounds: Map<string, HTMLAudioElement> = new Map();
	private readonly screenReaderAttached = observableFromEvent(this,
		this.accessibilityService.onDidChangeScreenReaderOptimized,
		() => /** @description accessibilityService.onDidChangeScreenReaderOptimized */ this.accessibilityService.isScreenReaderOptimized()
	);
	private readonly sentTelemetry = new Set<string>();

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();
	}

	public getEnabledState(signal: AccessibilitySignal, userGesture: boolean, modality?: AccessibilityModality | undefined): IValueWithChangeEvent<boolean> {
		return new ValueWithChangeEventFromObservable(this._signalEnabledState.get({ signal, userGesture, modality }));
	}

	public async playSignal(signal: AccessibilitySignal, options: IAccessbilitySignalOptions = {}): Promise<void> {
		const shouldPlayAnnouncement = options.modality === 'announcement' || options.modality === undefined;
		const announcementMessage = signal.announcementMessage;
		if (shouldPlayAnnouncement && this.isAnnouncementEnabled(signal, options.userGesture) && announcementMessage) {
			this.accessibilityService.status(announcementMessage);
		}

		const shouldPlaySound = options.modality === 'sound' || options.modality === undefined;
		if (shouldPlaySound && this.isSoundEnabled(signal, options.userGesture)) {
			this.sendSignalTelemetry(signal, options.source);
			await this.playSound(signal.sound.getSound(), options.allowManyInParallel);
		}
	}

	public async playSignals(signals: (AccessibilitySignal | { signal: AccessibilitySignal; source: string })[]): Promise<void> {
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


	private sendSignalTelemetry(signal: AccessibilitySignal, source: string | undefined): void {
		const isScreenReaderOptimized = this.accessibilityService.isScreenReaderOptimized();
		const key = signal.name + (source ? `::${source}` : '') + (isScreenReaderOptimized ? '{screenReaderOptimized}' : '');
		// Only send once per user session
		if (this.sentTelemetry.has(key) || this.getVolumeInPercent() === 0) {
			return;
		}
		this.sentTelemetry.add(key);

		this.telemetryService.publicLog2<{
			signal: string;
			source: string;
			isScreenReaderOptimized: boolean;
		}, {
			owner: 'hediet';

			signal: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The signal that was played.' };
			source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The source that triggered the signal (e.g. "diffEditorNavigation").' };
			isScreenReaderOptimized: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the user is using a screen reader' };

			comment: 'This data is collected to understand how signals are used and if more signals should be added.';
		}>('signal.played', {
			signal: signal.name,
			source: source ?? '',
			isScreenReaderOptimized,
		});
	}

	private getVolumeInPercent(): number {
		const volume = this.configurationService.getValue<number>('accessibility.signalOptions.volume');
		if (typeof volume !== 'number') {
			return 50;
		}

		return Math.max(Math.min(volume, 100), 0);
	}

	private readonly playingSounds = new Set<Sound>();

	public async playSound(sound: Sound, allowManyInParallel = false): Promise<void> {
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
			} else {
				const playedSound = await playAudio(url, this.getVolumeInPercent() / 100);
				this.sounds.set(url, playedSound);
			}
		} catch (e) {
			if (!e.message.includes('play() can only be initiated by a user gesture')) {
				// tracking this issue in #178642, no need to spam the console
				console.error('Error while playing sound', e);
			}
		} finally {
			this.playingSounds.delete(sound);
		}
	}

	public playSignalLoop(signal: AccessibilitySignal, milliseconds: number): IDisposable {
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

	private readonly _signalConfigValue = new CachedFunction((signal: AccessibilitySignal) => observableConfigValue<{
		sound: EnabledState;
		announcement: EnabledState;
	}>(signal.settingsKey, { sound: 'off', announcement: 'off' }, this.configurationService));

	private readonly _signalEnabledState = new CachedFunction(
		{ getCacheKey: getStructuralKey },
		(arg: { signal: AccessibilitySignal; userGesture: boolean; modality?: AccessibilityModality | undefined }) => {
			return derived(reader => {
				/** @description sound enabled */
				const setting = this._signalConfigValue.get(arg.signal).read(reader);

				if (arg.modality === 'sound' || arg.modality === undefined) {
					if (checkEnabledState(setting.sound, () => this.screenReaderAttached.read(reader), arg.userGesture)) {
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
		}
	);

	public isAnnouncementEnabled(signal: AccessibilitySignal, userGesture?: boolean): boolean {
		if (!signal.announcementMessage) {
			return false;
		}
		return this._signalEnabledState.get({ signal, userGesture: !!userGesture, modality: 'announcement' }).get();
	}

	public isSoundEnabled(signal: AccessibilitySignal, userGesture?: boolean): boolean {
		return this._signalEnabledState.get({ signal, userGesture: !!userGesture, modality: 'sound' }).get();
	}

	public onSoundEnabledChanged(signal: AccessibilitySignal): Event<void> {
		return this.getEnabledState(signal, false).onDidChange;
	}

	public getDelayMs(signal: AccessibilitySignal, modality: AccessibilityModality, mode: 'line' | 'positional'): number {
		if (!this.configurationService.getValue('accessibility.signalOptions.debouncePositionChanges')) {
			return 0;
		}
		let value: { sound: number; announcement: number };
		if (signal.name === AccessibilitySignal.errorAtPosition.name && mode === 'positional') {
			value = this.configurationService.getValue('accessibility.signalOptions.experimental.delays.errorAtPosition');
		} else if (signal.name === AccessibilitySignal.warningAtPosition.name && mode === 'positional') {
			value = this.configurationService.getValue('accessibility.signalOptions.experimental.delays.warningAtPosition');
		} else {
			value = this.configurationService.getValue('accessibility.signalOptions.experimental.delays.general');
		}
		return modality === 'sound' ? value.sound : value.announcement;
	}
}

type EnabledState = 'on' | 'off' | 'auto' | 'userGesture' | 'always' | 'never';
function checkEnabledState(state: EnabledState, getScreenReaderAttached: () => boolean, isTriggeredByUserGesture: boolean): boolean {
	return state === 'on' || state === 'always' || (state === 'auto' && getScreenReaderAttached()) || state === 'userGesture' && isTriggeredByUserGesture;
}

/**
 * Play the given audio url.
 * @volume value between 0 and 1
 */
function playAudio(url: string, volume: number): Promise<HTMLAudioElement> {
	return new Promise((resolve, reject) => {
		const audio = new Audio(url);
		audio.volume = volume;
		audio.addEventListener('ended', () => {
			resolve(audio);
		});
		audio.addEventListener('error', (e) => {
			// When the error event fires, ended might not be called
			reject(e.error);
		});
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
	private static register(options: { fileName: string }): Sound {
		const sound = new Sound(options.fileName);
		return sound;
	}

	public static readonly error = Sound.register({ fileName: 'error.mp3' });
	public static readonly warning = Sound.register({ fileName: 'warning.mp3' });
	public static readonly success = Sound.register({ fileName: 'success.mp3' });
	public static readonly foldedArea = Sound.register({ fileName: 'foldedAreas.mp3' });
	public static readonly break = Sound.register({ fileName: 'break.mp3' });
	public static readonly quickFixes = Sound.register({ fileName: 'quickFixes.mp3' });
	public static readonly taskCompleted = Sound.register({ fileName: 'taskCompleted.mp3' });
	public static readonly taskFailed = Sound.register({ fileName: 'taskFailed.mp3' });
	public static readonly terminalBell = Sound.register({ fileName: 'terminalBell.mp3' });
	public static readonly diffLineInserted = Sound.register({ fileName: 'diffLineInserted.mp3' });
	public static readonly diffLineDeleted = Sound.register({ fileName: 'diffLineDeleted.mp3' });
	public static readonly diffLineModified = Sound.register({ fileName: 'diffLineModified.mp3' });
	public static readonly requestSent = Sound.register({ fileName: 'requestSent.mp3' });
	public static readonly responseReceived1 = Sound.register({ fileName: 'responseReceived1.mp3' });
	public static readonly responseReceived2 = Sound.register({ fileName: 'responseReceived2.mp3' });
	public static readonly responseReceived3 = Sound.register({ fileName: 'responseReceived3.mp3' });
	public static readonly responseReceived4 = Sound.register({ fileName: 'responseReceived4.mp3' });
	public static readonly clear = Sound.register({ fileName: 'clear.mp3' });
	public static readonly save = Sound.register({ fileName: 'save.mp3' });
	public static readonly format = Sound.register({ fileName: 'format.mp3' });
	public static readonly voiceRecordingStarted = Sound.register({ fileName: 'voiceRecordingStarted.mp3' });
	public static readonly voiceRecordingStopped = Sound.register({ fileName: 'voiceRecordingStopped.mp3' });
	public static readonly progress = Sound.register({ fileName: 'progress.mp3' });
	public static readonly chatEditModifiedFile = Sound.register({ fileName: 'chatEditModifiedFile.mp3' });
	public static readonly editsKept = Sound.register({ fileName: 'editsKept.mp3' });
	public static readonly editsUndone = Sound.register({ fileName: 'editsUndone.mp3' });
	public static readonly nextEditSuggestion = Sound.register({ fileName: 'nextEditSuggestion.mp3' });
	public static readonly terminalCommandSucceeded = Sound.register({ fileName: 'terminalCommandSucceeded.mp3' });

	private constructor(public readonly fileName: string) { }
}

export class SoundSource {
	constructor(
		public readonly randomOneOf: Sound[]
	) { }

	public getSound(deterministic = false): Sound {
		if (deterministic || this.randomOneOf.length === 1) {
			return this.randomOneOf[0];
		} else {
			const index = Math.floor(Math.random() * this.randomOneOf.length);
			return this.randomOneOf[index];
		}
	}
}

export class AccessibilitySignal {
	private constructor(
		public readonly sound: SoundSource,
		public readonly name: string,
		public readonly legacySoundSettingsKey: string | undefined,
		public readonly settingsKey: string,
		public readonly legacyAnnouncementSettingsKey: string | undefined,
		public readonly announcementMessage: string | undefined
	) { }

	private static _signals = new Set<AccessibilitySignal>();
	private static register(options: {
		name: string;
		sound: Sound | {
			/**
			 * Gaming and other apps often play a sound variant when the same event happens again
			 * for an improved experience. This option enables playing a random sound.
			 */
			randomOneOf: Sound[];
		};
		legacySoundSettingsKey?: string;
		settingsKey: string;
		legacyAnnouncementSettingsKey?: string;
		announcementMessage?: string;
		delaySettingsKey?: string;
	}): AccessibilitySignal {
		const soundSource = new SoundSource('randomOneOf' in options.sound ? options.sound.randomOneOf : [options.sound]);
		const signal = new AccessibilitySignal(
			soundSource,
			options.name,
			options.legacySoundSettingsKey,
			options.settingsKey,
			options.legacyAnnouncementSettingsKey,
			options.announcementMessage,
		);
		AccessibilitySignal._signals.add(signal);
		return signal;
	}

	public static get allAccessibilitySignals() {
		return [...this._signals];
	}

	public static readonly errorAtPosition = AccessibilitySignal.register({
		name: localize('accessibilitySignals.positionHasError.name', 'Error at Position'),
		sound: Sound.error,
		announcementMessage: localize('accessibility.signals.positionHasError', 'Error'),
		settingsKey: 'accessibility.signals.positionHasError',
		delaySettingsKey: 'accessibility.signalOptions.delays.errorAtPosition'
	});
	public static readonly warningAtPosition = AccessibilitySignal.register({
		name: localize('accessibilitySignals.positionHasWarning.name', 'Warning at Position'),
		sound: Sound.warning,
		announcementMessage: localize('accessibility.signals.positionHasWarning', 'Warning'),
		settingsKey: 'accessibility.signals.positionHasWarning',
		delaySettingsKey: 'accessibility.signalOptions.delays.warningAtPosition'
	});

	public static readonly errorOnLine = AccessibilitySignal.register({
		name: localize('accessibilitySignals.lineHasError.name', 'Error on Line'),
		sound: Sound.error,
		legacySoundSettingsKey: 'audioCues.lineHasError',
		legacyAnnouncementSettingsKey: 'accessibility.alert.error',
		announcementMessage: localize('accessibility.signals.lineHasError', 'Error on Line'),
		settingsKey: 'accessibility.signals.lineHasError',
	});

	public static readonly warningOnLine = AccessibilitySignal.register({
		name: localize('accessibilitySignals.lineHasWarning.name', 'Warning on Line'),
		sound: Sound.warning,
		legacySoundSettingsKey: 'audioCues.lineHasWarning',
		legacyAnnouncementSettingsKey: 'accessibility.alert.warning',
		announcementMessage: localize('accessibility.signals.lineHasWarning', 'Warning on Line'),
		settingsKey: 'accessibility.signals.lineHasWarning',
	});
	public static readonly foldedArea = AccessibilitySignal.register({
		name: localize('accessibilitySignals.lineHasFoldedArea.name', 'Folded Area on Line'),
		sound: Sound.foldedArea,
		legacySoundSettingsKey: 'audioCues.lineHasFoldedArea',
		legacyAnnouncementSettingsKey: 'accessibility.alert.foldedArea',
		announcementMessage: localize('accessibility.signals.lineHasFoldedArea', 'Folded'),
		settingsKey: 'accessibility.signals.lineHasFoldedArea',
	});
	public static readonly break = AccessibilitySignal.register({
		name: localize('accessibilitySignals.lineHasBreakpoint.name', 'Breakpoint on Line'),
		sound: Sound.break,
		legacySoundSettingsKey: 'audioCues.lineHasBreakpoint',
		legacyAnnouncementSettingsKey: 'accessibility.alert.breakpoint',
		announcementMessage: localize('accessibility.signals.lineHasBreakpoint', 'Breakpoint'),
		settingsKey: 'accessibility.signals.lineHasBreakpoint',
	});
	public static readonly inlineSuggestion = AccessibilitySignal.register({
		name: localize('accessibilitySignals.lineHasInlineSuggestion.name', 'Inline Suggestion on Line'),
		sound: Sound.quickFixes,
		legacySoundSettingsKey: 'audioCues.lineHasInlineSuggestion',
		settingsKey: 'accessibility.signals.lineHasInlineSuggestion',
	});
	public static readonly nextEditSuggestion = AccessibilitySignal.register({
		name: localize('accessibilitySignals.nextEditSuggestion.name', 'Next Edit Suggestion on Line'),
		sound: Sound.nextEditSuggestion,
		legacySoundSettingsKey: 'audioCues.nextEditSuggestion',
		settingsKey: 'accessibility.signals.nextEditSuggestion',
		announcementMessage: localize('accessibility.signals.nextEditSuggestion', 'Next Edit Suggestion'),
	});
	public static readonly terminalQuickFix = AccessibilitySignal.register({
		name: localize('accessibilitySignals.terminalQuickFix.name', 'Terminal Quick Fix'),
		sound: Sound.quickFixes,
		legacySoundSettingsKey: 'audioCues.terminalQuickFix',
		legacyAnnouncementSettingsKey: 'accessibility.alert.terminalQuickFix',
		announcementMessage: localize('accessibility.signals.terminalQuickFix', 'Quick Fix'),
		settingsKey: 'accessibility.signals.terminalQuickFix',
	});

	public static readonly onDebugBreak = AccessibilitySignal.register({
		name: localize('accessibilitySignals.onDebugBreak.name', 'Debugger Stopped on Breakpoint'),
		sound: Sound.break,
		legacySoundSettingsKey: 'audioCues.onDebugBreak',
		legacyAnnouncementSettingsKey: 'accessibility.alert.onDebugBreak',
		announcementMessage: localize('accessibility.signals.onDebugBreak', 'Breakpoint'),
		settingsKey: 'accessibility.signals.onDebugBreak',
	});

	public static readonly noInlayHints = AccessibilitySignal.register({
		name: localize('accessibilitySignals.noInlayHints', 'No Inlay Hints on Line'),
		sound: Sound.error,
		legacySoundSettingsKey: 'audioCues.noInlayHints',
		legacyAnnouncementSettingsKey: 'accessibility.alert.noInlayHints',
		announcementMessage: localize('accessibility.signals.noInlayHints', 'No Inlay Hints'),
		settingsKey: 'accessibility.signals.noInlayHints',
	});

	public static readonly taskCompleted = AccessibilitySignal.register({
		name: localize('accessibilitySignals.taskCompleted', 'Task Completed'),
		sound: Sound.taskCompleted,
		legacySoundSettingsKey: 'audioCues.taskCompleted',
		legacyAnnouncementSettingsKey: 'accessibility.alert.taskCompleted',
		announcementMessage: localize('accessibility.signals.taskCompleted', 'Task Completed'),
		settingsKey: 'accessibility.signals.taskCompleted',
	});

	public static readonly taskFailed = AccessibilitySignal.register({
		name: localize('accessibilitySignals.taskFailed', 'Task Failed'),
		sound: Sound.taskFailed,
		legacySoundSettingsKey: 'audioCues.taskFailed',
		legacyAnnouncementSettingsKey: 'accessibility.alert.taskFailed',
		announcementMessage: localize('accessibility.signals.taskFailed', 'Task Failed'),
		settingsKey: 'accessibility.signals.taskFailed',
	});

	public static readonly terminalCommandFailed = AccessibilitySignal.register({
		name: localize('accessibilitySignals.terminalCommandFailed', 'Terminal Command Failed'),
		sound: Sound.error,
		legacySoundSettingsKey: 'audioCues.terminalCommandFailed',
		legacyAnnouncementSettingsKey: 'accessibility.alert.terminalCommandFailed',
		announcementMessage: localize('accessibility.signals.terminalCommandFailed', 'Command Failed'),
		settingsKey: 'accessibility.signals.terminalCommandFailed',
	});

	public static readonly terminalCommandSucceeded = AccessibilitySignal.register({
		name: localize('accessibilitySignals.terminalCommandSucceeded', 'Terminal Command Succeeded'),
		sound: Sound.terminalCommandSucceeded,
		announcementMessage: localize('accessibility.signals.terminalCommandSucceeded', 'Command Succeeded'),
		settingsKey: 'accessibility.signals.terminalCommandSucceeded',
	});

	public static readonly terminalBell = AccessibilitySignal.register({
		name: localize('accessibilitySignals.terminalBell', 'Terminal Bell'),
		sound: Sound.terminalBell,
		legacySoundSettingsKey: 'audioCues.terminalBell',
		legacyAnnouncementSettingsKey: 'accessibility.alert.terminalBell',
		announcementMessage: localize('accessibility.signals.terminalBell', 'Terminal Bell'),
		settingsKey: 'accessibility.signals.terminalBell',
	});

	public static readonly notebookCellCompleted = AccessibilitySignal.register({
		name: localize('accessibilitySignals.notebookCellCompleted', 'Notebook Cell Completed'),
		sound: Sound.taskCompleted,
		legacySoundSettingsKey: 'audioCues.notebookCellCompleted',
		legacyAnnouncementSettingsKey: 'accessibility.alert.notebookCellCompleted',
		announcementMessage: localize('accessibility.signals.notebookCellCompleted', 'Notebook Cell Completed'),
		settingsKey: 'accessibility.signals.notebookCellCompleted',
	});

	public static readonly notebookCellFailed = AccessibilitySignal.register({
		name: localize('accessibilitySignals.notebookCellFailed', 'Notebook Cell Failed'),
		sound: Sound.taskFailed,
		legacySoundSettingsKey: 'audioCues.notebookCellFailed',
		legacyAnnouncementSettingsKey: 'accessibility.alert.notebookCellFailed',
		announcementMessage: localize('accessibility.signals.notebookCellFailed', 'Notebook Cell Failed'),
		settingsKey: 'accessibility.signals.notebookCellFailed',
	});

	public static readonly diffLineInserted = AccessibilitySignal.register({
		name: localize('accessibilitySignals.diffLineInserted', 'Diff Line Inserted'),
		sound: Sound.diffLineInserted,
		legacySoundSettingsKey: 'audioCues.diffLineInserted',
		settingsKey: 'accessibility.signals.diffLineInserted',
	});

	public static readonly diffLineDeleted = AccessibilitySignal.register({
		name: localize('accessibilitySignals.diffLineDeleted', 'Diff Line Deleted'),
		sound: Sound.diffLineDeleted,
		legacySoundSettingsKey: 'audioCues.diffLineDeleted',
		settingsKey: 'accessibility.signals.diffLineDeleted',
	});

	public static readonly diffLineModified = AccessibilitySignal.register({
		name: localize('accessibilitySignals.diffLineModified', 'Diff Line Modified'),
		sound: Sound.diffLineModified,
		legacySoundSettingsKey: 'audioCues.diffLineModified',
		settingsKey: 'accessibility.signals.diffLineModified',
	});

	public static readonly chatEditModifiedFile = AccessibilitySignal.register({
		name: localize('accessibilitySignals.chatEditModifiedFile', 'Chat Edit Modified File'),
		sound: Sound.chatEditModifiedFile,
		announcementMessage: localize('accessibility.signals.chatEditModifiedFile', 'File Modified from Chat Edits'),
		settingsKey: 'accessibility.signals.chatEditModifiedFile',
	});

	public static readonly chatRequestSent = AccessibilitySignal.register({
		name: localize('accessibilitySignals.chatRequestSent', 'Chat Request Sent'),
		sound: Sound.requestSent,
		legacySoundSettingsKey: 'audioCues.chatRequestSent',
		legacyAnnouncementSettingsKey: 'accessibility.alert.chatRequestSent',
		announcementMessage: localize('accessibility.signals.chatRequestSent', 'Chat Request Sent'),
		settingsKey: 'accessibility.signals.chatRequestSent',
	});

	public static readonly chatResponseReceived = AccessibilitySignal.register({
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
	});

	public static readonly codeActionTriggered = AccessibilitySignal.register({
		name: localize('accessibilitySignals.codeActionRequestTriggered', 'Code Action Request Triggered'),
		sound: Sound.voiceRecordingStarted,
		legacySoundSettingsKey: 'audioCues.codeActionRequestTriggered',
		legacyAnnouncementSettingsKey: 'accessibility.alert.codeActionRequestTriggered',
		announcementMessage: localize('accessibility.signals.codeActionRequestTriggered', 'Code Action Request Triggered'),
		settingsKey: 'accessibility.signals.codeActionTriggered',
	});

	public static readonly codeActionApplied = AccessibilitySignal.register({
		name: localize('accessibilitySignals.codeActionApplied', 'Code Action Applied'),
		legacySoundSettingsKey: 'audioCues.codeActionApplied',
		sound: Sound.voiceRecordingStopped,
		settingsKey: 'accessibility.signals.codeActionApplied'
	});


	public static readonly progress = AccessibilitySignal.register({
		name: localize('accessibilitySignals.progress', 'Progress'),
		sound: Sound.progress,
		legacySoundSettingsKey: 'audioCues.chatResponsePending',
		legacyAnnouncementSettingsKey: 'accessibility.alert.progress',
		announcementMessage: localize('accessibility.signals.progress', 'Progress'),
		settingsKey: 'accessibility.signals.progress'
	});

	public static readonly clear = AccessibilitySignal.register({
		name: localize('accessibilitySignals.clear', 'Clear'),
		sound: Sound.clear,
		legacySoundSettingsKey: 'audioCues.clear',
		legacyAnnouncementSettingsKey: 'accessibility.alert.clear',
		announcementMessage: localize('accessibility.signals.clear', 'Clear'),
		settingsKey: 'accessibility.signals.clear'
	});

	public static readonly save = AccessibilitySignal.register({
		name: localize('accessibilitySignals.save', 'Save'),
		sound: Sound.save,
		legacySoundSettingsKey: 'audioCues.save',
		legacyAnnouncementSettingsKey: 'accessibility.alert.save',
		announcementMessage: localize('accessibility.signals.save', 'Save'),
		settingsKey: 'accessibility.signals.save'
	});

	public static readonly format = AccessibilitySignal.register({
		name: localize('accessibilitySignals.format', 'Format'),
		sound: Sound.format,
		legacySoundSettingsKey: 'audioCues.format',
		legacyAnnouncementSettingsKey: 'accessibility.alert.format',
		announcementMessage: localize('accessibility.signals.format', 'Format'),
		settingsKey: 'accessibility.signals.format'
	});

	public static readonly voiceRecordingStarted = AccessibilitySignal.register({
		name: localize('accessibilitySignals.voiceRecordingStarted', 'Voice Recording Started'),
		sound: Sound.voiceRecordingStarted,
		legacySoundSettingsKey: 'audioCues.voiceRecordingStarted',
		settingsKey: 'accessibility.signals.voiceRecordingStarted'
	});

	public static readonly voiceRecordingStopped = AccessibilitySignal.register({
		name: localize('accessibilitySignals.voiceRecordingStopped', 'Voice Recording Stopped'),
		sound: Sound.voiceRecordingStopped,
		legacySoundSettingsKey: 'audioCues.voiceRecordingStopped',
		settingsKey: 'accessibility.signals.voiceRecordingStopped'
	});

	public static readonly editsKept = AccessibilitySignal.register({
		name: localize('accessibilitySignals.editsKept', 'Edits Kept'),
		sound: Sound.editsKept,
		announcementMessage: localize('accessibility.signals.editsKept', 'Edits Kept'),
		settingsKey: 'accessibility.signals.editsKept',
	});

	public static readonly editsUndone = AccessibilitySignal.register({
		name: localize('accessibilitySignals.editsUndone', 'Undo Edits'),
		sound: Sound.editsUndone,
		announcementMessage: localize('accessibility.signals.editsUndone', 'Edits Undone'),
		settingsKey: 'accessibility.signals.editsUndone',
	});
}
