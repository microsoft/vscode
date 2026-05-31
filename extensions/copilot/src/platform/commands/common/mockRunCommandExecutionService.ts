/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRunCommandExecutionService } from '../common/runCommandExecutionService';

export class MockRunCommandExecutionService implements IRunCommandExecutionService {
	declare readonly _serviceBrand: undefined;
	async executeCommand(command: string, ...args: any[]): Promise<any> {
		// ignore call
	}
	updateContextValues(): void {
	}
}
