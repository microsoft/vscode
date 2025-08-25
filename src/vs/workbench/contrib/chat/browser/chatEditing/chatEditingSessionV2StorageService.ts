/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hash } from '../../../../../base/common/hash.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import {
	IChatEditingStorageService,
	IChatEditingSessionData,
	IOperationLogData,
	IOperationCheckpointData,
	ISessionStorageStats,
	ISessionExportData,
	IStorageConfiguration,
	IStorageProvider,
	IOperationLogManager,
} from './chatEditingSessionV2.js';
import { OperationLogManager } from './chatEditingSessionV2OperationLog.js';
import { IChatEditOperationData } from './chatEditingSessionV2Operations.js';

// ============================================================================
// MAIN STORAGE SERVICE IMPLEMENTATION
// ============================================================================

/**
 * Main storage service implementation for chat editing sessions.
 */
export class ChatEditingStorageService implements IChatEditingStorageService {
	private readonly _operationLogManager: IOperationLogManager;
	private readonly _configuration: IStorageConfiguration;

	constructor(
		private readonly _storageProvider: IStorageProvider,
		private readonly _logService: ILogService,
		configuration: Partial<IStorageConfiguration> = {}
	) {
		this._configuration = {
			compressionThreshold: 100,
			maxCheckpoints: 10,
			checkpointInterval: 50,
			enableCompression: true,
			maxSessionSize: 50 * 1024 * 1024, // 50MB
			enableAutoCleanup: true,
			retentionDays: 30,
			...configuration
		};

		this._operationLogManager = new OperationLogManager(
			_storageProvider,
			_logService,
			this._configuration
		);
	}

	async saveSession(sessionId: string, sessionData: IChatEditingSessionData): Promise<void> {
		try {
			// Save main session data
			await this._storageProvider.store(`session_${sessionId}`, sessionData);

			// Save operation log separately for efficiency
			if (sessionData.operationLog) {
				await this.saveOperationLog(sessionId, sessionData.operationLog);
			}

			// Save checkpoints separately
			for (const checkpoint of sessionData.checkpoints) {
				await this.saveCheckpoint(sessionId, checkpoint);
			}

			this._logService.debug('Saved chat editing session', sessionId);
		} catch (error) {
			this._logService.error('Failed to save chat editing session', sessionId, error);
			throw error;
		}
	}

	async loadSession(sessionId: string): Promise<IChatEditingSessionData | null> {
		try {
			const sessionData = await this._storageProvider.retrieve(`session_${sessionId}`);

			if (!sessionData) {
				return null;
			}

			// Load operation log separately
			const operationLog = await this.loadOperationLog(sessionId);
			if (operationLog) {
				sessionData.operationLog = operationLog;
			}

			// Load checkpoints separately
			const checkpoints = await this.loadCheckpoints(sessionId);
			sessionData.checkpoints = checkpoints;

			this._logService.debug('Loaded chat editing session', sessionId);
			return sessionData;
		} catch (error) {
			this._logService.error('Failed to load chat editing session', sessionId, error);
			return null;
		}
	}

	async deleteSession(sessionId: string): Promise<void> {
		try {
			// Delete main session data
			await this._storageProvider.delete(`session_${sessionId}`);

			// Delete operation log
			await this._storageProvider.delete(`log_${sessionId}`);

			// Delete checkpoints
			const checkpointKeys = await this._storageProvider.list(`checkpoint_${sessionId}`);
			for (const key of checkpointKeys) {
				await this._storageProvider.delete(key);
			}

			this._logService.debug('Deleted chat editing session', sessionId);
		} catch (error) {
			this._logService.error('Failed to delete chat editing session', sessionId, error);
			throw error;
		}
	}

	async saveOperationLog(sessionId: string, log: IOperationLogData): Promise<void> {
		try {
			await this._storageProvider.store(`log_${sessionId}`, log);
			this._logService.trace('Saved operation log', sessionId);
		} catch (error) {
			this._logService.error('Failed to save operation log', sessionId, error);
			throw error;
		}
	}

	async loadOperationLog(sessionId: string): Promise<IOperationLogData | null> {
		try {
			const log = await this._storageProvider.retrieve(`log_${sessionId}`);
			this._logService.trace('Loaded operation log', sessionId);
			return log;
		} catch (error) {
			this._logService.error('Failed to load operation log', sessionId, error);
			return null;
		}
	}

	async appendOperations(sessionId: string, operations: IChatEditOperationData[]): Promise<void> {
		await this._operationLogManager.appendOperations(sessionId, operations);
	}

	async saveCheckpoint(sessionId: string, checkpoint: IOperationCheckpointData): Promise<void> {
		try {
			const key = `checkpoint_${sessionId}_${checkpoint.timestamp}`;
			await this._storageProvider.store(key, checkpoint);
			this._logService.trace('Saved checkpoint', sessionId, checkpoint.timestamp);

			// Clean up old checkpoints if needed
			await this.cleanupCheckpoints(sessionId, this._configuration.maxCheckpoints);
		} catch (error) {
			this._logService.error('Failed to save checkpoint', sessionId, error);
			throw error;
		}
	}

	async loadCheckpoints(sessionId: string): Promise<IOperationCheckpointData[]> {
		try {
			const checkpointKeys = await this._storageProvider.list(`checkpoint_${sessionId}`);
			const checkpoints: IOperationCheckpointData[] = [];

			for (const key of checkpointKeys) {
				const checkpoint = await this._storageProvider.retrieve(key);
				if (checkpoint) {
					checkpoints.push(checkpoint);
				}
			}

			// Sort by timestamp
			checkpoints.sort((a, b) => a.timestamp - b.timestamp);
			this._logService.trace('Loaded checkpoints', sessionId, checkpoints.length);
			return checkpoints;
		} catch (error) {
			this._logService.error('Failed to load checkpoints', sessionId, error);
			return [];
		}
	}

	async cleanupCheckpoints(sessionId: string, keepCount: number): Promise<void> {
		try {
			const checkpoints = await this.loadCheckpoints(sessionId);

			if (checkpoints.length > keepCount) {
				// Keep only the most recent checkpoints
				const toDelete = checkpoints.slice(0, checkpoints.length - keepCount);

				for (const checkpoint of toDelete) {
					const key = `checkpoint_${sessionId}_${checkpoint.timestamp}`;
					await this._storageProvider.delete(key);
				}

				this._logService.debug('Cleaned up old checkpoints', sessionId, toDelete.length);
			}
		} catch (error) {
			this._logService.error('Failed to cleanup checkpoints', sessionId, error);
		}
	}

	async getSessionStats(sessionId: string): Promise<ISessionStorageStats> {
		try {
			const sessionData = await this._storageProvider.retrieve(`session_${sessionId}`);
			const operationLog = await this._storageProvider.retrieve(`log_${sessionId}`);
			const checkpoints = await this.loadCheckpoints(sessionId);

			const sessionSize = sessionData ? JSON.stringify(sessionData).length : 0;
			const operationLogSize = operationLog ? JSON.stringify(operationLog).length : 0;
			const checkpointSize = checkpoints.reduce((total, cp) => total + JSON.stringify(cp).length, 0);
			const totalSize = sessionSize + operationLogSize + checkpointSize;

			const logStats = await this._operationLogManager.getLogStats(sessionId);

			return {
				sessionId,
				totalSize,
				operationLogSize,
				checkpointSize,
				snapshotSize: sessionData?.workspaceSnapshot ? JSON.stringify(sessionData.workspaceSnapshot).length : 0,
				operationCount: logStats.operationCount,
				checkpointCount: checkpoints.length,
				lastModified: sessionData?.lastModified || 0,
				compressionRatio: logStats.compressionRatio
			};
		} catch (error) {
			this._logService.error('Failed to get session stats', sessionId, error);
			throw error;
		}
	}

	async compactSession(sessionId: string): Promise<void> {
		try {
			// Prune old checkpoints (compression disabled)
			await this.cleanupCheckpoints(sessionId, this._configuration.maxCheckpoints);

			this._logService.debug('Compacted session (basic storage)', sessionId);
		} catch (error) {
			this._logService.error('Failed to compact session', sessionId, error);
			throw error;
		}
	}

	async exportSession(sessionId: string): Promise<ISessionExportData> {
		try {
			const sessionData = await this.loadSession(sessionId);

			if (!sessionData) {
				throw new Error(`Session not found: ${sessionId}`);
			}

			const exportData: ISessionExportData = {
				format: 'chatEditingSessionV2',
				version: 1,
				exportedAt: Date.now(),
				sessionData,
				checksum: hash(JSON.stringify(sessionData)).toString()
			};

			this._logService.debug('Exported session', sessionId);
			return exportData;
		} catch (error) {
			this._logService.error('Failed to export session', sessionId, error);
			throw error;
		}
	}

	async importSession(data: ISessionExportData): Promise<string> {
		try {
			// Validate format and version
			if (data.format !== 'chatEditingSessionV2' || data.version !== 1) {
				throw new Error(`Unsupported export format: ${data.format} v${data.version}`);
			}

			// Validate checksum
			const calculatedChecksum = hash(JSON.stringify(data.sessionData)).toString();
			if (calculatedChecksum !== data.checksum) {
				throw new Error('Import data checksum validation failed');
			}

			// Generate new session ID if needed
			const sessionId = data.sessionData.sessionId || `imported_${Date.now()}`;
			data.sessionData.sessionId = sessionId;
			data.sessionData.lastModified = Date.now();

			// Save the imported session
			await this.saveSession(sessionId, data.sessionData);

			this._logService.debug('Imported session', sessionId);
			return sessionId;
		} catch (error) {
			this._logService.error('Failed to import session', error);
			throw error;
		}
	}
}
