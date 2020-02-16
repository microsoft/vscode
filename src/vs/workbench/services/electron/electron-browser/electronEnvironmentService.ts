/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';
import { memoize } from 'vs/base/common/decorators';
import { join } from 'vs/base/common/path';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

export const IElectronEnvironmentService = createDecorator<IElectronEnvironmentService>('electronEnvironmentService');

export interface IElectronEnvironmentService {

	_serviceBrand: undefined;

	readonly windowId: number;

	readonly sharedIPCHandle: string;

	readonly extHostLogsPath: URI;
}

export class ElectronEnvironmentService implements IElectronEnvironmentService {

	_serviceBrand: undefined;

	constructor(
		public readonly windowId: number,
		public readonly sharedIPCHandle: string,
		private readonly environmentService: IEnvironmentService
	) { }

	@memoize
	get extHostLogsPath(): URI { return URI.file(join(this.environmentService.logsPath, `exthost${this.windowId}`)); }
}
