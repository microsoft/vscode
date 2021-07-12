/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

// -----------------------------------------------------------------
// The following commands are registered on both sides separately.
//
// We are trying to maintain backwards compatibility for cases where
// API commands are encoded as markdown links, for example.
// -----------------------------------------------------------------

export interface ICommandsExecutor {
	executeCommand<T>(id: string, ...args: any[]): Promise<T | undefined>;
}

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
