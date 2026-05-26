/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';

export const IRunCommandExecutionService = createServiceIdentifier<IRunCommandExecutionService>('IRunCommandExecutionService');

export interface IRunCommandExecutionService {
	readonly _serviceBrand: undefined;

	executeCommand(command: string, ...args: any[]): Promise<any>;
}
