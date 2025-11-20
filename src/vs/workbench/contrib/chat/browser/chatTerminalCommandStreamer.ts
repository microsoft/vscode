/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MutableDisposable, DisposableStore, Disposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ITerminalCommand } from '../../../../platform/terminal/common/capabilities/capabilities.js';
import { ITerminalInstance } from '../../terminal/browser/terminal.js';
import { IStreamingSnapshotRequest } from './chatTerminalStreamingModel.js';
import type { IMarker as IXtermMarker } from '@xterm/xterm';


export class ChatTerminalCommandStreamer extends Disposable {
	private readonly _commandStreamingListener = this._register(new MutableDisposable<DisposableStore>());
	private _streamingCommand: ITerminalCommand | undefined;
	private _trackedCommandId: string | undefined;
	private _streamingQueue: IStreamingSnapshotRequest[] = [];
	private _emptySnapshotRetries = 0;
	private _isDrainingStreamingQueue = false;
	private _streamingDrainScheduled = false;

	constructor(
		private readonly _logService: ILogService,
		private readonly _isDisposed: () => boolean,
		private readonly _syncSnapshot: (instance: ITerminalInstance, command: ITerminalCommand, force: boolean) => Promise<void>
	) {
		super();
	}

	public get listener(): MutableDisposable<DisposableStore> {
		return this._commandStreamingListener;
	}

	public get streamingCommand(): ITerminalCommand | undefined {
		return this._streamingCommand;
	}

	public beginStreaming(command: ITerminalCommand, expectedId: string | undefined): DisposableStore {
		this._streamingCommand = command;
		this._trackedCommandId = command.id ?? expectedId;
		this._emptySnapshotRetries = 0;
		const store = new DisposableStore();
		this._commandStreamingListener.value = store;
		return store;
	}

	public endStreaming(): void {
		this._commandStreamingListener.clear();
		this._streamingCommand = undefined;
		this._trackedCommandId = undefined;
		this._emptySnapshotRetries = 0;
		this._clearStreamingQueue();
	}

	public resetForCommandDetection(initialTrackedId: string | undefined): void {
		this._commandStreamingListener.clear();
		this._streamingCommand = undefined;
		this._trackedCommandId = initialTrackedId;
		this._emptySnapshotRetries = 0;
		this._clearStreamingQueue();
	}

	public clearAllCommandState(): void {
		this._commandStreamingListener.clear();
		this._streamingCommand = undefined;
		this._trackedCommandId = undefined;
		this._emptySnapshotRetries = 0;
		this._clearStreamingQueue();
	}

	public get trackedCommandId(): string | undefined {
		return this._trackedCommandId;
	}

	public set trackedCommandId(value: string | undefined) {
		this._trackedCommandId = value;
	}

	public isTrackedCommand(candidate: string | undefined): boolean {
		return !!candidate && candidate === this._trackedCommandId;
	}

	public queueStreaming(instance: ITerminalInstance, command: ITerminalCommand, force = false): Promise<void> {
		if (this._isDisposed() || (!force && this._streamingCommand !== command)) {
			return Promise.resolve();
		}

		const executedMarker = (command as unknown as { executedMarker?: IXtermMarker; commandExecutedMarker?: IXtermMarker }).executedMarker
			?? (command as unknown as { executedMarker?: IXtermMarker; commandExecutedMarker?: IXtermMarker }).commandExecutedMarker;
		if (!executedMarker) {
			const commandId = command.id ?? 'unknown';
			this._logService.trace('chatTerminalToolProgressPart.queueStreaming.waitForExecutedMarker', { commandId, force });
			setTimeout(() => {
				if (this._isDisposed() || (!force && this._streamingCommand !== command)) {
					return;
				}
				void this.queueStreaming(instance, command, force);
			}, 0);
			return Promise.resolve();
		}

		const commandId = command.id ?? 'unknown';
		this._logService.trace('chatTerminalToolProgressPart.queueStreaming', { commandId, pending: this._streamingQueue.length + 1, force });

		return new Promise<void>((resolve, reject) => {
			this._streamingQueue.push({ instance, command, force, resolve, reject });
			if (!this._isDrainingStreamingQueue) {
				this._scheduleStreamingFlush();
			}
		});
	}

	public handleEmptySnapshotNoChange(force: boolean, storedLength: number, hasOutput: boolean, command: ITerminalCommand, requeue: () => void): boolean {
		if (!(force && storedLength === 0 && hasOutput)) {
			this._emptySnapshotRetries = 0;
			return false;
		}

		this._emptySnapshotRetries++;
		if (this._emptySnapshotRetries <= 60) {
			const attempt = this._emptySnapshotRetries;
			this._logService.trace('chatTerminalToolProgressPart.syncStreamingSnapshot.retryPendingOutput', { commandId: command.id, attempt });
			requeue();
			return true;
		}

		this._logService.trace('chatTerminalToolProgressPart.syncStreamingSnapshot.retryPendingOutput.maxAttempts', { commandId: command.id, attempt: this._emptySnapshotRetries });
		this._emptySnapshotRetries = 0;
		return false;
	}

	public resetEmptySnapshotRetries(): void {
		this._emptySnapshotRetries = 0;
	}

	public override dispose(): void {
		this._clearStreamingQueue();
		super.dispose();
	}

	private _scheduleStreamingFlush(): void {
		if (this._streamingDrainScheduled || this._isDrainingStreamingQueue || this._streamingQueue.length === 0) {
			return;
		}
		this._streamingDrainScheduled = true;
		this._logService.trace('chatTerminalToolProgressPart.scheduleStreamingFlush', { commandId: this._streamingCommand?.id, queued: this._streamingQueue.length });
		void this._drainStreamingQueue();
	}

	private async _drainStreamingQueue(): Promise<void> {
		this._streamingDrainScheduled = false;
		if (this._isDrainingStreamingQueue || this._streamingQueue.length === 0) {
			return;
		}

		this._isDrainingStreamingQueue = true;
		this._logService.trace('chatTerminalToolProgressPart.drainStreamingQueue-start', { queued: this._streamingQueue.length, commandId: this._streamingCommand?.id });
		try {
			while (this._streamingQueue.length) {
				const job = this._streamingQueue.shift()!;
				if (this._isDisposed() || (!job.force && this._streamingCommand !== job.command)) {
					job.resolve();
					this._logService.trace('chatTerminalToolProgressPart.drainStreamingQueue-skip', { commandId: job.command.id, force: job.force });
					continue;
				}
				try {
					await this._syncSnapshot(job.instance, job.command, job.force);
					job.resolve();
					this._logService.trace('chatTerminalToolProgressPart.drainStreamingQueue-run', { commandId: job.command.id, force: job.force });
				} catch (error) {
					job.reject(error);
					this._logService.trace('chatTerminalToolProgressPart.drainStreamingQueue-error', { commandId: job.command.id, force: job.force, message: error instanceof Error ? error.message : String(error) });
				}
			}
		} finally {
			this._isDrainingStreamingQueue = false;
			this._logService.trace('chatTerminalToolProgressPart.drainStreamingQueue-end', { remaining: this._streamingQueue.length, commandId: this._streamingCommand?.id });
			if (this._streamingQueue.length) {
				this._scheduleStreamingFlush();
			}
		}
	}

	private _clearStreamingQueue(error?: unknown): void {
		this._streamingDrainScheduled = false;
		if (!this._streamingQueue.length) {
			return;
		}
		this._logService.trace('chatTerminalToolProgressPart.clearStreamingQueue', { pending: this._streamingQueue.length, hasError: error !== undefined });
		const pending = this._streamingQueue.splice(0, this._streamingQueue.length);
		for (const job of pending) {
			if (error !== undefined) {
				job.reject(error);
			} else {
				job.resolve();
			}
		}
	}
}
