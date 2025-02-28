/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


declare module 'vscode' {

	export interface ChatPromptReference {
		/**
		 * When true, the user has indicated at the reference is informational only.
		 * The model should avoid changing or suggesting changes to the reference.
		 */
		readonly isReadonly?: boolean;
	}

}
