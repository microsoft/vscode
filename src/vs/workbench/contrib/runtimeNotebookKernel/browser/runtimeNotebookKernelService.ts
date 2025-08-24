/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IRuntimeNotebookKernelService } from '../common/interfaces/runtimeNotebookKernelService.js';

export class RuntimeNotebookKernelService extends Disposable implements IRuntimeNotebookKernelService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._logService.info('RuntimeNotebookKernelService initialized');
	}

	initialize(): void {
		this._logService.debug('RuntimeNotebookKernelService initialize called');
	}
}

registerSingleton(IRuntimeNotebookKernelService, RuntimeNotebookKernelService, InstantiationType.Eager);
