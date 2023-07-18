/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export enum ChatMessageRole {
		System = 0,
		User = 1,
		Assistant = 2,
		Function = 3,
	}

	export class ChatMessage {
		role: ChatMessageRole;
		content: string;
		name?: string;

		constructor(role: ChatMessageRole, content: string);
	}

	// TODO: chat response builder
	export interface ChatResponse {
		message: ChatMessage;
	}

	export interface ChatResponseFragment {
		index: number;
		part: string;
	}

	export interface ChatResponseProvider {
		provideChatResponse(messages: ChatMessage[], options: { [name: string]: any }, progress: Progress<ChatResponseFragment>, token: CancellationToken): Thenable<any>;
	}

	export interface ChatResponseProviderMetadata {
		// TODO: add way to compute token count
		name: string;
	}

	export namespace llm {
		export function registerChatResponseProvider(id: string, provider: ChatResponseProvider, metadata: ChatResponseProviderMetadata): Disposable;
	}

}
