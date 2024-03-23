/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface ChatParticipant {
		onDidPerformAction: Event<ChatUserActionEvent>;
		supportIssueReporting?: boolean;
	}

	export interface ChatErrorDetails {
		/**
		 * If set to true, the message content is completely hidden. Only ChatErrorDetails#message will be shown.
		 */
		responseIsRedacted?: boolean;
	}

	/** @deprecated */
	export interface ChatMarkdownContent {
		markdownContent: MarkdownString;
	}

	/**
	 * Now only used for the "intent detection" API below
	 */
	export interface ChatCommand {
		readonly name: string;
		readonly description: string;
	}

	// TODO@API fit this into the stream
	export interface ChatDetectedParticipant {
		participant: string;
		// TODO@API validate this against statically-declared slash commands?
		command?: ChatCommand;
	}

	// TODO@API fit this into the stream
	export interface ChatVulnerability {
		title: string;
		description: string;
		// id: string; // Later we will need to be able to link these across multiple content chunks.
	}

	// TODO@API fit this into the stream
	export interface ChatContent {
		vulnerabilities?: ChatVulnerability[];
	}

	/**
	 * @deprecated use ChatResponseStream instead
	 */
	export type ChatContentProgress =
		| ChatContent
		| ChatInlineContentReference
		| ChatCommandButton;

	/**
	 * @deprecated use ChatResponseStream instead
	 */
	export type ChatMetadataProgress =
		| ChatUsedContext
		| ChatContentReference
		| ChatProgressMessage;

	/**
	 * @deprecated use ChatResponseStream instead
	 */
	export type ChatProgress = ChatContentProgress | ChatMetadataProgress;

	/** @deprecated */
	export interface ChatProgressMessage {
		message: string;
	}

	/** @deprecated */

	export interface ChatContentReference {
		/**
		 * The resource that was referenced.
		 */
		reference: Uri | Location;
	}

	/**
	 * A reference to a piece of content that will be rendered inline with the markdown content.
	 */
	export interface ChatInlineContentReference {
		/**
		 * The resource being referenced.
		 */
		inlineReference: Uri | Location;

		/**
		 * An alternate title for the resource.
		 */
		title?: string;
	}

	/**
	 * Displays a {@link Command command} as a button in the chat response.
	 */
	export interface ChatCommandButton {
		command: Command;
	}

	/**
	 * A piece of the chat response's content. Will be merged with other progress pieces as needed, and rendered as markdown.
	 */
	export interface ChatContent {
		/**
		 * The content as a string of markdown source.
		 */
		content: string;
	}

	export interface ChatDocumentContext {
		uri: Uri;
		version: number;
		ranges: Range[];
	}

	// TODO@API fit this into the stream
	export interface ChatUsedContext {
		documents: ChatDocumentContext[];
	}

	export interface ChatResponseStream {
		/**
		 * @deprecated use above methods instread
		 */
		report(value: ChatProgress): void;
	}

	/** @deprecated */
	export type ChatExtendedProgress = ChatProgress
		| ChatMarkdownContent
		| ChatDetectedParticipant;

	export type ChatExtendedResponseStream = ChatResponseStream & {
		/**
		 * @deprecated
		 */
		report(value: ChatExtendedProgress): void;
	};

	export interface ChatParticipant {
		/**
		 * Provide a set of variables that can only be used with this participant.
		 */
		participantVariableProvider?: { provider: ChatParticipantCompletionItemProvider; triggerCharacters: string[] };
	}

	export interface ChatParticipantCompletionItemProvider {
		provideCompletionItems(query: string, token: CancellationToken): ProviderResult<ChatCompletionItem[]>;
	}

	export class ChatCompletionItem {
		label: string | CompletionItemLabel;
		values: ChatVariableValue[];
		insertText?: string;
		detail?: string;
		documentation?: string | MarkdownString;

		constructor(label: string | CompletionItemLabel, values: ChatVariableValue[]);
	}

	export type ChatExtendedRequestHandler = (request: ChatRequest, context: ChatContext, response: ChatExtendedResponseStream, token: CancellationToken) => ProviderResult<ChatResult | void>;

	export namespace chat {
		/**
		 * Create a chat participant with the extended progress type
		 */
		export function createChatParticipant(id: string, handler: ChatExtendedRequestHandler): ChatParticipant;

		export function createDynamicChatParticipant(id: string, name: string, description: string, handler: ChatExtendedRequestHandler): ChatParticipant;
	}

	/*
	 * User action events
	 */

	export enum ChatCopyKind {
		// Keyboard shortcut or context menu
		Action = 1,
		Toolbar = 2
	}

	export interface ChatCopyAction {
		// eslint-disable-next-line local/vscode-dts-string-type-literals
		kind: 'copy';
		codeBlockIndex: number;
		copyKind: ChatCopyKind;
		copiedCharacters: number;
		totalCharacters: number;
		copiedText: string;
	}

	export interface ChatInsertAction {
		// eslint-disable-next-line local/vscode-dts-string-type-literals
		kind: 'insert';
		codeBlockIndex: number;
		totalCharacters: number;
		newFile?: boolean;
	}

	export interface ChatTerminalAction {
		// eslint-disable-next-line local/vscode-dts-string-type-literals
		kind: 'runInTerminal';
		codeBlockIndex: number;
		languageId?: string;
	}

	export interface ChatCommandAction {
		// eslint-disable-next-line local/vscode-dts-string-type-literals
		kind: 'command';
		commandButton: ChatCommandButton;
	}

	export interface ChatFollowupAction {
		// eslint-disable-next-line local/vscode-dts-string-type-literals
		kind: 'followUp';
		followup: ChatFollowup;
	}

	export interface ChatBugReportAction {
		// eslint-disable-next-line local/vscode-dts-string-type-literals
		kind: 'bug';
	}

	export interface ChatUserActionEvent {
		readonly result: ChatResult;
		readonly action: ChatCopyAction | ChatInsertAction | ChatTerminalAction | ChatCommandAction | ChatFollowupAction | ChatBugReportAction;
	}

	export interface ChatVariableValue {
		/**
		 * An optional type tag for extensions to communicate the kind of the variable. An extension might use it to interpret the shape of `value`.
		 */
		kind?: string;
	}

	export interface ChatVariableResolverResponseStream {
		/**
		 * Push a progress part to this stream. Short-hand for
		 * `push(new ChatResponseProgressPart(value))`.
		 *
		 * @param value
		 * @returns This stream.
		 */
		progress(value: string): ChatVariableResolverResponseStream;

		/**
		 * Push a reference to this stream. Short-hand for
		 * `push(new ChatResponseReferencePart(value))`.
		 *
		 * *Note* that the reference is not rendered inline with the response.
		 *
		 * @param value A uri or location
		 * @returns This stream.
		 */
		reference(value: Uri | Location): ChatVariableResolverResponseStream;

		/**
		 * Pushes a part to this stream.
		 *
		 * @param part A response part, rendered or metadata
		 */
		push(part: ChatVariableResolverResponsePart): ChatVariableResolverResponseStream;
	}

	export type ChatVariableResolverResponsePart = ChatResponseProgressPart | ChatResponseReferencePart;

	export interface ChatVariableResolver {
		/**
		 * A callback to resolve the value of a chat variable.
		 * @param name The name of the variable.
		 * @param context Contextual information about this chat request.
		 * @param token A cancellation token.
		 */
		resolve2?(name: string, context: ChatVariableContext, stream: ChatVariableResolverResponseStream, token: CancellationToken): ProviderResult<ChatVariableValue[]>;
	}
}
