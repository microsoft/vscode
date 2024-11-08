/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { ILoggerOptions, ILoggerResource, ILoggerService, ILogService, isLogLevel, log, LogLevel, LogLevelToString, parseLogLevel } from '../../../platform/log/common/log.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { ExtHostContext, MainThreadLoggerShape, MainContext } from '../common/extHost.protocol.js';
import { UriComponents, URI, UriDto } from '../../../base/common/uri.js';
import { ServicesAccessor } from '../../../platform/instantiation/common/instantiation.js';
import { CommandsRegistry } from '../../../platform/commands/common/commands.js';
import { IEnvironmentService } from '../../../platform/environment/common/environment.js';

@extHostNamedCustomer(MainContext.MainThreadLogger)
export class MainThreadLoggerService implements MainThreadLoggerShape {

	private readonly disposables = new DisposableStore();

	constructor(
		extHostContext: IExtHostContext,
		@ILoggerService private readonly loggerService: ILoggerService,
	) {
		const proxy = extHostContext.getProxy(ExtHostContext.ExtHostLogLevelServiceShape);
		this.disposables.add(loggerService.onDidChangeLogLevel(arg => {
			if (isLogLevel(arg)) {
				proxy.$setLogLevel(arg);
			} else {
				proxy.$setLogLevel(arg[1], arg[0]);
			}
		}));
	}

	$log(file: UriComponents, messages: [LogLevel, string][]): void {
		const logger = this.loggerService.getLogger(URI.revive(file));
		if (!logger) {
			throw new Error('Create the logger before logging');
		}
		for (const [level, message] of messages) {
			log(logger, level, message);
		}
	}

	async $createLogger(file: UriComponents, options?: ILoggerOptions): Promise<void> {
		this.loggerService.createLogger(URI.revive(file), options);
	}

	async $registerLogger(logResource: UriDto<ILoggerResource>): Promise<void> {
		this.loggerService.registerLogger({
			...logResource,
			resource: URI.revive(logResource.resource)
		});
	}

	async $deregisterLogger(resource: UriComponents): Promise<void> {
		this.loggerService.deregisterLogger(URI.revive(resource));
	}

	async $setVisibility(resource: UriComponents, visible: boolean): Promise<void> {
		this.loggerService.setVisibility(URI.revive(resource), visible);
	}

	$flush(file: UriComponents): void {
		const logger = this.loggerService.getLogger(URI.revive(file));
		if (!logger) {
			throw new Error('Create the logger before flushing');
		}
		logger.flush();
	}

	dispose(): void {
		this.disposables.dispose();
	}
}

// --- Internal commands to improve extension test runs

CommandsRegistry.registerCommand('_extensionTests.setLogLevel', function (accessor: ServicesAccessor, level: string) {
	const loggerService = accessor.get(ILoggerService);
	const environmentService = accessor.get(IEnvironmentService);

	if (environmentService.isExtensionDevelopment && !!environmentService.extensionTestsLocationURI) {
		const logLevel = parseLogLevel(level);
		if (logLevel !== undefined) {
			loggerService.setLogLevel(logLevel);
		}
	}
});

CommandsRegistry.registerCommand('_extensionTests.getLogLevel', function (accessor: ServicesAccessor) {
	const logService = accessor.get(ILogService);

	return LogLevelToString(logService.getLevel());
});
