/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { FileAccess } from 'vs/base/common/network';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';
import { localize } from 'vs/nls';
import { observableFromEvent, derived } from 'vs/base/common/observable';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

export const IAccessibilitySignalService = createDecorator<IAccessibilitySignalService>('accessibilitySignalService');

export interface IAccessibilitySignalService {
	readonly _serviceBrand: undefined;
	playSignal(signal: AccessibilitySignal, options?: IAccessbilitySignalOptions): Promise<void>;
	playSignals(signals: (AccessibilitySignal | { signal: AccessibilitySignal; source: string })[]): Promise<void>;
	isSoundEnabled(signal: AccessibilitySignal): boolean;
	isAnnouncementEnabled(signal: AccessibilitySignal): boolean;
	onSoundEnabledChanged(signal: AccessibilitySignal): Event<void>;
	onAnnouncementEnabledChanged(signal: AccessibilitySignal): Event<void>;

	playSound(signal: Sound, allowManyInParallel?: boolean): Promise<void>;
	playSignalLoop(signal: AccessibilitySignal, milliseconds: number): IDisposable;
}

export interface IAccessbilitySignalOptions {
	allowManyInParallel?: boolean;

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
	private readonly screenReaderAttached = observableFromEvent(
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

	public async playSignal(signal: AccessibilitySignal, options: IAccessbilitySignalOptions = {}): Promise<void> {
		const announcementMessage = signal.announcementMessage;
		if (this.isAnnouncementEnabled(signal, options.userGesture) && announcementMessage) {
			this.accessibilityService.status(announcementMessage);
		}

		if (this.isSoundEnabled(signal, options.userGesture)) {
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
		const volume = this.configurationService.getValue<number>('accessibilitySignals.volume');
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

	private readonly obsoleteAccessibilitySignalsEnabled = observableFromEvent(
		Event.filter(this.configurationService.onDidChangeConfiguration, (e) =>
			e.affectsConfiguration('accessibilitySignals.enabled')
		),
		() => /** @description config: accessibilitySignals.enabled */ this.configurationService.getValue<'on' | 'off' | 'auto' | 'userGesture' | 'always' | 'never'>('accessibilitySignals.enabled')
	);

	private readonly isSoundEnabledCache = new Cache((event: { readonly signal: AccessibilitySignal; readonly userGesture?: boolean }) => {
		const settingObservable = observableFromEvent(
			Event.filter(this.configurationService.onDidChangeConfiguration, (e) =>
				e.affectsConfiguration(event.signal.legacySoundSettingsKey) || e.affectsConfiguration(event.signal.settingsKey)
			),
			() => this.configurationService.getValue<'on' | 'off' | 'auto' | 'userGesture' | 'always' | 'never'>(event.signal.settingsKey + '.sound')
		);
		return derived(reader => {
			/** @description sound enabled */
			const setting = settingObservable.read(reader);
			if (
				setting === 'on' ||
				(setting === 'auto' && this.screenReaderAttached.read(reader))
			) {
				return true;
			} else if (setting === 'always' || setting === 'userGesture' && event.userGesture) {
				return true;
			}

			const obsoleteSetting = this.obsoleteAccessibilitySignalsEnabled.read(reader);
			if (
				obsoleteSetting === 'on' ||
				(obsoleteSetting === 'auto' && this.screenReaderAttached.read(reader))
			) {
				return true;
			}

			return false;
		});
	}, JSON.stringify);

	private readonly isAnnouncementEnabledCache = new Cache((event: { readonly signal: AccessibilitySignal; readonly userGesture?: boolean }) => {
		const settingObservable = observableFromEvent(
			Event.filter(this.configurationService.onDidChangeConfiguration, (e) =>
				e.affectsConfiguration(event.signal.legacyAnnouncementSettingsKey!) || e.affectsConfiguration(event.signal.settingsKey)
			),
			() => event.signal.announcementMessage ? this.configurationService.getValue<'auto' | 'off' | 'userGesture' | 'always' | 'never'>(event.signal.settingsKey + '.announcement') : false
		);
		return derived(reader => {
			/** @description announcement enabled */
			const setting = settingObservable.read(reader);
			if (
				!this.screenReaderAttached.read(reader)
			) {
				return false;
			}
			return setting === 'auto' || setting === 'always' || setting === 'userGesture' && event.userGesture;
		});
	}, JSON.stringify);

	public isAnnouncementEnabled(signal: AccessibilitySignal, userGesture?: boolean): boolean {
		if (!signal.announcementMessage) {
			return false;
		}
		return this.isAnnouncementEnabledCache.get({ signal, userGesture }).get() ?? false;
	}

	public isSoundEnabled(signal: AccessibilitySignal, userGesture?: boolean): boolean {
		return this.isSoundEnabledCache.get({ signal, userGesture }).get() ?? false;
	}

	public onSoundEnabledChanged(signal: AccessibilitySignal): Event<void> {
		return Event.fromObservableLight(this.isSoundEnabledCache.get({ signal }));
	}

	public onAnnouncementEnabledChanged(signal: AccessibilitySignal): Event<void> {
		return Event.fromObservableLight(this.isAnnouncementEnabledCache.get({ signal }));
	}
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

class Cache<TArg, TValue> {
	private readonly map = new Map<unknown, TValue>();
	constructor(private readonly getValue: (value: TArg) => TValue, private readonly getKey: (value: TArg) => unknown) {
	}

	public get(arg: TArg): TValue {
		if (this.map.has(arg)) {
			return this.map.get(arg)!;
		}

		const value = this.getValue(arg);
		const key = this.getKey(arg);
		this.map.set(key, value);
		return value;
	}
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
	public static readonly foldedArea = Sound.register({ fileName: 'foldedAreas.mp3' });
	public static readonly break = Sound.register({ fileName: 'break.mp3' });
	public static readonly quickFixes = Sound.register({ fileName: 'quickFixes.mp3' });
	public static readonly taskCompleted = Sound.register({ fileName: 'taskCompleted.mp3' });
	public static readonly taskFailed = Sound.register({ fileName: 'taskFailed.mp3' });
	public static readonly terminalBell = Sound.register({ fileName: 'terminalBell.mp3' });
	public static readonly diffLineInserted = Sound.register({ fileName: 'diffLineInserted.mp3' });
	public static readonly diffLineDeleted = Sound.register({ fileName: 'diffLineDeleted.mp3' });
	public static readonly diffLineModified = Sound.register({ fileName: 'diffLineModified.mp3' });
	public static readonly chatRequestSent = Sound.register({ fileName: 'chatRequestSent.mp3' });
	public static readonly chatResponsePending = Sound.register({ fileName: 'chatResponsePending.mp3' });
	public static readonly chatResponseReceived1 = Sound.register({ fileName: 'chatResponseReceived1.mp3' });
	public static readonly chatResponseReceived2 = Sound.register({ fileName: 'chatResponseReceived2.mp3' });
	public static readonly chatResponseReceived3 = Sound.register({ fileName: 'chatResponseReceived3.mp3' });
	public static readonly chatResponseReceived4 = Sound.register({ fileName: 'chatResponseReceived4.mp3' });
	public static readonly clear = Sound.register({ fileName: 'clear.mp3' });
	public static readonly save = Sound.register({ fileName: 'save.mp3' });
	public static readonly format = Sound.register({ fileName: 'format.mp3' });
	public static readonly voiceRecordingStarted = Sound.register({ fileName: 'voiceRecordingStarted.mp3' });
	public static readonly voiceRecordingStopped = Sound.register({ fileName: 'voiceRecordingStopped.mp3' });

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

export const enum AccessibilityAlertSettingId {
	Save = 'accessibility.alert.save',
	Format = 'accessibility.alert.format',
	Clear = 'accessibility.alert.clear',
	Breakpoint = 'accessibility.alert.breakpoint',
	Error = 'accessibility.alert.error',
	Warning = 'accessibility.alert.warning',
	FoldedArea = 'accessibility.alert.foldedArea',
	TerminalQuickFix = 'accessibility.alert.terminalQuickFix',
	TerminalBell = 'accessibility.alert.terminalBell',
	TerminalCommandFailed = 'accessibility.alert.terminalCommandFailed',
	TaskCompleted = 'accessibility.alert.taskCompleted',
	TaskFailed = 'accessibility.alert.taskFailed',
	ChatRequestSent = 'accessibility.alert.chatRequestSent',
	NotebookCellCompleted = 'accessibility.alert.notebookCellCompleted',
	NotebookCellFailed = 'accessibility.alert.notebookCellFailed',
	OnDebugBreak = 'accessibility.alert.onDebugBreak',
	NoInlayHints = 'accessibility.alert.noInlayHints',
	LineHasBreakpoint = 'accessibility.alert.lineHasBreakpoint',
	ChatResponsePending = 'accessibility.alert.chatResponsePending'
}


export class AccessibilitySignal {
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
		legacySoundSettingsKey: string;
		settingsKey: string;
		legacyAnnouncementSettingsKey?: AccessibilityAlertSettingId;
		announcementMessage?: string;
	}): AccessibilitySignal {
		const soundSource = new SoundSource('randomOneOf' in options.sound ? options.sound.randomOneOf : [options.sound]);
		const signal = new AccessibilitySignal(soundSource, options.name, options.legacySoundSettingsKey, options.settingsKey, options.legacyAnnouncementSettingsKey, options.announcementMessage);
		AccessibilitySignal._signals.add(signal);
		return signal;
	}

	public static get allAccessibilitySignals() {
		return [...this._signals];
	}

	public static readonly error = AccessibilitySignal.register({
		name: localize('accessibilitySignals.lineHasError.name', 'Error on Line'),
		sound: Sound.error,
		legacySoundSettingsKey: 'audioCues.lineHasError',
		legacyAnnouncementSettingsKey: AccessibilityAlertSettingId.Error,
		announcementMessage: localize('accessibility.signals.lineHasError', 'Error'),
		settingsKey: 'accessibility.signals.lineHasError'
	});
	public static readonly warning = AccessibilitySignal.register({
		name: localize('accessibilitySignals.lineHasWarning.name', 'Warning on Line'),
		sound: Sound.warning,
		legacySoundSettingsKey: 'audioCues.lineHasWarning',
		legacyAnnouncementSettingsKey: AccessibilityAlertSettingId.Warning,
		announcementMessage: localize('accessibility.signals.lineHasWarning', 'Warning'),
		settingsKey: 'accessibility.signals.lineHasWarning'
	});
	public static readonly foldedArea = AccessibilitySignal.register({
		name: localize('accessibilitySignals.lineHasFoldedArea.name', 'Folded Area on Line'),
		sound: Sound.foldedArea,
		legacySoundSettingsKey: 'audioCues.lineHasFoldedArea',
		legacyAnnouncementSettingsKey: AccessibilityAlertSettingId.FoldedArea,
		announcementMessage: localize('accessibility.signals.lineHasFoldedArea', 'Folded'),
		settingsKey: 'accessibility.signals.lineHasFoldedArea'
	});
	public static readonly break = AccessibilitySignal.register({
		name: localize('accessibilitySignals.lineHasBreakpoint.name', 'Breakpoint on Line'),
		sound: Sound.break,
		legacySoundSettingsKey: 'audioCues.lineHasBreakpoint',
		legacyAnnouncementSettingsKey: AccessibilityAlertSettingId.Breakpoint,
		announcementMessage: localize('accessibility.signals.lineHasBreakpoint', 'Breakpoint'),
		settingsKey: 'accessibility.signals.lineHasBreakpoint'
	});
	public static readonly inlineSuggestion = AccessibilitySignal.register({
		name: localize('accessibilitySignals.lineHasInlineSuggestion.name', 'Inline Suggestion on Line'),
		sound: Sound.quickFixes,
		legacySoundSettingsKey: 'audioCues.lineHasInlineSuggestion',
		settingsKey: 'accessibility.signals.lineHasInlineSuggestion'
	});

	public static readonly terminalQuickFix = AccessibilitySignal.register({
		name: localize('accessibilitySignals.terminalQuickFix.name', 'Terminal Quick Fix'),
		sound: Sound.quickFixes,
		legacySoundSettingsKey: 'audioCues.terminalQuickFix',
		legacyAnnouncementSettingsKey: AccessibilityAlertSettingId.TerminalQuickFix,
		announcementMessage: localize('accessibility.signals.terminalQuickFix', 'Quick Fix'),
		settingsKey: 'accessibility.signals.terminalQuickFix'
	});

	public static readonly onDebugBreak = AccessibilitySignal.register({
		name: localize('accessibilitySignals.onDebugBreak.name', 'Debugger Stopped on Breakpoint'),
		sound: Sound.break,
		legacySoundSettingsKey: 'audioCues.onDebugBreak',
		legacyAnnouncementSettingsKey: AccessibilityAlertSettingId.OnDebugBreak,
		announcementMessage: localize('accessibility.signals.onDebugBreak', 'Breakpoint'),
		settingsKey: 'accessibility.signals.onDebugBreak'
	});

	public static readonly noInlayHints = AccessibilitySignal.register({
		name: localize('accessibilitySignals.noInlayHints', 'No Inlay Hints on Line'),
		sound: Sound.error,
		legacySoundSettingsKey: 'audioCues.noInlayHints',
		legacyAnnouncementSettingsKey: AccessibilityAlertSettingId.NoInlayHints,
		announcementMessage: localize('accessibility.signals.noInlayHints', 'No Inlay Hints'),
		settingsKey: 'accessibility.signals.noInlayHints'
	});

	public static readonly taskCompleted = AccessibilitySignal.register({
		name: localize('accessibilitySignals.taskCompleted', 'Task Completed'),
		sound: Sound.taskCompleted,
		legacySoundSettingsKey: 'audioCues.taskCompleted',
		legacyAnnouncementSettingsKey: AccessibilityAlertSettingId.TaskCompleted,
		announcementMessage: localize('accessibility.signals.taskCompleted', 'Task Completed'),
		settingsKey: 'accessibility.signals.taskCompleted'
	});

	public static readonly taskFailed = AccessibilitySignal.register({
		name: localize('accessibilitySignals.taskFailed', 'Task Failed'),
		sound: Sound.taskFailed,
		legacySoundSettingsKey: 'audioCues.taskFailed',
		legacyAnnouncementSettingsKey: AccessibilityAlertSettingId.TaskFailed,
		announcementMessage: localize('accessibility.signals.taskFailed', 'Task Failed'),
		settingsKey: 'accessibility.signals.taskFailed'
	});

	public static readonly terminalCommandFailed = AccessibilitySignal.register({
		name: localize('accessibilitySignals.terminalCommandFailed', 'Terminal Command Failed'),
		sound: Sound.error,
		legacySoundSettingsKey: 'audioCues.terminalCommandFailed',
		legacyAnnouncementSettingsKey: AccessibilityAlertSettingId.TerminalCommandFailed,
		announcementMessage: localize('accessibility.signals.terminalCommandFailed', 'Command Failed'),
		settingsKey: 'accessibility.signals.terminalCommandFailed'
	});

	public static readonly terminalBell = AccessibilitySignal.register({
		name: localize('accessibilitySignals.terminalBell', 'Terminal Bell'),
		sound: Sound.terminalBell,
		legacySoundSettingsKey: 'audioCues.terminalBell',
		legacyAnnouncementSettingsKey: AccessibilityAlertSettingId.TerminalBell,
		announcementMessage: localize('accessibility.signals.terminalBell', 'Terminal Bell'),
		settingsKey: 'accessibility.signals.terminalBell'
	});

	public static readonly notebookCellCompleted = AccessibilitySignal.register({
		name: localize('accessibilitySignals.notebookCellCompleted', 'Notebook Cell Completed'),
		sound: Sound.taskCompleted,
		legacySoundSettingsKey: 'audioCues.notebookCellCompleted',
		legacyAnnouncementSettingsKey: AccessibilityAlertSettingId.NotebookCellCompleted,
		announcementMessage: localize('accessibility.signals.notebookCellCompleted', 'Notebook Cell Completed'),
		settingsKey: 'accessibility.signals.notebookCellCompleted'
	});

	public static readonly notebookCellFailed = AccessibilitySignal.register({
		name: localize('accessibilitySignals.notebookCellFailed', 'Notebook Cell Failed'),
		sound: Sound.taskFailed,
		legacySoundSettingsKey: 'audioCues.notebookCellFailed',
		legacyAnnouncementSettingsKey: AccessibilityAlertSettingId.NotebookCellFailed,
		announcementMessage: localize('accessibility.signals.notebookCellFailed', 'Notebook Cell Failed'),
		settingsKey: 'accessibility.signals.notebookCellFailed'
	});

	public static readonly diffLineInserted = AccessibilitySignal.register({
		name: localize('accessibilitySignals.diffLineInserted', 'Diff Line Inserted'),
		sound: Sound.diffLineInserted,
		legacySoundSettingsKey: 'audioCues.diffLineInserted',
		settingsKey: 'accessibility.signals.diffLineInserted'
	});

	public static readonly diffLineDeleted = AccessibilitySignal.register({
		name: localize('accessibilitySignals.diffLineDeleted', 'Diff Line Deleted'),
		sound: Sound.diffLineDeleted,
		legacySoundSettingsKey: 'audioCues.diffLineDeleted',
		settingsKey: 'accessibility.signals.diffLineDeleted'
	});

	public static readonly diffLineModified = AccessibilitySignal.register({
		name: localize('accessibilitySignals.diffLineModified', 'Diff Line Modified'),
		sound: Sound.diffLineModified,
		legacySoundSettingsKey: 'audioCues.diffLineModified',
		settingsKey: 'accessibility.signals.diffLineModified'
	});

	public static readonly chatRequestSent = AccessibilitySignal.register({
		name: localize('accessibilitySignals.chatRequestSent', 'Chat Request Sent'),
		sound: Sound.chatRequestSent,
		legacySoundSettingsKey: 'audioCues.chatRequestSent',
		legacyAnnouncementSettingsKey: AccessibilityAlertSettingId.ChatRequestSent,
		announcementMessage: localize('accessibility.signals.chatRequestSent', 'Chat Request Sent'),
		settingsKey: 'accessibility.signals.chatRequestSent'
	});

	public static readonly chatResponseReceived = AccessibilitySignal.register({
		name: localize('accessibilitySignals.chatResponseReceived', 'Chat Response Received'),
		legacySoundSettingsKey: 'audioCues.chatResponseReceived',
		sound: {
			randomOneOf: [
				Sound.chatResponseReceived1,
				Sound.chatResponseReceived2,
				Sound.chatResponseReceived3,
				Sound.chatResponseReceived4
			]
		},
		settingsKey: 'accessibility.signals.chatResponseReceived'
	});

	public static readonly chatResponsePending = AccessibilitySignal.register({
		name: localize('accessibilitySignals.chatResponsePending', 'Chat Response Pending'),
		sound: Sound.chatResponsePending,
		legacySoundSettingsKey: 'audioCues.chatResponsePending',
		legacyAnnouncementSettingsKey: AccessibilityAlertSettingId.ChatResponsePending,
		announcementMessage: localize('accessibility.signals.chatResponsePending', 'Chat Response Pending'),
		settingsKey: 'accessibility.signals.chatResponsePending'
	});

	public static readonly clear = AccessibilitySignal.register({
		name: localize('accessibilitySignals.clear', 'Clear'),
		sound: Sound.clear,
		legacySoundSettingsKey: 'audioCues.clear',
		legacyAnnouncementSettingsKey: AccessibilityAlertSettingId.Clear,
		announcementMessage: localize('accessibility.signals.clear', 'Clear'),
		settingsKey: 'accessibility.signals.clear'
	});

	public static readonly save = AccessibilitySignal.register({
		name: localize('accessibilitySignals.save', 'Save'),
		sound: Sound.save,
		legacySoundSettingsKey: 'audioCues.save',
		legacyAnnouncementSettingsKey: AccessibilityAlertSettingId.Save,
		announcementMessage: localize('accessibility.signals.save', 'Save'),
		settingsKey: 'accessibility.signals.save'
	});

	public static readonly format = AccessibilitySignal.register({
		name: localize('accessibilitySignals.format', 'Format'),
		sound: Sound.format,
		legacySoundSettingsKey: 'audioCues.format',
		legacyAnnouncementSettingsKey: AccessibilityAlertSettingId.Format,
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

	private constructor(
		public readonly sound: SoundSource,
		public readonly name: string,
		public readonly legacySoundSettingsKey: string,
		public readonly settingsKey: string,
		public readonly legacyAnnouncementSettingsKey?: string,
		public readonly announcementMessage?: string,
	) { }
}
