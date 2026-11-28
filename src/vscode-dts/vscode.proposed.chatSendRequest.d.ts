/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/350549

	/**
	 * A request that an extension sends into an existing chat session, for example to deliver the
	 * result of background work that a request in that session started.
	 */
	export interface ChatSessionRequest {
		/**
		 * The message that the agent handling the request receives.
		 */
		readonly prompt: string;

		/**
		 * A short description of the request that the chat shows in place of the prompt, such as
		 * `Build finished`. The chat also shows which extension sent the request.
		 */
		readonly label: string;

		/**
		 * The id of a {@link ChatParticipant chat participant} of the calling extension that should
		 * handle the request. When omitted, the agent that handled the last request of the session
		 * handles it.
		 *
		 * Only sessions of the built-in chat support this. Sessions that a chat session provider or
		 * an agent host handles reject requests that set a participant.
		 */
		readonly participant?: string;

		/**
		 * How to deliver the request when the session is already handling a request. Defaults to
		 * {@link ChatSessionRequestDelivery.Queue}.
		 */
		readonly delivery?: ChatSessionRequestDelivery;
	}

	/**
	 * How a {@link ChatSessionRequest} is delivered when the session is already handling a request.
	 */
	export enum ChatSessionRequestDelivery {
		/**
		 * Send the request after the current request completes.
		 */
		Queue = 1,

		/**
		 * Send the request after the current request completes, and ask the current request to stop
		 * at its next opportunity so that the request is handled sooner.
		 */
		Steer = 2,
	}

	export namespace chat {

		/**
		 * Sends a request into the chat session that a tool invocation token belongs to, whether or not
		 * that session is visible. Focus and the visible chat do not change.
		 *
		 * The request runs with the agent, model, mode, permission level and tools of the last request of
		 * the session, and is delivered the way the session delivers requests that the user queues while
		 * a request is running.
		 *
		 * @param toolInvocationToken The {@link ChatRequest.toolInvocationToken token} of a chat request, or
		 * the {@link LanguageModelToolInvocationOptions.toolInvocationToken token} that a tool invocation
		 * received. It identifies the session; the request that it came from may have completed.
		 * @param request The request to send.
		 * @returns A promise that resolves once the session has accepted the request, without waiting for
		 * the response. It rejects when the session no longer exists or does not accept requests, for example
		 * because it is read-only.
		 */
		export function sendRequest(toolInvocationToken: ChatParticipantToolToken, request: ChatSessionRequest): Thenable<void>;
	}
}
