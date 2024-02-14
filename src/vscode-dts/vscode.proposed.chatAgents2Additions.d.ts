/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface ChatAgent2 {
		onDidPerformAction: Event<ChatAgentUserActionEvent>;
		supportIssueReporting?: boolean;
	}

	export interface ChatAgentErrorDetails {
		/**
		 * If set to true, the message content is completely hidden. Only ChatAgentErrorDetails#message will be shown.
		 */
		responseIsRedacted?: boolean;
	}

	/** @deprecated */
	export interface ChatAgentMarkdownContent {
		markdownContent: MarkdownString;
	}

	// TODO@API fit this into the stream
	export interface ChatAgentDetectedAgent {
		agentName: string;
		command?: ChatAgentCommand;
	}

	// TODO@API fit this into the stream
	export interface ChatAgentVulnerability {
		title: string;
		description: string;
		// id: string; // Later we will need to be able to link these across multiple content chunks.
	}

	// TODO@API fit this into the stream
	export interface ChatAgentContent {
		vulnerabilities?: ChatAgentVulnerability[];
	}

	/**
	 * @deprecated use ChatAgentResponseStream instead
	 */
	export type ChatAgentContentProgress =
		| ChatAgentContent
		| ChatAgentInlineContentReference
		| ChatAgentCommandButton;

	/**
	 * @deprecated use ChatAgentResponseStream instead
	 */
	export type ChatAgentMetadataProgress =
		| ChatAgentUsedContext
		| ChatAgentContentReference
		| ChatAgentProgressMessage;

	/**
	 * @deprecated use ChatAgentResponseStream instead
	 */
	export type ChatAgentProgress = ChatAgentContentProgress | ChatAgentMetadataProgress;

	/** @deprecated */
	export interface ChatAgentProgressMessage {
		message: string;
	}

	/** @deprecated */

	export interface ChatAgentContentReference {
		/**
		 * The resource that was referenced.
		 */
		reference: Uri | Location;
	}

	/**
	 * A reference to a piece of content that will be rendered inline with the markdown content.
	 */
	export interface ChatAgentInlineContentReference {
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
	export interface ChatAgentCommandButton {
		command: Command;
	}

	/**
	 * A piece of the chat response's content. Will be merged with other progress pieces as needed, and rendered as markdown.
	 */
	export interface ChatAgentContent {
		/**
		 * The content as a string of markdown source.
		 */
		content: string;
	}

	export interface ChatAgentDocumentContext {
		uri: Uri;
		version: number;
		ranges: Range[];
	}

	// TODO@API fit this into the stream
	export interface ChatAgentUsedContext {
		documents: ChatAgentDocumentContext[];
	}

	export interface ChatAgentResponseStream {
		/**
		 * @deprecated use above methods instread
		 */
		report(value: ChatAgentProgress): void;
	}

	/** @deprecated */
	export type ChatAgentExtendedProgress = ChatAgentProgress
		| ChatAgentMarkdownContent
		| ChatAgentDetectedAgent;

	export type ChatAgentExtendedResponseStream = ChatAgentResponseStream & {
		/**
		 * @deprecated
		 */
		report(value: ChatAgentExtendedProgress): void;
	};

	export interface ChatAgent2 {
		/**
		 * Provide a set of variables that can only be used with this agent.
		 */
		agentVariableProvider?: { provider: ChatAgentCompletionItemProvider; triggerCharacters: string[] };
	}

	export interface ChatAgentCompletionItemProvider {
		provideCompletionItems(query: string, token: CancellationToken): ProviderResult<ChatAgentCompletionItem[]>;
	}

	export class ChatAgentCompletionItem {
		label: string | CompletionItemLabel;
		values: ChatVariableValue[];
		insertText?: string;
		detail?: string;
		documentation?: string | MarkdownString;

		constructor(label: string | CompletionItemLabel, values: ChatVariableValue[]);
	}

	export type ChatAgentExtendedRequestHandler = (request: ChatAgentRequest, context: ChatAgentContext, response: ChatAgentExtendedResponseStream, token: CancellationToken) => ProviderResult<ChatAgentResult2>;

	export namespace chat {
		/**
		 * Create a chat agent with the extended progress type
		 */
		export function createChatAgent(name: string, handler: ChatAgentExtendedRequestHandler): ChatAgent2;
	}

	/*
	 * User action events
	 */

	export enum ChatAgentCopyKind {
		// Keyboard shortcut or context menu
		Action = 1,
		Toolbar = 2
	}

	export interface ChatAgentCopyAction {
		// eslint-disable-next-line local/vscode-dts-string-type-literals
		kind: 'copy';
		codeBlockIndex: number;
		copyKind: ChatAgentCopyKind;
		copiedCharacters: number;
		totalCharacters: number;
		copiedText: string;
	}

	export interface ChatAgentInsertAction {
		// eslint-disable-next-line local/vscode-dts-string-type-literals
		kind: 'insert';
		codeBlockIndex: number;
		totalCharacters: number;
		newFile?: boolean;
	}

	export interface ChatAgentTerminalAction {
		// eslint-disable-next-line local/vscode-dts-string-type-literals
		kind: 'runInTerminal';
		codeBlockIndex: number;
		languageId?: string;
	}

	export interface ChatAgentCommandAction {
		// eslint-disable-next-line local/vscode-dts-string-type-literals
		kind: 'command';
		commandButton: ChatAgentCommandButton;
	}

	export interface ChatAgentFollowupAction {
		// eslint-disable-next-line local/vscode-dts-string-type-literals
		kind: 'followUp';
		followup: ChatAgentFollowup;
	}

	export interface ChatAgentBugReportAction {
		// eslint-disable-next-line local/vscode-dts-string-type-literals
		kind: 'bug';
	}

	export interface ChatAgentUserActionEvent {
		readonly result: ChatAgentResult2;
		readonly action: ChatAgentCopyAction | ChatAgentInsertAction | ChatAgentTerminalAction | ChatAgentCommandAction | ChatAgentFollowupAction | ChatAgentBugReportAction;
	}

	export interface ChatVariableValue {
		/**
		 * An optional type tag for extensions to communicate the kind of the variable. An extension might use it to interpret the shape of `value`.
		 */
		kind?: string;
	}

	export interface ChatAgentCommand {
		readonly isSticky2?: {
			/**
			 * Indicates that the command should be automatically repopulated.
			 */
			isSticky: true;

			/**
			 * This can be set to a string to use a different placeholder message in the input box when the command has been repopulated.
			 */
			placeholder?: string;
		};
	}
}
