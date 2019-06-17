/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITerminalLauncher } from 'vs/workbench/contrib/debug/common/debug';
import { TelemetryService } from 'vs/platform/telemetry/common/telemetryService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

export const DEBUGUI_SERVICE_ID = 'debugUIService';
export const IDebugUIService = createDecorator<IDebugUIService>(DEBUGUI_SERVICE_ID);

/**
 * This interface represents a single command line argument split into a "prefix" and a "path" half.
 * The optional "prefix" contains arbitrary text and the optional "path" contains a file system path.
 * Concatenating both results in the original command line argument.
 */
export interface ILaunchVSCodeArgument {
	prefix?: string;
	path?: string;
}

export interface ILaunchVSCodeArguments {
	args: ILaunchVSCodeArgument[];
	env?: { [key: string]: string | null; };
}

export interface IDebugUIService {
	_serviceBrand: any;

	createTerminalLauncher(instantiationService: IInstantiationService): ITerminalLauncher;

	launchVsCode(vscodeArgs: ILaunchVSCodeArguments): Promise<number>;

	createTelemetryService(configurationService: IConfigurationService, args: string[]): TelemetryService | undefined;
}
