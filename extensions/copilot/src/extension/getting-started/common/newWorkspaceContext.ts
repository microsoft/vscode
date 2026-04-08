/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';

export const NEW_WORKSPACE_STORAGE_KEY = 'copilot.newWorkspaceAgent.workspaceContexts';

export interface INewWorkspaceStoredData {
	workspaceURI: string;
	userPrompt: string;
	initialized: boolean | undefined;
}

export function saveNewWorkspaceContext(add: INewWorkspaceStoredData, extensionContext: IVSCodeExtensionContext) {
	const contexts = extensionContext.globalState.get<INewWorkspaceStoredData[]>(NEW_WORKSPACE_STORAGE_KEY, []);
	const idx = contexts.findIndex(context => context.workspaceURI === add.workspaceURI);
	if (idx >= 0) {
		contexts.splice(idx, 1);
	}

	contexts.unshift(add);
	while (contexts.length > 30) {
		contexts.pop();
	}

	extensionContext.globalState.update(NEW_WORKSPACE_STORAGE_KEY, contexts);
}