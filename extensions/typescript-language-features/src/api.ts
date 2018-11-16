/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

interface ApiV0 {
	readonly onCompletionAccepted: vscode.Event<vscode.CompletionItem>;
}

export interface Api {
	getAPI(version: 0): ApiV0 | undefined;
}

export function getExtensionApi(
	onCompletionAccepted: vscode.Event<vscode.CompletionItem>
): Api {
	return {
		getAPI(version) {
			if (version === 0) {
				return {
					onCompletionAccepted: onCompletionAccepted
				} as ApiV0;
			}
			return undefined;
		}
	};
}