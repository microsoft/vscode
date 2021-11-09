/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { ILoggerOptions, ILoggerService, ILogService, log, LogLevel } from 'vs/platform/log/common/log';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IExtHostContext, ExtHostContext, MainThreadLoggerShape, MainContext } from 'vs/workbench/api/common/extHost.protocol';
import { UriComponents, URI } from 'vs/base/common/uri';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

@extHostNamedCustomer(MainContext.MainThreadLogger)
export class MainThreadLoggerService implements MainThreadLoggerShape {

	private readonly _logListener: IDisposable;

	constructor(
		extHostContext: IExtHostContext,
		@ILogService logService: ILogService,
		@ILoggerService private readonly _loggerService: ILoggerService,
	) {
		const proxy = extHostContext.getProxy(ExtHostContext.ExtHostLogLevelServiceShape);
		this._logListener = logService.onDidChangeLogLevel(level => proxy.$setLevel(level));
	}

	$log(file: UriComponents, messages: [LogLevel, string][]): void {
		const logger = this._loggerService.getLogger(URI.revive(file));
		if (!logger) {
			throw new Error('Create the logger before logging');
		}
		for (const [level, message] of messages) {
			log(logger, level, message);
		}
	}

	async $createLogger(file: UriComponents, options?: ILoggerOptions): Promise<void> {
		this._loggerService.createLogger(URI.revive(file), options);
	}

	dispose(): void {
		this._logListener.dispose();
	}
}

// --- Internal commands to improve extension test runs

CommandsRegistry.registerCommand('_extensionTests.setLogLevel', function (accessor: ServicesAccessor, level: number) {
	const logService = accessor.get(ILogService);
	const environmentService = accessor.get(IEnvironmentService);

	if (environmentService.isExtensionDevelopment && !!environmentService.extensionTestsLocationURI) {
		logService.setLevel(level);
	}
});

CommandsRegistry.registerCommand('_extensionTests.getLogLevel', function (accessor: ServicesAccessor) {
	const logService = accessor.get(ILogService);

	return logService.getLevel();
});
