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
		// TODO@API should use "id" here to match vscode tools, or keep name to match OpenAI? Align everything.
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
	// TODO@API NAME: LanguageModelChatMessageToolCallPart, LanguageModelToolCallPart
	export class LanguageModelChatResponseToolCallPart {
		name: string;
		toolCallId: string;
		parameters: any;

		constructor(name: string, toolCallId: string, parameters: any);
	}

	// LM -> USER: text chunk
	// TODO@API NAME: LanguageModelChatMessageTextPart, LanguageModelTextPart
	export class LanguageModelChatResponseTextPart {
		value: string;

		constructor(value: string);
	}

	export interface LanguageModelChatResponse {
		stream: AsyncIterable<LanguageModelChatResponseTextPart | LanguageModelChatResponseToolCallPart>;
	}


	// USER -> LM: the result of a function call
	// TODO@API NAME: LanguageModelChatMessageToolResultPart, LanguageModelToolResultPart
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

	// Tool registration/invoking between extensions

	/**
	 * A result returned from a tool invocation.
	 */
	// TODO@API should we align this with NotebookCellOutput and NotebookCellOutputItem
	export interface LanguageModelToolResult {
		/**
		 * The result can contain arbitrary representations of the content. A tool user can set
		 * {@link LanguageModelToolInvocationOptions.requested} to request particular types, and a tool implementation should only
		 * compute the types that were requested. `text/plain` is required to be supported by all tools. Another example might be
		 * a `PromptElementJSON` from `@vscode/prompt-tsx`, using the `contentType` exported by that library.
		 */
		[contentType: string]: any;

		/**
		 * A string representation of the result.
		 */
		'text/plain'?: string;
	}

	export namespace lm {
		/**
		 * Register a LanguageModelTool. The tool must also be registered in the package.json `languageModelTools` contribution
		 * point. A registered tool is available in the {@link lm.tools} list for any extension to invoke.
		 */
		export function registerTool<T>(id: string, tool: LanguageModelTool<T>): Disposable;

		/**
		 * A list of all available tools.
		 */
		export const tools: ReadonlyArray<LanguageModelToolDescription>;

		/**
		 * Invoke a tool with the given parameters.
		 */
		export function invokeTool<T>(id: string, options: LanguageModelToolInvocationOptions<T>, token: CancellationToken): Thenable<LanguageModelToolResult>;
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
		 */
		toolInvocationToken: ChatParticipantToolToken | undefined;

		/**
		 * The parameters with which to invoke the tool. The parameters must match the schema defined in
		 * {@link LanguageModelToolDescription.parametersSchema}
		 */
		parameters: T;

		/**
		 * A tool user can request that particular content types be returned from the tool, depending on what the tool user
		 * supports. All tools are required to support `text/plain`. See {@link LanguageModelToolResult}.
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
	 * Represents a JSON Schema.
	 * TODO@API - is this worth it?
	 */
	export type JSONSchema = Object;

	/**
	 * A description of an available tool.
	 */
	export interface LanguageModelToolDescription {
		/**
		 * A unique identifier for the tool.
		 */
		readonly id: string;

		/**
		 * A human-readable name for this tool that may be used to describe it in the UI.
		 * TODO@API keep?
		 */
		readonly displayName: string | undefined;

		/**
		 * A description of this tool that may be passed to a language model.
		 */
		readonly description: string;

		/**
		 * A JSON schema for the parameters this tool accepts.
		 */
		readonly parametersSchema?: JSONSchema;

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
	 * Messages shown in the chat view when a tool needs confirmation from the user to run. These messages will be shown with
	 * buttons that say Continue and Cancel.
	 */
	export interface LanguageModelToolConfirmationMessages {
		/**
		 * The title of the confirmation message.
		 */
		title: string;

		/**
		 * The body of the confirmation message. This should be phrased as an action of the participant that is invoking the tool
		 * from {@link LanguageModelToolInvocationPrepareOptions.participantName}. An example of a good message would be
		 * `${participantName} will run the command ${echo 'hello world'} in the terminal.`
		 * TODO@API keep this?
		 */
		message: string | MarkdownString;
	}

	/**
	 * Options for {@link LanguageModelTool.prepareToolInvocation}.
	 */
	export interface LanguageModelToolInvocationPrepareOptions<T> {
		/**
		 * The name of the participant invoking the tool.
		 * TODO@API keep this?
		 */
		participantName: string;

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
		 * Called once before a tool is invoked. May be implemented to customize the progress message that appears while the tool
		 * is running, and the messages that appear when the tool needs confirmation.
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
		 * Customized messages to show when asking for user confirmation to run the tool.
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
