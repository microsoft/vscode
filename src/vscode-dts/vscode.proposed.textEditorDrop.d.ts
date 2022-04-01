/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/142990

	export class SnippetTextEdit {
		snippet: SnippetString;
		range: Range;
		constructor(range: Range, snippet: SnippetString);
	}

	export interface DocumentOnDropProvider {
		provideDocumentOnDropEdits(document: TextDocument, position: Position, dataTransfer: DataTransfer, token: CancellationToken): ProviderResult<SnippetTextEdit>;
	}

	export namespace languages {
		export function registerDocumentOnDropProvider(selector: DocumentSelector, provider: DocumentOnDropProvider): Disposable;
	}
}
