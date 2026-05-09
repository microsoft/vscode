/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { IFileService, IFileStatWithMetadata } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';

export type AhpLogDirection = 'c2s' | 's2c';

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

export class AhpJsonlLogger extends Disposable {

	private readonly _directory: URI;
	private readonly _baseName: string;
	private readonly _maxFileSizeBytes: number;
	private readonly _maxFiles: number;
	private _currentFile: URI;
	private _currentSize = 0;
	private _segment = 0;
	private _queue = Promise.resolve();
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
		const entry = {
			...message,
			_ahpLog: {
				ts: new Date().toISOString(),
				dir,
				connectionId: this._options.connectionId,
				transport: this._options.transport,
				...(typeof byteLength === 'number' ? { byteLength } : {}),
			}
		};
		const line = `${JSON.stringify(entry)}\n`;
		const buffer = VSBuffer.fromString(line);
		this._queue = this._queue.then(() => this._appendLine(buffer)).catch(error => {
			this._logService.error('[AHPLog] Failed to write transport log', error);
		});
	}

	async flush(): Promise<void> {
		await this._queue;
	}

	private async _appendLine(buffer: VSBuffer): Promise<void> {
		// Create folder once and memoize to avoid repeated filesystem calls
		if (!this._folderCreated) {
			this._folderCreated = this._fileService.createFolder(this._directory);
		}
		await this._folderCreated;
		if (this._currentSize === 0) {
			this._currentSize = await this._getFileSize(this._currentFile);
		}
		if (this._currentSize > 0 && this._currentSize + buffer.byteLength > this._maxFileSizeBytes) {
			await this._rotate();
		}
		await this._fileService.writeFile(this._currentFile, buffer, { append: true });
		this._currentSize += buffer.byteLength;
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

function toFileTimestamp(date: Date): string {
	return date.toISOString().replace(/[:.]/g, '-');
}

function sanitizeFilePart(value: string): string {
	return value.replace(/[\\/:\*\?"<>\|\s]+/g, '-').replace(/^-+|-+$/g, '') || 'connection';
}
