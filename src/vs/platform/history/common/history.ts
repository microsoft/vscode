/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IPath } from 'vs/platform/windows/common/windows';
import CommonEvent from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceIdentifier } from "vs/platform/workspaces/common/workspaces";

export const IHistoryMainService = createDecorator<IHistoryMainService>('historyMainService');

export interface IRecentlyOpened {
	workspaces: IWorkspaceIdentifier[];
	folders: string[];
	files: string[];
}

export interface IRecentlyOpenedFile {
	path: string;
	isFile?: boolean;
}

export interface IHistoryMainService {
	_serviceBrand: any;

	onRecentlyOpenedChange: CommonEvent<void>;

	addToRecentlyOpened(recent: (IWorkspaceIdentifier | IRecentlyOpenedFile)[]): void;

	getRecentlyOpened(currentWorkspace?: IWorkspaceIdentifier, currentFolderPath?: string, currentFiles?: IPath[]): IRecentlyOpened;

	removeFromRecentlyOpened(toRemove: IWorkspaceIdentifier | string): void;
	removeFromRecentlyOpened(toRemove: (IWorkspaceIdentifier | string)[]): void;

	clearRecentlyOpened(): void;

	updateWindowsJumpList(): void;
}