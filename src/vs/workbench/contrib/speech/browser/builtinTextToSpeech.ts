/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IBuiltinTextToSpeechEngine, ITextToSpeechEvent, ITextToSpeechSession, ITextToSpeechSessionOptions, TextToSpeechStatus } from '../common/speechService.js';

/**
 * Picks the voice to read with, preferring an exact match on `language` (a
 * BCP-47 tag such as `en-US`) over one on its primary subtag alone. Returns
 * `undefined` when nothing matches, leaving the choice to the platform.
 *
 * Quality is deliberately not ranked: on desktop the on-device engine reads
 * English, so this only serves other languages and the web, where the platform
 * default is the best available guess.
 */
export function pickVoice(voices: readonly SpeechSynthesisVoice[], language: string | undefined): SpeechSynthesisVoice | undefined {
	if (!language) {
		return undefined;
	}

	const wanted = language.toLowerCase().replace(/_/g, '-');
	const langOf = (voice: SpeechSynthesisVoice) => voice.lang.toLowerCase().replace(/_/g, '-');

	return voices.find(voice => langOf(voice) === wanted)
		?? voices.find(voice => langOf(voice).split('-')[0] === wanted.split('-')[0]);
}

/**
 * A text-to-speech session backed by the platform synthesizer. Each call to
 * {@link synthesize} only resolves once its audio finished playing, because
 * callers await it per chunk to keep the spoken response in order.
 */
class BuiltinTextToSpeechSession extends Disposable implements ITextToSpeechSession {

	private readonly _onDidChange = this._register(new Emitter<ITextToSpeechEvent>());
	readonly onDidChange = this._onDidChange.event;

	private active = false;

	constructor(
		private readonly synthesis: SpeechSynthesis,
		private readonly token: CancellationToken,
		private readonly options: ITextToSpeechSessionOptions | undefined,
		private readonly logService: ILogService
	) {
		super();

		this._register(toDisposable(() => this.stop()));
	}

	/** Ties `disposable` to the lifetime of this session. */
	keep(disposable: IDisposable): void {
		this._register(disposable);
	}

	async synthesize(text: string): Promise<void> {
		if (this.token.isCancellationRequested || !text.trim()) {
			return;
		}

		if (!this.active) {
			this.active = true;
			this._onDidChange.fire({ status: TextToSpeechStatus.Started });
		}

		try {
			await this.speak(text);
		} catch (error) {
			this.logService.error(`[speech] built-in text to speech failed: ${error}`);
			this._onDidChange.fire({ status: TextToSpeechStatus.Error, text: String(error) });
		}
	}

	private speak(text: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			const utterance = new SpeechSynthesisUtterance(text);

			const voice = pickVoice(this.synthesis.getVoices(), this.options?.language);
			if (voice) {
				utterance.voice = voice;
			}
			if (this.options?.language) {
				utterance.lang = this.options.language;
			}

			const disposables = new DisposableStore();
			const complete = (error?: Error) => {
				disposables.dispose();

				if (error) {
					reject(error);
				} else {
					resolve();
				}
			};

			disposables.add(toDisposable(() => {
				utterance.onend = null;
				utterance.onerror = null;
			}));
			disposables.add(this.token.onCancellationRequested(() => {
				this.synthesis.cancel();
				complete();
			}));

			utterance.onend = () => complete();
			utterance.onerror = event => {
				// Stopping mid-utterance surfaces as an error, but is expected.
				complete(event.error === 'canceled' || event.error === 'interrupted' ? undefined : new Error(event.error));
			};

			this.synthesis.speak(utterance);
		});
	}

	private stop(): void {
		if (this.active) {
			this.active = false;
			this.synthesis.cancel();
			this._onDidChange.fire({ status: TextToSpeechStatus.Stopped });
		}
	}
}

/**
 * The text-to-speech engine that ships with VS Code, backed by the platform
 * speech synthesizer. It is only consulted when no extension registered a
 * speech provider, so installing one keeps its voices in charge.
 */
export class BuiltinTextToSpeechEngine implements IBuiltinTextToSpeechEngine {

	private readonly synthesis: SpeechSynthesis | undefined = mainWindow.speechSynthesis;

	/** Lowest priority: any on-device model should be preferred over this. */
	readonly priority = 0;

	/**
	 * Voices are populated asynchronously on some platforms, so an empty voice
	 * list shortly after startup does not mean synthesis is unavailable. A
	 * platform without any speech service (e.g. Linux without `speech-dispatcher`)
	 * surfaces that as an error on use instead.
	 */
	get isSupported(): boolean {
		return !!this.synthesis;
	}

	constructor(
		@ILogService private readonly logService: ILogService
	) { }

	createTextToSpeechSession(token: CancellationToken, options?: ITextToSpeechSessionOptions): ITextToSpeechSession {
		const synthesis = this.synthesis;
		if (!synthesis) {
			throw new Error('The built-in text to speech engine is not supported in this environment.');
		}

		const session = new BuiltinTextToSpeechSession(synthesis, token, options, this.logService);
		// Kept by the session, so that it goes away with it rather than living
		// on the token until that is disposed.
		session.keep(token.onCancellationRequested(() => session.dispose()));

		return session;
	}
}
