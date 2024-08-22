/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace';
import { sequence } from '../../../../base/common/async';
import { Schemas } from '../../../../base/common/network';
import { INativeHostService } from '../../../../platform/native/common/native';

// Commands

export function revealResourcesInOS(resources: URI[], nativeHostService: INativeHostService, workspaceContextService: IWorkspaceContextService): void {
	if (resources.length) {
		sequence(resources.map(r => async () => {
			if (r.scheme === Schemas.file || r.scheme === Schemas.vscodeUserData) {
				nativeHostService.showItemInFolder(r.with({ scheme: Schemas.file }).fsPath);
			}
		}));
	} else if (workspaceContextService.getWorkspace().folders.length) {
		const uri = workspaceContextService.getWorkspace().folders[0].uri;
		if (uri.scheme === Schemas.file) {
			nativeHostService.showItemInFolder(uri.fsPath);
		}
	}
}
