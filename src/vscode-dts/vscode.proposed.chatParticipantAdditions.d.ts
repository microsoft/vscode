/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface ChatParticipant {
		onDidPerformAction: Event<ChatUserActionEvent>;
	}

	/**
	 * Now only used for the "intent detection" API below
	 */
	export interface ChatCommand {
		readonly name: string;
		readonly description: string;
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

	export class ChatResponseCodeblockUriPart {
		isEdit?: boolean;
		value: Uri;
		constructor(value: Uri, isEdit?: boolean);
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
		isDone?: boolean;
		constructor(uri: Uri, done: true);
		constructor(uri: Uri, edits: TextEdit | TextEdit[]);
	}

	export class ChatResponseNotebookEditPart {
		uri: Uri;
		edits: NotebookEdit[];
		isDone?: boolean;
		constructor(uri: Uri, done: true);
		constructor(uri: Uri, edits: NotebookEdit | NotebookEdit[]);
	}

	export class ChatResponseConfirmationPart {
		title: string;
		message: string;
		data: any;
		buttons?: string[];
		constructor(title: string, message: string, data: any, buttons?: string[]);
	}

	export class ChatResponseCodeCitationPart {
		value: Uri;
		license: string;
		snippet: string;
		constructor(value: Uri, license: string, snippet: string);
	}

	export type ExtendedChatResponsePart = ChatResponsePart | ChatResponseTextEditPart | ChatResponseNotebookEditPart | ChatResponseConfirmationPart | ChatResponseCodeCitationPart | ChatResponseReferencePart2 | ChatResponseMovePart | ChatResponseExtensionsPart;

	export class ChatResponseWarningPart {
		value: MarkdownString;
		constructor(value: string | MarkdownString);
	}

	export class ChatResponseProgressPart2 extends ChatResponseProgressPart {
		value: string;
		task?: (progress: Progress<ChatResponseWarningPart | ChatResponseReferencePart>) => Thenable<string | void>;
		constructor(value: string, task?: (progress: Progress<ChatResponseWarningPart | ChatResponseReferencePart>) => Thenable<string | void>);
	}

	export class ChatResponseReferencePart2 {
		/**
		 * The reference target.
		 */
		value: Uri | Location | { variableName: string; value?: Uri | Location } | string;

		/**
		 * The icon for the reference.
		 */
		iconPath?: Uri | ThemeIcon | {
			/**
			 * The icon path for the light theme.
			 */
			light: Uri;
			/**
			 * The icon path for the dark theme.
			 */
			dark: Uri;
		};
		options?: { status?: { description: string; kind: ChatResponseReferencePartStatusKind } };

		/**
		 * Create a new ChatResponseReferencePart.
		 * @param value A uri or location
		 * @param iconPath Icon for the reference shown in UI
		 */
		constructor(value: Uri | Location | { variableName: string; value?: Uri | Location } | string, iconPath?: Uri | ThemeIcon | {
			/**
			 * The icon path for the light theme.
			 */
			light: Uri;
			/**
			 * The icon path for the dark theme.
			 */
			dark: Uri;
		}, options?: { status?: { description: string; kind: ChatResponseReferencePartStatusKind } });
	}

	export class ChatResponseMovePart {

		readonly uri: Uri;
		readonly range: Range;

		constructor(uri: Uri, range: Range);
	}

	export interface ChatResponseAnchorPart {
		/**
		 * The target of this anchor.
		 *
		 * If this is a {@linkcode Uri} or {@linkcode Location}, this is rendered as a normal link.
		 *
		 * If this is a {@linkcode SymbolInformation}, this is rendered as a symbol link.
		 *
		 * TODO mjbvz: Should this be a full `SymbolInformation`? Or just the parts we need?
		 * TODO mjbvz: Should we allow a `SymbolInformation` without a location? For example, until `resolve` completes?
		 */
		value2: Uri | Location | SymbolInformation;

		/**
		 * Optional method which fills in the details of the anchor.
		 *
		 * THis is currently only implemented for symbol links.
		 */
		resolve?(token: CancellationToken): Thenable<void>;
	}

	export class ChatResponseExtensionsPart {

		readonly extensions: string[];

		constructor(extensions: string[]);
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
		progress(value: string, task?: (progress: Progress<ChatResponseWarningPart | ChatResponseReferencePart>) => Thenable<string | void>): void;

		textEdit(target: Uri, edits: TextEdit | TextEdit[]): void;

		textEdit(target: Uri, isDone: true): void;

		notebookEdit(target: Uri, edits: NotebookEdit | NotebookEdit[]): void;

		notebookEdit(target: Uri, isDone: true): void;

		markdownWithVulnerabilities(value: string | MarkdownString, vulnerabilities: ChatVulnerability[]): void;
		codeblockUri(uri: Uri, isEdit?: boolean): void;
		push(part: ChatResponsePart | ChatResponseTextEditPart | ChatResponseWarningPart | ChatResponseProgressPart2): void;

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
		confirmation(title: string, message: string, data: any, buttons?: string[]): void;

		/**
		 * Push a warning to this stream. Short-hand for
		 * `push(new ChatResponseWarningPart(message))`.
		 *
		 * @param message A warning message
		 * @returns This stream.
		 */
		warning(message: string | MarkdownString): void;

		reference(value: Uri | Location | { variableName: string; value?: Uri | Location }, iconPath?: Uri | ThemeIcon | { light: Uri; dark: Uri }): void;

		reference2(value: Uri | Location | string | { variableName: string; value?: Uri | Location }, iconPath?: Uri | ThemeIcon | { light: Uri; dark: Uri }, options?: { status?: { description: string; kind: ChatResponseReferencePartStatusKind } }): void;

		codeCitation(value: Uri, license: string, snippet: string): void;

		push(part: ExtendedChatResponsePart): void;
	}

	export enum ChatResponseReferencePartStatusKind {
		Complete = 1,
		Partial = 2,
		Omitted = 3
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

		/**
		 * Event that fires when a request is paused or unpaused.
		 * Chat requests are initialy unpaused in the {@link requestHandler}.
		 */
		onDidChangePauseState: Event<ChatParticipantPauseStateEvent>;
	}

	export interface ChatParticipantPauseStateEvent {
		request: ChatRequest;
		isPaused: boolean;
	}

	export interface ChatParticipantCompletionItemProvider {
		provideCompletionItems(query: string, token: CancellationToken): ProviderResult<ChatCompletionItem[]>;
	}

	export class ChatCompletionItem {
		id: string;
		label: string | CompletionItemLabel;
		values: ChatVariableValue[];
		fullName?: string;
		icon?: ThemeIcon;
		insertText?: string;
		detail?: string;
		documentation?: string | MarkdownString;
		command?: Command;

		constructor(id: string, label: string | CompletionItemLabel, values: ChatVariableValue[]);
	}

	export type ChatExtendedRequestHandler = (request: ChatRequest, context: ChatContext, response: ChatResponseStream, token: CancellationToken) => ProviderResult<ChatResult | void>;

	export interface ChatResult {
		nextQuestion?: {
			prompt: string;
			participant?: string;
			command?: string;
		};
	}

	export namespace chat {
		/**
		 * Create a chat participant with the extended progress type
		 */
		export function createChatParticipant(id: string, handler: ChatExtendedRequestHandler): ChatParticipant;
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

	export interface ChatApplyAction {
		// eslint-disable-next-line local/vscode-dts-string-type-literals
		kind: 'apply';
		codeBlockIndex: number;
		totalCharacters: number;
		newFile?: boolean;
		codeMapper?: string;
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
		// eslint-disable-next-line local/vscode-dts-string-type-literals
		kind: 'editor';
		accepted: boolean;
	}

	export interface ChatEditingSessionAction {
		// eslint-disable-next-line local/vscode-dts-string-type-literals
		kind: 'chatEditingSessionAction';
		uri: Uri;
		hasRemainingEdits: boolean;
		outcome: ChatEditingSessionActionOutcome;
	}

	export enum ChatEditingSessionActionOutcome {
		Accepted = 1,
		Rejected = 2,
		Saved = 3
	}

	export interface ChatUserActionEvent {
		readonly result: ChatResult;
		readonly action: ChatCopyAction | ChatInsertAction | ChatApplyAction | ChatTerminalAction | ChatCommandAction | ChatFollowupAction | ChatBugReportAction | ChatEditorAction | ChatEditingSessionAction;
	}

	export interface ChatPromptReference {
		/**
		 * TODO Needed for now to drive the variableName-type reference, but probably both of these should go away in the future.
		 */
		readonly name: string;
	}

	export interface ChatResultFeedback {
		readonly unhelpfulReason?: string;
	}

	export namespace lm {
		export function fileIsIgnored(uri: Uri, token?: CancellationToken): Thenable<boolean>;
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

	/**
	 * The detail level of this chat variable value.
	 */
	export enum ChatVariableLevel {
		Short = 1,
		Medium = 2,
		Full = 3
	}

	export interface LanguageModelToolInvocationOptions<T> {
		model?: LanguageModelChat;
	}
}
