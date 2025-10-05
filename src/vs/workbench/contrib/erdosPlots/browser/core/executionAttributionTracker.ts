/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IConsoleCodeAttribution } from '../../../../services/erdosConsole/common/erdosConsoleCodeExecution.js';

/**
 * Information about a code execution instance.
 */
interface ExecutionRecord {
	sourceCode: string;
	attributionData?: IConsoleCodeAttribution;
}

/**
 * Tracks recent code executions for associating plots with their generating code.
 */
export class ExecutionAttributionTracker extends Disposable {

	private readonly _executionRecords = new Map<string, ExecutionRecord>();
	private readonly _chronologicalIds: string[] = [];
	private readonly MaxRecordCapacity = 100;

	recordExecution(executionId: string, sourceCode: string, attributionData?: IConsoleCodeAttribution): void {
		const record: ExecutionRecord = {
			sourceCode,
			attributionData
		};

		this._executionRecords.set(executionId, record);
		this._chronologicalIds.push(executionId);

		if (this._chronologicalIds.length > this.MaxRecordCapacity) {
			const expiredId = this._chronologicalIds.shift();
			if (expiredId) {
				this._executionRecords.delete(expiredId);
			}
		}
	}

	retrieveRecord(executionId: string): ExecutionRecord | undefined {
		return this._executionRecords.get(executionId);
	}

	extractCode(executionId: string): string {
		return this._executionRecords.get(executionId)?.sourceCode ?? '';
	}

	extractAttribution(executionId: string): IConsoleCodeAttribution | undefined {
		return this._executionRecords.get(executionId)?.attributionData;
	}

	hasRecord(executionId: string): boolean {
		return this._executionRecords.has(executionId);
	}
}


