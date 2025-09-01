/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IFunctionCallBuffer } from './functionCallBuffer.js';

export const IFunctionCallOrchestrator = createDecorator<IFunctionCallOrchestrator>('functionCallOrchestrator');

export interface IFunctionCallOrchestrator {
	readonly _serviceBrand: undefined;

	processSingleFunctionCall(functionCall: any, relatedToId: string | number, requestId: string, responseId?: string, messageId?: string | number, context?: any): Promise<any>;
	getPreallocatedMessageId(callId: string, index?: number): string | number | null;
	getFunctionCallBuffer(): IFunctionCallBuffer;
	isFirstFunctionCallInParallelSet(callId: string): boolean;
	hasBufferedFunctionCalls(): boolean;
	getBufferSize(): number;
	getFunctionCallHandler(): any;
}
