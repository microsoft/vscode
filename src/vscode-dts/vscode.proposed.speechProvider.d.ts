/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface SpeechProvider {
		provideSpeechToText(token: CancellationToken): Thenable<any>;
	}

	export namespace speech {

		export function registerSpeechProvider(id: string, provider: SpeechProvider): Disposable;
	}
}
