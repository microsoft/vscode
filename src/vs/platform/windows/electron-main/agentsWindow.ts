/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { NativeParsedArgs } from '../../environment/common/argv.js';
import { AgentsWindowOpenSource } from '../../window/common/window.js';
import { ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier } from '../../workspace/common/workspace.js';
import { IOpenConfiguration, OpenContext } from './windows.js';

export async function resolveAgentsWindowFolder(openConfig: IOpenConfiguration, folderUri: URI | undefined, sessionResource: URI | undefined, source: AgentsWindowOpenSource | undefined, extractPaths: (cli: NativeParsedArgs) => Promise<readonly { readonly workspace?: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier }[]>): Promise<URI | undefined> {
	if (folderUri || sessionResource || openConfig.context !== OpenContext.CLI || !openConfig.cli.agents || (source !== undefined && source !== AgentsWindowOpenSource.CommandLine)) {
		return folderUri;
	}

	const paths = await extractPaths(openConfig.cli);
	return paths.map(path => path.workspace).find(isSingleFolderWorkspaceIdentifier)?.uri;
}
