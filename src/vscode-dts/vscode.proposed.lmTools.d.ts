/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// version: 10
// https://github.com/microsoft/vscode/issues/213274

declare module 'vscode' {

	export namespace lm {
		/**
		 * Register a LanguageModelTool. The tool must also be registered in the package.json `languageModelTools` contribution
		 * point. A registered tool is available in the {@link lm.tools} list for any extension to see. But in order for it to
		 * be seen by a language model, it must be passed in the list of available tools in {@link LanguageModelChatRequestOptions.tools}.
		 */
		export function registerTool<T>(name: string, tool: LanguageModelTool<T>): Disposable;

		/**
		 * A list of all available tools that were registered by all extensions using {@link lm.registerTool}. They can be called
		 * with {@link lm.invokeTool} with a set of parameters that match their declared `parametersSchema`.
		 */
		export const tools: readonly LanguageModelToolInformation[];

		/**
		 * Invoke a tool listed in {@link lm.tools} by name with the given parameters.
		 *
		 * The caller must pass a {@link LanguageModelToolInvocationOptions.toolInvocationToken}, which comes from
		 * {@link ChatRequest.toolInvocationToken} when the tool is being invoked by a by a {@link ChatParticipant}, and
		 * associates the invocation to a chat session.
		 *
		 * The tool will return a {@link LanguageModelToolResult} which contains an array of {@link LanguageModelTextPart} and
		 * {@link LanguageModelPromptTsxPart}. If the tool caller is using `@vscode/prompt-tsx`, it can incorporate the response
		 *  parts into its prompt using a `ToolResult`. If not, the parts can be passed along to the {@link LanguageModelChat} via
		 *  a User message with a {@link LanguageModelToolResultPart}.
		 *
		 * If a chat participant wants to preserve tool results for requests across multiple turns, it can store tool results in
		 * the {@link ChatResult.metadata} returned from the handler and retrieve them on the next turn from
		 * {@link ChatResponseTurn.result}.
		 */
		export function invokeTool(name: string, options: LanguageModelToolInvocationOptions<object>, token: CancellationToken): Thenable<LanguageModelToolResult>;
	}

	/**
	 * A tool that is available to the language model via {@link LanguageModelChatRequestOptions}. A language model uses all the
	 * properties of this interface to decide which tool to call, and how to call it.
	 */
	export interface LanguageModelChatTool {
		/**
		 * The name of the tool.
		 */
		name: string;

		/**
		 * The description of the tool.
		 */
		description: string;

		/**
		 * A JSON schema for the parameters this tool accepts.
		 */
		parametersSchema?: object;
	}

	/**
	 * A tool-calling mode for the language model to use.
	 */
	export enum LanguageModelChatToolMode {
		/**
		 * The language model can choose to call a tool or generate a message. Is the default.
		 */
		Auto = 1,

		/**
		 * The language model must call one of the provided tools. Note- some models only support a single tool when using this
		 * mode. TODO@API - do we throw, or just pick the first tool? Or only offer an API that allows callers to pick a single
		 * tool? Go back to `toolChoice?: string`?
		 */
		Required = 2
	}

	export interface LanguageModelChatRequestOptions {

		/**
		 * An optional list of tools that are available to the language model. These could be registered tools available via
		 * {@link lm.tools}, or private tools that are just implemented within the calling extension.
		 *
		 * If the LLM requests to call one of these tools, it will return a {@link LanguageModelToolCallPart} in
		 * {@link LanguageModelChatResponse.stream}. It's the caller's responsibility to invoke the tool. If it's a tool
		 * registered in {@link lm.tools}, that means calling {@link lm.invokeTool}.
		 *
		 * Then, the tool result can be provided to the LLM by creating an Assistant-type {@link LanguageModelChatMessage} with a
		 * {@link LanguageModelToolCallPart}, followed by a User-type message with a {@link LanguageModelToolResultPart}.
		 */
		tools?: LanguageModelChatTool[];

		/**
		 * 	The tool-selecting mode to use. {@link LanguageModelChatToolMode.Auto} by default.
		 */
		toolMode?: LanguageModelChatToolMode;
	}

	/**
	 * A language model response part indicating a tool call, returned from a {@link LanguageModelChatResponse}, and also can be
	 * included as a content part on a {@link LanguageModelChatMessage}, to represent a previous tool call in a chat request.
	 */
	export class LanguageModelToolCallPart {
		/**
		 * The name of the tool to call.
		 */
		name: string;

		/**
		 * The ID of the tool call. This is a unique identifier for the tool call within the chat request.
		 */
		callId: string;

		/**
		 * The parameters with which to call the tool.
		 */
		parameters: object;

		/**
		 * Create a new LanguageModelToolCallPart.
		 */
		constructor(name: string, callId: string, parameters: object);
	}

	/**
	 * A language model response part containing a piece of text, returned from a {@link LanguageModelChatResponse}.
	 */
	export class LanguageModelTextPart {
		/**
		 * The text content of the part.
		 */
		value: string;

		/**
		 * Construct a text part with the given content.
		 * @param value The text content of the part.
		 */
		constructor(value: string);
	}

	/**
	 * A language model response part containing a PromptElementJSON from `@vscode/prompt-tsx`.
	 * @see {@link LanguageModelToolResult}
	 */
	export class LanguageModelPromptTsxPart {
		/**
		 * The value of the part.
		 */
		value: unknown;

		/**
		 * The mimeType of this part, exported from the `@vscode/prompt-tsx` library.
		 */
		mime: string;

		/**
		 * Construct a prompt-tsx part with the given content.
		 * @param value The value of the part, the result of `renderPromptElementJSON` from `@vscode/prompt-tsx`.
		 * @param mime The mimeType of the part, exported from `@vscode/prompt-tsx` as `contentType`.
		 */
		constructor(value: unknown, mime: string);
	}

	export interface LanguageModelChatResponse {
		/**
		 * A stream of parts that make up the response. Could be extended with more types in the future. A
		 * {@link LanguageModelTextPart} is part of the assistant's response to be shown to the user. A
		 * {@link LanguageModelToolCallPart} is a request from the language model to call a tool.
		 */
		stream: AsyncIterable<LanguageModelTextPart | LanguageModelToolCallPart | unknown>;
	}

	/**
	 * The result of a tool call. Can only be included in the content of a User message.
	 */
	export class LanguageModelToolResultPart {
		/**
		 * The ID of the tool call.
		 */
		callId: string;

		/**
		 * The value of the tool result.
		 */
		content: (LanguageModelTextPart | LanguageModelPromptTsxPart | unknown)[];

		/**
		 * @param callId The ID of the tool call.
		 * @param content The content of the tool result.
		 */
		constructor(callId: string, content: (LanguageModelTextPart | LanguageModelPromptTsxPart | unknown)[]);
	}

	export interface LanguageModelChatMessage {
		/**
		 * A heterogeneous array of other things that a message can contain as content. Some parts may be message-type specific
		 * for some models.
		 */
		content2: (string | LanguageModelToolResultPart | LanguageModelToolCallPart)[];
	}

	/**
	 * A result returned from a tool invocation. If using `@vscode/prompt-tsx`, this result may be rendered using a `ToolResult`.
	 */
	export class LanguageModelToolResult {
		/**
		 * A list of tool result content parts. Includes `unknown` becauses this list may be extended with new content types in
		 * the future.
		 * @see {@link lm.invokeTool}.
		 */
		content: (LanguageModelTextPart | LanguageModelPromptTsxPart | unknown)[];

		/**
		 * Create a LanguageModelToolResult
		 * @param content A list of tool result content parts
		 */
		constructor(content: (LanguageModelTextPart | LanguageModelPromptTsxPart | unknown)[]);
	}

	/**
	 * A token that can be passed to {@link lm.invokeTool} when invoking a tool inside the context of handling a chat request.
	 */
	export type ChatParticipantToolToken = unknown;

	/**
	 * Options provided for tool invocation.
	 */
	export interface LanguageModelToolInvocationOptions<T> {
		/**
		 * When this tool is being invoked by a {@link ChatParticipant} within the context of a chat request, this token should be
		 * passed from {@link ChatRequest.toolInvocationToken}. In that case, a progress bar will be automatically shown for the
		 * tool invocation in the chat response view, and if the tool requires user confirmation, it will show up inline in the
		 * chat view. If the tool is being invoked outside of a chat request, `undefined` should be passed instead.
		 *
		 * If a tool invokes another tool during its invocation, it can pass along the `toolInvocationToken` that it received.
		 */
		toolInvocationToken: ChatParticipantToolToken | undefined;

		/**
		 * The parameters with which to invoke the tool. The parameters must match the schema defined in
		 * {@link LanguageModelToolInformation.parametersSchema}
		 */
		parameters: T;

		/**
		 * Options to hint at how many tokens the tool should return in its response, and enable the tool to count tokens
		 * accurately.
		 */
		tokenizationOptions?: LanguageModelToolTokenizationOptions;
	}

	/**
	 * Options related to tokenization for a tool invocation.
	 */
	export interface LanguageModelToolTokenizationOptions {
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
	}

	/**
	 * Information about a registered tool available in {@link lm.tools}.
	 */
	export interface LanguageModelToolInformation {
		/**
		 * A unique name for the tool.
		 */
		readonly name: string;

		/**
		 * A description of this tool that may be passed to a language model.
		 */
		readonly description: string;

		/**
		 * A JSON schema for the parameters this tool accepts.
		 */
		readonly parametersSchema: object | undefined;

		/**
		 * A set of tags, declared by the tool, that roughly describe the tool's capabilities. A tool user may use these to filter
		 * the set of tools to just ones that are relevant for the task at hand.
		 */
		readonly tags: readonly string[];
	}

	/**
	 * When this is returned in {@link PreparedToolInvocation}, the user will be asked to confirm before running the tool. These
	 * messages will be shown with buttons that say "Continue" and "Cancel".
	 */
	export interface LanguageModelToolConfirmationMessages {
		/**
		 * The title of the confirmation message.
		 */
		title: string;

		/**
		 * The body of the confirmation message.
		 */
		message: string | MarkdownString;
	}

	/**
	 * Options for {@link LanguageModelTool.prepareInvocation}.
	 */
	export interface LanguageModelToolInvocationPrepareOptions<T> {
		/**
		 * The parameters that the tool is being invoked with.
		 */
		parameters: T;
	}

	/**
	 * A tool that can be invoked by a call to a {@link LanguageModelChat}.
	 */
	export interface LanguageModelTool<T> {
		/**
		 * Invoke the tool with the given parameters and return a result.
		 *
		 * The provided {@link LanguageModelToolInvocationOptions.parameters} are currently not validated against the declared
		 * schema, but will be in the future.
		 */
		invoke(options: LanguageModelToolInvocationOptions<T>, token: CancellationToken): ProviderResult<LanguageModelToolResult>;

		/**
		 * Called once before a tool is invoked. It's recommended to implement this to customize the progress message that appears
		 * while the tool is running, and to provide a more useful message with context from the invocation parameters. Can also
		 * signal that a tool needs user confirmation before running, if appropriate. Must be free of side-effects. A call to
		 * `prepareInvocation` is not necessarily followed by a call to `invoke`.
		 */
		prepareInvocation?(options: LanguageModelToolInvocationPrepareOptions<T>, token: CancellationToken): ProviderResult<PreparedToolInvocation>;
	}

	/**
	 * The result of a call to {@link LanguageModelTool.prepareInvocation}.
	 */
	export interface PreparedToolInvocation {
		/**
		 * A customized progress message to show while the tool runs.
		 */
		invocationMessage?: string;

		/**
		 * The presence of this property indicates that the user should be asked to confirm before running the tool. The user
		 * should be asked for confirmation for any tool that has a side-effect or may potentially be dangerous.
		 */
		confirmationMessages?: LanguageModelToolConfirmationMessages;
	}

	/**
	 * A reference to a tool that the user manually attached to their request, either using the `#`-syntax inline, or as an
	 * attachment via the paperclip button.
	 */
	export interface ChatLanguageModelToolReference {
		/**
		 * The tool name. Refers to a tool listed in {@link lm.tools}.
		 */
		readonly name: string;

		/**
		 * The start and end index of the reference in the {@link ChatRequest.prompt prompt}. When undefined, the reference was
		 * not part of the prompt text.
		 *
		 * *Note* that the indices take the leading `#`-character into account which means they can be used to modify the prompt
		 * as-is.
		 */
		readonly range?: [start: number, end: number];
	}

	export interface ChatRequest {
		/**
		 * The list of tools that the user attached to their request.
		 *
		 * When a tool reference is present, the chat participant should make a chat request using
		 * {@link LanguageModelChatToolMode.Required} to force the language model to generate parameters for the tool. Then, the
		 * participant can use {@link lm.invokeTool} to use the tool attach the result to its request for the user's prompt. The
		 * tool may contribute useful extra context for the user's request.
		 */
		readonly toolReferences: readonly ChatLanguageModelToolReference[];

		/**
		 * A token that can be passed to {@link lm.invokeTool} when invoking a tool inside the context of handling a chat request.
		 * This associates the tool invocation to a chat session.
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
