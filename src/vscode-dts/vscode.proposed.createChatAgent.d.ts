/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface ChatAgentContext {
		// messages so far
		history: ChatMessage[]; // Should be same type as request
	}

	export interface SlashResult extends InteractiveResponseForProgress { }

	export interface SlashCommand {
		readonly name: string;
		readonly description: string;
		// invoke: ChatAgentHandler;
	}

	// TODO@API will this be called slash commands or is the prefix configurable
	export interface SlashCommandProvider {

		// is this needed? would allow us to do the caching more nicely?
		// onDidChangeSlashCommands?: Event<void>;

		// - called when suggest is triggered
		// - called when focus moves to input box?
		provideSlashCommands(token: CancellationToken): ProviderResult<SlashCommand[]>;
	}

	// All agent and slashCommand details must be fully dynamic because they can be loaded from a remote server (github copilot extensibility).
	// But could be declared in package.json a well.
	export interface ChatAgent2 {

		// TODO@API naming: name, shortName, alias,
		readonly id: string;

		description: string;

		fullName?: string;

		iconPath?: ThemeIcon;

		slashCommandProvider?: SlashCommandProvider;

		slashCommands: ReadonlyArray<SlashCommand>;
		// Extensions can assign this to provide followups.
		// Maybe context.history is the only thing needed here, but if the extension relies on some other internal info, they could store that on SlashResult
		// copilot chat tries to save a little time by starting to compute followups before they are requested.
		provideFollowups?: (request: SlashRequest, result: SlashResult, context: ChatAgentContext, token: CancellationToken) => ProviderResult<InteractiveSessionFollowup[]>;

		// We need this- can't handle telemetry on the vscode side yet
		// onDidPerformAction: Event<{ action: InteractiveSessionUserAction }>;
		dispose(): void;
		// prepareSession(); Something like prepareSession from the interactive chat provider might be needed. Probably nobody needs it right now.
	}

	export type SlashRequest = Omit<InteractiveRequest, 'session'>;

	// Could include "slashCommand: SlashCommand | undefined" here instead of the invoke method.
	export type ChatAgentHandler = (request: SlashRequest, context: ChatAgentContext, progress: Progress<InteractiveProgress>, token: CancellationToken) => ProviderResult<SlashResult>;

	export namespace chat {
		// Invoking slash commands vs the agent with no slash command?
		// Could be a separate handler or a slash command with a '' id
		// TODO@API what is id for? can we use extension identifier?
		export function createChatAgent(id: string, description: string, fullName: string | undefined, icon: Uri | undefined, handler: ChatAgentHandler): ChatAgent2;
	}
}
