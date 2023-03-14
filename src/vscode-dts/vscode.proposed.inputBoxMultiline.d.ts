/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/

	export interface InputBox extends QuickInput {
		/**
		 * An optional flag to support multiline input. Defaults to false. Cannot be used at the same time as `password`.
		 */
		multiline?: boolean;
	}

	export interface InputBoxOptions {
		/**
		 * Controls if multiline input is supported.
		 */
		multiline?: boolean;
	}
}
