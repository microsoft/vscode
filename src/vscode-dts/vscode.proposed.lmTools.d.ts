/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// version: 7
// https://github.com/microsoft/vscode/issues/213274

declare module 'vscode' {

	// TODO@API capabilities

	// API -> LM: an tool/function that is available to the language model
	export interface LanguageModelChatTool {
		// TODO@API should use "id" here to match vscode tools, or keep name to match OpenAI?
		name: string;
		description: string;
		parametersSchema?: JSONSchema;
	}

	// API -> LM: add tools as request option
	export interface LanguageModelChatRequestOptions {
		// TODO@API this will be a heterogeneous array of different types of tools
		tools?: LanguageModelChatTool[];

		/**
		 * Force a specific tool to be used.
		 */
		toolChoice?: string;
	}

	// LM -> USER: function that should be used
	export class LanguageModelChatResponseToolCallPart {
		name: string;
		toolCallId: string;
		parameters: any;

		constructor(name: string, toolCallId: string, parameters: any);
	}

	// LM -> USER: text chunk
	export class LanguageModelChatResponseTextPart {
		value: string;

		constructor(value: string);
	}

	export interface LanguageModelChatResponse {
		stream: AsyncIterable<LanguageModelChatResponseTextPart | LanguageModelChatResponseToolCallPart>;
	}


	// USER -> LM: the result of a function call
	export class LanguageModelChatMessageToolResultPart {
		toolCallId: string;
		content: string;
		isError: boolean;

		constructor(toolCallId: string, content: string, isError?: boolean);
	}

	export interface LanguageModelChatMessage {
		/**
		 * A heterogeneous array of other things that a message can contain as content.
		 * Some parts would be message-type specific for some models and wouldn't go together,
		 * but it's up to the chat provider to decide what to do about that.
		 * Can drop parts that are not valid for the message type.
		 * LanguageModelChatMessageToolResultPart: only on User messages
		 * LanguageModelChatResponseToolCallPart: only on Assistant messages
		 */
		content2: (string | LanguageModelChatMessageToolResultPart | LanguageModelChatResponseToolCallPart)[];
	}

	export interface LanguageModelToolResult {
		/**
		 * The result can contain arbitrary representations of the content. Use {@link LanguageModelToolInvocationOptions.requested} to request particular types.
		 * `text/plain` is required to be supported by all tools. Another example might be a `PromptElementJSON` from `@vscode/prompt-tsx`, using the `contentType` exported by that library.
		 */
		[contentType: string]: any;
	}

	// Tool registration/invoking between extensions

	export namespace lm {
		/**
		 * Register a LanguageModelTool. The tool must also be registered in the package.json `languageModelTools` contribution point.
		 */
		export function registerTool(id: string, tool: LanguageModelTool): Disposable;

		/**
		 * A list of all available tools.
		 */
		export const tools: ReadonlyArray<LanguageModelToolDescription>;

		/**
		 * Invoke a tool with the given parameters.
		 */
		export function invokeTool(id: string, options: LanguageModelToolInvocationOptions, token: CancellationToken): Thenable<LanguageModelToolResult>;
	}

	export type ChatParticipantToolToken = unknown;

	export interface LanguageModelToolInvocationOptions {
		/**
		 * When this tool is being invoked within the context of a chat request, this token should be passed from {@link ChatRequest.toolInvocationToken}.
		 * In that case, a progress bar will be automatically shown for the tool invocation in the chat response view. If the tool is being invoked
		 * outside of a chat request, `undefined` should be passed instead.
		 */
		toolInvocationToken: ChatParticipantToolToken | undefined;

		/**
		 * Parameters with which to invoke the tool.
		 */
		parameters: Object;

		/**
		 * A tool invoker can request that particular content types be returned from the tool. All tools are required to support `text/plain`.
		 */
		requestedContentTypes: string[];

		/**
		 * Options to hint at how many tokens the tool should return in its response.
		 */
		tokenOptions?: {
			/**
			 * If known, the maximum number of tokens the tool should emit in its result.
			 */
			tokenBudget: number;

			/**
			 * Count the number of tokens in a message using the model specific tokenizer-logic.
			 * @param text A string.
			 * @param token Optional cancellation token.  See {@link CancellationTokenSource} for how to create one.
			 * @returns A thenable that resolves to the number of tokens.
			 */
			countTokens(text: string, token?: CancellationToken): Thenable<number>;
		};
	}

	export type JSONSchema = object;

	export interface LanguageModelToolDescription {
		/**
		 * A unique identifier for the tool.
		 */
		id: string;

		/**
		 * A human-readable name for this tool that may be used to describe it in the UI.
		 */
		displayName: string | undefined;

		/**
		 * A description of this tool that may be passed to a language model.
		 */
		modelDescription: string;

		/**
		 * A JSON schema for the parameters this tool accepts.
		 */
		parametersSchema?: JSONSchema;

		/**
		 * The list of content types that the tool has declared support for.
		 */
		supportedContentTypes: string[];
	}

	export interface LanguageModelToolProvideConfirmationMessageOptions {
		participantName: string;
		parameters: any;
	}

	export interface LanguageModelToolConfirmationMessages {
		title: string;
		message: string | MarkdownString;
	}

	export interface LanguageModelTool {
		invoke(options: LanguageModelToolInvocationOptions, token: CancellationToken): ProviderResult<LanguageModelToolResult>;

		/**
		 * This can be implemented to customize the message shown to the user when a tool requires confirmation.
		 */
		provideToolConfirmationMessages?(options: LanguageModelToolProvideConfirmationMessageOptions, token: CancellationToken): Thenable<LanguageModelToolConfirmationMessages>;

		/**
		 * This message will be shown with the progress notification when the tool is invoked in a chat session.
		 */
		provideToolInvocationMessage?(parameters: any, token: CancellationToken): Thenable<string>;
	}

	export interface ChatLanguageModelToolReference {
		/**
		 * The tool's ID. Refers to a tool listed in {@link lm.tools}.
		 */
		readonly id: string;

		/**
		 * The start and end index of the reference in the {@link ChatRequest.prompt prompt}. When undefined, the reference was not part of the prompt text.
		 *
		 * *Note* that the indices take the leading `#`-character into account which means they can
		 * used to modify the prompt as-is.
		 */
		readonly range?: [start: number, end: number];
	}

	export interface ChatRequest {
		/**
		 * The list of tools that the user attached to their request.
		 *
		 * *Note* that if tools are referenced in the text of the prompt, using `#`, the prompt contains
		 * references as authored and that it is up to the participant
		 * to further modify the prompt, for instance by inlining reference values or creating links to
		 * headings which contain the resolved values. References are sorted in reverse by their range
		 * in the prompt. That means the last reference in the prompt is the first in this list. This simplifies
		 * string-manipulation of the prompt.
		 */
		readonly toolReferences: readonly ChatLanguageModelToolReference[];

		/**
		 * A token that can be passed to {@link lm.invokeTool} when invoking a tool inside the context of handling a chat request.
		 */
		readonly toolInvocationToken: ChatParticipantToolToken;
	}

	export interface ChatRequestTurn {
		/**
		 * The list of tools were attached to this request.
		 */
		readonly toolReferences?: readonly ChatLanguageModelToolReference[];
	}
}
