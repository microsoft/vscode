/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export type ChatAgentWelcomeMessageContent = string | MarkdownString;

	export interface ChatAgentWelcomeMessageProvider {
		provideWelcomeMessage(token: CancellationToken): ProviderResult<ChatAgentWelcomeMessageContent[]>;
		provideSampleQuestions?(token: CancellationToken): ProviderResult<ChatAgentFollowup[]>;
	}

	export interface ChatAgent2<TResult extends ChatAgentResult2> {
		/**
		 * When true, this agent is invoked by default when no other agent is being invoked
		 */
		isDefault?: boolean;

		/**
		 * When true, this agent is invoked when the user submits their query using ctrl/cmd+enter
		 * TODO@API name
		 */
		isSecondary?: boolean;

		/**
		 * A string that will be added before the listing of chat agents in `/help`.
		 */
		helpTextPrefix?: string | MarkdownString;

		/**
		 * A string that will be appended after the listing of chat agents in `/help`.
		 */
		helpTextPostfix?: string | MarkdownString;

		welcomeMessageProvider?: ChatAgentWelcomeMessageProvider;
	}
}
