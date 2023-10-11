/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface ChatAgentContext {
		// messages so far
		history: ChatMessage[]; // Should be same type as request?
	}

	export interface ChatAgentResult extends InteractiveResponseForProgress { }

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

		// is this needed? would allow us to do the caching more nicely?
		// onDidChangeSlashCommands?: Event<void>;

		// - called when suggest is triggered
		// - called when focus moves to input box?
		provideSlashCommands(token: CancellationToken): ProviderResult<ChatAgentSlashCommand[]>;
	}

	export interface FollowupProvider {
		provideFollowups(result: ChatAgentResult, token: CancellationToken): ProviderResult<InteractiveSessionFollowup[]>;
	}

	export interface ChatAgent2 {
		readonly name: string;

		description: string;
		fullName: string;

		/**
		 * Icon for the agent shown in UI.
		 */
		iconPath?: Uri;

		slashCommandProvider?: ChatAgentSlashCommandProvider;
		followupProvider?: FollowupProvider;

		// We need this- can't handle telemetry on the vscode side yet
		// onDidPerformAction: Event<{ action: InteractiveSessionUserAction }>;
		dispose(): void;
		// prepareSession(); Something like prepareSession from the interactive chat provider might be needed. Probably nobody needs it right now.
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
		 * The {@link ChatAgentSlashCommand slash command} that was selected for this request
		 */
		slashCommand?: ChatAgentSlashCommand;

		variables: Record<string, ChatVariableValue[]>;
	}

	export type ChatAgentHandler = (request: ChatAgentRequest, context: ChatAgentContext, progress: Progress<InteractiveProgress>, token: CancellationToken) => ProviderResult<ChatAgentResult>;

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
