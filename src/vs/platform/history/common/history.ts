/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPath } from 'vs/platform/windows/common/windows';
import { Event as CommonEvent } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { URI } from 'vs/base/common/uri';

export const IHistoryMainService = createDecorator<IHistoryMainService>('historyMainService');

export interface IRecentlyOpened {
	workspaces: Array<IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier>;
	files: URI[];
}

export interface IHistoryMainService {
	_serviceBrand: any;

	onRecentlyOpenedChange: CommonEvent<void>;

	addRecentlyOpened(workspaces: undefined | Array<IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier>, files: URI[]): void;
	getRecentlyOpened(currentWorkspace?: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier, currentFiles?: IPath[]): IRecentlyOpened;
	removeFromRecentlyOpened(paths: Array<IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | URI | string>): void;
	clearRecentlyOpened(): void;

	updateWindowsJumpList(): void;
}