/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// https://github.com/microsoft/vscode/issues/19561

declare module 'vscode' {

	export namespace window {

		/**
		 * Creates a new {@link OutputChannel output channel} with the given name and language id
		 * If language id is not provided, then **Log** is used as default language id.
		 *
		 * You can access the visible or active output channel as a {@link TextDocument text document} from {@link window.visibleTextEditors visible editors} or {@link window.activeTextEditor active editor}
		 * and use the langage id to contribute language features like syntax coloring, code lens etc.,
		 *
		 * @param name Human-readable string which will be used to represent the channel in the UI.
		 * @param languageId The identifier of the language associated with the channel.
		 */
		export function createOutputChannel(name: string, languageId?: string): OutputChannel;
	}
}
