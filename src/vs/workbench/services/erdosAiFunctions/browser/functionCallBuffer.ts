/*
 * Copyright (C) 2024 Lotas Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { FunctionCall } from '../common/functionTypes.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IFunctionCallBuffer } from '../common/functionCallBuffer.js';

// Function call data structure for buffering
export interface FunctionCallData {
	function_call: FunctionCall;
	request_id: string;
	response_id?: string;
	message_id: string | number;
}

// Function call buffer for sequential processing of parallel function calls
export class FunctionCallBuffer extends Disposable implements IFunctionCallBuffer {
	readonly _serviceBrand: undefined;
	private buffer: FunctionCallData[] = [];
	private isInitialized: boolean = false;

	constructor() {
		super();
	}

	async processBufferedFunctionCalls(
		processor: (functionCallData: FunctionCallData) => Promise<any>
	): Promise<void> {
		while (this.hasBufferedFunctionCalls()) {
			const functionCallData = this.getNextFunctionCall();
			if (functionCallData) {
				try {
					await processor(functionCallData);
				} catch (error) {
				}
			}
		}
	}

	initFunctionCallBuffer(): void {
		this.buffer = [];
		this.isInitialized = true;
	}

	addToFunctionCallBuffer(functionCallData: FunctionCallData): number {
		if (!this.isInitialized) {
			this.initFunctionCallBuffer();
		}

		this.buffer.push(functionCallData);
		return this.buffer.length;
	}

	getNextFunctionCall(): FunctionCallData | null {
		if (this.buffer.length === 0) {
			return null;
		}
		return this.buffer.shift() || null;
	}

	hasBufferedFunctionCalls(): boolean {
		return this.buffer.length > 0;
	}

	getBufferSize(): number {
		return this.buffer.length;
	}

	clearBuffer(): void {
		this.buffer = [];
	}
}
