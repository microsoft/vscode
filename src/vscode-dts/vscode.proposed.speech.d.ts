/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// todo@bpasero work in progress speech API

	export enum SpeechToTextStatus {
		Started = 1,
		Recognizing = 2,
		Recognized = 3,
		Stopped = 4
	}

	export interface SpeechToTextEvent {
		readonly status: SpeechToTextStatus;
		readonly text?: string;
	}

	export interface SpeechToTextSession extends Disposable {
		readonly onDidChange: Event<SpeechToTextEvent>;
	}

	export enum KeywordRecognitionStatus {
		Recognized = 1,
		Stopped = 2
	}

	export interface KeywordRecognitionEvent {
		readonly status: KeywordRecognitionStatus;
		readonly text?: string;
	}

	export interface KeywordRecognitionSession extends Disposable {
		readonly onDidChange: Event<KeywordRecognitionEvent>;
	}

	export interface SpeechProvider {
		provideSpeechToTextSession(token: CancellationToken): SpeechToTextSession;
		provideKeywordRecognitionSession(token: CancellationToken): KeywordRecognitionSession;
	}

	export namespace speech {

		export function registerSpeechProvider(id: string, provider: SpeechProvider): Disposable;
	}
}
