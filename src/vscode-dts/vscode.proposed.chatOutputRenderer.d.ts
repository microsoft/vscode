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
		// TODO: Should this live here? Or should we be able to mark each `content` items as user/lm specific?
		// TODO: Should we allow multiple per tool result?
		toolResultDetails2?: Array<Uri | Location> | ToolResultDataOutput;
	}

	/**
	 * The data to be rendered by a {@link ChatOutputRenderer}.
	 */
	export interface ChatOutputDataItem {
		/**
		 * The MIME type of the data.
		 */
		readonly mime: string;

		/**
		 * The contents of the data.
		 */
		readonly value: Uint8Array;
	}

	export interface ChatOutputRenderer {
		/**
		 * Given an output, render it into the provided webview.
		 *
		 * TODO: Figure out what to pass as context? Probably at least basic info such as chat location.
		 *
		 * @param data The data to render.
		 * @param webview The webview to render the data into.
		 * @param token A cancellation token that is cancelled if we no longer care about the rendering before this
		 * call completes.
		 *
		 * @returns A promise that resolves when the webview has been initialized and is ready to be presented to the user.
		 */
		renderChatOutput(data: ChatOutputDataItem, webview: Webview, ctx: {}, token: CancellationToken): Thenable<void>;
	}

	export namespace chat {
		/**
		 * Registers a new renderer for a given mime type.
		 *
		 * Note: To use this API, you should also add a contribution point in your extension's
		 * package.json:
		 *
		 * ```json
		 * "contributes": {
		 *   "chatOutputRenderer": [
		 *     {
		 *       "viewType": "myExt.myChatOutputRenderer",
		 *       "mimeTypes": ["application/your-mime-type"]
		 *     }
		 *   ]
		 * }
		 * ```
		 *
		 * @param viewType Unique identifier for the renderer. This should match the `viewType` in your contribution point.
		 * @param renderer The renderer to register.
		 */
		export function registerChatOutputRenderer(viewType: string, renderer: ChatOutputRenderer): Disposable;
	}
}
