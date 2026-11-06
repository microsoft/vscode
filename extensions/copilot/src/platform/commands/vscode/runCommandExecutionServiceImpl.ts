/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { ITelemetryService } from '../../telemetry/common/telemetry';
import { IRunCommandExecutionService } from '../common/runCommandExecutionService';

export class RunCommandExecutionServiceImpl extends Disposable implements IRunCommandExecutionService {
	declare readonly _serviceBrand: undefined;
	constructor(@ITelemetryService private telemetryService: ITelemetryService) {
		super();
	}
	async executeCommand(command: string, ...args: any[]): Promise<any> {
		try {
			const result = vscode.commands.executeCommand(command, ...args);
			this.telemetryService.sendMSFTTelemetryEvent('automaticCommandExecutedSucceeded', { command: command, args: args?.join(',') });
			return result;
		} catch (e) {
			this.telemetryService.sendMSFTTelemetryEvent('automaticCommandExecutedFailed', { command: command, args: args?.join(','), e });
		}
	}
}
