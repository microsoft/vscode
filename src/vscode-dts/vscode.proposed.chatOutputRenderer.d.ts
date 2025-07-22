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

	export interface ChatOutputRenderer {
		/**
		 * Given an output, render it into the provided webview.
		 *
		 * TODO:Should this take an object instead of Uint8Array? That would let you get the original mime. Useful
		 * if we ever support registering for multiple mime types or using image/*.
		 *
		 * TODO: Figure out what to pass as context?
		 *
		 * @param data The data to render.
		 * @param webview The webview to render the data into.
		 * @param token A cancellation token that is cancelled if we no longer care about the rendering before this
		 * call completes.
		 *
		 * @returns A promise that resolves when the webview has been initialized and is ready to be presented to the user.
		 */
		renderChatOutput(data: Uint8Array, webview: Webview, ctx: {}, token: CancellationToken): Thenable<void>;
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
		 *       "mimeTypes": ["application/your-mime-type"]
		 *     }
		 *   ]
		 * }
		 * ```
		 *
		 * @param mime The MIME type of the output that this renderer can handle.
		 * @param renderer The renderer to register.
		 */
		export function registerChatOutputRenderer(mime: string, renderer: ChatOutputRenderer): Disposable;
	}
}
