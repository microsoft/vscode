/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { WorkspaceSymbolMiddleware } from 'vscode-languageclient';

export function createWorkspaceSymbolMiddleware(isEnabled: () => boolean): WorkspaceSymbolMiddleware {
	return {
		provideWorkspaceSymbols(query, token, next) {
			if (!isEnabled()) {
				return [];
			}
			return next(query, token);
		},
	};
}
