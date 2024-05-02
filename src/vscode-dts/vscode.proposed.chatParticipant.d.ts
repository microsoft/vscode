/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	/**
	 * Represents a user request in chat history.
	 */
	export class ChatRequestTurn {
		/**
		 * The prompt as entered by the user.
		 *
		 * Information about variables used in this request is stored in {@link ChatRequestTurn.variables}.
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
		 * The variables that were used in this message.
		 * TODO@API rename to `references`?
		 */
		readonly variables: ChatValueReference[];

		private constructor(prompt: string, command: string | undefined, variables: ChatValueReference[], participant: string);
	}

	/**
	 * Represents a chat participant's response in chat history.
	 */
	export class ChatResponseTurn {
		/**
		 * The content that was received from the chat participant. Only the stream parts that represent actual content (not metadata) are represented.
		 */
		readonly response: ReadonlyArray<ChatResponseMarkdownPart | ChatResponseFileTreePart | ChatResponseAnchorPart | ChatResponseCommandButtonPart>;

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

		private constructor(response: ReadonlyArray<ChatResponseMarkdownPart | ChatResponseFileTreePart | ChatResponseAnchorPart | ChatResponseCommandButtonPart>, result: ChatResult, participant: string);
	}

	export interface ChatContext {
		/**
		 * All of the chat messages so far in the current chat session.
		 */
		readonly history: ReadonlyArray<ChatRequestTurn | ChatResponseTurn>;
	}

	/**
	 * Represents an error result from a chat request.
	 */
	export interface ChatErrorDetails {
		/**
		 * An error message that is shown to the user.
		 */
		message: string;

		/**
		 * If partial markdown content was sent over the {@link ChatRequestHandler handler}'s response stream before the response terminated, then this flag
		 * can be set to true and it will be rendered with incomplete markdown features patched up.
		 *
		 * For example, if the response terminated after sending part of a triple-backtick code block, then the editor will
		 * render it as a complete code block.
		 */
		responseIsIncomplete?: boolean;

		/**
		 * If set to true, the response will be partly blurred out.
		 */
		responseIsFiltered?: boolean;
	}

	/**
	 * The result of a chat request.
	 */
	export interface ChatResult {
		/**
		 * If the request resulted in an error, this property defines the error details.
		 */
		errorDetails?: ChatErrorDetails;

		/**
		 * Arbitrary metadata for this result. Can be anything, but must be JSON-stringifyable.
		 */
		readonly metadata?: { readonly [key: string]: any };
	}

	/**
	 * Represents the type of user feedback received.
	 */
	export enum ChatResultFeedbackKind {
		/**
		 * The user marked the result as helpful.
		 */
		Unhelpful = 0,

		/**
		 * The user marked the result as unhelpful.
		 */
		Helpful = 1,
	}

	/**
	 * Represents user feedback for a result.
	 */
	export interface ChatResultFeedback {
		/**
		 * The ChatResult for which the user is providing feedback.
		 * This object has the same properties as the result returned from the participant callback, including `metadata`, but is not the same instance.
		 */
		readonly result: ChatResult;

		/**
		 * The kind of feedback that was received.
		 */
		readonly kind: ChatResultFeedbackKind;
	}

	/**
	 * A followup question suggested by the participant.
	 */
	export interface ChatFollowup {
		/**
		 * The message to send to the chat.
		 */
		prompt: string;

		/**
		 * A title to show the user. The prompt will be shown by default, when this is unspecified.
		 */
		label?: string;

		/**
		 * By default, the followup goes to the same participant/command. But this property can be set to invoke a different participant by ID.
		 * Followups can only invoke a participant that was contributed by the same extension.
		 */
		participant?: string;

		/**
		 * By default, the followup goes to the same participant/command. But this property can be set to invoke a different command.
		 */
		command?: string;
	}

	/**
	 * Will be invoked once after each request to get suggested followup questions to show the user. The user can click the followup to send it to the chat.
	 */
	export interface ChatFollowupProvider {
		/**
		 * Provide followups for the given result.
		 * @param result This object has the same properties as the result returned from the participant callback, including `metadata`, but is not the same instance.
		 * @param token A cancellation token.
		 */
		provideFollowups(result: ChatResult, context: ChatContext, token: CancellationToken): ProviderResult<ChatFollowup[]>;
	}

	/**
	 * A chat request handler is a callback that will be invoked when a request is made to a chat participant.
	 */
	export type ChatRequestHandler = (request: ChatRequest, context: ChatContext, response: ChatResponseStream, token: CancellationToken) => ProviderResult<ChatResult | void>;

	/**
	 * A chat participant can be invoked by the user in a chat session, using the `@` prefix. When it is invoked, it handles the chat request and is solely
	 * responsible for providing a response to the user. A ChatParticipant is created using {@link chat.createChatParticipant}.
	 */
	export interface ChatParticipant {
		/**
		 * A unique ID for this participant.
		 */
		readonly id: string;

		/**
		 * An icon for the participant shown in UI.
		 */
		iconPath?: Uri | {
			/**
			 * The icon path for the light theme.
			 */
			light: Uri;
			/**
			 * The icon path for the dark theme.
			 */
			dark: Uri;
		} | ThemeIcon;

		/**
		 * The handler for requests to this participant.
		 */
		requestHandler: ChatRequestHandler;

		/**
		 * This provider will be called once after each request to retrieve suggested followup questions.
		 */
		followupProvider?: ChatFollowupProvider;

		/**
		 * An event that fires whenever feedback for a result is received, e.g. when a user up- or down-votes
		 * a result.
		 *
		 * The passed {@link ChatResultFeedback.result result} is guaranteed to be the same instance that was
		 * previously returned from this chat participant.
		 */
		onDidReceiveFeedback: Event<ChatResultFeedback>;

		/**
		 * Dispose this participant and free resources
		 */
		dispose(): void;
	}

	export interface ChatValueReference {
		/**
		 * The name of the reference.
		 * TODO@API How to handle name conflicts? Need id vs name?
		 */
		readonly name: string;

		/**
		 * The start and end index of the variable in the {@link ChatRequest.prompt prompt}.
		 *
		 * *Note* that the indices take the leading `#`-character into account which means they can
		 * used to modify the prompt as-is.
		 */
		readonly range: [start: number, end: number];

		/**
		 * The value of this reference. The `string | Uri | Location` types are used today, but this could expand in the future.
		 */
		readonly value: string | Uri | Location | unknown;
	}

	export interface ChatRequest {
		/**
		 * The prompt as entered by the user.
		 *
		 * Information about variables used in this request is stored in {@link ChatRequest.variables}.
		 *
		 * *Note* that the {@link ChatParticipant.name name} of the participant and the {@link ChatCommand.name command}
		 * are not part of the prompt.
		 */
		readonly prompt: string;

		/**
		 * The name of the {@link ChatCommand command} that was selected for this request.
		 */
		readonly command: string | undefined;


		/**
		 * The list of variables and their values that are referenced in the prompt.
		 *
		 * *Note* that the prompt contains varibale references as authored and that it is up to the participant
		 * to further modify the prompt, for instance by inlining variable values or creating links to
		 * headings which contain the resolved values. Variables are sorted in reverse by their range
		 * in the prompt. That means the last variable in the prompt is the first in this list. This simplifies
		 * string-manipulation of the prompt.
		 */
		readonly variables: readonly ChatValueReference[];
	}

	/**
	 * The ChatResponseStream is how a participant is able to return content to the chat view. It provides several methods for streaming different types of content
	 * which will be rendered in an appropriate way in the chat view. A participant can use the helper method for the type of content it wants to return, or it
	 * can instantiate a {@link ChatResponsePart} and use the generic {@link ChatResponseStream.push} method to return it.
	 */
	export interface ChatResponseStream {
		/**
		 * Push a markdown part to this stream. Short-hand for
		 * `push(new ChatResponseMarkdownPart(value))`.
		 *
		 * @see {@link ChatResponseStream.push}
		 * @param value A markdown string or a string that should be interpreted as markdown. The boolean form of {@link MarkdownString.isTrusted} is NOT supported.
		 * @returns This stream.
		 */
		markdown(value: string | MarkdownString): ChatResponseStream;

		/**
		 * Push an anchor part to this stream. Short-hand for
		 * `push(new ChatResponseAnchorPart(value, title))`.
		 * An anchor is an inline reference to some type of resource.
		 *
		 * @param value A uri or location
		 * @param title An optional title that is rendered with value
		 * @returns This stream.
		 */
		anchor(value: Uri | Location, title?: string): ChatResponseStream;

		/**
		 * Push a command button part to this stream. Short-hand for
		 * `push(new ChatResponseCommandButtonPart(value, title))`.
		 *
		 * @param command A Command that will be executed when the button is clicked.
		 * @returns This stream.
		 */
		button(command: Command): ChatResponseStream;

		/**
		 * Push a filetree part to this stream. Short-hand for
		 * `push(new ChatResponseFileTreePart(value))`.
		 *
		 * @param value File tree data.
		 * @param baseUri The base uri to which this file tree is relative to.
		 * @returns This stream.
		 */
		filetree(value: ChatResponseFileTree[], baseUri: Uri): ChatResponseStream;

		/**
		 * Push a progress part to this stream. Short-hand for
		 * `push(new ChatResponseProgressPart(value))`.
		 *
		 * @param value A progress message
		 * @returns This stream.
		 */
		progress(value: string): ChatResponseStream;

		/**
		 * Push a reference to this stream. Short-hand for
		 * `push(new ChatResponseReferencePart(value))`.
		 *
		 * *Note* that the reference is not rendered inline with the response.
		 *
		 * @param value A uri or location
		 * @param iconPath Icon for the reference shown in UI
		 * @returns This stream.
		 */
		reference(value: Uri | Location | { variableName: string; value?: Uri | Location }, iconPath?: ThemeIcon | { light: Uri; dark: Uri }): ChatResponseStream;

		/**
		 * Push a warning to this stream. Short-hand for
		 * `push(new ChatResponseWarningPart(message))`.
		 *
		 * @param message A warning message
		 * @returns This stream.
		 */
		warning(message: string | MarkdownString): ChatResponseStream;

		/**
		 * Pushes a part to this stream.
		 *
		 * @param part A response part, rendered or metadata
		 */
		push(part: ChatResponsePart): ChatResponseStream;
	}

	export class ChatResponseMarkdownPart {
		value: MarkdownString;

		/**
		 * @param value Note: The boolean form of {@link MarkdownString.isTrusted} is NOT supported.
		 */
		constructor(value: string | MarkdownString);
	}

	export interface ChatResponseFileTree {
		name: string;
		children?: ChatResponseFileTree[];
	}

	export class ChatResponseFileTreePart {
		value: ChatResponseFileTree[];
		baseUri: Uri;
		constructor(value: ChatResponseFileTree[], baseUri: Uri);
	}

	export class ChatResponseAnchorPart {
		value: Uri | Location | SymbolInformation;
		title?: string;
		constructor(value: Uri | Location | SymbolInformation, title?: string);
	}

	export class ChatResponseProgressPart {
		value: string;
		constructor(value: string);
	}

	export class ChatResponseReferencePart {
		value: Uri | Location | { variableName: string; value?: Uri | Location };
		iconPath?: ThemeIcon | { light: Uri; dark: Uri };
		constructor(value: Uri | Location | { variableName: string; value?: Uri | Location }, iconPath?: ThemeIcon | { light: Uri; dark: Uri });
	}

	export class ChatResponseCommandButtonPart {
		value: Command;
		constructor(value: Command);
	}

	export class ChatResponseWarningPart {
		value: MarkdownString;
		constructor(value: string | MarkdownString);
	}

	/**
	 * Represents the different chat response types.
	 */
	export type ChatResponsePart = ChatResponseMarkdownPart | ChatResponseFileTreePart | ChatResponseAnchorPart
		| ChatResponseProgressPart | ChatResponseReferencePart | ChatResponseCommandButtonPart | ChatResponseWarningPart;


	export namespace chat {
		/**
		 * Create a new {@link ChatParticipant chat participant} instance.
		 *
		 * @param id A unique identifier for the participant.
		 * @param handler A request handler for the participant.
		 * @returns A new chat participant
		 */
		export function createChatParticipant(id: string, handler: ChatRequestHandler): ChatParticipant;
	}
}
