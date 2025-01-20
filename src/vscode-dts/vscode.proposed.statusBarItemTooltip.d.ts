/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/234339

	export interface StatusBarItem {
		tooltip2?: (token: CancellationToken) => ProviderResult<string | MarkdownString>;
	}
}
