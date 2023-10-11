/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface ChatAgentContext {
		// messages so far
		history: ChatMessage[]; // Should be same type as request?
	}

	export interface AgentResult extends InteractiveResponseForProgress { }

	export interface SlashCommand {
		readonly name: string;
		readonly description: string;
	}

	// TODO@API will this be called slash commands or is the prefix configurable
	export interface SlashCommandProvider {

		// is this needed? would allow us to do the caching more nicely?
		// onDidChangeSlashCommands?: Event<void>;

		// - called when suggest is triggered
		// - called when focus moves to input box?
		provideSlashCommands(token: CancellationToken): ProviderResult<SlashCommand[]>;
	}

	export interface FollowupProvider {
		provideFollowups(result: AgentResult, token: CancellationToken): ProviderResult<InteractiveSessionFollowup[]>;
	}

	export interface ChatAgent2 {
		readonly name: string;
		description: string;
		fullName?: string;
		icon?: Uri;
		slashCommandProvider?: SlashCommandProvider;
		followupProvider?: FollowupProvider;

		// We need this- can't handle telemetry on the vscode side yet
		// onDidPerformAction: Event<{ action: InteractiveSessionUserAction }>;
		dispose(): void;
		// prepareSession(); Something like prepareSession from the interactive chat provider might be needed. Probably nobody needs it right now.
	}

	export interface AgentRequest {
		message: string;
		variables: Record<string, ChatVariableValue[]>;
		slashCommand?: SlashCommand;
	}

	export type ChatAgentHandler = (request: AgentRequest, context: ChatAgentContext, progress: Progress<InteractiveProgress>, token: CancellationToken) => ProviderResult<AgentResult>;

	export namespace chat {
		export function createChatAgent(name: string, description: string, fullName: string | undefined, icon: Uri | undefined, handler: ChatAgentHandler): ChatAgent2;
	}
}
