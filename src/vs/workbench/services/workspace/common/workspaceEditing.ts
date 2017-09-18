/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';

export const IWorkspaceEditingService = createDecorator<IWorkspaceEditingService>('workspaceEditingService');

export interface IWorkspaceEditingService {

	_serviceBrand: ServiceIdentifier<any>;

	/**
	 * add folders to the existing workspace
	 */
	addFolders(folders: URI[]): TPromise<void>;

	/**
	 * remove folders from the existing workspace
	 */
	removeFolders(folders: URI[]): TPromise<void>;
}

export const IWorkspaceMigrationService = createDecorator<IWorkspaceMigrationService>('workspaceMigrationService');

export interface IWorkspaceMigrationService {

	/**
	 * Migrate current workspace to given workspace
	 */
	migrate(toWokspaceId: IWorkspaceIdentifier): TPromise<void>;

}