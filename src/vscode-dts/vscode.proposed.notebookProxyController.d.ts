/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export enum NotebookControllerState {
		Idle = 1,
		Connecting = 2
	}

	export interface NotebookController {
		state?: NotebookControllerState;
	}
}
