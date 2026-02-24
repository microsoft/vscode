/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// version: 14

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
	}

	export class ChatRequestEditorData {

		readonly editor: TextEditor;

		//TODO@API should be the editor
		document: TextDocument;
		selection: Selection;

		/** @deprecated */
		wholeRange: Range;

		constructor(editor: TextEditor, document: TextDocument, selection: Selection, wholeRange: Range);
	}

	export class ChatRequestNotebookData {
		//TODO@API should be the editor
		readonly cell: TextDocument;

		constructor(cell: TextDocument);
	}

	export interface ChatRequest {
		/**
		 * The id of the chat request. Used to identity an interaction with any of the chat surfaces.
		 */
		readonly id: string;
		/**
		 * The attempt number of the request. The first request has attempt number 0.
		 */
		readonly attempt: number;

		/**
		 * The session identifier for this chat request.
		 *
		 * @deprecated Use {@link chatSessionResource} instead.
		 */
		readonly sessionId: string;

		/**
		 * The resource URI for the chat session this request belongs to.
		 */
		readonly sessionResource: Uri;

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

		/**
		 * Events for edited files in this session collected since the last request.
		 */
		readonly editedFileEvents?: ChatRequestEditedFileEvent[];

		/**
		 * Unique ID for the subagent invocation, used to group tool calls from the same subagent run together.
		 * Pass this to tool invocations when calling tools from within a subagent context.
		 */
		readonly subAgentInvocationId?: string;

		/**
		 * Display name of the subagent that is invoking this request.
		 */
		readonly subAgentName?: string;

		/**
		 * The request ID of the parent request that invoked this subagent.
		 */
		readonly parentRequestId?: string;

		/**
		 * Whether any hooks are enabled for this request.
		 */
		readonly hasHooksEnabled: boolean;
	}

	export enum ChatRequestEditedFileEventKind {
		Keep = 1,
		Undo = 2,
		UserModification = 3,
	}

	export interface ChatRequestEditedFileEvent {
		readonly uri: Uri;
		readonly eventKind: ChatRequestEditedFileEventKind;
	}

	/**
	 * ChatRequestTurn + private additions. Note- at runtime this is the SAME as ChatRequestTurn and instanceof is safe.
	 */
	export class ChatRequestTurn2 {
		/**
		 * The id of the chat request. Used to identity an interaction with any of the chat surfaces.
		 */
		readonly id?: string;
		/**
		 * The prompt as entered by the user.
		 *
		 * Information about references used in this request is stored in {@link ChatRequestTurn.references}.
		 *
		 * *Note* that the {@link ChatParticipant.name name} of the participant and the {@link ChatCommand.name command}
		 * are not part of the prompt.
		 */
		readonly prompt: string;

		/**
		 * The id of the chat participant to which this request was directed.
		 */
		readonly participant: string;

		/**
		 * The name of the {@link ChatCommand command} that was selected for this request.
		 */
		readonly command?: string;

		/**
		 * The references that were used in this message.
		 */
		readonly references: ChatPromptReference[];

		/**
		 * The list of tools were attached to this request.
		 */
		readonly toolReferences: readonly ChatLanguageModelToolReference[];

		/**
		 * Events for edited files in this session collected between the previous request and this one.
		 */
		readonly editedFileEvents?: ChatRequestEditedFileEvent[];

		/**
		 * The identifier of the language model that was used for this request, if known.
		 */
		readonly modelId?: string;

		/**
		 * @hidden
		 */
		constructor(prompt: string, command: string | undefined, references: ChatPromptReference[], participant: string, toolReferences: ChatLanguageModelToolReference[], editedFileEvents: ChatRequestEditedFileEvent[] | undefined, id: string | undefined, modelId: string | undefined);
	}

	export class ChatResponseTurn2 {
		/**
		 * The id of the chat response. Used to identity an interaction with any of the chat surfaces.
		 */
		readonly id?: string;

		/**
		 * The content that was received from the chat participant. Only the stream parts that represent actual content (not metadata) are represented.
		 */
		readonly response: ReadonlyArray<ChatResponseMarkdownPart | ChatResponseFileTreePart | ChatResponseAnchorPart | ChatResponseCommandButtonPart | ExtendedChatResponsePart | ChatToolInvocationPart>;

		/**
		 * The result that was received from the chat participant.
		 */
		readonly result: ChatResult;

		/**
		 * The id of the chat participant that this response came from.
		 */
		readonly participant: string;

		/**
		 * The name of the command that this response came from.
		 */
		readonly command?: string;

		constructor(response: ReadonlyArray<ChatResponseMarkdownPart | ChatResponseFileTreePart | ChatResponseAnchorPart | ChatResponseCommandButtonPart | ExtendedChatResponsePart>, result: ChatResult, participant: string);
	}

	export interface ChatParticipant {
		supportIssueReporting?: boolean;
	}

	export enum ChatErrorLevel {
		Info = 0,
		Warning = 1,
		Error = 2,
	}

	export interface ChatErrorDetails {
		/**
		 * If set to true, the message content is completely hidden. Only ChatErrorDetails#message will be shown.
		 */
		responseIsRedacted?: boolean;

		isQuotaExceeded?: boolean;

		isRateLimited?: boolean;

		level?: ChatErrorLevel;

		code?: string;
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

	export type PreToolUsePermissionDecision = 'allow' | 'deny' | 'ask';

	export interface LanguageModelToolInvocationOptions<T> {
		chatRequestId?: string;
		chatSessionResource?: Uri;
		chatInteractionId?: string;
		terminalCommand?: string;
		/**
		 * Unique ID for the subagent invocation, used to group tool calls from the same subagent run together.
		 */
		subAgentInvocationId?: string;
		/**
		 * Pre-tool-use hook result, if the hook was already executed by the caller.
		 * When provided, the tools service will skip executing its own preToolUse hook
		 * and use this result for permission decisions and input modifications instead.
		 */
		preToolUseResult?: {
			permissionDecision?: PreToolUsePermissionDecision;
			permissionDecisionReason?: string;
			updatedInput?: object;
		};
	}

	export interface LanguageModelToolInvocationPrepareOptions<T> {
		/**
		 * The input that the tool is being invoked with.
		 */
		input: T;
		chatRequestId?: string;
		chatSessionResource?: Uri;
		chatInteractionId?: string;
		/**
		 * If set, tells the tool that it should include confirmation messages.
		 */
		forceConfirmationReason?: string;
	}

	export interface PreparedToolInvocation {
		pastTenseMessage?: string | MarkdownString;
		presentation?: 'hidden' | 'hiddenAfterComplete' | undefined;
	}

	export class ExtendedLanguageModelToolResult extends LanguageModelToolResult {
		toolResultMessage?: string | MarkdownString;
		toolResultDetails?: Array<Uri | Location>;
		toolMetadata?: unknown;
		/** Whether there was an error calling the tool. The tool may still have partially succeeded. */
		hasError?: boolean;
	}

	// #region Chat participant detection

	export interface ChatParticipantMetadata {
		participant: string;
		command?: string;
		disambiguation: { category: string; description: string; examples: string[] }[];
	}

	export interface ChatParticipantDetectionResult {
		participant: string;
		command?: string;
	}

	export interface ChatParticipantDetectionProvider {
		provideParticipantDetection(chatRequest: ChatRequest, context: ChatContext, options: { participants?: ChatParticipantMetadata[]; location: ChatLocation }, token: CancellationToken): ProviderResult<ChatParticipantDetectionResult>;
	}

	export namespace chat {
		export function registerChatParticipantDetectionProvider(participantDetectionProvider: ChatParticipantDetectionProvider): Disposable;

		export const onDidDisposeChatSession: Event<string>;
	}

	export namespace window {
		/**
		 * The resource URI of the currently active chat panel session,
		 * or `undefined` if there is no active chat panel session.
		 */
		export const activeChatPanelSessionResource: Uri | undefined;

		/**
		 * An event that fires when the active chat panel session resource changes.
		 */
		export const onDidChangeActiveChatPanelSessionResource: Event<Uri | undefined>;
	}

	// #endregion

	// #region ChatErrorDetailsWithConfirmation

	export interface ChatErrorDetails {
		confirmationButtons?: ChatErrorDetailsConfirmationButton[];
	}

	export interface ChatErrorDetailsConfirmationButton {
		data: any;
		label: string;
	}

	// #endregion

	// #region LanguageModelProxyProvider

	/**
	 * Duplicated so that this proposal and languageModelProxy can be independent.
	 */
	export interface LanguageModelProxy extends Disposable {
		readonly uri: Uri;
		readonly key: string;
	}

	export interface LanguageModelProxyProvider {
		provideModelProxy(forExtensionId: string, token: CancellationToken): ProviderResult<LanguageModelProxy>;
	}

	export namespace lm {
		export function registerLanguageModelProxyProvider(provider: LanguageModelProxyProvider): Disposable;
	}

	// #endregion

	// #region Steering

	export interface ChatContext {
		/**
		 * Set to `true` by the editor to request the language model gracefully
		 * stop after its next opportunity. When set, it's likely that the editor
		 * will immediately follow up with a new request in the same conversation.
		 */
		readonly yieldRequested: boolean;
	}

	// #endregion
}
