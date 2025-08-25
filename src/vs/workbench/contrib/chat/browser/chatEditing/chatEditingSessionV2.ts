/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../../base/common/map.js';
import { IObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { ICellEditOperation } from '../../../notebook/common/notebookCommon.js';
import { IChatResponseModel } from '../../common/chatModel.js';
import { ChatEditOperationType, IChatEditOperation, IChatEditOperationData, IOperationResult } from './chatEditingSessionV2Operations.js';


// ============================================================================
// WORKSPACE STATE TRACKING
// ============================================================================

/**
 * Represents the state of a file in the workspace.
 */
export interface IFileState {
	/** The URI of the file */
	readonly uri: URI;

	/** Whether the file exists */
	readonly exists: boolean;

	/** The content of the file (lazy-loaded) */
	getContent(): Promise<string | null>;

	/** The language ID of the file */
	readonly languageId: string;

	/** When the file was last modified */
	readonly lastModified: number;

	/** Size of the file in bytes */
	readonly size: number;

	/** Whether the file is read-only */
	readonly readOnly: boolean;
}

/**
 * Serialized workspace snapshot data.
 */
export interface IWorkspaceSnapshotData {
	timestamp: number;
	files: Array<{
		uri: string;
		exists: boolean;
		contentHash?: string; // Reference to stored content
		languageId: string;
		lastModified: number;
		size: number;
		readOnly: boolean;
	}>;
}

// ============================================================================
// OPERATION HISTORY MANAGEMENT
// ============================================================================

/**
 * Manages the history of operations applied to a chat editing session.
 */
export interface IOperationHistoryManager {
	/** Add a new operation to the history */
	addOperation(operation: IChatEditOperation): void;

	/** Add a group of operations as an atomic unit */
	addOperationGroup(operations: readonly IChatEditOperation[], description: string): void;

	/** Get all operations in chronological order */
	getAllOperations(): readonly IChatEditOperation[];

	/** Get operations for a specific request */
	getOperationsForRequest(requestId: string): readonly IChatEditOperation[];

	/** Get operations that affect a specific resource */
	getOperationsForResource(uri: URI): readonly IChatEditOperation[];

	/** Go to a specific operation in the history (handles both undo and redo) */
	goToOperation(operationId: string): Promise<IOperationResult[]>;

	/** Check if undo is possible */
	readonly canUndo: IObservable<boolean>;

	/** Check if redo is possible */
	readonly canRedo: IObservable<boolean>;

	/** Create a checkpoint for efficient rollback */
	createCheckpoint(): Promise<IOperationCheckpoint>;

	/** Rollback to a specific checkpoint */
	rollbackToCheckpoint(checkpoint: IOperationCheckpoint): Promise<void>;

	/** Optimize the history by squashing operations */
	optimizeHistory(): Promise<void>;
}

/**
 * A checkpoint in the operation history for efficient rollback.
 */
export interface IOperationCheckpoint {
	/** The operation ID where this checkpoint was created */
	readonly operationId: string;

	/** When this checkpoint was created */
	readonly timestamp: number;

	/** Serialize this checkpoint for storage */
	serialize(): Promise<IOperationCheckpointData>;
}

/**
 * Serialized checkpoint data.
 */
export interface IOperationCheckpointData {
	operationId: string;
	timestamp: number;
}

// ============================================================================
// V2 CHAT EDITING SESSION INTERFACE
// ============================================================================

export interface IFileWithPendingOperation {
	linesAdded: number;
	linesRemoved: number;
	reviewMode: boolean;
}

/**
 * V2 interface for chat editing sessions using the operation-based model.
 */
export interface IChatEditingSessionV2 extends IDisposable {
	/** Associated chat session ID */
	readonly chatSessionId: string;

	/** Event fired when the session is disposed. */
	readonly onDidDispose: Event<void>;

	/** Whether this is a global editing session */
	readonly isGlobalEditingSession: boolean;

	/** Files with pending operations. Files are automatically added when operations
	 * are created and removed when all operations are accepted or rejected. */
	readonly filesWithPendingOperations: IObservable<ResourceMap<IFileWithPendingOperation>>;

	/** Gets all files edited in this session, not just ones with pending operations. */
	readonly filesEditedInSession: IObservable<ResourceSet>;

	/** @deprecated cross-compat for new edit session */
	modifiedFilesFromRequests(requestIds: Set<string>): URI[];
	setReviewMode(uri: URI): void;

	/** Undo the last operation or group globally */
	undo(): Promise<void>;

	/** Redo the next operation or group globally */
	redo(): Promise<void>;

	/** Check if global undo is available */
	readonly canUndo: IObservable<boolean>;

	/** Check if global redo is available */
	readonly canRedo: IObservable<boolean>;

	// Session management

	/** Accept all pending changes across all files */
	acceptAll(): Promise<void>;

	/** Reject all pending changes across all files */
	rejectAll(): Promise<void>;

	/** Show the session in the UI */
	show(previousChanges?: boolean): Promise<void>;

	/** Save the session state */
	save(): Promise<void>;

	/** Restore the session from saved state */
	restore(): Promise<void>;
}

// ============================================================================
// STREAMING OPERATIONS INTERFACE
// ============================================================================

/**
 * Interface for streaming operations as they are generated by chat responses.
 */
export interface IStreamingOperationsV2 {
	/** Add a text edit operation */
	addTextEdit(uri: URI, edits: readonly TextEdit[], isLastEdit: boolean, responseModel: IChatResponseModel): void;

	/** Add a notebook edit operation */
	addNotebookEdit(uri: URI, edits: readonly ICellEditOperation[], isLastEdit: boolean, responseModel: IChatResponseModel): void;

	/** Add a file creation operation */
	addFileCreate(uri: URI, content: string, overwrite: boolean, responseModel: IChatResponseModel): void;

	/** Add a file deletion operation */
	addFileDelete(uri: URI, moveToTrash: boolean, responseModel: IChatResponseModel): void;

	/** Add a file rename operation */
	addFileRename(oldUri: URI, newUri: URI, overwrite: boolean, responseModel: IChatResponseModel): void;

	/** Mark the current operation group as complete */
	complete(): void;

	/** Cancel the current operation group */
	cancel(): void;
}

// ============================================================================
// STORAGE SYSTEM
// ============================================================================

/**
 * Service for persisting chat editing session state and operation logs.
 */
export interface IChatEditingStorageService {
	/** Save a complete session state */
	saveSession(sessionId: string, sessionData: IChatEditingSessionData): Promise<void>;

	/** Load a complete session state */
	loadSession(sessionId: string): Promise<IChatEditingSessionData | null>;

	/** Delete a session and all its data */
	deleteSession(sessionId: string): Promise<void>;

	/** Save operation log data */
	saveOperationLog(sessionId: string, log: IOperationLogData): Promise<void>;

	/** Load operation log data */
	loadOperationLog(sessionId: string): Promise<IOperationLogData | null>;

	/** Append operations to an existing log */
	appendOperations(sessionId: string, operations: IChatEditOperationData[]): Promise<void>;

	/** Save a checkpoint */
	saveCheckpoint(sessionId: string, checkpoint: IOperationCheckpointData): Promise<void>;

	/** Load checkpoints for a session */
	loadCheckpoints(sessionId: string): Promise<IOperationCheckpointData[]>;

	/** Clean up old checkpoints (keep only recent ones) */
	cleanupCheckpoints(sessionId: string, keepCount: number): Promise<void>;

	/** Get storage statistics for a session */
	getSessionStats(sessionId: string): Promise<ISessionStorageStats>;

	/** Compact storage by removing redundant data */
	compactSession(sessionId: string): Promise<void>;

	/** Export session data for backup/migration */
	exportSession(sessionId: string): Promise<ISessionExportData>;

	/** Import session data from backup/migration */
	importSession(data: ISessionExportData): Promise<string>;
}

/**
 * Complete session data for persistence.
 */
export interface IChatEditingSessionData {
	sessionId: string;
	version: number;
	createdAt: number;
	lastModified: number;
	metadata: IChatEditingSessionMetadata;
	operationLog: IOperationLogData;
	checkpoints: IOperationCheckpointData[];
	workspaceSnapshot?: IWorkspaceSnapshotData;
}

/**
 * Session metadata for indexing and management.
 */
export interface IChatEditingSessionMetadata {
	isGlobalEditingSession: boolean;
	requestIds: string[];
	affectedFiles: string[]; // URI strings
	operationCount: number;
	lastOperationType: ChatEditOperationType;
	tags: string[];
	description?: string;
	chatSessionId?: string;
}

/**
 * Operation log data structure.
 */
export interface IOperationLogData {
	version: number;
	operations: IChatEditOperationData[];
	currentPosition: number;
	totalOperations: number;
	compressed: boolean;
	compressionAlgorithm?: string;
}

/**
 * Storage statistics for a session.
 */
export interface ISessionStorageStats {
	sessionId: string;
	totalSize: number;
	operationLogSize: number;
	checkpointSize: number;
	snapshotSize: number;
	operationCount: number;
	checkpointCount: number;
	lastModified: number;
	compressionRatio?: number;
}

/**
 * Export data format for session backup/migration.
 */
export interface ISessionExportData {
	format: 'chatEditingSessionV2';
	version: number;
	exportedAt: number;
	sessionData: IChatEditingSessionData;
	checksum: string;
}

/**
 * Configuration for storage behavior.
 */
export interface IStorageConfiguration {
	/** Maximum number of operations before triggering compression */
	compressionThreshold: number;

	/** Maximum number of checkpoints to keep */
	maxCheckpoints: number;

	/** Interval for automatic checkpoint creation (in operations) */
	checkpointInterval: number;

	/** Enable compression for operation logs */
	enableCompression: boolean;

	/** Maximum storage size per session (in bytes) */
	maxSessionSize: number;

	/** Enable automatic cleanup of old data */
	enableAutoCleanup: boolean;

	/** Retention period for old sessions (in days) */
	retentionDays: number;
}

/**
 * Storage provider interface for different storage backends.
 */
export interface IStorageProvider {
	/** Initialize the storage provider */
	initialize(): Promise<void>;

	/** Store data with a key */
	store(key: string, data: any): Promise<void>;

	/** Retrieve data by key */
	retrieve(key: string): Promise<any | null>;

	/** Delete data by key */
	delete(key: string): Promise<void>;

	/** List all keys matching a pattern */
	list(pattern?: string): Promise<string[]>;

	/** Get storage statistics */
	getStats(): Promise<IStorageProviderStats>;

	/** Clean up expired or unused data */
	cleanup(): Promise<void>;

	/** Check if the provider supports compression */
	supportsCompression(): boolean;

	/** Dispose of the provider */
	dispose(): Promise<void>;
}

/**
 * Statistics for a storage provider.
 */
export interface IStorageProviderStats {
	totalKeys: number;
	totalSize: number;
	providerType: string;
	lastCleanup?: number;
}

// ============================================================================
// FILE-LEVEL OPERATION MANAGEMENT
// ============================================================================

/**
 * State of operations for a specific file.
 */
export const enum FileOperationState {
	/** File has operations that haven't been accepted or rejected */
	Pending = 'pending',
	/** All operations on this file have been accepted */
	Accepted = 'accepted',
	/** All operations on this file have been rejected */
	Rejected = 'rejected',
	/** File has a mix of accepted and rejected operations */
	Mixed = 'mixed'
}

/**
 * Information about operation conflicts for a file.
 */
export interface IOperationConflict {
	/** The conflicting operation */
	readonly operation: IChatEditOperation;
	/** Description of the conflict */
	readonly reason: string;
	/** Operations that this operation conflicts with */
	readonly conflictsWith: readonly IChatEditOperation[];
}

/**
 * Operation log manager for efficient storage and retrieval.
 */
export interface IOperationLogManager {
	/** Create a new operation log */
	createLog(sessionId: string): Promise<void>;

	/** Append operations to a log */
	appendOperations(sessionId: string, operations: IChatEditOperationData[]): Promise<void>;

	/** Get operations in a range */
	getOperations(sessionId: string, startIndex?: number, count?: number): Promise<IChatEditOperationData[]>;

	/** Get operations for a specific request */
	getOperationsForRequest(sessionId: string, requestId: string): Promise<IChatEditOperationData[]>;

	/** Get operations affecting a specific resource */
	getOperationsForResource(sessionId: string, resourceUri: string): Promise<IChatEditOperationData[]>;

	/** Compress the operation log */
	compressLog(sessionId: string): Promise<void>;

	/** Get log statistics */
	getLogStats(sessionId: string): Promise<IOperationLogStats>;

	/** Prune old operations (keep only recent ones) */
	pruneLog(sessionId: string, keepCount: number): Promise<void>;

	/** Optimize log storage */
	optimizeLog(sessionId: string): Promise<void>;
}

/**
 * Statistics for an operation log.
 */
export interface IOperationLogStats {
	sessionId: string;
	operationCount: number;
	logSize: number;
	compressed: boolean;
	compressionRatio?: number;
	oldestOperation?: number;
	newestOperation?: number;
}

// ============================================================================
// MIGRATION AND COMPATIBILITY
// ============================================================================

/**
 * Service for migrating from V1 to V2 chat editing sessions.
 */
export interface IChatEditingMigrationService {
	/** Check if a session needs migration */
	needsMigration(sessionId: string): Promise<boolean>;

	/** Migrate a V1 session to V2 format */
	migrateSession(sessionId: string): Promise<IChatEditingSessionV2>;

	/** Get migration status for a session */
	getMigrationStatus(sessionId: string): Promise<ChatEditingMigrationStatus>;

	/** Migrate multiple sessions in batch */
	batchMigrateSessions(sessionIds: string[]): Promise<ChatEditingMigrationResult[]>;

	/** Get list of sessions that need migration */
	getSessionsNeedingMigration(): Promise<string[]>;

	/** Clean up old V1 data after successful migration */
	cleanupV1Data(sessionId: string): Promise<void>;
}

/**
 * Status of a session migration.
 */
export const enum ChatEditingMigrationStatus {
	NotNeeded = 'notNeeded',
	Pending = 'pending',
	InProgress = 'inProgress',
	Completed = 'completed',
	Failed = 'failed'
}

/**
 * Result of a migration operation.
 */
export interface ChatEditingMigrationResult {
	sessionId: string;
	status: ChatEditingMigrationStatus;
	error?: string;
	migratedAt?: number;
	v2SessionId?: string;
}
