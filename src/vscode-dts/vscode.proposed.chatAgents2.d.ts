/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	/**
	 * One request/response pair in chat history.
	 */
	export interface ChatAgentHistoryEntry {
		/**
		 * The request that was sent to the chat agent.
		 */
		request: ChatAgentRequest;

		/**
		 * The content that was received from the chat agent. Only the progress parts that represent actual content (not metadata) are represented.
		 */
		response: ReadonlyArray<ChatResponseTextPart | ChatResponseMarkdownPart | ChatResponseFileTreePart | ChatResponseAnchorPart | ChatResponseCommandButtonPart>;

		/**
		 * The result that was received from the chat agent.
		 */
		result: ChatAgentResult2;
	}

	// TODO@API name: Turn?
	export class ChatAgentRequestTurn {

		/**
		 * The prompt as entered by the user.
		 *
		 * Information about variables used in this request are is stored in {@link ChatAgentRequest.variables2}.
		 *
		 * *Note* that the {@link ChatAgent2.name name} of the agent and the {@link ChatAgentCommand.name command}
		 * are not part of the prompt.
		 */
		readonly prompt: string;

		/**
		 * The ID of the chat agent to which this request was directed.
		 */
		readonly agentId: string;

		/**
		 * The name of the {@link ChatAgentCommand command} that was selected for this request.
		 */
		readonly command: string | undefined;

		/**
		 *
		 */
		// TODO@API is this needed?
		readonly variables: ChatAgentResolvedVariable[];

		private constructor(prompt: string, agentId: string, command: string | undefined, variables: ChatAgentResolvedVariable[],);
	}

	// TODO@API name: Turn?
	export class ChatAgentResponseTurn {

		/**
		 * The content that was received from the chat agent. Only the progress parts that represent actual content (not metadata) are represented.
		 */
		readonly response: ReadonlyArray<ChatResponseTextPart | ChatResponseMarkdownPart | ChatResponseFileTreePart | ChatResponseAnchorPart | ChatResponseCommandButtonPart>;

		/**
		 * The result that was received from the chat agent.
		 */
		readonly result: ChatAgentResult2;

		readonly agentId: string;

		private constructor(response: ReadonlyArray<ChatResponseTextPart | ChatResponseMarkdownPart | ChatResponseFileTreePart | ChatResponseAnchorPart | ChatResponseCommandButtonPart>, result: ChatAgentResult2, agentId: string);
	}

	export interface ChatAgentContext {
		/**
		 * @deprecated
		 */
		history: ChatAgentHistoryEntry[];

		// location:

		/**
		 * All of the chat messages so far in the current chat session.
		 */
		// TODO@API name: histroy
		readonly history2: ReadonlyArray<ChatAgentRequestTurn | ChatAgentResponseTurn>;
	}

	/**
	 * Represents an error result from a chat request.
	 */
	export interface ChatAgentErrorDetails {
		/**
		 * An error message that is shown to the user.
		 */
		message: string;

		/**
		 * If partial markdown content was sent over the `progress` callback before the response terminated, then this flag
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
	export interface ChatAgentResult2 {
		/**
		 * If the request resulted in an error, this property defines the error details.
		 */
		errorDetails?: ChatAgentErrorDetails;

		/**
		 * Arbitrary metadata for this result. Can be anything but must be JSON-stringifyable.
		 */
		readonly metadata?: { readonly [key: string]: any };
	}

	/**
	 * Represents the type of user feedback received.
	 */
	export enum ChatAgentResultFeedbackKind {
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
	export interface ChatAgentResult2Feedback {
		/**
		 * This instance of ChatAgentResult2 is the same instance that was returned from the chat agent,
		 * and it can be extended with arbitrary properties if needed.
		 */
		readonly result: ChatAgentResult2;

		/**
		 * The kind of feedback that was received.
		 */
		readonly kind: ChatAgentResultFeedbackKind;
	}

	export interface ChatAgentCommand {
		/**
		 * A short name by which this command is referred to in the UI, e.g. `fix` or
		 * `explain` for commands that fix an issue or explain code.
		 *
		 * **Note**: The name should be unique among the commands provided by this agent.
		 */
		readonly name: string;

		/**
		 * Human-readable description explaining what this command does.
		 */
		readonly description: string;

		/**
		 * When the user clicks this command in `/help`, this text will be submitted to this command
		 */
		readonly sampleRequest?: string;

		/**
		 * Whether executing the command puts the
		 * chat into a persistent mode, where the
		 * command is prepended to the chat input.
		 */
		readonly shouldRepopulate?: boolean;

		/**
		 * Placeholder text to render in the chat input
		 * when the command has been repopulated.
		 * Has no effect if `shouldRepopulate` is `false`.
		 */
		// TODO@API merge this with shouldRepopulate? so that invalid state cannot be represented?
		readonly followupPlaceholder?: string;
	}

	export interface ChatAgentCommandProvider {

		/**
		 * Returns a list of commands that its agent is capable of handling. A command
		 * can be selected by the user and will then be passed to the {@link ChatAgentHandler handler}
		 * via the {@link ChatAgentRequest.command command} property.
		 *
		 *
		 * @param token A cancellation token.
		 * @returns A list of commands. The lack of a result can be signaled by returning `undefined`, `null`, or
		 * an empty array.
		 */
		provideCommands(token: CancellationToken): ProviderResult<ChatAgentCommand[]>;
	}

	/**
	 * A followup question suggested by the model.
	 */
	export interface ChatAgentFollowup {
		/**
		 * The message to send to the chat.
		 * TODO@API is it ok for variables to resolved from the text of this prompt, using the `#` syntax?
		 */
		prompt: string;

		/**
		 * By default, the followup goes to the same agent/subCommand. But these properties can be set to override that.
		 */
		agentId?: string;

		subCommand?: string;

		/**
		 * A tooltip to show when hovering over the followup.
		 */
		tooltip?: string;

		/**
		 * A title to show the user, when it is different than the message.
		 */
		title?: string;
	}

	/**
	 * Will be invoked once after each request to get suggested followup questions to show the user. The user can click the followup to send it to the chat.
	 */
	export interface ChatAgentFollowupProvider {
		/**
		 *
		 * @param result The same instance of the result object that was returned by the chat agent, and it can be extended with arbitrary properties if needed.
		 * @param token A cancellation token.
		 */
		provideFollowups(result: ChatAgentResult2, token: CancellationToken): ProviderResult<ChatAgentFollowup[]>;
	}

	export interface ChatAgent2 {

		/**
		 * The short name by which this agent is referred to in the UI, e.g `workspace`.
		 */
		readonly name: string;

		/**
		 * The full name of this agent.
		 */
		fullName: string;

		/**
		 * A human-readable description explaining what this agent does.
		 */
		description: string;

		/**
		 * Icon for the agent shown in UI.
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
		 * This provider will be called to retrieve the agent's commands.
		 */
		commandProvider?: ChatAgentCommandProvider;

		/**
		 * This provider will be called once after each request to retrieve suggested followup questions.
		 */
		followupProvider?: ChatAgentFollowupProvider;


		// TODO@API
		// notify(request: ChatResponsePart, reference: string): boolean;
		// BETTER
		// requestResponseStream(callback: (stream: ChatAgentResponseStream) => void, why?: string): void;

		// TODO@API
		// clear NEVER happens
		// onDidClearResult(value: TResult): void;

		/**
		 * When the user clicks this agent in `/help`, this text will be submitted to this command
		 */
		sampleRequest?: string;

		/**
		 * An event that fires whenever feedback for a result is received, e.g. when a user up- or down-votes
		 * a result.
		 *
		 * The passed {@link ChatAgentResult2Feedback.result result} is guaranteed to be the same instance that was
		 * previously returned from this chat agent.
		 */
		onDidReceiveFeedback: Event<ChatAgentResult2Feedback>;

		/**
		 * Dispose this agent and free resources
		 */
		dispose(): void;
	}

	export interface ChatAgentResolvedVariable {
		name: string;
		range: [start: number, end: number];
		values: ChatVariableValue[];
	}

	export interface ChatAgentRequest {

		/**
		 * The prompt entered by the user. The {@link ChatAgent2.name name} of the agent or the {@link ChatAgentCommand.name command}
		 * are not part of the prompt.
		 *
		 * @see {@link ChatAgentRequest.command}
		 */
		prompt: string;

		/**
		 * The prompt as entered by the user.
		 *
		 * Information about variables used in this request are is stored in {@link ChatAgentRequest.variables2}.
		 *
		 * *Note* that the {@link ChatAgent2.name name} of the agent and the {@link ChatAgentCommand.name command}
		 * are not part of the prompt.
		 */
		prompt2: string;

		/**
		 * The ID of the chat agent to which this request was directed.
		 */
		agentId: string;

		/**
		 * The name of the {@link ChatAgentCommand command} that was selected for this request.
		 */
		command?: string;

		/** @deprecated */
		variables: Record<string, ChatVariableValue[]>;

		/**
		 *
		 */
		variables2: ChatAgentResolvedVariable[];
	}

	export interface ChatAgentResponseStream {

		/**
		 * Push a text part to this stream. Short-hand for
		 * `push(new ChatResponseTextPart(value))`.
		 *
		 * @see {@link ChatAgentResponseStream.push}
		 * @param value A plain text value.
		 * @returns This stream.
		 */
		text(value: string): ChatAgentResponseStream;

		/**
		 * Push a markdown part to this stream. Short-hand for
		 * `push(new ChatResponseMarkdownPart(value))`.
		 *
		 * @see {@link ChatAgentResponseStream.push}
		 * @param value A markdown string or a string that should be interpreted as markdown.
		 * @returns This stream.
		 */
		markdown(value: string | MarkdownString): ChatAgentResponseStream;

		/**
		 * Push an anchor part to this stream. Short-hand for
		 * `push(new ChatResponseAnchorPart(value, title))`.
		 *
		 * @param value A uri or location
		 * @param title An optional title that is rendered with value
		 * @returns This stream.
		 */
		anchor(value: Uri | Location, title?: string): ChatAgentResponseStream;

		/**
		 * Push a command button part to this stream. Short-hand for
		 * `push(new ChatResponseCommandButtonPart(value, title))`.
		 *
		 * @param command A Command that will be executed when the button is clicked.
		 * @returns This stream.
		 */
		button(command: Command): ChatAgentResponseStream;

		/**
		 * Push a filetree part to this stream. Short-hand for
		 * `push(new ChatResponseFileTreePart(value))`.
		 *
		 * @param value File tree data.
		 * @param baseUri The base uri to which this file tree is relative to.
		 * @returns This stream.
		 */
		filetree(value: ChatResponseFileTree[], baseUri: Uri): ChatAgentResponseStream;

		/**
		 * Push a progress part to this stream. Short-hand for
		 * `push(new ChatResponseProgressPart(value))`.
		 *
		 * @param value
		 * @returns This stream.
		 */
		// TODO@API is this always inline or not
		// TODO@API is this markdown or string?
		// TODO@API this influences the rendering, it inserts new lines which is likely a bug
		progress(value: string): ChatAgentResponseStream;

		/**
		 * Push a reference to this stream. Short-hand for
		 * `push(new ChatResponseReferencePart(value))`.
		 *
		 * *Note* that the reference is not rendered inline with the response.
		 *
		 * @param value A uri or location
		 * @returns This stream.
		 */
		// TODO@API support non-file uris, like http://example.com
		// TODO@API support mapped edits
		reference(value: Uri | Location): ChatAgentResponseStream;

		/**
		 * Pushes a part to this stream.
		 *
		 * @param part A response part, rendered or metadata
		 */
		push(part: ChatResponsePart): ChatAgentResponseStream;
	}

	// TODO@API
	// support ChatResponseCommandPart
	// support ChatResponseTextEditPart
	// support ChatResponseCodeReferencePart

	// TODO@API should the name suffix differentiate between rendered items (XYZPart)
	// and metadata like XYZItem
	export class ChatResponseTextPart {
		value: string;
		constructor(value: string);
	}

	export class ChatResponseMarkdownPart {
		value: MarkdownString;
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
		value: Uri | Location;
		constructor(value: Uri | Location);
	}

	export class ChatResponseCommandButtonPart {
		value: Command;
		constructor(value: Command);
	}

	export type ChatResponsePart = ChatResponseTextPart | ChatResponseMarkdownPart | ChatResponseFileTreePart | ChatResponseAnchorPart
		| ChatResponseProgressPart | ChatResponseReferencePart | ChatResponseCommandButtonPart;


	// TODO@API Remove a different type of `request` so that they can
	// evolve at their own pace
	export type ChatAgentHandler = (request: ChatAgentRequest, context: ChatAgentContext, response: ChatAgentResponseStream, token: CancellationToken) => ProviderResult<ChatAgentResult2>;

	export namespace chat {

		/**
		 * Create a new {@link ChatAgent2 chat agent} instance.
		 *
		 * @param name Short name by which this agent is referred to in the UI
		 * @param handler The reply-handler of the agent.
		 * @returns A new chat agent
		 */
		export function createChatAgent(name: string, handler: ChatAgentHandler): ChatAgent2;

		/**
		 * Register a variable which can be used in a chat request to any agent.
		 * @param name The name of the variable, to be used in the chat input as `#name`.
		 * @param description A description of the variable for the chat input suggest widget.
		 * @param resolver Will be called to provide the chat variable's value when it is used.
		 */
		// TODO@API NAME: registerChatVariable, registerChatVariableResolver
		export function registerVariable(name: string, description: string, resolver: ChatVariableResolver): Disposable;
	}

	/**
	 * The detail level of this chat variable value.
	 */
	// TODO@API maybe for round2
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
		 * The variable's value, which can be included in an LLM prompt as-is, or the chat agent may decide to read the value and do something else with it.
		 */
		value: string | Uri;

		/**
		 * A description of this value, which could be provided to the LLM as a hint.
		 */
		description?: string;
	}

	export interface ChatVariableContext {
		/**
		 * The message entered by the user, which includes this variable.
		 */
		prompt: string;
	}

	export interface ChatVariableResolver {
		/**
		 * A callback to resolve the value of a chat variable.
		 * @param name The name of the variable.
		 * @param context Contextual information about this chat request.
		 * @param token A cancellation token.
		 */
		resolve(name: string, context: ChatVariableContext, token: CancellationToken): ProviderResult<ChatVariableValue[]>;
	}
}
