/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../../../../platform/log/common/log.js';
import {
	IOperationLogManager,
	IOperationLogData,
	IOperationLogStats,
	IStorageProvider,
	IStorageConfiguration,
} from './chatEditingSessionV2.js';
import { IChatEditOperationData } from './chatEditingSessionV2Operations.js';

// ============================================================================
// OPERATION LOG MANAGER IMPLEMENTATION
// ============================================================================

/**
 * Concrete implementation of operation log manager.
 */
export class OperationLogManager implements IOperationLogManager {
	private readonly _logs = new Map<string, IOperationLogData>();

	constructor(
		private readonly _storageProvider: IStorageProvider,
		private readonly _logService: ILogService,
		configuration: Partial<IStorageConfiguration> = {}
	) {
		// Configuration available but not stored for basic implementation
		// Compression and advanced features are disabled
	}

	async createLog(sessionId: string): Promise<void> {
		const logData: IOperationLogData = {
			version: 1,
			operations: [],
			currentPosition: 0,
			totalOperations: 0,
			compressed: false
		};

		this._logs.set(sessionId, logData);
		await this._saveLog(sessionId, logData);
		this._logService.debug('Created operation log', sessionId);
	}

	async appendOperations(sessionId: string, operations: IChatEditOperationData[]): Promise<void> {
		let logData = this._logs.get(sessionId);

		if (!logData) {
			// Try to load from storage
			logData = await this._loadLog(sessionId);
			if (!logData) {
				throw new Error(`Operation log not found: ${sessionId}`);
			}
		}

		// Append operations
		logData.operations.push(...operations);
		logData.totalOperations = logData.operations.length;
		logData.currentPosition = logData.operations.length;

		// Note: Compression disabled for basic storage implementation

		await this._saveLog(sessionId, logData);
		this._logService.debug('Appended operations to log', sessionId, operations.length);
	}

	async getOperations(sessionId: string, startIndex?: number, count?: number): Promise<IChatEditOperationData[]> {
		let logData = this._logs.get(sessionId);

		if (!logData) {
			logData = await this._loadLog(sessionId);
			if (!logData) {
				return [];
			}
		}

		const operations = await this._getOperations(logData);
		const start = startIndex || 0;
		const end = count ? start + count : undefined;

		return operations.slice(start, end);
	}

	async getOperationsForRequest(sessionId: string, requestId: string): Promise<IChatEditOperationData[]> {
		const operations = await this.getOperations(sessionId);
		return operations.filter(op => op.requestId === requestId);
	}

	async getOperationsForResource(sessionId: string, resourceUri: string): Promise<IChatEditOperationData[]> {
		const operations = await this.getOperations(sessionId);
		return operations.filter(op => {
			// Check if operation affects this resource
			const data = op.data as any;
			if (data.targetUri === resourceUri) {
				return true;
			}
			if (data.oldUri === resourceUri || data.newUri === resourceUri) {
				return true;
			}
			return false;
		});
	}

	async compressLog(sessionId: string): Promise<void> {
		// Compression not implemented in basic storage
		this._logService.debug('Compression not available in basic storage', sessionId);
	}

	async getLogStats(sessionId: string): Promise<IOperationLogStats> {
		let logData = this._logs.get(sessionId);

		if (!logData) {
			logData = await this._loadLog(sessionId);
			if (!logData) {
				throw new Error(`Operation log not found: ${sessionId}`);
			}
		}

		const logSize = JSON.stringify(logData).length;
		const operations = await this._getOperations(logData);

		let oldestOperation: number | undefined;
		let newestOperation: number | undefined;

		if (operations.length > 0) {
			oldestOperation = Math.min(...operations.map((op: IChatEditOperationData) => op.timestamp));
			newestOperation = Math.max(...operations.map((op: IChatEditOperationData) => op.timestamp));
		}

		return {
			sessionId,
			operationCount: operations.length,
			logSize,
			compressed: false, // Always false for basic storage
			compressionRatio: 1, // No compression
			oldestOperation,
			newestOperation
		};
	}

	async pruneLog(sessionId: string, keepCount: number): Promise<void> {
		let logData = this._logs.get(sessionId);

		if (!logData) {
			logData = await this._loadLog(sessionId);
			if (!logData) {
				throw new Error(`Operation log not found: ${sessionId}`);
			}
		}

		const operations = await this._getOperations(logData);

		if (operations.length > keepCount) {
			const prunedOperations = operations.slice(-keepCount);
			logData.operations = prunedOperations;
			logData.totalOperations = prunedOperations.length;
			logData.currentPosition = prunedOperations.length;

			await this._saveLog(sessionId, logData);
			this._logService.debug('Pruned operation log', sessionId, operations.length - keepCount);
		}
	}

	async optimizeLog(sessionId: string): Promise<void> {
		// Optimization could include:
		// - Combining consecutive text edits
		// - Removing redundant operations
		// - Compacting file operations

		this._logService.debug('Operation log optimization not yet implemented', sessionId);
	}

	private async _loadLog(sessionId: string): Promise<IOperationLogData | undefined> {
		try {
			const logData = await this._storageProvider.retrieve(`log_${sessionId}`);
			if (logData) {
				this._logs.set(sessionId, logData);
				return logData;
			}
			return undefined;
		} catch (error) {
			this._logService.error('Failed to load operation log', sessionId, error);
			return undefined;
		}
	}

	private async _saveLog(sessionId: string, logData: IOperationLogData): Promise<void> {
		try {
			await this._storageProvider.store(`log_${sessionId}`, logData);
			this._logs.set(sessionId, logData);
		} catch (error) {
			this._logService.error('Failed to save operation log', sessionId, error);
			throw error;
		}
	}

	private async _getOperations(logData: IOperationLogData): Promise<IChatEditOperationData[]> {
		// Basic storage without compression
		return logData.operations;
	}
}
