/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from 'vs/base/common/path';
import { memoize } from 'vs/base/common/decorators';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { NativeEnvironmentService } from 'vs/platform/environment/node/environmentService';

export const IEnvironmentMainService = createDecorator<IEnvironmentMainService>('environmentMainService');

/**
 * A subclass of the `INativeEnvironmentService` to be used only in electron-main
 * environments.
 */
export interface IEnvironmentMainService extends INativeEnvironmentService {
	backupHome: string;
	backupWorkspacesPath: string;
}

export class EnvironmentMainService extends NativeEnvironmentService {

	@memoize
	get backupHome(): string { return join(this.userDataPath, 'Backups'); }

	@memoize
	get backupWorkspacesPath(): string { return join(this.backupHome, 'workspaces.json'); }
}
