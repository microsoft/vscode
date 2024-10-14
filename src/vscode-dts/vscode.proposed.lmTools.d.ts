/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// version: 9
// https://github.com/microsoft/vscode/issues/213274

declare module 'vscode' {

	// TODO@API capabilities

	/**
	 * A tool that is available to the language model via {@link LanguageModelChatRequestOptions}.
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

	export interface LanguageModelChatRequestOptions {
		// TODO@API this will be a heterogeneous array of different types of tools
		/**
		 * An optional list of tools that are available to the language model.
		 */
		tools?: LanguageModelChatTool[];

		/**
		 * Force a specific tool to be used.
		 */
		toolChoice?: string;
	}

	/**
	 * A language model response part indicating a tool call, returned from a {@link LanguageModelChatResponse}, and also can be
	 * included as a content part on a {@link LanguageModelChatMessage}, to represent a previous tool call in a
	 * chat request.
	 */
	export class LanguageModelToolCallPart {
		/**
		 * The name of the tool to call.
		 */
		name: string;

		/**
		 * The ID of the tool call. This is a unique identifier for the tool call within the chat request.
		 */
		toolCallId: string;

		/**
		 * The parameters with which to call the tool.
		 */
		parameters: object;

		constructor(name: string, toolCallId: string, parameters: object);
	}

	/**
	 * A language model response part containing a piece of text, returned from a {@link LanguageModelChatResponse}.
	 */
	export class LanguageModelTextPart {
		/**
		 * The text content of the part.
		 */
		value: string;

		constructor(value: string);
	}

	export interface LanguageModelChatResponse {
		/**
		 * A stream of parts that make up the response. Could be extended with more types in the future.
		 * TODO@API add "| unknown"?
		 */
		stream: AsyncIterable<LanguageModelTextPart | LanguageModelToolCallPart>;
	}

	/**
	 * The result of a tool call. Can only be included in the content of a User message.
	 */
	export class LanguageModelToolResultPart {
		/**
		 * The ID of the tool call.
		 */
		toolCallId: string;

		/**
		 * The content of the tool result.
		 */
		content: string;

		constructor(toolCallId: string, content: string);
	}

	export interface LanguageModelChatMessage {
		/**
		 * A heterogeneous array of other things that a message can contain as content. Some parts may be message-type specific
		 * for some models.
		 */
		content2: (string | LanguageModelToolResultPart | LanguageModelToolCallPart)[];
	}

	// Tool registration/invoking between extensions

	/**
	 * A result returned from a tool invocation.
	 */
	// TODO@API should we align this with NotebookCellOutput and NotebookCellOutputItem
	export interface LanguageModelToolResult {
		/**
		 * The result can contain arbitrary representations of the content. A tool user can set
		 * {@link LanguageModelToolInvocationOptions.requested} to request particular types, and a tool implementation should only
		 * compute the types that were requested. `text/plain` is recommended to be supported by all tools, which would indicate
		 * any text-based content. Another example might be a `PromptElementJSON` from `@vscode/prompt-tsx`, using the
		 * `contentType` exported by that library.
		 */
		[contentType: string]: any;
	}

	export namespace lm {
		/**
		 * Register a LanguageModelTool. The tool must also be registered in the package.json `languageModelTools` contribution
		 * point. A registered tool is available in the {@link lm.tools} list for any extension to see. But in order for it to
		 * be seen by a language model, it must be passed in the list of available tools in {@link LanguageModelChatRequestOptions.tools}.
		 */
		export function registerTool<T>(name: string, tool: LanguageModelTool<T>): Disposable;

		/**
		 * A list of all available tools.
		 */
		export const tools: ReadonlyArray<LanguageModelToolDescription>;

		/**
		 * Invoke a tool with the given parameters.
		 */
		export function invokeTool(id: string, options: LanguageModelToolInvocationOptions<object>, token: CancellationToken): Thenable<LanguageModelToolResult>;
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
		 * When this tool is being invoked within the context of a chat request, this token should be passed from
		 * {@link ChatRequest.toolInvocationToken}. In that case, a progress bar will be automatically shown for the tool
		 * invocation in the chat response view, and if the tool requires user confirmation, it will show up inline in the chat
		 * view. If the tool is being invoked outside of a chat request, `undefined` should be passed instead.
		 *
		 * If a tool invokes another tool during its invocation, it can pass along the `toolInvocationToken` that it received.
		 */
		toolInvocationToken: ChatParticipantToolToken | undefined;

		/**
		 * The parameters with which to invoke the tool. The parameters must match the schema defined in
		 * {@link LanguageModelToolDescription.parametersSchema}
		 */
		parameters: T;

		/**
		 * A tool user can request that particular content types be returned from the tool, depending on what the tool user
		 * supports. All tools are recommended to support `text/plain`. See {@link LanguageModelToolResult}.
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

	/**
	 * A description of an available tool.
	 */
	export interface LanguageModelToolDescription {
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
		readonly parametersSchema?: object;

		/**
		 * The list of content types that the tool has declared support for. See {@link LanguageModelToolResult}.
		 */
		readonly supportedContentTypes: string[];

		/**
		 * A set of tags, declared by the tool, that roughly describe the tool's capabilities. A tool user may use these to filter
		 * the set of tools to just ones that are relevant for the task at hand.
		 */
		readonly tags: string[];
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
	 * Options for {@link LanguageModelTool.prepareToolInvocation}.
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
		 */
		invoke(options: LanguageModelToolInvocationOptions<T>, token: CancellationToken): ProviderResult<LanguageModelToolResult>;

		/**
		 * Called once before a tool is invoked. May be implemented to signal that a tool needs user confirmation before running,
		 * and to customize the progress message that appears while the tool is running.
		 */
		prepareToolInvocation?(options: LanguageModelToolInvocationPrepareOptions<T>, token: CancellationToken): ProviderResult<PreparedToolInvocation>;
	}

	/**
	 * The result of a call to {@link LanguageModelTool.prepareToolInvocation}.
	 */
	export interface PreparedToolInvocation {
		/**
		 * A customized progress message to show while the tool runs.
		 */
		invocationMessage?: string;

		/**
		 * The presence of this property indicates that the user should be asked to confirm before running the tool.
		 */
		confirmationMessages?: LanguageModelToolConfirmationMessages;
	}

	/**
	 * A reference to a tool attached to a user's request.
	 */
	export interface ChatLanguageModelToolReference {
		/**
		 * The tool's ID. Refers to a tool listed in {@link lm.tools}.
		 */
		readonly id: string;

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
		 * *Note* that if tools are referenced in the text of the prompt, using `#`, the prompt contains references as authored
		 * and it is up to the participant to further modify the prompt, for instance by inlining reference values or
		 * creating links to headings which contain the resolved values. References are sorted in reverse by their range in the
		 * prompt. That means the last reference in the prompt is the first in this list. This simplifies string-manipulation of
		 * the prompt.
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
