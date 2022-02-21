/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// https://github.com/microsoft/vscode/issues/19561

declare module 'vscode' {

	export namespace window {

		/**
		 * Creates a new {@link OutputChannel output channel} with the given name.
		 *
		 * @param name Human-readable string which will be used to represent the channel in the UI.
		 * @param languageId The identifier of the language associated with the channel.
		 */
		export function createOutputChannel(name: string, languageId?: string): OutputChannel;
	}
}
