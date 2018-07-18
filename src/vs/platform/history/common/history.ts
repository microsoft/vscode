/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IPath } from 'vs/platform/windows/common/windows';
import { Event as CommonEvent } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier2 } from 'vs/platform/workspaces/common/workspaces';

export const IHistoryMainService = createDecorator<IHistoryMainService>('historyMainService');

export interface IRecentlyOpened {
	workspaces: (IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier2)[];
	files: string[];
}

export interface IHistoryMainService {
	_serviceBrand: any;

	onRecentlyOpenedChange: CommonEvent<void>;

	addRecentlyOpened(workspaces: (IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier2)[], files: string[]): void;
	getRecentlyOpened(currentWorkspace?: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier2, currentFiles?: IPath[]): IRecentlyOpened;
	removeFromRecentlyOpened(paths: (IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier2 | string)[]): void;
	clearRecentlyOpened(): void;

	updateWindowsJumpList(): void;
}