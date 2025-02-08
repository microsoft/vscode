/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
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
