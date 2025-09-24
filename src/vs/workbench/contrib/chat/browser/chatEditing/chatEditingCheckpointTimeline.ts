/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { IObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { IEditSessionEntryDiff } from '../../common/chatEditingService.js';
import { FileOperation, ICheckpoint, IFileBaseline, IChatEditingTimelineState, IReconstructedFileState } from './chatEditingOperations.js';

/**
 * Interface for the new checkpoint-based timeline system
 */
export interface IChatEditingCheckpointTimeline {
	// Navigation
	readonly currentCheckpoint: IObservable<ICheckpoint | undefined>;
	readonly canUndo: IObservable<boolean>;
	readonly canRedo: IObservable<boolean>;

	// Checkpoint management
	createCheckpoint(requestId: string | undefined, undoStopId: string | undefined, label: string, description?: string): void;
	navigateToCheckpoint(checkpointId: string): Promise<void>;
	undoToLastCheckpoint(): Promise<void>;
	redoToNextCheckpoint(): Promise<void>;
	getCheckpoint(checkpointId: string): ICheckpoint | undefined;
	getAllCheckpoints(): readonly ICheckpoint[];

	// Operation tracking
	recordFileOperation(operation: FileOperation): void;
	getOperationsSince(checkpointId: string): readonly FileOperation[];
	getOperationsBetween(fromCheckpointId: string, toCheckpointId: string): readonly FileOperation[];
	getOperationsForFile(uri: URI): readonly FileOperation[];
	incrementEpoch(): number;

	// File baselines
	recordFileBaseline(baseline: IFileBaseline): void;
	getFileBaseline(uri: URI, requestId: string): IFileBaseline | undefined;
	hasFileBaseline(uri: URI, requestId: string): boolean;

	// State reconstruction
	getFileStateAtCheckpoint(uri: URI, checkpointId: string): Promise<IReconstructedFileState>;
	getContentURIAtStop(requestId: string, fileURI: URI, stopId: string | undefined): URI;
	getContentAtStop(requestId: string, contentURI: URI, stopId: string | undefined): string | VSBuffer | undefined;


	// Persistence
	getStateForPersistence(): IChatEditingTimelineState;
	restoreFromState(state: IChatEditingTimelineState): void;

	// Legacy compatibility methods for gradual migration
	readonly requestDisablement: IObservable<any[]>; // TODO: Remove when session is fully migrated
	getEntryDiffBetweenStops(uri: URI, requestId: string | undefined, stopId: string | undefined): IObservable<IEditSessionEntryDiff | undefined> | undefined;
	getEntryDiffBetweenRequests(uri: URI, startRequestId: string, stopRequestId: string): IObservable<IEditSessionEntryDiff | undefined>;

	// Utility
	clear(): void;
	getCheckpointIdForRequest(requestId: string, undoStopId?: string): string | undefined;
}
