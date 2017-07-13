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
	workspaces: (IWorkspaceIdentifier | string)[];
	files: string[];
}

export interface IHistoryMainService {
	_serviceBrand: any;

	onRecentlyOpenedChange: CommonEvent<void>;

	addRecentlyOpened(workspaces: (IWorkspaceIdentifier | string)[], files: string[]): void;

	getRecentlyOpened(currentWorkspace?: IWorkspaceIdentifier | string, currentFiles?: IPath[]): IRecentlyOpened;

	removeFromRecentlyOpened(toRemove: IWorkspaceIdentifier | string): void;
	removeFromRecentlyOpened(toRemove: (IWorkspaceIdentifier | string)[]): void;

	clearRecentlyOpened(): void;

	updateWindowsJumpList(): void;
}