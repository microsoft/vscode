/*
 * Copyright (C) 2025 Lotas Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { FunctionCall, FunctionResult, CallContext } from '../common/functionTypes.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IFunctionCallOrchestrator } from '../common/functionCallOrchestrator.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IFunctionCallService } from '../common/functionCallService.js';
import { IFunctionCallBuffer } from '../common/functionCallBuffer.js';

// Main orchestrator for function call processing
export class FunctionCallOrchestrator extends Disposable implements IFunctionCallOrchestrator {
	readonly _serviceBrand: undefined;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IFunctionCallService private readonly functionCallHandler: IFunctionCallService,
		@IFunctionCallBuffer private readonly functionCallBuffer: IFunctionCallBuffer
	) {
		super();
	}

	async processSingleFunctionCall(
		functionCall: FunctionCall,
		relatedToId: string | number,
		requestId: string,
		responseId?: string,
		messageId?: string | number,
		context?: CallContext
	): Promise<FunctionResult> {
		try {
			const functionName = this.extractFunctionName(functionCall);
			

			if (this.shouldRouteToBackend(functionName)) {
				return {
					type: 'error',
					error_message: `Function ${functionName} not supported - widget functionality removed`,
					breakout_of_function_calls: true
				};
			}

			if (!context) {
				throw new Error('CallContext is required for function call processing - cannot use stub methods');
			}
			const callContext: CallContext = context;

			const result = await this.functionCallHandler.processFunctionCall(functionCall, callContext);
			return result;

		} catch (error) {
			const errorMessage = `Function call orchestration failed: ${error instanceof Error ? error.message : String(error)}`;
			this.logService.error('Function call orchestration error:', error);
			return {
				type: 'error',
				error_message: errorMessage,
				breakout_of_function_calls: true
			};
		}
	}

	private extractFunctionName(functionCall: FunctionCall): string {
		if (Array.isArray(functionCall.name)) {
			return functionCall.name[0] || '';
		}
		return functionCall.name || '';
	}

	private shouldRouteToBackend(functionName: string): boolean {
		return false;
	}

	getPreallocatedMessageId(callId: string, index: number = 1): string | number | null {
		return null;
	}

	getFunctionCallBuffer(): IFunctionCallBuffer {
		return this.functionCallBuffer;
	}

	isFirstFunctionCallInParallelSet(callId: string): boolean {
		return false;
	}

	hasBufferedFunctionCalls(): boolean {
		return this.functionCallBuffer.hasBufferedFunctionCalls();
	}

	getBufferSize(): number {
		return this.functionCallBuffer.getBufferSize();
	}

	getFunctionCallHandler(): IFunctionCallService {
		return this.functionCallHandler;
	}
}
