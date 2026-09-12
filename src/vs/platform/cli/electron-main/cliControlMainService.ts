/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { CliCommandExitCode, ICliCommandResult, ICliControlMainService, IUpdateCliRequest } from '../common/cliControl.js';

export class CliControlMainService implements ICliControlMainService {
	declare readonly _serviceBrand: undefined;

	async runUpdateCommand(request: IUpdateCliRequest): Promise<ICliCommandResult> {
		const command = `update ${request.command}`;
		return {
			exitCode: CliCommandExitCode.Failure,
			stderr: localize('updateCommandNotImplemented', "The '{0}' command is not available yet.", command)
		};
	}
}
