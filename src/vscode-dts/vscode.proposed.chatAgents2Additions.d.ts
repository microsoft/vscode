/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface ChatAgent2<TResult extends ChatAgentResult2> {
		onDidPerformAction: Event<ChatAgentUserActionEvent>;
		supportIssueReporting?: boolean;
	}

	export interface ChatAgentErrorDetails {
		/**
		 * If set to true, the message content is completely hidden. Only ChatAgentErrorDetails#message will be shown.
		 */
		responseIsRedacted?: boolean;
	}

	/**
	 * This is temporary until inline references are fully supported and adopted
	 */
	export interface ChatAgentMarkdownContent {
		markdownContent: MarkdownString;
	}

	export interface ChatAgentDetectedAgent {
		agentName: string;
		command?: ChatAgentSubCommand;
	}

	export interface ChatAgentVulnerability {
		title: string;
		description: string;
		// id: string; // Later we will need to be able to link these across multiple content chunks.
	}

	export interface ChatAgentContent {
		vulnerabilities?: ChatAgentVulnerability[];
	}


	/**
	 * @deprecated use ChatAgentResponseStream instead
	 */
	export type ChatAgentContentProgress =
		| ChatAgentContent
		| ChatAgentFileTree
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

	/**
	 * Is displayed in the UI to communicate steps of progress to the user. Should be used when the agent may be slow to respond, e.g. due to doing extra work before sending the actual request to the LLM.
	 */
	export interface ChatAgentProgressMessage {
		message: string;
	}

	/**
	 * Indicates a piece of content that was used by the chat agent while processing the request. Will be displayed to the user.
	 */
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

	/**
	 * Represents a tree, such as a file and directory structure, rendered in the chat response.
	 */
	export interface ChatAgentFileTree {
		/**
		 * The root node of the tree.
		 */
		treeData: ChatAgentFileTreeData;
	}

	/**
	 * Represents a node in a chat response tree.
	 */
	export interface ChatAgentFileTreeData {
		/**
		 * A human-readable string describing this node.
		 */
		label: string;

		/**
		 * A Uri for this node, opened when it's clicked.
		 */
		// TODO@API why label and uri. Can the former be derived from the latter?
		// TODO@API don't use uri but just names? This API allows to to build nonsense trees where the data structure doesn't match the uris
		// path-structure.
		uri: Uri;

		/**
		 * The type of this node. Defaults to {@link FileType.Directory} if it has {@link ChatAgentFileTreeData.children children}.
		 */
		// TODO@API cross API usage
		type?: FileType;

		/**
		 * The children of this node.
		 */
		children?: ChatAgentFileTreeData[];
	}

	export interface ChatAgentDocumentContext {
		uri: Uri;
		version: number;
		ranges: Range[];
	}

	/**
	 * Document references that should be used by the MappedEditsProvider.
	 */
	export interface ChatAgentUsedContext {
		documents: ChatAgentDocumentContext[];
	}

	export interface ChatAgentResponseStream {
		/**
		 * @deprecated use above methods instread
		 */
		report(value: ChatAgentProgress): void;
	}

	export type ChatAgentExtendedProgress = ChatAgentProgress
		| ChatAgentMarkdownContent
		| ChatAgentDetectedAgent;

	export type ChatAgentExtendedResponseStream = ChatAgentResponseStream & {
		/**
		 * @deprecated
		 */
		report(value: ChatAgentExtendedProgress): void;
	};

	export interface ChatAgent2<TResult extends ChatAgentResult2> {
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

	export type ChatAgentExtendedHandler = (request: ChatAgentRequest, context: ChatAgentContext, response: ChatAgentExtendedResponseStream, token: CancellationToken) => ProviderResult<ChatAgentResult2>;

	export namespace chat {
		/**
		 * Create a chat agent with the extended progress type
		 */
		export function createChatAgent<TResult extends ChatAgentResult2>(name: string, handler: ChatAgentExtendedHandler): ChatAgent2<TResult>;
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

	export interface ChatAgentSessionFollowupAction {
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
		readonly action: ChatAgentCopyAction | ChatAgentInsertAction | ChatAgentTerminalAction | ChatAgentCommandAction | ChatAgentSessionFollowupAction | ChatAgentBugReportAction;
	}

	export interface ChatVariableValue {
		/**
		 * An optional type tag for extensions to communicate the kind of the variable. An extension might use it to interpret the shape of `value`.
		 */
		kind?: string;
	}
}
