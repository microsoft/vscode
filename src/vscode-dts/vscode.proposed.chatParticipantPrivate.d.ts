/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// version: 2

declare module 'vscode' {

	/**
	 * The location at which the chat is happening.
	 */
	export enum ChatLocation {
		/**
		 * The chat panel
		 */
		Panel = 1,
		/**
		 * Terminal inline chat
		 */
		Terminal = 2,
		/**
		 * Notebook inline chat
		 */
		Notebook = 3,
		/**
		 * Code editor inline chat
		 */
		Editor = 4,
		/**
		 * Chat is happening in an editing session
		 */
		EditingSession = 5,
	}

	export class ChatRequestEditorData {
		//TODO@API should be the editor
		document: TextDocument;
		selection: Selection;
		wholeRange: Range;

		constructor(document: TextDocument, selection: Selection, wholeRange: Range);
	}

	export class ChatRequestNotebookData {
		//TODO@API should be the editor
		readonly cell: TextDocument;

		constructor(cell: TextDocument);
	}

	export interface ChatRequest {
		/**
		 * The attempt number of the request. The first request has attempt number 0.
		 */
		readonly attempt: number;

		/**
		 * If automatic command detection is enabled.
		 */
		readonly enableCommandDetection: boolean;

		/**
		 * If the chat participant or command was automatically assigned.
		 */
		readonly isParticipantDetected: boolean;

		/**
		 * The location at which the chat is happening. This will always be one of the supported values
		 *
		 * @deprecated
		 */
		readonly location: ChatLocation;

		/**
		 * Information that is specific to the location at which chat is happening, e.g within a document, notebook,
		 * or terminal. Will be `undefined` for the chat panel.
		 */
		readonly location2: ChatRequestEditorData | ChatRequestNotebookData | undefined;
	}

	export interface ChatParticipant {
		supportIssueReporting?: boolean;

		/**
		 * Temp, support references that are slow to resolve and should be tools rather than references.
		 */
		supportsSlowReferences?: boolean;
	}

	export interface ChatErrorDetails {
		/**
		 * If set to true, the message content is completely hidden. Only ChatErrorDetails#message will be shown.
		 */
		responseIsRedacted?: boolean;
	}

	export namespace chat {
		export function createDynamicChatParticipant(id: string, dynamicProps: DynamicChatParticipantProps, handler: ChatExtendedRequestHandler): ChatParticipant;
	}

	/**
	 * These don't get set on the ChatParticipant after creation, like other props, because they are typically defined in package.json and we want them at the time of creation.
	 */
	export interface DynamicChatParticipantProps {
		name: string;
		publisherName: string;
		description?: string;
		fullName?: string;
	}

	export namespace lm {
		export function registerIgnoredFileProvider(provider: LanguageModelIgnoredFileProvider): Disposable;
	}

	export interface LanguageModelIgnoredFileProvider {
		provideFileIgnored(uri: Uri, token: CancellationToken): ProviderResult<boolean>;
	}
}
