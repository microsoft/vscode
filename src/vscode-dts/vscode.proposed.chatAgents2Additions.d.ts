/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface ChatAgentUserActionEvent {
		readonly result: ChatAgentResult2;
		readonly action: InteractiveSessionCopyAction | InteractiveSessionInsertAction | InteractiveSessionTerminalAction | InteractiveSessionCommandAction | InteractiveSessionFollowupAction | InteractiveSessionBugReportAction;
	}

	export interface ChatAgent2 {
		onDidPerformAction: Event<ChatAgentUserActionEvent>;
		supportIssueReporting?: boolean;
	}

	/**
	 * This is temporary until inline references are fully supported and adopted
	 */
	export interface ChatAgentMarkdownContent {
		markdownContent: MarkdownString;
	}

	export interface ChatAgentDetectedAgent {
		agentName: string;
		command?: ChatAgentSlashCommand;
	}

	export type ChatAgentExtendedProgress = ChatAgentProgress
		| ChatAgentMarkdownContent
		| ChatAgentDetectedAgent;

	export type ChatAgentExtendedHandler = (request: ChatAgentRequest, context: ChatAgentContext, progress: Progress<ChatAgentExtendedProgress>, token: CancellationToken) => ProviderResult<ChatAgentResult2>;

	export namespace chat {
		/**
		 * Create a chat agent with the extended progress type
		 */
		export function createChatAgent(name: string, handler: ChatAgentExtendedHandler): ChatAgent2;
	}
}
