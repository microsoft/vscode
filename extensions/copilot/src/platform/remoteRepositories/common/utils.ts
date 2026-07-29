/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../util/vs/base/common/uri';

export function isGitHubRemoteRepository(uri: URI): boolean {
	return uri.scheme === 'vscode-vfs' && uri.authority.startsWith('github');
}
