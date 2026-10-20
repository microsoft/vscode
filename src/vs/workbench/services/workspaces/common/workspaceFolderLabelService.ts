/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceFolder } from '../../../../platform/workspace/common/workspace.js';

export const IWorkspaceFolderLabelService = createDecorator<IWorkspaceFolderLabelService>('workspaceFolderLabelService');

export interface IWorkspaceFolderLabelService {
	readonly _serviceBrand: undefined;

	/**
	 * Whether breadcrumbs show the folder of a workspace with a single folder, which they
	 * otherwise omit as redundant.
	 */
	readonly showSingleWorkspaceFolder: boolean;

	getWorkspaceFolderLabel(folder: IWorkspaceFolder, verbose?: boolean): string | undefined;
}

export class WorkspaceFolderLabelService implements IWorkspaceFolderLabelService {

	declare readonly _serviceBrand: undefined;

	readonly showSingleWorkspaceFolder = false;

	getWorkspaceFolderLabel(_folder: IWorkspaceFolder, _verbose?: boolean): undefined {
		return undefined;
	}
}

registerSingleton(IWorkspaceFolderLabelService, WorkspaceFolderLabelService, InstantiationType.Delayed);
