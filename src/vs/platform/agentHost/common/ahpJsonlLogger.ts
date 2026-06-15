/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { MarshalledId } from '../../../base/common/marshallingIds.js';
import { joinPath } from '../../../base/common/resources.js';
import { isUriComponents, URI, UriComponents } from '../../../base/common/uri.js';
import { IFileService, IFileStatWithMetadata } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';

export type AhpLogDirection = 'c2s' | 's2c';

interface IAhpLogMeta {
	readonly ts: string;
	readonly dir: AhpLogDirection;
	readonly connectionId: string;
	readonly transport: string;
	readonly byteLength?: number;
	/** Set when oversized string values in the entry were elided (see {@link stringifyAhpLogEntryTruncated}). */
	truncated?: boolean;
}

export interface IAhpJsonlLoggerOptions {
	readonly logsHome: URI;
	readonly connectionId: string;
	readonly transport: string;
	readonly maxFileSizeBytes?: number;
	readonly maxFiles?: number;
}

const AHP_LOG_DIR = 'ahp';
const DEFAULT_MAX_FILE_SIZE_BYTES = 75 * 1024 * 1024;
const DEFAULT_MAX_FILES = 5;
// Cap the size of any single coalesced writeFile to avoid producing huge
// concatenated VSBuffers (which would just create the GC pressure we're
// trying to avoid). 1 MiB strikes a balance between amortizing IPC overhead
// and keeping per-write allocations modest.
const MAX_BATCH_BYTES = 1024 * 1024;

// A single AHP protocol message can be enormous (e.g. a `resourceRead` carrying
// a base64-encoded file, or an `action` carrying a full session snapshot). We
// don't want to write hundreds of MB on a single JSONL line — it bloats the log
// directory and, more importantly, building/holding that line creates exactly
// the GC pressure these logs are meant to help diagnose. When a serialized
// entry exceeds this size we re-serialize it with oversized string values
// elided so the line stays well-formed JSONL.
const MAX_LOG_LINE_LENGTH = 1024 * 1024;
// When trimming an oversized entry, individual string values are capped to this
// length. Generous enough to keep messages useful for debugging.
const MAX_LOGGED_STRING_LENGTH = 16 * 1024;


export class AhpJsonlLogger extends Disposable {

	private readonly _directory: URI;
	private readonly _baseName: string;
	private readonly _maxFileSizeBytes: number;
	private readonly _maxFiles: number;
	private _currentFile: URI;
	private _currentSize = 0;
	private _segment = 0;
	private _queue = Promise.resolve();
	private _pending: VSBuffer[] = [];
	private _drainScheduled = false;
	private _folderCreated: Promise<IFileStatWithMetadata> | undefined;

	constructor(
		private readonly _options: IAhpJsonlLoggerOptions,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._directory = joinPath(this._options.logsHome, AHP_LOG_DIR);
		// Truncate connectionId to avoid filesystem filename length limits (e.g. 255 on ext4/APFS)
		const safeConnectionId = sanitizeFilePart(this._options.connectionId).slice(0, 64);
		this._baseName = `ahp-${toFileTimestamp(new Date())}-${safeConnectionId}.jsonl`;
		this._maxFileSizeBytes = this._options.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES;
		this._maxFiles = this._options.maxFiles ?? DEFAULT_MAX_FILES;
		this._currentFile = joinPath(this._directory, this._baseName);
	}

	get resource(): URI {
		return this._currentFile;
	}

	log(message: object, dir: AhpLogDirection, byteLength?: number): void {
		const meta: IAhpLogMeta = {
			ts: new Date().toISOString(),
			dir,
			connectionId: this._options.connectionId,
			transport: this._options.transport,
			...(typeof byteLength === 'number' ? { byteLength } : {}),
		};
		const entry = { ...message, _ahpLog: meta };
		// Fast path: serialize once. The vast majority of messages are small, so
		// we only pay a single stringify and use its length to decide whether the
		// rare oversized-message path below is needed.
		let body = stringifyAhpLogEntry(entry);
		if (body.length > MAX_LOG_LINE_LENGTH) {
			// Slow path (rare): a single message carried very large payloads. Walk
			// the object via a replacer that elides long string values, keeping the
			// line valid JSONL instead of writing/holding the full multi-MB payload.
			meta.truncated = true;
			body = stringifyAhpLogEntryTruncated(entry, MAX_LOGGED_STRING_LENGTH);
		}
		const line = `${body}\n`;
		this._pending.push(VSBuffer.fromString(line));
		this._scheduleDrain();
	}

	async flush(): Promise<void> {
		// Pending entries always have a drain scheduled (see _scheduleDrain), so
		// awaiting the queue is sufficient to flush everything submitted before
		// this call.
		await this._queue;
	}

	private _scheduleDrain(): void {
		if (this._drainScheduled) {
			return;
		}
		this._drainScheduled = true;
		this._queue = this._queue.then(() => this._drainPending()).catch(error => {
			this._logService.error('[AHPLog] Failed to write transport log', error);
		});
	}

	private async _drainPending(): Promise<void> {
		// Clear the scheduled flag before snapshotting _pending so that any log()
		// calls happening during the awaits below will schedule a fresh drain.
		this._drainScheduled = false;
		if (this._pending.length === 0) {
			return;
		}
		const buffers = this._pending;
		this._pending = [];

		// Create folder once and memoize to avoid repeated filesystem calls
		if (!this._folderCreated) {
			this._folderCreated = this._fileService.createFolder(this._directory);
		}
		await this._folderCreated;
		if (this._currentSize === 0) {
			this._currentSize = await this._getFileSize(this._currentFile);
		}

		// Coalesce buffers into chunks, respecting both file-rotation size and the
		// per-write batch cap. Rotation is checked per-entry to preserve the
		// invariant that we don't exceed maxFileSizeBytes once a file has data.
		let chunk: VSBuffer[] = [];
		let chunkSize = 0;
		const flushChunk = async () => {
			if (chunk.length === 0) {
				return;
			}
			const combined = chunk.length === 1 ? chunk[0] : VSBuffer.concat(chunk, chunkSize);
			await this._fileService.writeFile(this._currentFile, combined, { append: true });
			this._currentSize += combined.byteLength;
			chunk = [];
			chunkSize = 0;
		};

		for (const buffer of buffers) {
			const totalInFile = this._currentSize + chunkSize;
			if (totalInFile > 0 && totalInFile + buffer.byteLength > this._maxFileSizeBytes) {
				await flushChunk();
				await this._rotate();
			} else if (chunkSize > 0 && chunkSize + buffer.byteLength > MAX_BATCH_BYTES) {
				// Same file but the batch is getting too large; flush early to
				// avoid creating an oversized concatenated VSBuffer.
				await flushChunk();
			}
			chunk.push(buffer);
			chunkSize += buffer.byteLength;
		}
		await flushChunk();
	}

	private async _rotate(): Promise<void> {
		this._segment++;
		const oldSegment = this._segment - this._maxFiles;
		if (oldSegment >= 0) {
			await this._fileService.del(this._resourceForSegment(oldSegment)).catch(error => {
				this._logService.trace('[AHPLog] Failed to delete old transport log', error);
			});
		}
		this._currentFile = this._resourceForSegment(this._segment);
		this._currentSize = await this._getFileSize(this._currentFile);
	}

	private _resourceForSegment(segment: number): URI {
		if (segment === 0) {
			return joinPath(this._directory, this._baseName);
		}
		const currentBaseName = this._baseName.slice(0, -'.jsonl'.length);
		return joinPath(this._directory, `${currentBaseName}.${segment}.jsonl`);
	}

	private async _getFileSize(resource: URI): Promise<number> {
		try {
			return (await this._fileService.resolve(resource)).size ?? 0;
		} catch {
			return 0;
		}
	}
}

export function getAhpLogByteLength(text: string): number {
	return VSBuffer.fromString(text).byteLength;
}

export function stringifyAhpLogEntry(value: unknown): string {
	return JSON.stringify(value, _ahpReplacer);
}

/**
 * Like {@link stringifyAhpLogEntry} but additionally elides any string value
 * longer than {@param maxStringLength}, replacing the overflow with a short
 * marker. The result is still well-formed JSON, so the log remains valid JSONL.
 * Only used for the rare oversized entry, so the extra per-value work is fine.
 */
function stringifyAhpLogEntryTruncated(value: unknown, maxStringLength: number): string {
	return JSON.stringify(value, function (this: unknown, key: string, val: unknown): unknown {
		const revived = _ahpReplacer.call(this, key, val);
		if (typeof revived === 'string' && revived.length > maxStringLength) {
			return `${revived.slice(0, maxStringLength)}…[${revived.length - maxStringLength} more chars elided]`;
		}
		return revived;
	});
}

/**
 * JSON.stringify replacer that converts URI values to their canonical string
 * form. `URI.prototype.toJSON()` runs before this replacer is invoked and
 * produces a {@link UriComponents}-shaped object stamped with
 * `$mid: MarshalledId.Uri`, which we detect here to round-trip back through
 * {@link URI.revive}. This avoids the expensive deep-clone tree walk that
 * would otherwise be required to find every URI in a message payload.
 */
function _ahpReplacer(this: unknown, _key: string, value: unknown): unknown {
	if (
		value
		&& typeof value === 'object'
		&& (value as { $mid?: number }).$mid === MarshalledId.Uri
		&& isUriComponents(value)
	) {
		return URI.revive(value as UriComponents).toString();
	}
	return value;
}

function toFileTimestamp(date: Date): string {
	return date.toISOString().replace(/[:.]/g, '-');
}

function sanitizeFilePart(value: string): string {
	return value.replace(/[\\/:\*\?"<>\|\s]+/g, '-').replace(/^-+|-+$/g, '') || 'connection';
}
