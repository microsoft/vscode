/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

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

	export interface SpeechProvider {
		provideSpeechToTextSession(token: CancellationToken): SpeechToTextSession;
	}

	export namespace speech {

		/**
		 * TODO@bpasero work in progress speech provider API
		 */
		export function registerSpeechProvider(id: string, provider: SpeechProvider): Disposable;
	}
}
