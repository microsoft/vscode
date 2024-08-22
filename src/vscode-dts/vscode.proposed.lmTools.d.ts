/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// version: 4
// https://github.com/microsoft/vscode/issues/213274

declare module 'vscode' {

	// TODO@API capabilities

	// TODO@API functions or tools?
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

		constructor(name: string, parameters: any, toolCallId: string);
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
		name: string;
		toolCallId: string;
		content: string;
		isError: boolean;

		constructor(name: string, toolCallId: string, content: string, isError?: boolean);
	}

	export interface LanguageModelChatMessage {
		// A heterogeneous array of other things that a message can contain as content. Some parts would be message-type specific for some models
		// and wouldn't go together, but it's up to the chat provider to decide what to do about that. Can drop parts that are not valid for the message type.
		// For OpenAI:
		// LanguageModelChatMessageToolResultPart: only on User messages
		// LanguageModelChatResponseToolCallPart: only on Assistant messages
		content2: (string | LanguageModelChatMessageToolResultPart | LanguageModelChatResponseToolCallPart)[];
	}

	export interface LanguageModelToolResult {
		// Types determined by LanguageModelToolInvokationOptions#contentTypes
		[contentType: string]: any;

		/**
		 * The 'string' contentType must be supported by all tools.
		 */
		string?: string;
	}

	// Tool registration/invoking between extensions

	export interface LanguageModelToolInvokationOptions {
		/**
		 * The content types that the tool should emit, which should be pulled from `LanguageModelToolDescription#supportedContentTypes`.
		 * The string 'string' must be supported for all tools and should be used as a general value for content that can be incorporated into an LLM prompt with no special processing.
		 * Another example would be the `contentType` exported by the `@vscode/prompt-tsx` library to return a PromptElementJSON.
		 * TODO@API if the caller didn't specify any content types, this parameter should default to ['string'] for the tool.
		 */
		contentTypes?: string[];

		/**
		 * Parameters with which to invoke the tool.
		 */
		parameters: Object;

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
			 * @param text A string or a message instance.
			 * @param token Optional cancellation token.  See {@link CancellationTokenSource} for how to create one.
			 * @returns A thenable that resolves to the number of tokens.
			 */
			countTokens(text: string | LanguageModelChatMessage, token?: CancellationToken): Thenable<number>;
		};
	}

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
		export function invokeTool(id: string, options: LanguageModelToolInvokationOptions, token: CancellationToken): Thenable<LanguageModelToolResult>;
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

		supportedContentTypes?: string[];
	}

	export interface LanguageModelToolResponseStream {
		/**
		 * This progress appears inline in the chat response, only when the tool was invoked via ChatContext#invokeTool.
		 *
		 * @param value
		 * @returns This stream.
		 */
		progress(value: string): void;

		/**
		 * Pushes a part to this stream.
		 *
		 * @param part A response part, rendered or metadata
		 */
		push(part: LanguageModelToolResponsePart): void;
	}

	export type LanguageModelToolResponsePart = ChatResponseProgressPart | ChatResponseReferencePart;

	export interface LanguageModelTool {
		invoke(parameters: any, stream: LanguageModelToolResponseStream, token: CancellationToken): Thenable<LanguageModelToolResult>;
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
	}

	export interface ChatRequestTurn {
		/**
		 * The list of tools were attached to this request.
		 */
		readonly toolReferences?: readonly ChatLanguageModelToolReference[];
	}

	export interface ChatContext {
		/**
		 * Invoke a tool with the given parameters, for ChatParticipants.
		 * When a chat participant invokes a tool using this method, a progress spinner will be shown in the chat panel.
		 */
		invokeTool(id: string, options: LanguageModelToolInvokationOptions, token: CancellationToken): Thenable<LanguageModelToolResult>;
	}
}
