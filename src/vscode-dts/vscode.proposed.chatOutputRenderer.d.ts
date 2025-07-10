/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	/**
	 * Data returned from a tool.
	 *
	 * This is an opaque binary blob that can be rendered by a {@link ChatOutputRenderer}.
	 */
	export interface ToolResultDataOutput {
		/**
		 * The MIME type of the data.
		 */
		mime: string;

		/**
		 * The contents of the data.
		 */
		value: Uint8Array;
	}

	export interface ExtendedLanguageModelToolResult2 extends ExtendedLanguageModelToolResult {
		// Temporary to allow `toolResultDetails` to return a ToolResultDataOutput
		// TODO: Should we allow multiple per tool result?
		toolResultDetails2?: Array<Uri | Location> | ToolResultDataOutput;
	}

	export interface ChatOutputRenderer {
		/**
		 * Given an output, render it into the provided webview.
		 *
		 * TODO: Should we make this more generic so that we could support inputs besides tool outputs?
		 * For example, a generic `ChatResponseDataPart` type.
		 *
		 * @param data The data to render.
		 * @param webview The webview to render the data into.
		 * @param token A cancellation token that is cancelled if we no longer care about the rendering before this
		 * call completes.
		 *
		 * @returns A promise that resolves when the rendering is complete.
		 */
		renderChatOutput(data: ToolResultDataOutput, webview: Webview, token: CancellationToken): Thenable<void>;
	}

	export namespace chat {
		/**
		 * Registers a new renderer for a given mime type.
		 *
		 * TODO: needs contribution point so we know which mimes are available.
		 *
		 * @param mime The MIME type of the output that this renderer can handle.
		 * @param renderer The renderer to register.
		 */
		export function registerChatOutputRenderer(mime: string, renderer: ChatOutputRenderer): Disposable;
	}
}
