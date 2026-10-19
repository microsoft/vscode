/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface SpeechToTextOptions {
		readonly language?: string;
	}

	export enum SpeechToTextStatus {
		Started = 1,
		Recognizing = 2,
		Recognized = 3,
		Stopped = 4,
		Error = 5
	}

	export interface SpeechToTextEvent {
		readonly status: SpeechToTextStatus;
		readonly text?: string;
	}

	export interface SpeechToTextSession {
		readonly onDidChange: Event<SpeechToTextEvent>;
	}

	export interface TextToSpeechOptions {
		readonly language?: string;
	}

	export enum TextToSpeechStatus {
		Started = 1,
		Stopped = 2,
		Error = 3
	}

	export interface TextToSpeechEvent {
		readonly status: TextToSpeechStatus;
		readonly text?: string;
	}

	export interface TextToSpeechSession {
		readonly onDidChange: Event<TextToSpeechEvent>;

		synthesize(text: string): void;
	}

	export enum KeywordRecognitionStatus {
		Recognized = 1,
		Stopped = 2
	}

	export interface KeywordRecognitionEvent {
		readonly status: KeywordRecognitionStatus;
		readonly text?: string;
	}

	export interface KeywordRecognitionSession {
		readonly onDidChange: Event<KeywordRecognitionEvent>;
	}

	export interface SpeechProvider {
		provideSpeechToTextSession(token: CancellationToken, options?: SpeechToTextOptions): ProviderResult<SpeechToTextSession>;
		provideTextToSpeechSession(token: CancellationToken, options?: TextToSpeechOptions): ProviderResult<TextToSpeechSession>;
		provideKeywordRecognitionSession(token: CancellationToken): ProviderResult<KeywordRecognitionSession>;
	}

	export interface VoiceLiveSession {
		readonly sessionId: string;
		readonly sdp: string;
	}

	export interface VoiceLiveSessionResult {
		/** Whether a live session can be created with the current provider configuration. */
		readonly available: boolean;
		/** The created session, present only when an SDP offer was supplied. */
		readonly session?: VoiceLiveSession;
	}

	export interface VoiceLiveSessionProvider {
		/** Checks availability without an SDP offer, or exchanges an offer for a live session. */
		provideVoiceLiveSession(sdp: string | undefined, token: CancellationToken): ProviderResult<VoiceLiveSessionResult>;
	}

	export namespace speech {

		export function registerSpeechProvider(id: string, provider: SpeechProvider): Disposable;
		export function registerVoiceLiveSessionProvider(id: string, provider: VoiceLiveSessionProvider): Disposable;
	}
}
