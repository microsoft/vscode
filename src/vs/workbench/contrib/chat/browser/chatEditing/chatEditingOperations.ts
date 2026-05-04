/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StringSHA1 } from '../../../../../base/common/hash.js';
import { URI } from '../../../../../base/common/uri.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { ICellEditOperation } from '../../../notebook/common/notebookCommon.js';
import { IModifiedEntryTelemetryInfo } from '../../common/editing/chatEditingService.js';
import { LocalChatSessionUri } from '../../common/model/chatUri.js';

export enum FileOperationType {
	Create = 'create',
	Delete = 'delete',
	Rename = 'rename',
	TextEdit = 'textEdit',
	NotebookEdit = 'notebookEdit'
}

/**
 * Base interface for all file operations in the checkpoint timeline
 */
export interface IFileOperation {
	readonly type: FileOperationType;
	readonly uri: URI;
	readonly requestId: string;
	readonly epoch: number;
}

/**
 * Operation representing the creation of a new file
 */
export interface IFileCreateOperation extends IFileOperation {
	readonly type: FileOperationType.Create;
	readonly initialContent: string;
	readonly notebookViewType?: string;
	readonly telemetryInfo: IModifiedEntryTelemetryInfo;
}

/**
 * Operation representing the deletion of a file
 */
export interface IFileDeleteOperation extends IFileOperation {
	readonly type: FileOperationType.Delete;
	readonly finalContent: string; // content before deletion for potential restoration
}

/**
 * Operation representing the renaming/moving of a file
 */
export interface IFileRenameOperation extends IFileOperation {
	readonly type: FileOperationType.Rename;
	readonly oldUri: URI;
	readonly newUri: URI;
}

/**
 * Operation representing text edits applied to a file
 */
export interface ITextEditOperation extends IFileOperation {
	readonly type: FileOperationType.TextEdit;
	readonly edits: readonly TextEdit[];
	/**
	 * For cell URIs, the cell index that was edited. Needed because the original
	 * edit URI only contains the `handle` which is not portable between notebooks.
	 */
	readonly cellIndex?: number;
}

/**
 * Operation representing notebook cell edits applied to a notebook
 */
export interface INotebookEditOperation extends IFileOperation {
	readonly type: FileOperationType.NotebookEdit;
	readonly cellEdits: readonly ICellEditOperation[];
}

/**
 * Union type of all possible file operations
 */
export type FileOperation = IFileCreateOperation | IFileDeleteOperation | IFileRenameOperation | ITextEditOperation | INotebookEditOperation;

/**
 * File baseline represents the initial state of a file when first edited in a request
 */
export interface IFileBaseline {
	readonly uri: URI;
	readonly requestId: string;
	readonly content: string;
	readonly epoch: number;
	readonly telemetryInfo: IModifiedEntryTelemetryInfo;
	readonly notebookViewType?: string;
}

export interface IReconstructedFileExistsState {
	readonly exists: true;
	readonly content: string;
	readonly uri: URI;
	readonly telemetryInfo: IModifiedEntryTelemetryInfo;
	readonly notebookViewType?: string;
}

export interface IReconstructedFileNotExistsState {
	readonly exists: false;
	readonly uri: URI;
}

/**
 * The reconstructed state of a file at a specific checkpoint
 */
export type IReconstructedFileState = IReconstructedFileNotExistsState | IReconstructedFileExistsState;

/**
 * Checkpoint represents a stable state that can be navigated to
 */
export interface ICheckpoint {
	readonly checkpointId: string;
	readonly requestId: string | undefined; // undefined for initial state
	readonly undoStopId: string | undefined;
	readonly epoch: number;
	readonly label: string; // for UI display
	readonly description?: string; // optional detailed description
}

/**
 * State that can be persisted and restored for the checkpoint timeline
 */
export interface IChatEditingTimelineState {
	readonly checkpoints: readonly ICheckpoint[];
	readonly fileBaselines: [string, IFileBaseline][]; // key: `${uri}::${requestId}`
	readonly operations: readonly FileOperation[];
	readonly currentEpoch: number;
	readonly epochCounter: number;
}

export function getKeyForChatSessionResource(chatSessionResource: URI) {
	const sessionId = LocalChatSessionUri.parseLocalSessionId(chatSessionResource);
	if (sessionId) {
		return sessionId;
	}

	const sha = new StringSHA1();
	sha.update(chatSessionResource.toString());
	return sha.digest();
}
