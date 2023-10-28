/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface ChatAgentContext {
		/**
		 * All of the chat messages so far in the current chat session.
		 */
		history: ChatMessage[];
	}

	export interface ChatAgentErrorDetails {
		message: string;
		responseIsIncomplete?: boolean;
		responseIsFiltered?: boolean;
	}

	export interface ChatAgentResult2 {
		errorDetails?: ChatAgentErrorDetails;
	}

	export enum ChatAgentResultFeedbackKind {
		Unhelpful = 0,
		Helpful = 1,
	}

	export interface ChatAgentResult2Feedback {
		readonly result: ChatAgentResult2;
		readonly kind: ChatAgentResultFeedbackKind;
	}

	export interface ChatAgentSlashCommand {
		/**
		 * A short name by which this command is referred to in the UI, e.g. `fix` or
		 * `explain` for commands that fix an issue or explain code.
		 */
		readonly name: string;

		/**
		 * Human-readable description explaining what this command does.
		 */
		readonly description: string;

		/**
		 * Whether executing the command puts the
		 * chat into a persistent mode, where the
		 * slash command is prepended to the chat input.
		 */
		readonly shouldRepopulate?: boolean;
		/**
		 * Placeholder text to render in the chat input
		 * when the slash command has been repopulated.
		 * Has no effect if `shouldRepopulate` is `false`.
		 */
		readonly followupPlaceholder?: string;
	}

	export interface ChatAgentSlashCommandProvider {

		/**
		 * Returns a list of slash commands that its agent is capable of handling. A slash command
		 * and be selected by the user and will then be passed to the {@link ChatAgentHandler handler}
		 * via the {@link ChatAgentRequest.slashCommand slashCommand} property.
		 *
		 *
		 * @param token A cancellation token.
		 * @returns A list of slash commands. The lack of a result can be signaled by returning `undefined`, `null`, or
		 * an empty array.
		 */
		provideSlashCommands(token: CancellationToken): ProviderResult<ChatAgentSlashCommand[]>;
	}

	// TODO@API is this just a vscode.Command?
	// TODO@API what's the when-property for? how about not returning it in the first place?
	export interface ChatAgentCommandFollowup {
		commandId: string;
		args?: any[];
		title: string; // supports codicon strings
		when?: string;
	}

	export interface ChatAgentReplyFollowup {
		message: string;
		tooltip?: string;
		title?: string;
	}

	export type ChatAgentFollowup = ChatAgentCommandFollowup | ChatAgentReplyFollowup;

	export interface FollowupProvider {
		provideFollowups(result: ChatAgentResult2, token: CancellationToken): ProviderResult<ChatAgentFollowup[]>;
	}

	export interface ChatAgent2 {

		/**
		 * The short name by which this agent is referred to in the UI, e.g `workspace`
		 */
		readonly name: string;

		/**
		 * The full name of this agent
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

		slashCommandProvider?: ChatAgentSlashCommandProvider;

		followupProvider?: FollowupProvider;

		/**
		 * An event that fires whenever feedback for a result is received, e.g. when a user up- or down-votes
		 * a result.
		 *
		 * The passed {@link ChatAgentResult2Feedback.result result} is guaranteed to be the same instance that was
		 * previously returned from this chat agent.
		 */
		onDidReceiveFeedback: Event<ChatAgentResult2Feedback>;

		// TODO@API Something like prepareSession from the interactive chat provider might be needed.Probably nobody needs it right now.
		// prepareSession();

		/**
		 * TODO@API explain what happens wrt to history, in-flight requests etc...
		 * Dispose this agent and free resources
		 */
		dispose(): void;
	}

	export interface ChatAgentRequest {

		/**
		 * The prompt entered by the user. The {@link ChatAgent2.name name} of the agent or the {@link ChatAgentSlashCommand.name slash command}
		 * are not part of the prompt.
		 *
		 * @see {@link ChatAgentRequest.slashCommand}
		 */
		prompt: string;

		/**
		 * The {@link ChatAgentSlashCommand slash command} that was selected for this request. It is guaranteed that the passed slash
		 * command is an instance that was previously returned from the {@link ChatAgentSlashCommandProvider.provideSlashCommands slash command provider}.
		 */
		slashCommand?: ChatAgentSlashCommand;

		variables: Record<string, ChatVariableValue[]>;
	}

	// TODO@API should these each be prefixed ChatAgentProgress*?
	export type ChatAgentProgress =
		| ChatAgentContent
		| ChatAgentTask
		| ChatAgentFileTree
		| ChatAgentUsedContext
		| ChatAgentContentReference
		| ChatAgentInlineContentReference;

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
	 * Represents a piece of the chat response's content that is resolved asynchronously. It is rendered immediately with a placeholder,
	 * which is replaced once the full content is available.
	 */
	export interface ChatAgentTask {
		/**
		 * The markdown string to be rendered immediately.
		 */
		placeholder: string;

		/**
		 * A Thenable resolving to the real content. The placeholder will be replaced with this content once it's available.
		 */
		resolvedContent: Thenable<ChatAgentContent | ChatAgentFileTree>;
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
		uri: Uri;

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
		export function createChatAgent(name: string, handler: ChatAgentHandler): ChatAgent2;
	}
}
