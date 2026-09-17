/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';

export const ICliControlMainService = createDecorator<ICliControlMainService>('cliControlMainService');

export const enum CliCommandExitCode {
	Success = 0,
	Failure = 1,
	InvalidUsage = 2
}

export interface IUpdateCliRequest {
	readonly command: 'status' | 'install';
	readonly json?: boolean;
	readonly version?: string;
	readonly force?: boolean;
}

export interface IUpdateCliStatus {
	readonly schemaVersion: 1;
	readonly currentVersion: string;
	readonly quality: string;
	readonly platform: string;
	readonly installType: string;
	readonly state: string;
	readonly updateAvailable: boolean | null;
	readonly availableVersion: string | null;
	readonly canInstall: boolean;
	readonly disabledReason: string | null;
}

export interface ICliCommandResult {
	readonly exitCode: CliCommandExitCode;
	readonly stdout?: string;
	readonly stderr?: string;
}

export interface ICliControlMainService {
	readonly _serviceBrand: undefined;

	runUpdateCommand(request: IUpdateCliRequest): Promise<ICliCommandResult>;
}
