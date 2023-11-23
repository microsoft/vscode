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

	export interface ChatAgentErrorDetails {
		/**
		 * If set to true, the message content is completely hidden. Only ChatAgentErrorDetails#message will be shown.
		 */
		responseIsRedacted?: boolean;
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

	export interface ChatAgentVulnerability {
		title: string;
		description: string;
		// id: string; // Later we will need to be able to link these across multiple content chunks.
	}

	export interface ChatAgentContent {
		vulnerabilities?: ChatAgentVulnerability[];
	}

	export type ChatAgentExtendedProgress = ChatAgentProgress
		| ChatAgentMarkdownContent
		| ChatAgentDetectedAgent;

	export interface ChatAgent2 {
		/**
		 * Provide a set of variables that can only be used with this agent.
		 */
		agentVariableProvider?: { provider: ChatAgentCompletionItemProvider; triggerCharacters: string[] };
	}

	export interface ChatAgentCompletionItemProvider {
		provideCompletionItems(query: string, token: CancellationToken): ProviderResult<ChatAgentCompletionItem[]>;
	}

	export class ChatAgentCompletionItem {
		label: string | CompletionItemLabel;
		values: ChatVariableValue[];
		insertText?: string;
		detail?: string;
		documentation?: string | MarkdownString;

		constructor(label: string | CompletionItemLabel, values: ChatVariableValue[]);
	}

	export type ChatAgentExtendedHandler = (request: ChatAgentRequest, context: ChatAgentContext, progress: Progress<ChatAgentExtendedProgress>, token: CancellationToken) => ProviderResult<ChatAgentResult2>;

	export namespace chat {
		/**
		 * Create a chat agent with the extended progress type
		 */
		export function createChatAgent(name: string, handler: ChatAgentExtendedHandler): ChatAgent2;
	}
}
