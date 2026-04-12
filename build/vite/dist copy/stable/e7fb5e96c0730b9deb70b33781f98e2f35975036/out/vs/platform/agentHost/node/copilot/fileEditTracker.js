/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { decodeHex, encodeHex, VSBuffer } from '../../../../base/common/buffer.js';
import { URI } from '../../../../base/common/uri.js';
const SESSION_DB_SCHEME = 'session-db';
/**
 * Builds a `session-db:` URI that references a file-edit content blob
 * stored in the session database. Parsed by {@link parseSessionDbUri}.
 */
export function buildSessionDbUri(sessionUri, toolCallId, filePath, part) {
    return URI.from({
        scheme: SESSION_DB_SCHEME,
        authority: encodeHex(VSBuffer.fromString(sessionUri)).toString(),
        path: `/${encodeURIComponent(toolCallId)}/${encodeHex(VSBuffer.fromString(filePath))}/${part}`,
    }).toString();
}
/**
 * Parses a `session-db:` URI produced by {@link buildSessionDbUri}.
 * Returns `undefined` if the URI is not a valid `session-db:` URI.
 */
export function parseSessionDbUri(raw) {
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
    }
    catch {
        return undefined;
    }
}
/**
 * Tracks file edits made by tools in a session by snapshotting file content
 * before and after each edit tool invocation, persisting snapshots into the
 * session database.
 */
export class FileEditTracker {
    constructor(_sessionUri, _db, _fileService, _logService) {
        this._sessionUri = _sessionUri;
        this._db = _db;
        this._fileService = _fileService;
        this._logService = _logService;
        /**
         * Pending edits keyed by file path. The `onPreToolUse` hook stores
         * entries here; `completeEdit` pops them when the tool finishes.
         */
        this._pendingEdits = new Map();
        /**
         * Completed edits keyed by file path. The `onPostToolUse` hook stores
         * entries here; `takeCompletedEdit` retrieves them from the
         * `onToolComplete` handler and persists to the database.
         */
        this._completedEdits = new Map();
    }
    /**
     * Call from the `onPreToolUse` hook before an edit tool runs.
     * Reads the file's current content into memory as the "before" state.
     * The hook blocks the SDK until this returns, ensuring the snapshot
     * captures pre-edit content.
     *
     * @param filePath - Absolute path of the file being edited.
     */
    async trackEditStart(filePath) {
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
    async completeEdit(filePath) {
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
    takeCompletedEdit(turnId, toolCallId, filePath) {
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
            kind: "edit" /* FileEditKind.Edit */,
            beforeContent: beforeBytes,
            afterContent: afterBytes,
            addedLines: undefined,
            removedLines: undefined,
        }).catch(err => this._logService.warn(`[FileEditTracker] Failed to persist file edit to database: ${filePath}`, err));
        return {
            type: "fileEdit" /* ToolResultContentType.FileEdit */,
            before: {
                uri: URI.file(filePath).toString(),
                content: { uri: buildSessionDbUri(this._sessionUri, toolCallId, filePath, 'before') },
            },
            after: {
                uri: URI.file(filePath).toString(),
                content: { uri: buildSessionDbUri(this._sessionUri, toolCallId, filePath, 'after') },
            },
        };
    }
    async _readFile(filePath) {
        try {
            const content = await this._fileService.readFile(URI.file(filePath));
            return content.value;
        }
        catch (err) {
            this._logService.trace(`[FileEditTracker] Could not read file for snapshot: ${filePath}`, err);
            return VSBuffer.fromString('');
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsZUVkaXRUcmFja2VyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYWdlbnRIb3N0L25vZGUvY29waWxvdC9maWxlRWRpdFRyYWNrZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDbkYsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBTXJELE1BQU0saUJBQWlCLEdBQUcsWUFBWSxDQUFDO0FBRXZDOzs7R0FHRztBQUNILE1BQU0sVUFBVSxpQkFBaUIsQ0FBQyxVQUFrQixFQUFFLFVBQWtCLEVBQUUsUUFBZ0IsRUFBRSxJQUF3QjtJQUNuSCxPQUFPLEdBQUcsQ0FBQyxJQUFJLENBQUM7UUFDZixNQUFNLEVBQUUsaUJBQWlCO1FBQ3pCLFNBQVMsRUFBRSxTQUFTLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRTtRQUNoRSxJQUFJLEVBQUUsSUFBSSxrQkFBa0IsQ0FBQyxVQUFVLENBQUMsSUFBSSxTQUFTLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxJQUFJLElBQUksRUFBRTtLQUM5RixDQUFDLENBQUMsUUFBUSxFQUFFLENBQUM7QUFDZixDQUFDO0FBVUQ7OztHQUdHO0FBQ0gsTUFBTSxVQUFVLGlCQUFpQixDQUFDLEdBQVc7SUFDNUMsTUFBTSxNQUFNLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUM5QixJQUFJLE1BQU0sQ0FBQyxNQUFNLEtBQUssaUJBQWlCLEVBQUUsQ0FBQztRQUN6QyxPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBQ0QsTUFBTSxDQUFDLEVBQUUsVUFB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