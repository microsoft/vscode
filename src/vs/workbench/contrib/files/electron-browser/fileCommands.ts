/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { sequence } from '../../../../base/common/async.js';
import { Schemas } from '../../../../base/common/network.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { getRemoteName, getRemoteServerRootPath } from '../../../../platform/remote/common/remoteHosts.js';

// Commands

export function revealResourcesInOS(resources: URI[], nativeHostService: INativeHostService, workspaceContextService: IWorkspaceContextService): void {
	if (resources.length) {
		sequence(resources.map(r => async () => {
			const localUri = toLocalFileUri(r);
			if (localUri) {
				nativeHostService.showItemInFolder(localUri.fsPath);
			}
		}));
	} else if (workspaceContextService.getWorkspace().folders.length) {
		const localUri = toLocalFileUri(workspaceContextService.getWorkspace().folders[0].uri);
		if (localUri) {
			nativeHostService.showItemInFolder(localUri.fsPath);
		}
	}
}

/**
 * Converts a resource URI to a local file URI.
 * For WSL remote resources, constructs a UNC path (e.g. \\wsl$\Ubuntu\...).
 */
function toLocalFileUri(resource: URI): URI | undefined {
	switch (resource.scheme) {
		case Schemas.file:
		case Schemas.vscodeUserData:
			return resource.with({ scheme: Schemas.file });
		case Schemas.vscodeRemote: {
			const remoteName = getRemoteName(resource.authority);
			if (remoteName === 'wsl') {
				const distro = getRemoteServerRootPath(resource.authority);
				if (distro) {
					return URI.from({ scheme: Schemas.file, authority: 'wsl$', path: `/${distro}${resource.path}` });
				}
			}
			return undefined;
		}
		default:
			return undefined;
	}
}
