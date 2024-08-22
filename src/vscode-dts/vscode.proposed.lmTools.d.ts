/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// version: 4
// https://github.com/microsoft/vscode/issues/213274

declare module 'vscode' {

	// TODO@API capabilities

	// API -> LM: an tool/function that is available to the language model
	export interface LanguageModelChatFunction {
		name: string;
		description: string;
		parametersSchema?: JSONSchema;
	}

	// API -> LM: add tools as request option
	export interface LanguageModelChatRequestOptions {
		// TODO@API this will a heterogeneous array of different types of tools
		tools?: LanguageModelChatFunction[];

		/**
		 * Force a specific tool to be used.
		 */
		toolChoice?: string;
	}

	// LM -> USER: function that should be used
	export class LanguageModelChatResponseFunctionUsePart {
		name: string;
		parameters: any;

		constructor(name: string, parameters: any);
	}

	// LM -> USER: text chunk
	export class LanguageModelChatResponseTextPart {
		value: string;

		constructor(value: string);
	}

	export interface LanguageModelChatResponse {

		stream: AsyncIterable<LanguageModelChatResponseTextPart | LanguageModelChatResponseFunctionUsePart>;
	}


	// USER -> LM: the result of a function call
	export class LanguageModelChatMessageFunctionResultPart {
		name: string;
		content: string;
		isError: boolean;

		constructor(name: string, content: string, isError?: boolean);
	}

	export interface LanguageModelChatMessage {
		content2: string | LanguageModelChatMessageFunctionResultPart;
	}

	export interface LanguageModelToolResult {
		/**
		 * The result can contain arbitrary representations of the content. An example might be 'prompt-tsx' to indicate an element that can be rendered with the @vscode/prompt-tsx library.
		 */
		[contentType: string]: any;

		/**
		 * A string representation of the result which can be incorporated back into an LLM prompt without any special handling.
		 */
		toString(): string;
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
		 * TODO@API Could request a set of contentTypes to be returned so they don't all need to be computed?
		 */
		export function invokeTool(id: string, parameters: Object, token: CancellationToken): Thenable<LanguageModelToolResult>;
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
	}

	export interface LanguageModelTool {
		// TODO@API should it be LanguageModelToolResult | string?
		invoke(parameters: any, token: CancellationToken): Thenable<LanguageModelToolResult>;
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
}
