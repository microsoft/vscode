/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { memoize } from 'vs/base/common/decorators';
import { join } from 'vs/base/common/path';
import { createStaticIPCHandle } from 'vs/base/parts/ipc/node/ipc.net';
import { IEnvironmentService, INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { NativeEnvironmentService } from 'vs/platform/environment/node/environmentService';
import { refineServiceDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IEnvironmentMainService = refineServiceDecorator<IEnvironmentService, IEnvironmentMainService>(IEnvironmentService);

/**
 * A subclass of the `INativeEnvironmentService` to be used only in electron-main
 * environments.
 */
export interface IEnvironmentMainService extends INativeEnvironmentService {

	// --- NLS cache path
	readonly cachedLanguagesPath: string;

	// --- backup paths
	readonly backupHome: string;

	// --- V8 code caching
	readonly codeCachePath: string | undefined;
	readonly useCodeCache: boolean;

	// --- IPC
	readonly mainIPCHandle: string;
	readonly mainLockfile: string;

	// --- config
	readonly disableUpdates: boolean;
}

export class EnvironmentMainService extends NativeEnvironmentService implements IEnvironmentMainService {

	@memoize
	get cachedLanguagesPath(): string { return join(this.userDataPath, 'clp'); }

	@memoize
	get backupHome(): string { return join(this.userDataPath, 'Backups'); }

	@memoize
	get mainIPCHandle(): string { return createStaticIPCHandle(this.userDataPath, 'main', this.productService.version); }

	@memoize
	get mainLockfile(): string { return join(this.userDataPath, 'code.lock'); }

	@memoize
	get disableUpdates(): boolean { return !!this.args['disable-updates']; }

	@memoize
	get disableKeytar(): boolean { return !!this.args['disable-keytar']; }

	@memoize
	get crossOriginIsolated(): boolean { return !!this.args['enable-coi']; }

	@memoize
	get codeCachePath(): string | undefined { return process.env['VSCODE_CODE_CACHE_PATH'] || undefined; }

	@memoize
	get useCodeCache(): boolean { return !!this.codeCachePath; }
}
