/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServiceIdentifier, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITerminalLauncher } from 'vs/workbench/contrib/debug/common/debug';
import { TelemetryService } from 'vs/platform/telemetry/common/telemetryService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IDebugUIService, ILaunchVSCodeArguments } from 'vs/workbench/contrib/debug/common/debugUI';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export class BrowserDebugUIService implements IDebugUIService {

	_serviceBrand: ServiceIdentifier<IDebugUIService>;

	createTerminalLauncher(instantiationService: IInstantiationService): ITerminalLauncher {
		throw new Error('Method createTerminalLauncher not implemented.');
	}

	launchVsCode(vscodeArgs: ILaunchVSCodeArguments): Promise<number> {
		throw new Error('Method launchVsCode not implemented.');
	}

	createTelemetryService(configurationService: IConfigurationService, args: string[]): TelemetryService | undefined {
		return undefined;
	}
}

registerSingleton(IDebugUIService, BrowserDebugUIService);