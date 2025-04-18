/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../../nls.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { INotebookLoggingService } from '../../common/notebookLoggingService.js';
import { ILogger, ILoggerService } from '../../../../../platform/log/common/log.js';
import { windowLogGroup } from '../../../../services/log/common/logConstants.js';

const logChannelId = 'notebook.rendering';

export class NotebookLoggingService extends Disposable implements INotebookLoggingService {
	_serviceBrand: undefined;

	static ID: string = 'notebook';
	private readonly _logger: ILogger;

	constructor(
		@ILoggerService loggerService: ILoggerService,
	) {
		super();
		this._logger = this._register(loggerService.createLogger(logChannelId, { name: nls.localize('renderChannelName', "Notebook"), group: windowLogGroup }));
	}

	debug(category: string, output: string): void {
		this._logger.debug(`[${category}] ${output}`);
	}

	info(category: string, output: string): void {
		this._logger.info(`[${category}] ${output}`);
	}

	warn(category: string, output: string): void {
		this._logger.warn(`[${category}] ${output}`);
	}

	error(category: string, output: string): void {
		this._logger.error(`[${category}] ${output}`);
	}
}

