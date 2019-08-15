/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event as CommonEvent } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { URI } from 'vs/base/common/uri';
import { IPath } from 'vs/platform/windows/common/windows';

export const IHistoryMainService = createDecorator<IHistoryMainService>('historyMainService');

export interface IRecentlyOpened {
	workspaces: Array<IRecentWorkspace | IRecentFolder>;
	files: IRecentFile[];
}

export type IRecent = IRecentWorkspace | IRecentFolder | IRecentFile;

export interface IRecentWorkspace {
	workspace: IWorkspaceIdentifier;
	label?: string;
}

export interface IRecentFolder {
	folderUri: ISingleFolderWorkspaceIdentifier;
	label?: string;
}

export interface IRecentFile {
	fileUri: URI;
	label?: string;
}

export function isRecentWorkspace(curr: IRecent): curr is IRecentWorkspace {
	return curr.hasOwnProperty('workspace');
}

export function isRecentFolder(curr: IRecent): curr is IRecentFolder {
	return curr.hasOwnProperty('folderUri');
}

export function isRecentFile(curr: IRecent): curr is IRecentFile {
	return curr.hasOwnProperty('fileUri');
}


export interface IHistoryMainService {
	_serviceBrand: any;

	onRecentlyOpenedChange: CommonEvent<void>;

	addRecentlyOpened(recents: IRecent[]): void;
	getRecentlyOpened(currentWorkspace?: IWorkspaceIdentifier, currentFolder?: ISingleFolderWorkspaceIdentifier, currentFiles?: IPath[]): IRecentlyOpened;
	removeFromRecentlyOpened(paths: URI[]): void;
	clearRecentlyOpened(): void;

	updateWindowsJumpList(): void;
}