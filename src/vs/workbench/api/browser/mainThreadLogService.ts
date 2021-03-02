/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { ILogService, LogLevel } from 'vs/platform/log/common/log';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IExtHostContext, ExtHostContext, MainThreadLogShape, MainContext } from 'vs/workbench/api/common/extHost.protocol';
import { UriComponents, URI } from 'vs/base/common/uri';
import { FileLogger } from 'vs/platform/log/common/fileLog';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { basename } from 'vs/base/common/path';

@extHostNamedCustomer(MainContext.MainThreadLog)
export class MainThreadLogService implements MainThreadLogShape {

	private readonly _loggers = new Map<string, FileLogger>();
	private readonly _logListener: IDisposable;

	constructor(
		extHostContext: IExtHostContext,
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instaService: IInstantiationService,
	) {
		const proxy = extHostContext.getProxy(ExtHostContext.ExtHostLogService);
		this._logListener = _logService.onDidChangeLogLevel(level => {
			proxy.$setLevel(level);
			this._loggers.forEach(value => value.setLevel(level));
		});
	}

	dispose(): void {
		this._logListener.dispose();
		this._loggers.forEach(value => value.dispose());
		this._loggers.clear();
	}

	$log(file: UriComponents, level: LogLevel, message: any[]): void {
		const uri = URI.revive(file);
		let logger = this._loggers.get(uri.toString());
		if (!logger) {
			logger = this._instaService.createInstance(FileLogger, basename(file.path), URI.revive(file), this._logService.getLevel());
			this._loggers.set(uri.toString(), logger);
		}
		logger.log(level, message);
	}
}
