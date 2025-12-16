/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	/**
	 * @deprecated Part of MappedEditsProvider, use `MappedEditsProvider2` instead.
	 */
	export interface DocumentContextItem {
		readonly uri: Uri;
		readonly version: number;
		readonly ranges: Range[];
	}

	/**
	 * @deprecated Part of MappedEditsProvider, use `MappedEditsProvider2` instead.
	 */
	export interface ConversationRequest {
		// eslint-disable-next-line local/vscode-dts-string-type-literals
		readonly type: 'request';
		readonly message: string;
	}

	/**
	 * @deprecated Part of MappedEditsProvider, use `MappedEditsProvider2` instead.
	 */
	export interface ConversationResponse {
		// eslint-disable-next-line local/vscode-dts-string-type-literals
		readonly type: 'response';
		readonly message: string;
		readonly result?: ChatResult;
		readonly references?: DocumentContextItem[];
	}

	/**
	 * @deprecated Part of MappedEditsProvider, use `MappedEditsProvider2` instead.
	 */
	export interface MappedEditsContext {
		readonly documents: DocumentContextItem[][];
		/**
		 * The conversation that led to the current code block(s).
		 * The last conversation part contains the code block(s) for which the code mapper should provide edits.
		 */
		readonly conversation?: Array<ConversationRequest | ConversationResponse>;
	}

	/**
	 * Interface for providing mapped edits for a given document.
	 * @deprecated Use `MappedEditsProvider2` instead.
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

	/**
	 * Interface for providing mapped edits for a given document.
	 */
	export interface MappedEditsRequest {
		readonly codeBlocks: { code: string; resource: Uri; markdownBeforeBlock?: string }[];
		readonly location?: string;
		readonly chatRequestId?: string;
		readonly chatRequestModel?: string;
		readonly chatSessionId?: string;
	}

	export interface MappedEditsResponseStream {
		textEdit(target: Uri, edits: TextEdit | TextEdit[]): void;
		notebookEdit(target: Uri, edits: NotebookEdit | NotebookEdit[]): void;
	}

	export interface MappedEditsResult {
		readonly errorMessage?: string;
	}

	/**
	 * Interface for providing mapped edits for a given document.
	 */
	export interface MappedEditsProvider2 {
		provideMappedEdits(
			request: MappedEditsRequest,
			result: MappedEditsResponseStream,
			token: CancellationToken
		): ProviderResult<MappedEditsResult>;
	}

	namespace chat {
		/**
		 * @deprecated Use `MappedEditsProvider2` instead.
		 */
		export function registerMappedEditsProvider(documentSelector: DocumentSelector, provider: MappedEditsProvider): Disposable;

		export function registerMappedEditsProvider2(provider: MappedEditsProvider2): Disposable;
	}
}
