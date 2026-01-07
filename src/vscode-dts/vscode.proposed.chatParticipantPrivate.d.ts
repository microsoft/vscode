/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// version: 11

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
		 * The session identifier for this chat request
		 */
		readonly sessionId: string;

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

		readonly isSubagent?: boolean;
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
		 * @hidden
		 */
		constructor(prompt: string, command: string | undefined, references: ChatPromptReference[], participant: string, toolReferences: ChatLanguageModelToolReference[], editedFileEvents: ChatRequestEditedFileEvent[] | undefined);
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

	export interface LanguageModelToolInvocationOptions<T> {
		chatRequestId?: string;
		chatSessionId?: string;
		chatInteractionId?: string;
		terminalCommand?: string;
		/**
		 * Lets us add some nicer UI to toolcalls that came from a sub-agent, but in the long run, this should probably just be rendered in a similar way to thinking text + tool call groups
		 */
		fromSubAgent?: boolean;
	}

	export interface LanguageModelToolInvocationPrepareOptions<T> {
		/**
		 * The input that the tool is being invoked with.
		 */
		input: T;
		chatRequestId?: string;
		chatSessionId?: string;
		chatInteractionId?: string;
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

	// #region CustomAgentProvider

	/**
	 * Private metadata for resource files.
	 */
	export interface ResourceMetadata {
		/**
		 * The source to be displayed in the resource dropdown.
		 */
		readonly customSource?: string;
	}

	/**
	 * Represents a custom agent resource file (e.g., .agent.md) available for a repository.
	 */
	export interface CustomAgentResource {
		/**
		 * The unique identifier/name of the custom agent.
		 */
		readonly name: string;

		/**
		 * A description of what the custom agent does.
		 */
		readonly description: string;

		/**
		 * The URI to the custom agent resource file.
		 */
		readonly uri: Uri;

		/**
		 * Indicates whether the custom agent is editable. Defaults to false.
		 */
		readonly isEditable?: boolean;
	}

	/**
	 * Private extension of CustomAgentResource with additional metadata.
	 */
	export interface CustomAgentResource {
		/**
		 * Optional metadata for the custom agent resource.
		 */
		readonly metadata?: ResourceMetadata;
	}

	/**
	 * Options for querying custom agents.
	 */
	export interface CustomAgentQueryOptions { }

	/**
	 * A provider that supplies custom agent resources (from .agent.md files) for repositories.
	 */
	export interface CustomAgentProvider {
		/**
		 * An optional event to signal that custom agents have changed.
		 */
		readonly onDidChangeCustomAgents?: Event<void>;

		/**
		 * Provide the list of custom agents available.
		 * @param options Optional query parameters.
		 * @param token A cancellation token.
		 * @returns An array of custom agent resources or a promise that resolves to such.
		 */
		provideCustomAgents(options: CustomAgentQueryOptions, token: CancellationToken): ProviderResult<CustomAgentResource[]>;
	}

	// #endregion

	// #region InstructionsProvider

	/**
	 * Represents an instructions resource file available for a repository.
	 */
	export interface InstructionsResource {
		/**
		 * The unique identifier/name of the instructions.
		 */
		readonly name: string;

		/**
		 * A description of what the instructions provide.
		 */
		readonly description: string;

		/**
		 * The URI to the instructions resource file.
		 */
		readonly uri: Uri;

		/**
		 * Indicates whether the instructions are editable. Defaults to false.
		 */
		readonly isEditable?: boolean;
	}

	/**
	 * Private extension of InstructionsResource with additional metadata.
	 */
	export interface InstructionsResource {
		/**
		 * Optional metadata for the instructions resource.
		 */
		readonly metadata?: ResourceMetadata;
	}

	/**
	 * Options for querying instructions.
	 */
	export interface InstructionsQueryOptions { }

	/**
	 * A provider that supplies instructions resources for repositories.
	 */
	export interface InstructionsProvider {
		/**
		 * An optional event to signal that instructions have changed.
		 */
		readonly onDidChangeInstructions?: Event<void>;

		/**
		 * Provide the list of instructions available.
		 * @param options Optional query parameters.
		 * @param token A cancellation token.
		 * @returns An array of instructions resources or a promise that resolves to such.
		 */
		provideInstructions(options: InstructionsQueryOptions, token: CancellationToken): ProviderResult<InstructionsResource[]>;
	}

	// #endregion

	// #region PromptFileProvider

	/**
	 * Represents a prompt file resource (e.g., .prompt.md) available for a repository.
	 */
	export interface PromptFileResource {
		/**
		 * The unique identifier/name of the prompt file.
		 */
		readonly name: string;

		/**
		 * A description of what the prompt file does.
		 */
		readonly description: string;

		/**
		 * The URI to the prompt file resource.
		 */
		readonly uri: Uri;

		/**
		 * Indicates whether the prompt file is editable. Defaults to false.
		 */
		readonly isEditable?: boolean;
	}

	/**
	 * Private extension of PromptFileResource with additional metadata.
	 */
	export interface PromptFileResource {
		/**
		 * Optional metadata for the prompt file resource.
		 */
		readonly metadata?: ResourceMetadata;
	}

	/**
	 * Options for querying prompt files.
	 */
	export interface PromptFileQueryOptions { }

	/**
	 * A provider that supplies prompt file resources (from .prompt.md files) for repositories.
	 */
	export interface PromptFileProvider {
		/**
		 * An optional event to signal that prompt files have changed.
		 */
		readonly onDidChangePromptFiles?: Event<void>;

		/**
		 * Provide the list of prompt files available.
		 * @param options Optional query parameters.
		 * @param token A cancellation token.
		 * @returns An array of prompt file resources or a promise that resolves to such.
		 */
		providePromptFiles(options: PromptFileQueryOptions, token: CancellationToken): ProviderResult<PromptFileResource[]>;
	}

	// #endregion

	// #region Chat Provider Registration

	export namespace chat {
		/**
		 * Register a provider for custom agents.
		 * @param provider The custom agent provider.
		 * @returns A disposable that unregisters the provider when disposed.
		 */
		export function registerCustomAgentProvider(provider: CustomAgentProvider): Disposable;

		/**
		 * Register a provider for instructions.
		 * @param provider The instructions provider.
		 * @returns A disposable that unregisters the provider when disposed.
		 */
		export function registerInstructionsProvider(provider: InstructionsProvider): Disposable;

		/**
		 * Register a provider for prompt files.
		 * @param provider The prompt file provider.
		 * @returns A disposable that unregisters the provider when disposed.
		 */
		export function registerPromptFileProvider(provider: PromptFileProvider): Disposable;
	}

	// #endregion
}
