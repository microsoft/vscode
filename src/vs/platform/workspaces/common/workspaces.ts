/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { TPromise } from 'vs/base/common/winjs.base';

export const IWorkspacesMainService = createDecorator<IWorkspacesMainService>('workspacesMainService');
export const IWorkspacesService = createDecorator<IWorkspacesService>('workspacesService');

export const WORKSPACE_EXTNAME = '.code';

export interface IWorkspaceIdentifier {
	id: string;
	configPath: string;
}

export interface IStoredWorkspace {
	id: string;
	folders: string[];
}

export interface IWorkspacesMainService extends IWorkspacesService {
	_serviceBrand: any;

	resolveWorkspaceSync(path: string): IWorkspaceIdentifier;
}

export interface IWorkspacesService {
	_serviceBrand: any;

	createWorkspace(folders?: string[]): TPromise<IWorkspaceIdentifier>;
}