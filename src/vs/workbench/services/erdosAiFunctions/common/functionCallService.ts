/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { FunctionCall, FunctionResult, CallContext } from './functionTypes.js';

export const IFunctionCallService = createDecorator<IFunctionCallService>('functionCallService');

export interface IFunctionCallService {
	readonly _serviceBrand: undefined;

	processFunctionCall(functionCall: FunctionCall, context: CallContext): Promise<FunctionResult>;
}
