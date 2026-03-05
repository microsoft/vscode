/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { sequence } from '../../../../base/common/async.js';
import { Schemas } from '../../../../base/common/network.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IRemoteAuthorityResolverService } from '../../../../platform/remote/common/remoteAuthorityResolver.js';

// Commands

export function revealResourcesInOS(resources: URI[], nativeHostService: INativeHostService, workspaceContextService: IWorkspaceContextService, remoteAuthorityResolverService: IRemoteAuthorityResolverService): void {
	const revealUri = async (uri: URI) => {
		const localUri = await toLocalFileUri(uri, remoteAuthorityResolverService);
		if (localUri) {
			nativeHostService.showItemInFolder(localUri.fsPath);
		}
	};

	if (resources.length) {
		sequence(resources.map(r => () => revealUri(r)));
	} else if (workspaceContextService.getWorkspace().folders.length) {
		revealUri(workspaceContextService.getWorkspace().folders[0].uri);
	}
}

/**
 * Converts a resource URI to a local file URI.
 * For vscode-remote resources (e.g. WSL), uses the remote authority resolver
 * to obtain a canonical local file path.
 */
async function toLocalFileUri(resource: URI, remoteResolver: IRemoteAuthorityResolverService): Promise<URI | undefined> {
	switch (resource.scheme) {
		case Schemas.file:
		case Schemas.vscodeUserData:
			return resource.with({ scheme: Schemas.file });
		case Schemas.vscodeRemote:
			try {
				const canonical = await remoteResolver.getCanonicalURI(resource);
				return canonical.scheme === Schemas.file ? canonical : undefined;
			} catch {
				return undefined;
			}
		default:
			return undefined;
	}
}
