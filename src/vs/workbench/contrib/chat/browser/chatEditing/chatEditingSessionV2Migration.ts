/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../../../../platform/log/common/log.js';
import {
	IChatEditingStorageService,
	IChatEditingSessionData,
	IChatEditingMigrationService,
	ChatEditingMigrationStatus,
	ChatEditingMigrationResult,
	IStorageProvider,
} from './chatEditingSessionV2.js';
import { ChatEditOperationType } from './chatEditingSessionV2Operations.js';

// ============================================================================
// MIGRATION SERVICE IMPLEMENTATION
// ============================================================================

/**
 * Service for migrating V1 chat editing sessions to V2 format.
 */
export class ChatEditingMigrationService implements IChatEditingMigrationService {
	private readonly _migrationStatus = new Map<string, ChatEditingMigrationStatus>();

	constructor(
		private readonly _storageService: IChatEditingStorageService,
		private readonly _legacyStorageProvider: IStorageProvider,
		private readonly _logService: ILogService
	) { }

	async needsMigration(sessionId: string): Promise<boolean> {
		try {
			// Check if V2 session already exists
			const v2Session = await this._storageService.loadSession(sessionId);
			if (v2Session) {
				return false;
			}

			// Check if V1 session exists
			const v1Session = await this._legacyStorageProvider.retrieve(`legacy_session_${sessionId}`);
			return !!v1Session;
		} catch (error) {
			this._logService.error('Failed to check migration status', sessionId, error);
			return false;
		}
	}

	async migrateSession(sessionId: string): Promise<any> {
		try {
			this._migrationStatus.set(sessionId, ChatEditingMigrationStatus.InProgress);

			// Load V1 session data
			const v1Session = await this._legacyStorageProvider.retrieve(`legacy_session_${sessionId}`);
			if (!v1Session) {
				throw new Error(`V1 session not found: ${sessionId}`);
			}

			// Convert V1 data to V2 format
			const v2Session = await this._convertV1ToV2(v1Session);

			// Save V2 session
			await this._storageService.saveSession(sessionId, v2Session);

			this._migrationStatus.set(sessionId, ChatEditingMigrationStatus.Completed);
			this._logService.debug('Successfully migrated session', sessionId);

			// Return a mock V2 session object (would be actual implementation in real code)
			return {
				sessionId,
				isGlobalEditingSession: v2Session.metadata.isGlobalEditingSession,
				// ... other properties would be implemented
			};
		} catch (error) {
			this._migrationStatus.set(sessionId, ChatEditingMigrationStatus.Failed);
			this._logService.error('Failed to migrate session', sessionId, error);
			throw error;
		}
	}

	async getMigrationStatus(sessionId: string): Promise<ChatEditingMigrationStatus> {
		const status = this._migrationStatus.get(sessionId);
		if (status) {
			return status;
		}

		// Check if migration is needed
		const needsMigration = await this.needsMigration(sessionId);
		return needsMigration ? ChatEditingMigrationStatus.Pending : ChatEditingMigrationStatus.NotNeeded;
	}

	async batchMigrateSessions(sessionIds: string[]): Promise<ChatEditingMigrationResult[]> {
		const results: ChatEditingMigrationResult[] = [];

		for (const sessionId of sessionIds) {
			try {
				const v2Session = await this.migrateSession(sessionId);
				results.push({
					sessionId,
					status: ChatEditingMigrationStatus.Completed,
					migratedAt: Date.now(),
					v2SessionId: v2Session.sessionId
				});
			} catch (error) {
				results.push({
					sessionId,
					status: ChatEditingMigrationStatus.Failed,
					error: error instanceof Error ? error.message : String(error)
				});
			}
		}

		return results;
	}

	async getSessionsNeedingMigration(): Promise<string[]> {
		try {
			const legacyKeys = await this._legacyStorageProvider.list('legacy_session_');
			const sessionIds: string[] = [];

			for (const key of legacyKeys) {
				const sessionId = key.replace('legacy_session_', '');
				const needsMigration = await this.needsMigration(sessionId);
				if (needsMigration) {
					sessionIds.push(sessionId);
				}
			}

			return sessionIds;
		} catch (error) {
			this._logService.error('Failed to get sessions needing migration', error);
			return [];
		}
	}

	async cleanupV1Data(sessionId: string): Promise<void> {
		try {
			await this._legacyStorageProvider.delete(`legacy_session_${sessionId}`);
			this._logService.debug('Cleaned up V1 data', sessionId);
		} catch (error) {
			this._logService.error('Failed to cleanup V1 data', sessionId, error);
		}
	}

	private async _convertV1ToV2(v1Session: any): Promise<IChatEditingSessionData> {
		// This is a simplified conversion - real implementation would be more complex
		const now = Date.now();

		const v2Session: IChatEditingSessionData = {
			sessionId: v1Session.id || `migrated_${now}`,
			version: 1,
			createdAt: v1Session.createdAt || now,
			lastModified: now,
			metadata: {
				isGlobalEditingSession: v1Session.isGlobal || false,
				requestIds: v1Session.requests || [],
				affectedFiles: v1Session.files || [],
				operationCount: 0,
				lastOperationType: ChatEditOperationType.TextEdit,
				tags: ['migrated'],
				description: 'Migrated from V1 session'
			},
			operationLog: {
				version: 1,
				operations: [],
				currentPosition: 0,
				totalOperations: 0,
				compressed: false
			},
			checkpoints: []
		};

		// Convert V1 edits to V2 operations
		if (v1Session.edits) {
			// This would need to analyze V1 edits and convert them to operations
			// For now, just set the operation count
			v2Session.metadata.operationCount = v1Session.edits.length;
		}

		return v2Session;
	}
}
