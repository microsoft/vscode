/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface ChatAgentHistoryEntry {
		request: ChatAgentRequest;
		response: ChatAgentContentProgress[];
		result: ChatAgentResult2;
	}

	export interface ChatAgentContext {
		/**
		 * All of the chat messages so far in the current chat session.
		 */
		history: ChatAgentHistoryEntry[];
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
	export interface ChatAgentResult2Feedback<TResult extends ChatAgentResult2> {
		/**
		 * This instance of ChatAgentResult2 is the same instance that was returned from the chat agent,
		 * and it can be extended with arbitrary properties if needed.
		 */
		readonly result: TResult;

		/**
		 * The kind of feedback that was received.
		 */
		readonly kind: ChatAgentResultFeedbackKind;
	}

	export interface ChatAgentSubCommand {
		/**
		 * A short name by which this command is referred to in the UI, e.g. `fix` or
		 * `explain` for commands that fix an issue or explain code.
		 *
		 * **Note**: The name should be unique among the subCommands provided by this agent.
		 */
		readonly name: string;

		/**
		 * Human-readable description explaining what this command does.
		 */
		readonly description: string;

		/**
		 * When the user clicks this subCommand in `/help`, this text will be submitted to this subCommand
		 */
		readonly sampleRequest?: string;

		/**
		 * Whether executing the command puts the
		 * chat into a persistent mode, where the
		 * subCommand is prepended to the chat input.
		 */
		readonly shouldRepopulate?: boolean;

		/**
		 * Placeholder text to render in the chat input
		 * when the subCommand has been repopulated.
		 * Has no effect if `shouldRepopulate` is `false`.
		 */
		// TODO@API merge this with shouldRepopulate? so that invalid state cannot be represented?
		readonly followupPlaceholder?: string;
	}

	export interface ChatAgentSubCommandProvider {

		/**
		 * Returns a list of subCommands that its agent is capable of handling. A subCommand
		 * can be selected by the user and will then be passed to the {@link ChatAgentHandler handler}
		 * via the {@link ChatAgentRequest.subCommand subCommand} property.
		 *
		 *
		 * @param token A cancellation token.
		 * @returns A list of subCommands. The lack of a result can be signaled by returning `undefined`, `null`, or
		 * an empty array.
		 */
		provideSubCommands(token: CancellationToken): ProviderResult<ChatAgentSubCommand[]>;
	}

	// TODO@API This should become a progress type, and use vscode.Command
	// TODO@API what's the when-property for? how about not returning it in the first place?
	export interface ChatAgentCommandFollowup {
		commandId: string;
		args?: any[];
		title: string; // supports codicon strings
		when?: string;
	}

	/**
	 * A followup question suggested by the model.
	 */
	export interface ChatAgentReplyFollowup {
		/**
		 * The message to send to the chat.
		 */
		message: string;

		/**
		 * A tooltip to show when hovering over the followup.
		 */
		tooltip?: string;

		/**
		 * A title to show the user, when it is different than the message.
		 */
		title?: string;
	}

	export type ChatAgentFollowup = ChatAgentCommandFollowup | ChatAgentReplyFollowup;

	/**
	 * Will be invoked once after each request to get suggested followup questions to show the user. The user can click the followup to send it to the chat.
	 */
	export interface FollowupProvider<TResult extends ChatAgentResult2> {
		/**
		 *
		 * @param result The same instance of the result object that was returned by the chat agent, and it can be extended with arbitrary properties if needed.
		 * @param token A cancellation token.
		 */
		provideFollowups(result: TResult, token: CancellationToken): ProviderResult<ChatAgentFollowup[]>;
	}

	export interface ChatAgent2<TResult extends ChatAgentResult2> {

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
		 * This provider will be called to retrieve the agent's subCommands.
		 */
		subCommandProvider?: ChatAgentSubCommandProvider;

		/**
		 * This provider will be called once after each request to retrieve suggested followup questions.
		 */
		followupProvider?: FollowupProvider<TResult>;

		/**
		 * When the user clicks this agent in `/help`, this text will be submitted to this subCommand
		 */
		sampleRequest?: string;

		/**
		 * An event that fires whenever feedback for a result is received, e.g. when a user up- or down-votes
		 * a result.
		 *
		 * The passed {@link ChatAgentResult2Feedback.result result} is guaranteed to be the same instance that was
		 * previously returned from this chat agent.
		 */
		onDidReceiveFeedback: Event<ChatAgentResult2Feedback<TResult>>;

		/**
		 * Dispose this agent and free resources
		 */
		dispose(): void;
	}

	export interface ChatAgentRequest {

		/**
		 * The prompt entered by the user. The {@link ChatAgent2.name name} of the agent or the {@link ChatAgentSubCommand.name subCommand}
		 * are not part of the prompt.
		 *
		 * @see {@link ChatAgentRequest.subCommand}
		 */
		prompt: string;

		/**
		 * The ID of the chat agent to which this request was directed.
		 */
		agentId: string;

		/**
		 * The {@link ChatAgentSubCommand subCommand} that was selected for this request. It is guaranteed that the passed subCommand
		 * is an instance that was previously returned from the {@link ChatAgentSubCommandProvider.provideSubCommands subCommand provider}.
		 * @deprecated this will be replaced by `subCommand`
		 */
		slashCommand?: ChatAgentSubCommand;

		/**
		 * The name of the {@link ChatAgentSubCommand subCommand} that was selected for this request.
		 */
		subCommand?: string;

		variables: Record<string, ChatVariableValue[]>;
	}

	export type ChatAgentContentProgress =
		| ChatAgentContent
		| ChatAgentFileTree
		| ChatAgentInlineContentReference;

	export type ChatAgentMetadataProgress =
		| ChatAgentUsedContext
		| ChatAgentContentReference
		| ChatAgentProgressMessage;

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

	export type ChatAgentHandler = (request: ChatAgentRequest, context: ChatAgentContext, progress: Progress<ChatAgentProgress>, token: CancellationToken) => ProviderResult<ChatAgentResult2>;

	export namespace chat {

		/**
		 * Create a new {@link ChatAgent2 chat agent} instance.
		 *
		 * @param name Short name by which this agent is referred to in the UI
		 * @param handler The reply-handler of the agent.
		 * @returns A new chat agent
		 */
		export function createChatAgent<TResult extends ChatAgentResult2>(name: string, handler: ChatAgentHandler): ChatAgent2<TResult>;

		/**
		 * Register a variable which can be used in a chat request to any agent.
		 * @param name The name of the variable, to be used in the chat input as `#name`.
		 * @param description A description of the variable for the chat input suggest widget.
		 * @param resolver Will be called to provide the chat variable's value when it is used.
		 */
		export function registerVariable(name: string, description: string, resolver: ChatVariableResolver): Disposable;
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
