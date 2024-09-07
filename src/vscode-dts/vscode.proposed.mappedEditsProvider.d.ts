/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface DocumentContextItem {
		readonly uri: Uri;
		readonly version: number;
		readonly ranges: Range[];
	}

	export interface ConversationRequest {
		readonly type: 'request';
		readonly message: string;
	}

	export interface ConversationResponse {
		readonly type: 'response';
		readonly message: string;
		readonly references?: DocumentContextItem[];
	}

	export interface MappedEditsContext {
		readonly documents: DocumentContextItem[][];
		/**
		 * The conversation that led to the current code block(s).
		 * The last conversation part contains the code block(s) for which the code mapper should provide edits.
		 */
		readonly conversation?: (ConversationRequest | ConversationResponse)[];
	}

	/**
	 * Interface for providing mapped edits for a given document.
	 */
	export interface MappedEditsProvider {
		/**
		 * Provide mapped edits for a given document.
		 * @param document The document to provide mapped edits for.
		 * @param codeBlocks Code blocks that come from an LLM's reply.
		 * 						"Apply in Editor" in the panel chat only sends one edit that the user clicks on, but inline chat can send multiple blocks and let the lang server decide what to do with them.
		 * @param context The context for providing mapped edits.
		 * @param token A cancellation token.
		 * @returns A provider result of text edits.
		 */
		provideMappedEdits(
			document: TextDocument,
			codeBlocks: string[],
			context: MappedEditsContext,
			token: CancellationToken
		): ProviderResult<WorkspaceEdit | null>;
	}

	namespace chat {
		export function registerMappedEditsProvider(documentSelector: DocumentSelector, provider: MappedEditsProvider): Disposable;
	}
}
