/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { IRecent, IRecentlyOpened } from 'vs/platform/workspaces/common/workspacesHistory';

export const IWorkspacesHistoryService = createDecorator<IWorkspacesHistoryService>('workspacesHistoryService');

export interface IWorkspacesHistoryService {

	_serviceBrand: undefined;

	readonly onRecentlyOpenedChange: Event<void>;

	addRecentlyOpened(recents: IRecent[]): Promise<void>;

	removeFromRecentlyOpened(workspaces: URI[]): Promise<void>;
	clearRecentlyOpened(): Promise<void>;

	getRecentlyOpened(): Promise<IRecentlyOpened>;
}
