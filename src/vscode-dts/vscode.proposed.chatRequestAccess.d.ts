/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface ChatResponseStream {

		/**
		 * The response stream.
		 */
		readonly response: AsyncIterable<string>;

		/**
		 * The variant of multiple responses. This is used to disambiguate between multiple
		 * response streams when having asked for multiple response options
		 */
		readonly option: number;
	}

	export interface ChatRequest {

		/**
		 * The overall result of the request which represents failure or success
		 * but _not_ the actual response or responses
		 */
		result: Thenable<any>;

		/**
		 * The _default response_ stream. This is the stream of the first response option
		 * receiving data.
		 *
		 * Usually there is only one response option and this stream is more convienient to use
		 * than the {@link onDidStartResponseStream `onDidStartResponseStream`} event.
		 */
		response: AsyncIterable<string>;

		/**
		 * An event that fires whenever a new response option is available. The response
		 * itself is a stream of the actual response.
		 *
		 * *Note* that the first time this event fires, the {@link ChatResponseStream.response response stream}
		 * is the same as the {@link response `default response stream`}.
		 *
		 * *Note* that unless requested there is only one response option, so this event will only fire
		 * once.
		 */
		onDidStartResponseStream: Event<ChatResponseStream>;

		/**
		 * Cancel this request.
		 */
		// TODO@API remove this? We pass a token to makeRequest call already
		cancel(): void;
	}

	/**
	 * Represents access to using a chat provider (LLM). Access is granted and temporary, usually only valid
	 * for the duration of an user interaction or specific time frame.
	 */
	export interface ChatAccess {

		/**
		 * Whether the access to chat has been revoked. This happens when the condition that allowed for
		 * chat access doesn't hold anymore, e.g a user interaction has ended.
		 */
		isRevoked: boolean;

		/**
		 * Make a chat request.
		 *
		 * The actual response will be reported back via the `progress` callback. The promise returned by this function
		 * returns a overall result which represents failure or success of the request.
		 *
		 * Chat can be asked for multiple response options. In that case the `progress` callback will be called multiple
		 * time with different `ChatResponseStream` objects. Each object represents a different response option and the actual
		 * response will be reported back via their `stream` property.
		 *
		 * *Note:* This will throw an error if access has been revoked.
		 *
		 * @param messages
		 * @param options
		 */
		makeRequest(messages: ChatMessage[], options: { [name: string]: any }, token: CancellationToken): ChatRequest;
	}

	export namespace chat {

		/**
		 * Request access to chat.
		 *
		 * *Note* that this function will throw an error unless an user interaction is currently active.
		 *
		 * @param id The id of the chat provider, e.g `copilot`
		 */
		export function requestChatAccess(id: string): Thenable<ChatAccess>;
	}
}
