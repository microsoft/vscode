/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// TODO@API capabilities

	export type JSONSchema = object;

	// API -> LM: an tool/function that is available to the language model
	export interface LanguageModelChatFunction {
		name: string;
		description: string;
		parametersSchema: JSONSchema;
	}

	// API -> LM: add tools as request option
	export interface LanguageModelChatRequestOptions {
		// TODO@API this will a heterogeneous array of different types of tools
		tools?: LanguageModelChatFunction[];
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
}
