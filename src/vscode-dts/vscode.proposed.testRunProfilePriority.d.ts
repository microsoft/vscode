/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/330204

	export interface TestRunProfile {
		/**
		 * Relative priority used when the editor automatically chooses between
		 * compatible profiles from the same controller and kind. Higher values
		 * are preferred. Defaults to `0`.
		 *
		 * Profiles currently selected as defaults take precedence over non-default
		 * profiles regardless of this value.
		 */
		priority: number;
	}
}
