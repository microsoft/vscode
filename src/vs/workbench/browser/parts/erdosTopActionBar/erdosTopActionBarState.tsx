/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useState } from 'react';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../platform/workspace/common/workspace.js';
import { useErdosReactServicesContext } from '../../../../base/browser/erdosReactRendererContext.js';

export interface ErdosTopActionBarState {
	workspaceFolder?: IWorkspaceFolder;
}

const singleWorkspaceFolder = (workspaceContextService: IWorkspaceContextService) => {
	const folders = workspaceContextService.getWorkspace().folders;
	if (folders.length) {
		return folders[0];
	} else {
		return undefined;
	}
};

export const useErdosTopActionBarState = (): ErdosTopActionBarState => {
	const services = useErdosReactServicesContext();
	const [workspaceFolder, setWorkspaceFolder] = useState<IWorkspaceFolder | undefined>(singleWorkspaceFolder(services.workspaceContextService));

	useEffect(() => {
		const disposableStore = new DisposableStore();

		disposableStore.add(services.workspaceContextService.onDidChangeWorkspaceFolders(e => {
			setWorkspaceFolder(singleWorkspaceFolder(services.workspaceContextService));
		}));

		return () => disposableStore.dispose();
	}, [services.workspaceContextService]);

	return {
		...services,
		workspaceFolder
	};
};
