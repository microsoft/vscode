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
		iconPath?: Uri;

		slashCommandProvider?: ChatAgentSlashCommandProvider;

		followupProvider?: FollowupProvider;

		// TODO@API We need this- can't handle telemetry on the vscode side yet
		// onDidPerformAction: Event<{ action: InteractiveSessionUserAction }>;


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

	// TODO@API InteractiveProgress is a lot to inline...
	export type ChatAgentHandler = (request: ChatAgentRequest, context: ChatAgentContext, progress: Progress<InteractiveProgress>, token: CancellationToken) => ProviderResult<ChatAgentResult2>;

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
