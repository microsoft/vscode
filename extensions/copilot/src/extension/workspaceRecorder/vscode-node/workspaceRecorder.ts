/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mkdir, rename } from 'fs/promises';
import { env } from 'vscode';
import { IChangedMetadata, LogDocumentId, LogEntry, serializeEdit, serializeOffsetRange } from '../../../platform/workspaceRecorder/common/workspaceLog';
import { TaskQueue } from '../../../util/common/async';
import { timeout } from '../../../util/vs/base/common/async';
import { BugIndicatingError } from '../../../util/vs/base/common/errors';
import { Disposable, toDisposable } from '../../../util/vs/base/common/lifecycle';
import * as path from '../../../util/vs/base/common/path';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { StringEdit } from '../../../util/vs/editor/common/core/edits/stringEdit';
import { OffsetRange } from '../../../util/vs/editor/common/core/ranges/offsetRange';
import { FlushableJSONFile, FlushableSafeJSONLFile, getFileSize } from './safeFileWriteUtils';
import { computeShortSha } from './utils';

interface IWorkspaceRecorderContext {
	isIgnoredDocument(documentUri: string): Promise<boolean>;
}

export class WorkspaceRecorder extends Disposable {
	private readonly _queue = new TaskQueue();

	public readonly logFilePath = path.join(this.recordingDirPath, `current.workspaceRecording.jsonl`);
	private readonly _impl = WorkspaceRecorderImpl.create(this.repoRootUri, this.recordingDirPath, this.logFilePath, this._context);

	constructor(
		public readonly repoRootUri: string,
		public readonly recordingDirPath: string,
		private readonly _context: IWorkspaceRecorderContext,
	) {
		super();
	}

	handleOnDidOpenTextDocument(documentUri: string, initialText: string, newModelVersion: number): void {
		this._schedule(() => this._impl.then(v => v.handleOnDidOpenTextDocument(this._getTime(), documentUri, initialText, newModelVersion)));
	}

	handleOnDidCloseTextDocument(documentUri: string): void {
		this._schedule(() => this._impl.then(v => v.handleOnDidCloseTextDocument(this._getTime(), documentUri)));
	}

	handleOnDidShowTextDocument(documentUri: string): void {
		this._schedule(() => this._impl.then(v => v.handleOnDidShowTextDocument(this._getTime(), documentUri)));
	}

	handleOnDidHideTextDocument(documentUri: string): void {
		this._schedule(() => this._impl.then(v => v.handleOnDidHideTextDocument(this._getTime(), documentUri)));
	}

	handleOnDidChangeTextDocument(documentUri: string, edit: StringEdit, newModelVersion: number, metadata: IChangedMetadata | undefined): void {
		if (edit.isEmpty()) { return; }

		this._schedule(() => this._impl.then(v => v.handleOnDidChangeTextDocument(this._getTime(), documentUri, edit, newModelVersion, metadata)));
	}

	handleOnDidFocusedDocumentChange(documentUri: string): void {
		this._schedule(() => this._impl.then(v => v.handleOnDidFocusedDocumentChange(this._getTime(), documentUri)));
	}

	handleOnDidSelectionChange(documentUri: string, selection: OffsetRange[]): void {
		this._schedule(() => this._impl.then(v => v.handleOnDidSelectionChange(this._getTime(), documentUri, selection)));
	}

	handleEvent(time: number, data: unknown): void {
		this._schedule(() => this._impl.then(v => v.handleEvent(time, data)));
	}

	handleDocumentEvent(documentUri: string, time: number, data: unknown): void {
		this._schedule(() => this._impl.then(v => v.handleDocumentEvent(time, documentUri, data)));
	}

	addBookmark() {
		this._schedule(() => this._impl.then(v => v.addBookmark(this._getTime())));
	}

	private _schedule(task: () => Promise<void>) {
		this._queue.schedule(task);
	}

	private _getTime(): number {
		return Date.now();
	}
}

export class WorkspaceRecorderImpl extends Disposable {
	public static async create(repoRootUri: string, recordingDirPath: string, logFilePath: string, context: IWorkspaceRecorderContext): Promise<WorkspaceRecorderImpl> {
		await mkdir(recordingDirPath, { recursive: true });

		const currentVersion = 4;

		const state = await FlushableJSONFile.loadOrCreate<WorkspaceRecordingState>(path.join(recordingDirPath, 'state.json'), {
			version: currentVersion,
			logCount: 0,
			documents: {}
		});

		let shouldStartNewLog = false;
		if (!('version' in state.value) || state.value.version !== currentVersion) {
			shouldStartNewLog = true;
			state.setValue({
				version: currentVersion,
				logCount: 0,
				documents: {}
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

			await rename(logFilePath, path.join(recordingDirPath, `${state.value.logCount}.${formatDateFileNameSafe(date)}.workspaceRecording.jsonl`));

			// Reset state after truncating the log
			state.setValue({
				version: currentVersion,
				logCount: state.value.logCount + 1,
				documents: {},
			});
			await state.flushAsync();
			logFileExists = false;
		}

		const log = new FlushableSafeJSONLFile<LogEntry>(logFilePath);
		return new WorkspaceRecorderImpl(repoRootUri, state, log, context, logFileExists, currentVersion);
	}

	private constructor(
		public readonly repoRootUri: string,
		private readonly _state: FlushableJSONFile<WorkspaceRecordingState>,
		private readonly _log: FlushableSafeJSONLFile<LogEntry>,
		private readonly _context: IWorkspaceRecorderContext,
		private readonly _logFileExists: boolean,
		private readonly _revision: number,
	) {
		super();
		this._register(toDisposable(() => {
			this._forceFlush();
		}));

		if (!this._logFileExists) {
			this._appendEntry({
				documentType: 'workspaceRecording@1.0',
				kind: 'header',
				repoRootUri: this.repoRootUri,
				time: Date.now(),
				uuid: generateUuid(),
				revision: this._revision,
			});
		}

		this._appendEntry({
			kind: 'applicationStart',
			time: Date.now(),
			commitHash: env.appCommit
		});
	}

	async handleOnDidOpenTextDocument(time: number, documentUri: string, initialText: string, initialModelVersion: number): Promise<void> {
		const relativeUri = this._getRelativePath(documentUri);
		if (this._documentInitialTexts.has(relativeUri)) {
			throw new BugIndicatingError('should not happen');
		}
		this._documentInitialTexts.set(relativeUri, { value: initialText, time, initialModelVersion });
	}

	async handleOnDidCloseTextDocument(time: number, documentUri: string): Promise<void> {
		this._documentInitialTexts.delete(this._getRelativePath(documentUri));
	}

	async handleOnDidShowTextDocument(time: number, documentUri: string): Promise<void> {
		const id = await this._getId(documentUri);
		if (id === undefined) { return; }
		this._appendEntry({ kind: 'opened', id, time });
	}

	async handleOnDidHideTextDocument(time: number, documentUri: string): Promise<void> {
		const id = await this._getId(documentUri);
		if (id === undefined) { return; }
		this._appendEntry({ kind: 'closed', id, time });
	}

	async handleOnDidChangeTextDocument(time: number, documentUri: string, edit: StringEdit, newModelVersion: number, metadata: IChangedMetadata | undefined): Promise<void> {
		const id = await this._getId(documentUri);
		if (id === undefined) { return; }
		this._appendEntry({ kind: 'changed', id, time, edit: serializeEdit(edit), v: newModelVersion, metadata });
	}

	async handleOnDidFocusedDocumentChange(time: number, documentUri: string): Promise<void> {
		const id = await this._getId(documentUri);
		if (id === undefined) { return; }
		this._appendEntry({ kind: 'focused', id, time });
	}

	async handleOnDidSelectionChange(time: number, documentUri: string, selection: OffsetRange[]): Promise<void> {
		const id = await this._getId(documentUri);
		if (id === undefined) { return; }
		this._appendEntry({ kind: 'selectionChanged', id, time, selection: selection.map(s => serializeOffsetRange(s)) });
	}

	async addBookmark(time: number): Promise<void> {
		this._appendEntry({ kind: 'bookmark', time });
	}

	async handleDocumentEvent(time: number, documentUri: string, data: unknown): Promise<void> {
		const id = await this._getId(documentUri);
		if (id === undefined) { return; }
		this._appendEntry({ kind: 'documentEvent', id, time, data });
	}

	async handleEvent(time: number, data: unknown): Promise<void> {
		this._appendEntry({ kind: 'event', time, data });
	}

	private readonly _documentInitialTexts = new Map<string, { value: string; time: number; initialModelVersion: number }>();
	private _getRelativePath(documentUri: string): string {
		return path.relative(this.repoRootUri, documentUri);
	}

	private async _getId(documentUri: string): Promise<number | undefined> {
		if (await this._context.isIgnoredDocument(documentUri)) {
			return undefined;
		}

		const relativePath = this._getRelativePath(documentUri);

		const s = this._state;
		const curState = s.value;
		let shouldWrite = false;
		let info = curState.documents[relativePath];
		if (!info) {
			info = { id: Object.entries(curState.documents).length, lastHash: '' };
			this._appendEntry({ kind: 'documentEncountered', time: Date.now(), id: info.id, relativePath });
			shouldWrite = true;
		}

		const initialText = this._documentInitialTexts.get(relativePath);
		if (initialText !== undefined) {
			const hash = computeShortSha(initialText.value);
			const v = initialText.initialModelVersion === 0 ? undefined : initialText.initialModelVersion;
			if (info.lastHash !== hash) {
				info.lastHash = hash;
				shouldWrite = true;
				this._appendEntry({ kind: 'setContent', time: initialText.time, id: info.id, content: initialText.value, v });
				this._appendEntry({ kind: 'storeContent', time: initialText.time, id: info.id, contentId: hash, v });
			} else {
				this._appendEntry({ kind: 'restoreContent', time: initialText.time, id: info.id, contentId: hash, v });
			}
			this._documentInitialTexts.delete(relativePath);
		}

		if (shouldWrite) {
			s.setValue({ ...s.value, documents: { ...curState.documents, [relativePath]: info } });
			this._scheduleFlush();
		}

		if (info.lastHash === '') {
			throw new BugIndicatingError(`hash was empty for uri "${documentUri}"`);
		}

		return info.id;
	}

	private readonly _writeQueue = new TaskQueue();

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

	private _appendEntry(entry: LogEntry): void {
		this._log.appendEntry(entry);
		this._scheduleFlush();
	}
}


type WorkspaceRecordingState = {
	version: 3 | 4;
	logCount: number;
	documents: Record</* relativePath */ string, { id: LogDocumentId; lastHash: string }>;
} | {
	documents: Record</* relativePath */ string, { id: LogDocumentId; lastHash: string }>;
};
