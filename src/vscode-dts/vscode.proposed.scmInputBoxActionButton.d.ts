/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	// https://github.com/microsoft/vscode/issues/195474

	export interface SourceControlInputBoxActionButton {
		readonly command: Command;
		readonly enabled: boolean;
		readonly icon?: Uri | { light: Uri; dark: Uri } | ThemeIcon;
	}

	export interface SourceControlInputBox {
		actionButton?: SourceControlInputBoxActionButton;
	}

}
