/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServiceIdentifier, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITerminalLauncher, IDebugHelperService, ILaunchVSCodeArguments } from 'vs/workbench/contrib/debug/common/debug';
import { TelemetryService } from 'vs/platform/telemetry/common/telemetryService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export class BrowserDebugHelperService implements IDebugHelperService {

	_serviceBrand: ServiceIdentifier<IDebugHelperService>;

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

registerSingleton(IDebugHelperService, BrowserDebugHelperService);