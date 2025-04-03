/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const ITracingService = createDecorator<ITracingService>('tracingService');

export interface ITracingService {
	readonly _serviceBrand: undefined;
	recordTrace(trace: object): Promise<void>;
}
