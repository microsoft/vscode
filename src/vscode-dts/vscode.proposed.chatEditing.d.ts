/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface ChatRequestDraft {
		readonly prompt: string;
		readonly files: readonly Uri[];
	}

	export interface ChatRelatedFilesProvider {
		provideRelatedFiles(chatRequest: ChatRequestDraft, token: CancellationToken): ProviderResult<Uri[]>;
	}

	export namespace chat {
		export function registerRelatedFilesProvider(provider: ChatRelatedFilesProvider): Disposable;
	}
}
