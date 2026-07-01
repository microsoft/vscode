/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import { mkdir, rename } from 'fs/promises';
import { InlineEditRequestLogContext } from '../../../../platform/inlineEdits/common/inlineEditLogContext';
import { TaskQueue } from '../../../../util/common/async';
import { timeout } from '../../../../util/vs/base/common/async';
import { BugIndicatingError } from '../../../../util/vs/base/common/errors';
import { Disposable, DisposableMap, toDisposable } from '../../../../util/vs/base/common/lifecycle';
import * as path from '../../../../util/vs/base/common/path';
import { FlushableJSONFile, FlushableSafeJSONLFile, getFileSize } from '../../../workspaceRecorder/vscode-node/safeFileWriteUtils';
import { INextEditResult } from '../../node/nextEditResult';
import { InlineEditLogger } from '../parts/inlineEditLogger';

export class LogContextRecorder extends Disposable {

	public static fileSuffix = '.logContext.jsonl';

	private readonly _queue: TaskQueue;
	public readonly logFilePath: string;
	private readonly _impl: Promise<LogContextRecorderImpl>;

	private readonly _shownSuggestions: DisposableMap<number, { timeout: TimeoutHandle; dispose: () => void }>;

	constructor(
		public readonly recordingDirPath: string,
		private readonly _inlineEditLogger: InlineEditLogger,
	) {
		super();

		this._queue = new TaskQueue();

		this._shownSuggestions = this._register(new DisposableMap());

		this.logFilePath = path.join(this.recordingDirPath, `current${LogContextRecorder.fileSuffix}`);

		this._impl = LogContextRecorderImpl.create(this.recordingDirPath, this.logFilePath);

		this._impl.then(impl => {
			if (this._store.isDisposed) {
				impl.dispose();
			} else {
				this._register(impl);
			}
		});
	}

	public static async cleanupOldRecordings(recordingDirPath: string) {
		const dirContents = await fs.readdir(recordingDirPath).catch(() => []);
		return Promise.all(
			dirContents.filter(file => file.endsWith(LogContextRecorder.fileSuffix)).map(file => {
				const filePath = path.join(recordingDirPath, file);
				return fs.unlink(filePath).catch(() => { });
			})
		);
	}

	public handleShown(nextEditResult: INextEditResult) {
		const requestId = nextEditResult.requestId;
		// If the user doesn't interact with the suggestion for 10s,
		//  we'll consider it ignored
		const timer = setTimeout(() => {
			const req = this._inlineEditLogger.getRequestById(requestId);
			if (req) {
				this.writeLog(req);
			}
			this._shownSuggestions.deleteAndDispose(requestId);
		}, 10000);
		this._shownSuggestions.set(requestId, { timeout: timer, dispose: () => clearTimeout(timer) });
	}

	public handleAcceptance(nextEditResult: INextEditResult) {
		const requestId = nextEditResult.requestId;
		this._shownSuggestions.deleteAndDispose(requestId);
		const req = this._inlineEditLogger.getRequestById(requestId);
		if (req) {
			req.setAccepted(true);
			this.writeLog(req);
		}
	}

	public handleRejection(nextEditResult: INextEditResult) {
		const requestId = nextEditResult.requestId;
		this._shownSuggestions.deleteAndDispose(requestId);

		const req = this._inlineEditLogger.getRequestById(requestId);
		if (req) {
			req.setAccepted(false);
			this.writeLog(req);
		}
	}

	private writeLog(req: InlineEditRequestLogContext) {
		this._queue.schedule(async () => {
			const impl = await this._impl;
			await req.allPromisesResolved();
			impl.appendEntry(req);
		});
	}
}

class LogContextRecorderImpl extends Disposable {
	public static async create(recordingDirPath: string, logFilePath: string,): Promise<LogContextRecorderImpl> {
		await mkdir(recordingDirPath, { recursive: true });

		const currentVersion = 1;

		const state = await FlushableJSONFile.loadOrCreate<LogFileState>(path.join(recordingDirPath, 'state.json'), {
			version: currentVersion,
			logCount: 0,
		});

		let shouldStartNewLog = false;
		if (!('version' in state.value) || state.value.version !== currentVersion) {
			shouldStartNewLog = true;
			state.setValue({
				version: currentVersion,
				logCount: 0,
			});
			await state.flushAsync();
		}

		if (!('version' in state.value)) {
			throw new BugIndicatingError();
		}

		const logFileSize = await getFileSize(logFilePath);
		let logFileExists = logFileSize !== undefined;

		const MB = 1024 * 1024;
		const maxLogFileSize = 20 * MB;
		if (logFileSize !== undefined && logFileSize > maxLogFileSize) {
			shouldStartNewLog = true;
		}

		if (logFileExists && shouldStartNewLog) {
			// log rotation
			const date = new Date();

			function formatDateFileNameSafe(date: Date): string {
				return date.toISOString().replace(/:/g, '-');
			}

			await rename(logFilePath, path.join(recordingDirPath, `${state.value.logCount}.${formatDateFileNameSafe(date)}${LogContextRecorder.fileSuffix}`));

			// Reset state after truncating the log
			state.setValue({
				version: currentVersion,
				logCount: state.value.logCount + 1,
			});
			await state.flushAsync();
			logFileExists = false;
		}

		const log = new FlushableSafeJSONLFile<InlineEditRequestLogContext>(logFilePath);
		return new LogContextRecorderImpl(state, log);
	}

	private constructor(
		private readonly _state: FlushableJSONFile<LogFileState>,
		private readonly _log: FlushableSafeJSONLFile<unknown>,
	) {
		super();
		this._register(toDisposable(() => {
			this._forceFlush();
		}));
	}

	private readonly _writeQueue = new TaskQueue();
	private readonly _loggedRequests = new Set<number>();
	private readonly _loggedQueue: number[] = [];
	private readonly _logBufferSize = 20;

	private _scheduleFlush() {
		this._writeQueue.clearPending();
		this._writeQueue.schedule(async () => {
			await timeout(10 * 1000);

			const state = this._state;
			await state.flushAsync();
			await this._log.flushAsync();
		});
	}

	private _forceFlush(): void {
		this._writeQueue.clearPending();
		this._state.flushSync();
		this._log.flushSync();
	}

	// Decide if a request should be logged
	private shouldLog(entry: InlineEditRequestLogContext): boolean {
		if (this._loggedRequests.has(entry.requestId)) {
			return false;
		}

		// We keep a buffer of requests to ensure the set
		// doesn't keep increasing throughout a session.
		if (this._loggedRequests.size >= this._logBufferSize) {
			const oldest = this._loggedQueue.shift();
			if (oldest !== undefined) {
				this._loggedRequests.delete(oldest);
			}
		}
		return true;
	}

	// Updated appendEntry using the helper method
	public appendEntry(entry: InlineEditRequestLogContext): void {
		if (!this.shouldLog(entry)) {
			return;
		}
		this._loggedRequests.add(entry.requestId);
		this._loggedQueue.push(entry.requestId);
		this._log.appendEntry(entry.toJSON());
		this._scheduleFlush();
	}
}

type LogFileState = {
	version: 1;
	logCount: number;
};
