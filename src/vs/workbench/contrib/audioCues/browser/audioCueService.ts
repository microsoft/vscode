/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from 'vs/base/common/async';
import { Disposable } from 'vs/base/common/lifecycle';
import { FileAccess } from 'vs/base/common/network';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { observableFromEvent, IObservable, LazyDerived } from 'vs/workbench/contrib/audioCues/browser/observable';
import { Event } from 'vs/base/common/event';
import { localize } from 'vs/nls';

export const IAudioCueService = createDecorator<IAudioCueService>('audioCue');

export interface IAudioCueService {
	readonly _serviceBrand: undefined;
	playAudioCue(cue: AudioCue): Promise<void>;
	isEnabled(cue: AudioCue): IObservable<boolean>;
}

export class AudioCueService extends Disposable implements IAudioCueService {
	readonly _serviceBrand: undefined;

	private readonly screenReaderAttached = observableFromEvent(
		this.accessibilityService.onDidChangeScreenReaderOptimized,
		() => this.accessibilityService.isScreenReaderOptimized()
	);

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService
	) {
		super();
	}

	public async playAudioCue(cue: AudioCue): Promise<void> {
		if (this.isEnabled(cue).get()) {
			await this.playSound(cue.sound);
		}
	}

	private async playSound(sound: Sound): Promise<void> {
		const url = FileAccess.asBrowserUri(
			`vs/workbench/contrib/audioCues/browser/media/${sound.fileName}`,
			require
		).toString();
		const audio = new Audio(url);

		try {
			try {
				// Don't play when loading takes more than 1s, due to loading, decoding or playing issues.
				// Delayed sounds are very confusing.
				await raceTimeout(audio.play(), 1000);
			} catch (e) {
				console.error('Error while playing sound', e);
			}
		} finally {
			audio.remove();
		}
	}

	private readonly isEnabledCache = new Cache((cue: AudioCue) => {
		const settingObservable = observableFromEvent(
			Event.filter(this.configurationService.onDidChangeConfiguration, (e) =>
				e.affectsConfiguration(cue.settingsKey)
			),
			() => this.configurationService.getValue<'on' | 'off' | 'auto'>(cue.settingsKey)
		);
		return new LazyDerived(reader => {
			const setting = settingObservable.read(reader);
			if (setting === 'auto') {
				return this.screenReaderAttached.read(reader);
			} else if (setting === 'on') {
				return true;
			}
			return false;
		}, 'audio cue enabled');
	});

	public isEnabled(cue: AudioCue): IObservable<boolean> {
		return this.isEnabledCache.get(cue);
	}
}

class Cache<TArg, TValue> {
	private readonly map = new Map<TArg, TValue>();
	constructor(private readonly getValue: (value: TArg) => TValue) {
	}

	public get(arg: TArg): TValue {
		if (this.map.has(arg)) {
			return this.map.get(arg)!;
		}

		const value = this.getValue(arg);
		this.map.set(arg, value);
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


	public static readonly error = Sound.register({ fileName: 'error.opus' });
	public static readonly foldedArea = Sound.register({ fileName: 'foldedAreas.opus' });
	public static readonly break = Sound.register({ fileName: 'break.opus' });
	public static readonly quickFixes = Sound.register({ fileName: 'quickFixes.opus' });

	private constructor(public readonly fileName: string) { }
}

export class AudioCue {
	private static _audioCues = new Set<AudioCue>();

	private static register(options: {
		name: string;
		sound: Sound;
		settingsKey: string;
	}): AudioCue {
		const audioCue = new AudioCue(options.sound, options.name, options.settingsKey);
		AudioCue._audioCues.add(audioCue);
		return audioCue;
	}

	public static get allAudioCues() {
		return [...this._audioCues];
	}

	public static readonly error = AudioCue.register({
		name: localize('audioCues.lineHasError.name', 'Line has Error'),
		sound: Sound.error,
		settingsKey: 'audioCues.lineHasError',
	});
	public static readonly warning = AudioCue.register({
		name: localize('audioCues.lineHasWarning.name', 'Line has Warning'),
		sound: Sound.error,
		settingsKey: 'audioCues.lineHasWarning',
	});
	public static readonly foldedArea = AudioCue.register({
		name: localize('audioCues.lineHasFoldedArea.name', 'Line has Folded Area'),
		sound: Sound.foldedArea,
		settingsKey: 'audioCues.lineHasFoldedArea',
	});
	public static readonly break = AudioCue.register({
		name: localize('audioCues.lineHasBreakpoint.name', 'Line has Breakpoint'),
		sound: Sound.break,
		settingsKey: 'audioCues.lineHasBreakpoint',
	});
	public static readonly inlineSuggestion = AudioCue.register({
		name: localize('audioCues.lineHasInlineSuggestion.name', 'Line has Inline Suggestion Available'),
		sound: Sound.quickFixes,
		settingsKey: 'audioCues.lineHasInlineSuggestion',
	});

	public static readonly debuggerStoppedOnBreakpoint = AudioCue.register({
		name: 'Debugger Stopped On Breakpoint',
		sound: Sound.break,
		settingsKey: 'audioCues.debuggerStoppedOnBreakpoint',
	});

	public static readonly noInlayHints = AudioCue.register({
		name: localize('audioCues.noInlayHints', 'No Inlay Hints available for the current line'),
		sound: Sound.error,
		settingsKey: 'audioCues.noInlayHints'
	});

	private constructor(
		public readonly sound: Sound,
		public readonly name: string,
		public readonly settingsKey: string,
	) { }
}
