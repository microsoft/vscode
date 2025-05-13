/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	/**
	 * Data returned from a tool. This is an opaque binary blob that can be rendered by
	 */
	export interface ToolResultDataOutput {
		mime: string;
		value: Uint8Array;

		// Optional source code for the element
		// Could be used to let users switch to a source code view
		//
		// Alternatively we could just use the text result if any?
		sourceCode?: {
			content: string;
			language?: string;
		};
	}

	export interface ExtendedLanguageModelToolResult2 extends ExtendedLanguageModelToolResult {
		// Allow toolResultDetails to return a ToolResultDataOutput
		toolResultDetails2?: Array<Uri | Location> | ToolResultDataOutput;
	}

	export interface ChatOutputRenderer {
		// Given an output, render it into the provided webview
		renderChatOutput(output: ToolResultDataOutput, webview: Webview, token: CancellationToken): Thenable<void>;
	}

	export namespace chat {
		export function registerChatOutputRenderer(mime: string, renderer: ChatOutputRenderer): Disposable;
	}


	//
	/**
	 * Data returned from a tool. This is an opaque binary blob that can be rendered by a widget renderer
	 */
	export interface ToolResultDataOutput {
		mime: string;
		value: Uint8Array;

		// Optional source code for the element
		// Could be used to let users switch to a source code view
		//
		// Alternatively we could just use the text result if any?
		sourceCode?: {
			content: string;
			language?: string;
		};
	}

	export interface ChatWidgetRenderer<T> {

		// Similar to tool's invoke but we allow returning both a result and widget data
		invoke(options: LanguageModelToolInvocationOptions<T>, token: CancellationToken): ProviderResult<{ data: ToolResultDataOutput; result: LanguageModelToolResult }>;


		// Do the actual rendering using the returned widget data
		renderChatWidget(output: ToolResultDataOutput, webview: Webview, token: CancellationToken): Thenable<void>;
	}

	export namespace chat {
		export function registerChatWidgetRenderer(id: string, renderer: ChatWidgetRenderer<any>): Disposable;
	}
}
