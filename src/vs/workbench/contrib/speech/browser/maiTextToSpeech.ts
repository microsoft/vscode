/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { AccessibilityVoiceSettingId, IBuiltinTextToSpeechEngine, ITextToSpeechEvent, ITextToSpeechSession, ITextToSpeechSessionOptions, TextToSpeechStatus } from '../common/speechService.js';
import { splitForSynthesis } from '../common/speechText.js';
import { BuiltinTextToSpeechEngine } from './builtinTextToSpeech.js';
import { IMaiSpeechCredentialsService } from './maiSpeechCredentials.js';

/**
 * Voices of the MAI text-to-speech model, by the language they speak. The model
 * offers many more; these are one well rated voice per language so that reading
 * works without the user choosing anything.
 */
const VOICES_BY_LANGUAGE = new Map<string, string>([
	['en', 'en-US-Harper:MAI-Voice-2'],
	['de', 'de-DE-Mia:MAI-Voice-2'],
	['es', 'es-ES-Marta:MAI-Voice-2'],
	['fr', 'fr-FR-Soleil:MAI-Voice-2'],
	['hi', 'hi-IN-Priya:MAI-Voice-2'],
	['it', 'it-IT-Rosa:MAI-Voice-2'],
	['ja', 'ja-JP-Sakura:MAI-Voice-2-Flash'],
	['ko', 'ko-KR-Haena:MAI-Voice-2'],
	['nl', 'nl-NL-Fleur:MAI-Voice-2'],
	['pt', 'pt-BR-Luana:MAI-Voice-2'],
	['ru', 'ru-RU-Masha:MAI-Voice-2'],
	['th', 'th-TH-Krit:MAI-Voice-2'],
	['tr', 'tr-TR-Elif:MAI-Voice-2'],
	['vi', 'vi-VN-Linh:MAI-Voice-2-Flash'],
	['zh', 'zh-CN-Mei:MAI-Voice-2'],
]);

const SAMPLE_RATE = 24000;
const OUTPUT_FORMAT = 'riff-24khz-16bit-mono-pcm';

export const MAI_VOICE_SETTING = AccessibilityVoiceSettingId.MaiVoice;

/**
 * The shape of a voice identifier, for example `en-US-Harper:MAI-Voice-2`. A
 * configured voice is matched against this before it is used: anything else is
 * not a voice the service knows, and letting it through would put arbitrary
 * text into the attribute of the document below.
 */
const VOICE_PATTERN = /^[a-z]{2,3}(-[A-Za-z0-9]+)*:[A-Za-z0-9-]+$/;

/**
 * Picks the voice to read `language` (a BCP-47 tag such as `en-US`) with, or
 * `undefined` when the model has no voice for it and the platform synthesizer
 * should read instead.
 */
export function pickMaiVoice(language: string | undefined, configuredVoice?: string): string | undefined {
	const configured = configuredVoice?.trim();
	if (configured && VOICE_PATTERN.test(configured)) {
		return configured;
	}

	const primary = (language ?? 'en').toLowerCase().replace(/_/g, '-').split('-')[0];

	return VOICES_BY_LANGUAGE.get(primary);
}

function escapeXml(value: string): string {
	return value.replace(/[&<>"']/g, char => {
		switch (char) {
			case '&': return '&amp;';
			case '<': return '&lt;';
			case '>': return '&gt;';
			case '"': return '&quot;';
			default: return '&apos;';
		}
	});
}

/**
 * Wraps `text` in the SSML document the service expects.
 *
 * Everything interpolated here is escaped, including the attributes: chat
 * responses routinely contain `&` and `<`, which would otherwise make the
 * document invalid, and text that closed its own element could add markup of
 * its own, such as an `<audio>` element pointing at another server.
 */
export function toSSML(text: string, voice: string, language: string): string {
	return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${escapeXml(language)}"><voice name="${escapeXml(voice)}">${escapeXml(text)}</voice></speak>`;
}

/**
 * A text-to-speech session that synthesizes with the MAI model over the Azure
 * Speech service and plays the result through Web Audio. Each call to
 * {@link synthesize} only resolves once its audio finished playing, because
 * callers await it per chunk to keep the spoken response in order.
 */
class MaiTextToSpeechSession extends Disposable implements ITextToSpeechSession {

	private readonly _onDidChange = this._register(new Emitter<ITextToSpeechEvent>());
	readonly onDidChange = this._onDidChange.event;

	private active = false;
	private context: AudioContext | undefined;
	private source: AudioBufferSourceNode | undefined;
	private readonly requests = new Set<AbortController>();

	constructor(
		private readonly voice: string,
		private readonly language: string,
		private readonly token: CancellationToken,
		private readonly credentialsService: IMaiSpeechCredentialsService,
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

		const pieces = splitForSynthesis(text);

		// Synthesis is faster than playback, so keep it one piece ahead: the
		// first sound then only waits for the first piece instead of for the
		// whole response, and later pieces are ready before they are needed.
		let pending = this.synthesizeAhead(pieces[0]);

		try {
			for (let i = 0; i < pieces.length; i++) {
				const audio = await pending;
				if (this.token.isCancellationRequested) {
					return;
				}

				pending = this.synthesizeAhead(pieces[i + 1]);

				await this.play(audio);
				if (this.token.isCancellationRequested) {
					return;
				}
			}
		} catch (error) {
			// Stopping aborts the request in flight, which is expected rather than
			// a failure worth reporting.
			if (this.token.isCancellationRequested) {
				return;
			}

			this.logService.error(`[speech] MAI text to speech failed: ${error}`);
			this._onDidChange.fire({ status: TextToSpeechStatus.Error, text: String(error) });
		}
	}

	/**
	 * Starts synthesizing the next piece while the current one plays. The
	 * rejection is observed immediately, because the piece is only awaited once
	 * playback of the previous one finished, and an unobserved rejection until
	 * then would be reported as an unhandled error.
	 */
	private synthesizeAhead(text: string | undefined): Promise<AudioBuffer | undefined> {
		const pending = this.synthesizePiece(text);
		pending.catch(() => { /* awaited (or abandoned) below */ });

		return pending;
	}

	private async synthesizePiece(text: string | undefined): Promise<AudioBuffer | undefined> {
		if (!text) {
			return undefined;
		}

		const credentials = await this.credentialsService.resolve();
		if (!credentials) {
			throw new Error('No credentials are configured for the MAI speech service.');
		}

		// Reading may have been stopped while the credentials were resolved, and
		// there was no request to abort yet at that point.
		if (this.token.isCancellationRequested) {
			return undefined;
		}

		const request = new AbortController();
		this.requests.add(request);

		try {
			const response = await fetch(`${credentials.endpoint.replace(/\/+$/, '')}/cognitiveservices/v1`, {
				method: 'POST',
				headers: {
					'Ocp-Apim-Subscription-Key': credentials.key,
					'Content-Type': 'application/ssml+xml',
					'X-Microsoft-OutputFormat': OUTPUT_FORMAT
				},
				body: toSSML(text, this.voice, this.language),
				signal: request.signal
			});

			if (!response.ok) {
				throw new Error(`The speech service responded with ${response.status} ${response.statusText}.`);
			}

			const audio = await response.arrayBuffer();
			if (this.token.isCancellationRequested) {
				return undefined;
			}

			return await this.getContext().decodeAudioData(audio);
		} finally {
			this.requests.delete(request);
		}
	}

	private getContext(): AudioContext {
		return this.context ??= new mainWindow.AudioContext({ sampleRate: SAMPLE_RATE });
	}

	private play(buffer: AudioBuffer | undefined): Promise<void> {
		if (!buffer) {
			return Promise.resolve();
		}

		const context = this.getContext();

		return new Promise<void>(resolve => {
			const source = this.source = context.createBufferSource();
			source.buffer = buffer;
			source.connect(context.destination);
			source.onended = () => {
				if (this.source === source) {
					this.source = undefined;
				}

				resolve();
			};

			// Playback needs a resumed context, which is not guaranteed when the
			// window never saw a user gesture.
			context.resume().catch(() => { /* best effort */ });
			source.start();
		});
	}

	private stop(): void {
		for (const request of this.requests) {
			request.abort();
		}
		this.requests.clear();

		this.source?.stop();
		this.source = undefined;

		this.context?.close().catch(() => { /* best effort */ });
		this.context = undefined;

		if (this.active) {
			this.active = false;
			this._onDidChange.fire({ status: TextToSpeechStatus.Stopped });
		}
	}
}

/**
 * Reads text aloud with the MAI text-to-speech model, hosted by the Azure
 * Speech service. Preferred over the speech synthesizer of the platform because
 * it sounds natural and is identical everywhere, at the cost of needing a
 * network connection and a configured endpoint.
 */
export class MaiTextToSpeechEngine implements IBuiltinTextToSpeechEngine {

	/** Above the platform synthesizer, which is only the fallback. */
	readonly priority = 10;

	get isSupported(): boolean {
		return this.credentialsService.isConfigured;
	}

	get onDidChangeSupported(): Event<void> {
		return this.credentialsService.onDidChangeConfigured;
	}

	constructor(
		@IMaiSpeechCredentialsService private readonly credentialsService: IMaiSpeechCredentialsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService
	) { }

	createTextToSpeechSession(token: CancellationToken, options?: ITextToSpeechSessionOptions): ITextToSpeechSession {
		const language = options?.language ?? 'en-US';
		const voice = pickMaiVoice(language, this.configurationService.getValue<string>(MAI_VOICE_SETTING));

		// The model only speaks some languages, so let the platform read anything
		// else: a lesser voice in the right language beats no speech at all.
		if (!voice) {
			return this.instantiationService.createInstance(BuiltinTextToSpeechEngine).createTextToSpeechSession(token, options);
		}

		const session = new MaiTextToSpeechSession(voice, language, token, this.credentialsService, this.logService);
		// Kept by the session, so that it goes away with it rather than living
		// on the token until that is disposed.
		session.keep(token.onCancellationRequested(() => session.dispose()));

		return session;
	}
}
