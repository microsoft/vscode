/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';


export const IDebugOutputService = createServiceIdentifier<IDebugOutputService>('IDebugOutputService');

export interface IDebugOutputService {
	readonly _serviceBrand: undefined;
	consoleOutput: string;
}
