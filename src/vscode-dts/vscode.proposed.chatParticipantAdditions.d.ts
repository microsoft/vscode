/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
		Editor = 4
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
		 * The location at which the chat is happening. This will always be one of the supported values
		 */
		readonly location: ChatLocation;
	}

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

	/**
	 * Now only used for the "intent detection" API below
	 */
	export interface ChatCommand {
		readonly name: string;
		readonly description: string;
	}

	export class ChatResponseDetectedParticipantPart {
		participant: string;
		// TODO@API validate this against statically-declared slash commands?
		command?: ChatCommand;
		constructor(participant: string, command?: ChatCommand);
	}

	export interface ChatVulnerability {
		title: string;
		description: string;
		// id: string; // Later we will need to be able to link these across multiple content chunks.
	}

	export class ChatResponseMarkdownWithVulnerabilitiesPart {
		value: MarkdownString;
		vulnerabilities: ChatVulnerability[];
		constructor(value: string | MarkdownString, vulnerabilities: ChatVulnerability[]);
	}

	/**
	 * Displays a {@link Command command} as a button in the chat response.
	 */
	export interface ChatCommandButton {
		command: Command;
	}

	export interface ChatDocumentContext {
		uri: Uri;
		version: number;
		ranges: Range[];
	}

	export class ChatResponseTextEditPart {
		uri: Uri;
		edits: TextEdit[];
		constructor(uri: Uri, edits: TextEdit | TextEdit[]);
	}

	export class ChatResponseConfirmationPart {
		title: string;
		message: string;
		data: any;
		constructor(title: string, message: string, data: any);
	}

	export type ExtendedChatResponsePart = ChatResponsePart | ChatResponseTextEditPart | ChatResponseDetectedParticipantPart | ChatResponseConfirmationPart;

	export class ChatResponseWarningPart {
		value: MarkdownString;
		constructor(value: string | MarkdownString);
	}

	export class ChatResponseProgressPart2 extends ChatResponseProgressPart {
		value: string;
		task?: (progress: Progress<ChatResponseWarningPart | ChatResponseReferencePart>) => Thenable<string | void>;
		constructor(value: string, task?: (progress: Progress<ChatResponseWarningPart | ChatResponseReferencePart>) => Thenable<string | void>);
	}

	export interface ChatResponseStream {

		/**
		 * Push a progress part to this stream. Short-hand for
		 * `push(new ChatResponseProgressPart(value))`.
		*
		* @param value A progress message
		* @param task If provided, a task to run while the progress is displayed. When the Thenable resolves, the progress will be marked complete in the UI, and the progress message will be updated to the resolved string if one is specified.
		* @returns This stream.
		*/
		progress(value: string, task?: (progress: Progress<ChatResponseWarningPart | ChatResponseReferencePart>) => Thenable<string | void>): ChatResponseStream;

		textEdit(target: Uri, edits: TextEdit | TextEdit[]): ChatResponseStream;
		markdownWithVulnerabilities(value: string | MarkdownString, vulnerabilities: ChatVulnerability[]): ChatResponseStream;
		detectedParticipant(participant: string, command?: ChatCommand): ChatResponseStream;
		push(part: ChatResponsePart | ChatResponseTextEditPart | ChatResponseDetectedParticipantPart | ChatResponseWarningPart | ChatResponseProgressPart2): ChatResponseStream;

		/**
		 * Show an inline message in the chat view asking the user to confirm an action.
		 * Multiple confirmations may be shown per response. The UI might show "Accept All" / "Reject All" actions.
		 * @param title The title of the confirmation entry
		 * @param message An extra message to display to the user
		 * @param data An arbitrary JSON-stringifiable object that will be included in the ChatRequest when
		 * the confirmation is accepted or rejected
		 * TODO@API should this be MarkdownString?
		 * TODO@API should actually be a more generic function that takes an array of buttons
		 */
		confirmation(title: string, message: string, data: any): ChatResponseStream;

		/**
		 * Push a warning to this stream. Short-hand for
		 * `push(new ChatResponseWarningPart(message))`.
		 *
		 * @param message A warning message
		 * @returns This stream.
		 */
		warning(message: string | MarkdownString): ChatResponseStream;

		push(part: ExtendedChatResponsePart): ChatResponseStream;
	}

	/**
	 * Does this piggy-back on the existing ChatRequest, or is it a different type of request entirely?
	 * Does it show up in history?
	 */
	export interface ChatRequest {
		/**
		 * The `data` for any confirmations that were accepted
		 */
		acceptedConfirmationData?: any[];

		/**
		 * The `data` for any confirmations that were rejected
		 */
		rejectedConfirmationData?: any[];
	}

	// TODO@API fit this into the stream
	export interface ChatUsedContext {
		documents: ChatDocumentContext[];
	}

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
		command?: Command;

		constructor(label: string | CompletionItemLabel, values: ChatVariableValue[]);
	}

	export type ChatExtendedRequestHandler = (request: ChatRequest, context: ChatContext, response: ChatResponseStream, token: CancellationToken) => ProviderResult<ChatResult | void>;

	export namespace chat {
		/**
		 * Create a chat participant with the extended progress type
		 */
		export function createChatParticipant(id: string, handler: ChatExtendedRequestHandler): ChatParticipant;

		export function createDynamicChatParticipant(id: string, name: string, publisherName: string, description: string, handler: ChatExtendedRequestHandler): ChatParticipant;
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

	export interface ChatEditorAction {
		kind: 'editor';
		accepted: boolean;
	}

	export interface ChatUserActionEvent {
		readonly result: ChatResult;
		readonly action: ChatCopyAction | ChatInsertAction | ChatTerminalAction | ChatCommandAction | ChatFollowupAction | ChatBugReportAction | ChatEditorAction;
	}

	/**
	 * The detail level of this chat variable value.
	 */
	export enum ChatVariableLevel {
		Short = 1,
		Medium = 2,
		Full = 3
	}

	export interface ChatVariableValue {
		/**
		 * The detail level of this chat variable value. If possible, variable resolvers should try to offer shorter values that will consume fewer tokens in an LLM prompt.
		 */
		level: ChatVariableLevel;

		/**
		 * The variable's value, which can be included in an LLM prompt as-is, or the chat participant may decide to read the value and do something else with it.
		 */
		value: string | Uri;

		/**
		 * A description of this value, which could be provided to the LLM as a hint.
		 */
		description?: string;
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
