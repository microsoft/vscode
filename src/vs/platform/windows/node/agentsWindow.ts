/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { URI } from '../../../base/common/uri.js';
import type { NativeParsedArgs } from '../../environment/common/argv.js';
import type { IPath } from '../../window/common/window.js';
import { type IAnyWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier } from '../../workspace/common/workspace.js';

type CliPathToOpen = IPath & { readonly workspace?: IAnyWorkspaceIdentifier };

/** Resolves a CLI folder only when no explicit folder or existing session was requested. */
export async function resolveAgentsWindowFolder(
	cli: NativeParsedArgs,
	folderUri: URI | undefined,
	sessionResource: URI | undefined,
	resolveCliPaths: (cli: NativeParsedArgs) => Promise<readonly CliPathToOpen[]>
): Promise<URI | undefined> {
	if (folderUri || sessionResource || !cli.agents) {
		return folderUri;
	}

	const paths = await resolveCliPaths(cli);
	for (const path of paths) {
		if (isSingleFolderWorkspaceIdentifier(path.workspace)) {
			return path.workspace.uri;
		}
	}

	return undefined;
}
