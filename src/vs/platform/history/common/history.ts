/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IPath } from 'vs/platform/windows/common/windows';
import CommonEvent from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';

export const IHistoryMainService = createDecorator<IHistoryMainService>('historyMainService');

export interface IRecentlyOpened {
	workspaces: (IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier)[];
	files: string[];
}

export interface IHistoryMainService {
	_serviceBrand: any;

	onRecentlyOpenedChange: CommonEvent<void>;

	addRecentlyOpened(workspaces: (IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier)[], files: string[]): void;
	getRecentlyOpened(currentWorkspace?: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier, currentFiles?: IPath[]): IRecentlyOpened;
	removeFromRecentlyOpened(paths: string[]): void;
	clearRecentlyOpened(): void;

	updateWindowsJumpList(): void;
}