/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../files/common/files.js';
import { ILogService } from '../../../log/common/log.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { ToolResultContentType, type IToolResultFileEditContent } from '../../common/state/sessionState.js';

/**
 * Tracks file edits made by tools in a session by snapshotting file content
 * before and after each edit tool invocation.
 */
export class FileEditTracker {

	/**
	 * Pending edits keyed by file path. The `onPreToolUse` hook stores
	 * entries here; `completeEdit` pops them when the tool finishes.
	 */
	private readonly _pendingEdits = new Map<string, { editKey: string; beforeUri: URI; snapshotDone: Promise<void> }>();

	/**
	 * Completed edits keyed by file path. The `onPostToolUse` hook stores
	 * entries here; `takeCompletedEdit` retrieves them synchronously from
	 * the `onToolComplete` handler.
	 */
	private readonly _completedEdits = new Map<string, IToolResultFileEditContent>();

	constructor(
		private readonly _sessionId: string,
		private readonly _sessionDataService: ISessionDataService,
		private readonly _fileService: IFileService,
		private readonly _logService: ILogService,
	) { }

	/**
	 * Call from the `onPreToolUse` hook before an edit tool runs.
	 * Snapshots the file's current content as the "before" state.
	 * The hook blocks the SDK until this returns, ensuring the snapshot
	 * captures pre-edit content.
	 *
	 * @param filePath - Absolute path of the file being edited.
	 */
	async trackEditStart(filePath: string): Promise<void> {
		const editKey = generateEditKey();
		const sessionDataDir = this._sessionDataService.getSessionDataDirById(this._sessionId);
		const beforeUri = URI.joinPath(sessionDataDir, 'file-edits', editKey, 'before');

		const snapshotDone = this._snapshotFile(filePath, beforeUri);
		this._pendingEdits.set(filePath, { editKey, beforeUri, snapshotDone });
		await snapshotDone;
	}

	/**
	 * Call from the `onPostToolUse` hook after an edit tool finishes.
	 * Stores the result for later synchronous retrieval via {@link takeCompletedEdit}.
	 * The `beforeURI` points to the stored snapshot; the `afterURI` is
	 * the real file path (the tool already modified it on disk).
	 *
	 * @param filePath - Absolute path of the file that was edited.
	 */
	async completeEdit(filePath: string): Promise<void> {
		const pending = this._pendingEdits.get(filePath);
		if (!pending) {
			return;
		}
		this._pendingEdits.delete(filePath);
		await pending.snapshotDone;

		// Snapshot the after-content into session data so it remains
		// stable even if the file is modified again later.
		const sessionDataDir = this._sessionDataService.getSessionDataDirById(this._sessionId);
		const afterUri = URI.joinPath(sessionDataDir, 'file-edits', pending.editKey, 'after');
		await this._snapshotFile(filePath, afterUri);

		this._completedEdits.set(filePath, {
			type: ToolResultContentType.FileEdit,
			beforeURI: pending.beforeUri.toString(),
			afterURI: afterUri.toString(),
		});
	}

	/**
	 * Synchronously retrieves and removes a completed edit for the given
	 * file path. Call from the `onToolComplete` handler to include the
	 * edit in the tool result without async work.
	 */
	takeCompletedEdit(filePath: string): IToolResultFileEditContent | undefined {
		const edit = this._completedEdits.get(filePath);
		if (edit) {
			this._completedEdits.delete(filePath);
		}
		return edit;
	}

	private async _snapshotFile(filePath: string, targetUri: URI): Promise<void> {
		try {
			const content = await this._fileService.readFile(URI.file(filePath));
			await this._fileService.writeFile(targetUri, content.value);
		} catch (err) {
			this._logService.trace(`[FileEditTracker] Could not read file for snapshot: ${filePath}`, err);
			await this._fileService.writeFile(targetUri, VSBuffer.fromString('')).catch(() => { });
		}
	}
}

let _editKeyCounter = 0;
function generateEditKey(): string {
	return `${Date.now()}-${_editKeyCounter++}`;
}
