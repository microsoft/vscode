/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { URI } from '../../../base/common/uri.js';
import { NativeParsedArgs } from '../../environment/common/argv.js';
import { IOpenAgentsWindowOptions } from '../../native/common/native.js';
import { AgentsWindowOpenSource } from '../../window/common/window.js';
import { ICodeWindow } from '../../window/electron-main/window.js';
import { ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier } from '../../workspace/common/workspace.js';
import { IOpenConfiguration, OpenContext } from './windows.js';

export function sendAgentsWindowOpenIntent(window: ICodeWindow, isExistingWindow: boolean, openConfig: IOpenConfiguration, options: IOpenAgentsWindowOptions): void {
	// A focus-only open must not navigate or cancel a pending reveal in an existing window.
	if (isExistingWindow && openConfig.context === OpenContext.API && options.reveal === undefined) {
		return;
	}

	const source = options.source ?? (openConfig.cli.agents ? AgentsWindowOpenSource.CommandLine : AgentsWindowOpenSource.Unknown);
	const draft = options.reveal === 'new' || openConfig.context === OpenContext.LINK ? options.draft : undefined;
	window.sendWhenReady('vscode:selectAgentsFolder', CancellationToken.None,
		URI.revive(options.folderUri)?.toJSON(),
		options.reveal === 'new' ? 'new' : URI.revive(options.reveal)?.toJSON(),
		source, options.folderUriIsDefault ?? false, draft,
		URI.revive(options.onboardingSessionResource)?.toJSON());
}

export async function resolveAgentsWindowFolder(openConfig: IOpenConfiguration, folderUri: URI | undefined, sessionResource: URI | undefined, source: AgentsWindowOpenSource | undefined, extractPaths: (cli: NativeParsedArgs) => Promise<readonly { readonly workspace?: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier }[]>): Promise<URI | undefined> {
	if (folderUri || sessionResource || openConfig.context !== OpenContext.CLI || !openConfig.cli.agents || (source !== undefined && source !== AgentsWindowOpenSource.CommandLine)) {
		return folderUri;
	}

	const paths = await extractPaths(openConfig.cli);
	return paths.map(path => path.workspace).find(isSingleFolderWorkspaceIdentifier)?.uri;
}
