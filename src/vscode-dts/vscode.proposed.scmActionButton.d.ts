/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	// https://github.com/microsoft/vscode/issues/133935

	export interface SourceControlActionButton {
		command: Command;
		secondaryCommands?: Command[][];
		description?: string;
		enabled: boolean;
	}

	export interface SourceControl {
		actionButton?: SourceControlActionButton;
	}
}
