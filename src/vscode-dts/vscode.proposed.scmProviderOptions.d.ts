/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	// https://github.com/microsoft/vscode/issues/254910

	export interface SourceControl {
		readonly parentRootUri: Uri | undefined;
	}

	export namespace scm {
		export function createSourceControl(id: string, label: string, rootUri?: Uri, parentRootUri?: Uri): SourceControl;
	}
}
