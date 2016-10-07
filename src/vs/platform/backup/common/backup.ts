/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {createDecorator} from 'vs/platform/instantiation/common/instantiation';
import Uri from 'vs/base/common/uri';

export const IBackupService = createDecorator<IBackupService>('backupService');

export interface IBackupService {
	_serviceBrand: any;

	getBackupWorkspaces(): string[];
	clearBackupWorkspaces(): void;
	removeWorkspace(workspace: string): void;

	registerBackupFile(resource: Uri): void;
	deregisterBackupFile(resource: Uri): void;
	getBackupFiles(workspace: string): string[];
	getBackupResource(resource: Uri): Uri;
}
