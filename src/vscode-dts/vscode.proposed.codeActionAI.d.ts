/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface CodeAction {
		/**
		 * Marks this as an AI action.
		 *
		 * Ex: A quick fix should be marked AI if it invokes AI.
		 */
		isAI?: boolean;
	}
}
