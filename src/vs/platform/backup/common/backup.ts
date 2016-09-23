/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {createDecorator} from 'vs/platform/instantiation/common/instantiation';

export const IBackupService = createDecorator<IBackupService>('backupService');

export interface IBackupService {
	_serviceBrand: any;

	getBackupWorkspaces(): string[];
	clearBackupWorkspaces(): void;
	pushBackupWorkspaces(workspaces: string[]): void;
	removeWorkspace(workspace: string): void;
}
