/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../../base/common/map.js';
import { IObservable, IReader } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { ICellEditOperation } from '../../../notebook/common/notebookCommon.js';
import { IChatEditingSession } from '../../common/chatEditingService.js';
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

export const enum ChatEditOperationState {
	/** Operation has not been actioned by the user yet/ */
	Pending,
	/** Operation has been accepted by the user. */
	Accepted,
	/** Operation has been rejected by the user. */
	Rejected,
}

export interface IGetOperationsFilter {
	inState?: ChatEditOperationState;
	affectsResource?: readonly URI[];
}

/**
 * Manages the history of operations applied to a chat editing session.
 */
export interface IOperationHistoryManager {
	/** Add a new operation to the history */
	addOperation(operation: IChatEditOperation): void;

	/** Add a group of operations as an atomic unit */
	addOperationGroup(operations: readonly IChatEditOperation[], description: string): void;

	/** Get operations that affect a specific resource */
	getOperations(filter: IGetOperationsFilter): IChatEditOperation[];

	/** Go to a specific operation in the history (handles both undo and redo) */
	goToOperation(operationId: string): Promise<IOperationResult>;

	/** Marks the given operations as accepted. */
	accept(operation?: readonly IChatEditOperation[]): Promise<IOperationResult>;

	/** Marks the given operations as rejected, reverting them. */
	reject(operation?: readonly IChatEditOperation[]): Promise<IOperationResult>;

	/** Check if undo is possible */
	readonly canUndo: IObservable<boolean>;

	/** Check if redo is possible */
	readonly canRedo: IObservable<boolean>;

	/** Gets the last checkpoint. */
	readonly lastCheckpoint: IOperationCheckpoint | undefined;

	/** Undo the last operation or group globally */
	undo(): Promise<IOperationResult>;

	/** Redo the next operation or group globally */
	redo(): Promise<IOperationResult>;

	/** Creates a checkpoint that serves as a marker without containing full file contents. */
	createMarkerCheckpoint(requestId: string, checkpointId?: string): IOperationCheckpoint;

	/** Create a checkpoint containing the contents of all `includeURI`s  */
	createCompleteCheckpoint(includeURIs: ResourceSet, requestId: string, checkpointId?: string): Promise<IOperationCheckpoint>;

	/** Find checkpoint by request ID and optional checkpoint ID */
	findCheckpoint(requestId: string, checkpointId?: string): IOperationCheckpoint | undefined;

	/** Gets the file representation at the given checkpoint. */
	readFileAtCheckpoint(checkpoint: IOperationCheckpoint, resource: URI, reader: IReader): IObservable<string | undefined>;

	/** Rollback to a specific checkpoint */
	rollbackToCheckpoint(checkpoint: IOperationCheckpoint): Promise<void>;

	/** Optimize the history by squashing operations */
	optimizeHistory(): Promise<void>;
}

/**
 * A checkpoint in the operation history for efficient rollback.
 */
export interface IOperationCheckpoint {
	/** The request ID this checkpoint belongs to */
	readonly requestId: string;

	/** Optional explicit checkpoint ID */
	readonly checkpointId: string | undefined;

	/** The operation ID where this checkpoint was created */
	readonly operationId: string;

	/** File contents for complete checkpoints. */
	readonly resources?: ResourceMap<string>;

	/** Serialize this checkpoint for storage */
	serialize(): Promise<IOperationCheckpointData>;
}

export interface IOperationCheckpointPointer {
	readonly requestId: string;
	readonly operationId: string;
	readonly ptr: 'NEXT';
}

export namespace IOperationCheckpointPointer {
	export function is(obj: any): obj is IOperationCheckpointPointer {
		return obj && typeof obj === 'object'
			&& typeof obj.requestId === 'string'
			&& typeof obj.operationId === 'string'
			&& obj.ptr === 'NEXT';
	}

	export function after(base: IOperationCheckpoint): IOperationCheckpointPointer {
		return { requestId: base.requestId, operationId: base.operationId, ptr: 'NEXT' };
	}
}


/**
 * Serialized checkpoint data.
 */
export interface IOperationCheckpointData {
	requestId: string;
	checkpointId: string | undefined;
	operationId: string;
	resources: { uri: string; content: string }[] | undefined;
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
export interface IChatEditingSessionV2 extends IDisposable, IChatEditingSession {
	// /** Associated chat session ID */
	// readonly chatSessionId: string;

	// /** Event fired when the session is disposed. */
	// readonly onDidDispose: Event<void>;

	// /** Whether this is a global editing session */
	// readonly isGlobalEditingSession: boolean;

	// /** Undo the last operation or group globally */
	// undoInteraction(): Promise<void>;

	// /** Redo the next operation or group globally */
	// redoInteraction(): Promise<void>;

	// /** Check if global undo is available */
	// readonly canUndo: IObservable<boolean>;

	// /** Check if global redo is available */
	// readonly canRedo: IObservable<boolean>;

	// // Session management

	// /** Accept all pending changes in the all files */
	// accept(...uris: URI[]): Promise<void>;

	// /** Reject all pending changes in the all files */
	// reject(...uris: URI[]): Promise<void>;

	// /** Show the session in the UI */
	// show(previousChanges?: boolean): Promise<void>;

	// startStreamingEdits(resource: URI, responseModel: IChatResponseModel, inUndoStop: string | undefined): IStreamingEdits;

	// /** @deprecated cross-compat for new edit session */
	// stop(clearState?: boolean): Promise<void>;
	// getEntry(uri: URI): IModifiedFileEntry | undefined;
	// readEntry(uri: URI, reader?: IReader): IModifiedFileEntry | undefined;
	// readonly entries: IObservable<readonly IModifiedFileEntry[]>;
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
