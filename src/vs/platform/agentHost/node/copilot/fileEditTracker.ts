/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeHex, encodeHex, VSBuffer } from '../../../../base/common/buffer.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../files/common/files.js';
import { ILogService } from '../../../log/common/log.js';
import { ISessionDatabase } from '../../common/sessionDataService.js';
import { ToolResultContentType, type IToolResultFileEditContent } from '../../common/state/sessionState.js';

const SESSION_DB_SCHEME = 'session-db';

/**
 * Builds a `session-db:` URI that references a file-edit content blob
 * stored in the session database. Parsed by {@link parseSessionDbUri}.
 */
export function buildSessionDbUri(sessionUri: string, toolCallId: string, filePath: string, part: 'before' | 'after'): string {
	return URI.from({
		scheme: SESSION_DB_SCHEME,
		authority: encodeHex(VSBuffer.fromString(sessionUri)).toString(),
		path: `/${encodeURIComponent(toolCallId)}/${encodeHex(VSBuffer.fromString(filePath))}/${part}`,
	}).toString();
}

/** Parsed fields from a `session-db:` content URI. */
export interface ISessionDbUriFields {
	sessionUri: string;
	toolCallId: string;
	filePath: string;
	part: 'before' | 'after';
}

/**
 * Parses a `session-db:` URI produced by {@link buildSessionDbUri}.
 * Returns `undefined` if the URI is not a valid `session-db:` URI.
 */
export function parseSessionDbUri(raw: string): ISessionDbUriFields | undefined {
	const parsed = URI.parse(raw);
	if (parsed.scheme !== SESSION_DB_SCHEME) {
		return undefined;
	}
	const [, toolCallId, filePath, part] = parsed.path.split('/');
	if (!toolCallId || !filePath || (part !== 'before' && part !== 'after')) {
		return undefined;
	}
	try {
		return {
			sessionUri: decodeHex(parsed.authority).toString(),
			toolCallId: decodeURIComponent(toolCallId),
			filePath: decodeHex(filePath).toString(),
			part
		};
	} catch {
		return undefined;
	}
}

/**
 * Tracks file edits made by tools in a session by snapshotting file content
 * before and after each edit tool invocation, persisting snapshots into the
 * session database.
 */
export class FileEditTracker {

	/**
	 * Pending edits keyed by file path. The `onPreToolUse` hook stores
	 * entries here; `completeEdit` pops them when the tool finishes.
	 */
	private readonly _pendingEdits = new Map<string, { beforeContent: VSBuffer; snapshotDone: Promise<void> }>();

	/**
	 * Completed edits keyed by file path. The `onPostToolUse` hook stores
	 * entries here; `takeCompletedEdit` retrieves them from the
	 * `onToolComplete` handler and persists to the database.
	 */
	private readonly _completedEdits = new Map<string, { beforeContent: VSBuffer; afterContent: VSBuffer }>();

	constructor(
		private readonly _sessionUri: string,
		private readonly _db: ISessionDatabase,
		private readonly _fileService: IFileService,
		private readonly _logService: ILogService,
	) { }

	/**
	 * Call from the `onPreToolUse` hook before an edit tool runs.
	 * Reads the file's current content into memory as the "before" state.
	 * The hook blocks the SDK until this returns, ensuring the snapshot
	 * captures pre-edit content.
	 *
	 * @param filePath - Absolute path of the file being edited.
	 */
	async trackEditStart(filePath: string): Promise<void> {
		const snapshotDone = this._readFile(filePath);
		const entry = { beforeContent: VSBuffer.fromString(''), snapshotDone: snapshotDone.then(buf => { entry.beforeContent = buf; }) };
		this._pendingEdits.set(filePath, entry);
		await entry.snapshotDone;
	}

	/**
	 * Call from the `onPostToolUse` hook after an edit tool finishes.
	 * Reads the file content again as the "after" state and stores the
	 * result for later retrieval via {@link takeCompletedEdit}.
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

		const afterContent = await this._readFile(filePath);

		this._completedEdits.set(filePath, {
			beforeContent: pending.beforeContent,
			afterContent,
		});
	}

	/**
	 * Retrieves and removes a completed edit for the given file path,
	 * persists it to the session database, and returns the result as an
	 * {@link IToolResultFileEditContent} for inclusion in the tool result.
	 *
	 * @param toolCallId - The tool call that produced this edit.
	 * @param filePath - Absolute path of the edited file.
	 */
	takeCompletedEdit(turnId: string, toolCallId: string, filePath: string): IToolResultFileEditContent | undefined {
		const edit = this._completedEdits.get(filePath);
		if (!edit) {
			return undefined;
		}
		this._completedEdits.delete(filePath);

		const beforeBytes = edit.beforeContent.buffer;
		const afterBytes = edit.afterContent.buffer;

		this._db.storeFileEdit({
			turnId,
			toolCallId,
			filePath,
			beforeContent: beforeBytes,
			afterContent: afterBytes,
			addedLines: undefined,
			removedLines: undefined,
		}).catch(err => this._logService.warn(`[FileEditTracker] Failed to persist file edit to database: ${filePath}`, err));

		return {
			type: ToolResultContentType.FileEdit,
			beforeURI: buildSessionDbUri(this._sessionUri, toolCallId, filePath, 'before'),
			afterURI: buildSessionDbUri(this._sessionUri, toolCallId, filePath, 'after'),
		};
	}

	private async _readFile(filePath: string): Promise<VSBuffer> {
		try {
			const content = await this._fileService.readFile(URI.file(filePath));
			return content.value;
		} catch (err) {
			this._logService.trace(`[FileEditTracker] Could not read file for snapshot: ${filePath}`, err);
			return VSBuffer.fromString('');
		}
	}
}
