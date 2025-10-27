/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, ITransaction } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { IEditSessionEntryDiff } from '../../common/chatEditingService.js';
import { IChatRequestDisablement } from '../../common/chatModel.js';
import { FileOperation, IChatEditingTimelineState, IFileBaseline } from './chatEditingOperations.js';

/**
 * Interface for the new checkpoint-based timeline system
 */
export interface IChatEditingCheckpointTimeline {
	readonly requestDisablement: IObservable<IChatRequestDisablement[]>;
	readonly canUndo: IObservable<boolean>;
	readonly canRedo: IObservable<boolean>;

	// Checkpoint management
	createCheckpoint(requestId: string | undefined, undoStopId: string | undefined, label: string, description?: string): void;
	navigateToCheckpoint(checkpointId: string): Promise<void>;
	undoToLastCheckpoint(): Promise<void>;
	redoToNextCheckpoint(): Promise<void>;
	getCheckpointIdForRequest(requestId: string, undoStopId?: string): string | undefined;

	// Operation tracking
	recordFileOperation(operation: FileOperation): void;
	incrementEpoch(): number;

	// File baselines
	recordFileBaseline(baseline: IFileBaseline): void;
	hasFileBaseline(uri: URI, requestId: string): boolean;

	// State reconstruction
	getContentURIAtStop(requestId: string, fileURI: URI, stopId: string | undefined): URI;
	getContentAtStop(requestId: string, contentURI: URI, stopId: string | undefined): Promise<string | VSBuffer | undefined>;
	onDidChangeContentsAtStop(requestId: string, contentURI: URI, stopId: string | undefined, callback: (data: string) => void): IDisposable;

	// Persistence
	getStateForPersistence(): IChatEditingTimelineState;
	restoreFromState(state: IChatEditingTimelineState, tx: ITransaction): void;

	// Diffing
	getEntryDiffBetweenStops(uri: URI, requestId: string | undefined, stopId: string | undefined): IObservable<IEditSessionEntryDiff | undefined> | undefined;
	getEntryDiffBetweenRequests(uri: URI, startRequestId: string, stopRequestId: string): IObservable<IEditSessionEntryDiff | undefined>;
}
