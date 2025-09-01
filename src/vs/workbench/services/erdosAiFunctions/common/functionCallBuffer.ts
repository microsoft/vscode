/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface FunctionCallData {
	function_call: any;
	request_id: string;
	response_id?: string;
	message_id: string | number;
}

export const IFunctionCallBuffer = createDecorator<IFunctionCallBuffer>('functionCallBuffer');

export interface IFunctionCallBuffer {
	readonly _serviceBrand: undefined;

	processBufferedFunctionCalls(processor: (functionCallData: FunctionCallData) => Promise<any>): Promise<void>;
	initFunctionCallBuffer(): void;
	addToFunctionCallBuffer(functionCallData: FunctionCallData): number;
	getNextFunctionCall(): FunctionCallData | null;
	hasBufferedFunctionCalls(): boolean;
	getBufferSize(): number;
	clearBuffer(): void;
}
