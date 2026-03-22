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

/** Scheme used for content URIs served via fetchContent. */
export const AGENT_CONTENT_SCHEME = 'agenthost-content';

/**
 * Tracks file edits made by tools in a session by snapshotting file content
 * before and after each edit tool invocation.
 *
 * Before/after content is stored in the session data directory under
 * `file-edits/{editKey}/before` and `file-edits/{editKey}/after`.
 *
 * Content is addressable via URIs of the form:
 * `agenthost-content:///{sessionId}/file-edits/{editKey}/before`
 */
export class FileEditTracker {

	/**
	 * Pending edits keyed by file path. The `onPreToolUse` hook stores
	 * entries here; `completeEdit` pops them when the tool finishes.
	 */
	private readonly _pendingEdits = new Map<string, { editKey: string; snapshotDone: Promise<void> }>();

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
		this._pendingEdits.set(filePath, { editKey, snapshotDone });
		await snapshotDone;
	}

	/**
	 * Call from the `onPostToolUse` hook after an edit tool finishes.
	 * Snapshots the file's current content as the "after" state and stores
	 * the result for later synchronous retrieval via {@link takeCompletedEdit}.
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

		const sessionDataDir = this._sessionDataService.getSessionDataDirById(this._sessionId);
		const editDir = URI.joinPath(sessionDataDir, 'file-edits', pending.editKey);

		// Snapshot the file after the edit
		const afterUri = URI.joinPath(editDir, 'after');
		let afterContent: string;
		try {
			const fileUri = URI.file(filePath);
			const afterData = await this._fileService.readFile(fileUri);
			afterContent = afterData.value.toString();
			await this._fileService.writeFile(afterUri, afterData.value);
		} catch {
			afterContent = '';
			await this._fileService.writeFile(afterUri, VSBuffer.fromString('')).catch(() => { });
		}

		// Read the before content for diff stats
		let beforeContent: string;
		try {
			const beforeData = await this._fileService.readFile(URI.joinPath(editDir, 'before'));
			beforeContent = beforeData.value.toString();
		} catch {
			beforeContent = '';
		}

		const beforeLines = beforeContent ? beforeContent.split('\n').length : 0;
		const afterLines = afterContent ? afterContent.split('\n').length : 0;

		this._completedEdits.set(filePath, {
			type: ToolResultContentType.FileEdit,
			beforeURI: `${AGENT_CONTENT_SCHEME}:///${this._sessionId}/file-edits/${pending.editKey}/before`,
			afterURI: `${AGENT_CONTENT_SCHEME}:///${this._sessionId}/file-edits/${pending.editKey}/after`,
			diff: {
				added: Math.max(0, afterLines - beforeLines),
				removed: Math.max(0, beforeLines - afterLines),
			},
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

	/**
	 * Resolves an `agenthost-content:` URI to the stored file on disk.
	 * Returns `undefined` if the URI doesn't match the expected format.
	 */
	static resolveContentUri(uri: string, sessionDataService: ISessionDataService): URI | undefined {
		// agenthost-content:///sessionId/file-edits/editKey/before|after
		try {
			const parsed = URI.parse(uri);
			if (parsed.scheme !== AGENT_CONTENT_SCHEME) {
				return undefined;
			}
			const parts = parsed.path.split('/').filter(Boolean);
			if (parts.length !== 4 || parts[1] !== 'file-edits') {
				return undefined;
			}
			const [sessionId, , editKey, snapshot] = parts;
			if (snapshot !== 'before' && snapshot !== 'after') {
				return undefined;
			}
			const sessionDataDir = sessionDataService.getSessionDataDirById(sessionId);
			return URI.joinPath(sessionDataDir, 'file-edits', editKey, snapshot);
		} catch {
			return undefined;
		}
	}
}

let _editKeyCounter = 0;
function generateEditKey(): string {
	return `${Date.now()}-${_editKeyCounter++}`;
}
