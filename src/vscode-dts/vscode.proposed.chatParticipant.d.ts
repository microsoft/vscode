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
		 * @hidden
		 */
		private constructor(prompt: string, command: string | undefined, references: ChatPromptReference[], participant: string);
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

		/**
		 * @hidden
		 */
		private constructor(response: ReadonlyArray<ChatResponseMarkdownPart | ChatResponseFileTreePart | ChatResponseAnchorPart | ChatResponseCommandButtonPart>, result: ChatResult, participant: string);
	}

	/**
	 * Extra context passed to a participant.
	 */
	export interface ChatContext {
		/**
		 * All of the chat messages so far in the current chat session. Currently, only chat messages for the current participant are included.
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
		 * Dispose this participant and free resources.
		 */
		dispose(): void;
	}

	export interface ChatPromptReference {
		/**
		 * A unique identifier for this kind of reference.
		 */
		readonly id: string;

		/**
		 * The start and end index of the reference in the {@link ChatRequest.prompt prompt}. When undefined, the reference was not part of the prompt text.
		 *
		 * *Note* that the indices take the leading `#`-character into account which means they can
		 * used to modify the prompt as-is.
		 */
		readonly range?: [start: number, end: number];

		/**
		 * A description of this value that could be used in an LLM prompt.
		 */
		readonly modelDescription?: string;

		/**
		 * The value of this reference. The `string | Uri | Location` types are used today, but this could expand in the future.
		 */
		readonly value: string | Uri | Location | unknown;
	}

	export interface ChatRequest {
		/**
		 * The prompt as entered by the user.
		 *
		 * Information about references used in this request is stored in {@link ChatRequest.references}.
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
		 * The list of references and their values that are referenced in the prompt.
		 *
		 * *Note* that the prompt contains references as authored and that it is up to the participant
		 * to further modify the prompt, for instance by inlining reference values or creating links to
		 * headings which contain the resolved values. References are sorted in reverse by their range
		 * in the prompt. That means the last reference in the prompt is the first in this list. This simplifies
		 * string-manipulation of the prompt.
		 */
		readonly references: readonly ChatPromptReference[];
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
		 */
		markdown(value: string | MarkdownString): void;

		/**
		 * Push an anchor part to this stream. Short-hand for
		 * `push(new ChatResponseAnchorPart(value, title))`.
		 * An anchor is an inline reference to some type of resource.
		 *
		 * @param value A uri, location, or symbol information.
		 * @param title An optional title that is rendered with value.
		 */
		anchor(value: Uri | Location, title?: string): void;

		/**
		 * Push a command button part to this stream. Short-hand for
		 * `push(new ChatResponseCommandButtonPart(value, title))`.
		 *
		 * @param command A Command that will be executed when the button is clicked.
		 */
		button(command: Command): void;

		/**
		 * Push a filetree part to this stream. Short-hand for
		 * `push(new ChatResponseFileTreePart(value))`.
		 *
		 * @param value File tree data.
		 * @param baseUri The base uri to which this file tree is relative.
		 */
		filetree(value: ChatResponseFileTree[], baseUri: Uri): void;

		/**
		 * Push a progress part to this stream. Short-hand for
		 * `push(new ChatResponseProgressPart(value))`.
		 *
		 * @param value A progress message
		 */
		progress(value: string): void;

		/**
		 * Push a reference to this stream. Short-hand for
		 * `push(new ChatResponseReferencePart(value))`.
		 *
		 * *Note* that the reference is not rendered inline with the response.
		 *
		 * @param value A uri or location
		 * @param iconPath Icon for the reference shown in UI
		 */
		reference(value: Uri | Location, iconPath?: Uri | ThemeIcon | { light: Uri; dark: Uri }): void;

		/**
		 * Pushes a part to this stream.
		 *
		 * @param part A response part, rendered or metadata
		 */
		push(part: ChatResponsePart): void;
	}

	/**
	 * Represents a part of a chat response that is formatted as Markdown.
	 */
	export class ChatResponseMarkdownPart {
		/**
		 * A markdown string or a string that should be interpreted as markdown.
		 */
		value: MarkdownString;

		/**
		 * Create a new ChatResponseMarkdownPart.
		 *
		 * @param value A markdown string or a string that should be interpreted as markdown. The boolean form of {@link MarkdownString.isTrusted} is NOT supported.
		 */
		constructor(value: string | MarkdownString);
	}

	/**
	 * Represents a file tree structure in a chat response.
	 */
	export interface ChatResponseFileTree {
		/**
		 * The name of the file or directory.
		 */
		name: string;

		/**
		 * An array of child file trees, if the current file tree is a directory.
		 */
		children?: ChatResponseFileTree[];
	}

	/**
	 * Represents a part of a chat response that is a file tree.
	 */
	export class ChatResponseFileTreePart {
		/**
		 * File tree data.
		 */
		value: ChatResponseFileTree[];

		/**
		 * The base uri to which this file tree is relative
		 */
		baseUri: Uri;

		/**
		 * Create a new ChatResponseFileTreePart.
		 * @param value File tree data.
		 * @param baseUri The base uri to which this file tree is relative.
		 */
		constructor(value: ChatResponseFileTree[], baseUri: Uri);
	}

	/**
	 * Represents a part of a chat response that is an anchor, that is rendered as a link to a target.
	 */
	export class ChatResponseAnchorPart {
		/**
		 * The target of this anchor.
		 */
		value: Uri | Location;

		/**
		 * An optional title that is rendered with value.
		 */
		title?: string;

		/**
		 * Create a new ChatResponseAnchorPart.
		 * @param value A uri or location.
		 * @param title An optional title that is rendered with value.
		 */
		constructor(value: Uri | Location, title?: string);
	}

	/**
	 * Represents a part of a chat response that is a progress message.
	 */
	export class ChatResponseProgressPart {
		/**
		 * The progress message
		 */
		value: string;

		/**
		 * Create a new ChatResponseProgressPart.
		 * @param value A progress message
		 */
		constructor(value: string);
	}

	/**
	 * Represents a part of a chat response that is a reference, rendered separately from the content.
	 */
	export class ChatResponseReferencePart {
		/**
		 * The reference target.
		 */
		value: Uri | Location;

		/**
		 * The icon for the reference.
		 */
		iconPath?: Uri | ThemeIcon | { light: Uri; dark: Uri };

		/**
		 * Create a new ChatResponseReferencePart.
		 * @param value A uri or location
		 * @param iconPath Icon for the reference shown in UI
		 */
		constructor(value: Uri | Location, iconPath?: Uri | ThemeIcon | { light: Uri; dark: Uri });
	}

	/**
	 * Represents a part of a chat response that is a button that executes a command.
	 */
	export class ChatResponseCommandButtonPart {
		/**
		 * The command that will be executed when the button is clicked.
		 */
		value: Command;

		/**
		 * Create a new ChatResponseCommandButtonPart.
		 * @param value A Command that will be executed when the button is clicked.
		 */
		constructor(value: Command);
	}

	/**
	 * Represents the different chat response types.
	 */
	export type ChatResponsePart = ChatResponseMarkdownPart | ChatResponseFileTreePart | ChatResponseAnchorPart
		| ChatResponseProgressPart | ChatResponseReferencePart | ChatResponseCommandButtonPart;


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
