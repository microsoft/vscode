/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { removeAnsiEscapeCodes } from '../../../../base/common/strings.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ITerminalCommand } from '../../../../platform/terminal/common/capabilities/capabilities.js';
import { ITerminalInstance } from '../../terminal/browser/terminal.js';
import { IChatTerminalToolInvocationData } from '../common/chatService.js';

export interface IStreamingSnapshotRequest {
	readonly instance: ITerminalInstance;
	readonly command: ITerminalCommand;
	readonly force: boolean;
	readonly resolve: () => void;
	readonly reject: (error: unknown) => void;
}

export type StreamingSnapshotMutation =
	| { readonly kind: 'noop' }
	| { readonly kind: 'append'; readonly appended: string }
	| { readonly kind: 'replace'; readonly snapshot: string }
	| { readonly kind: 'truncate'; readonly truncated: number; readonly appended: string };

// Encapsulates the rolling buffer of serialized terminal output so the UI only needs to worry
// about mirroring data into the preview. The heavy lifting happens here, including diffing the
// newest VT snapshot to decide when we can append, truncate, or fully replace content.
export class ChatTerminalStreamingModel {
	// Tuning notes:
	//  - Prefix sample (256 chars) is big enough to catch prompt churn while staying cheaper than diffing full snapshots.
	//  - Overlap window (32 KiB) keeps the KMP scan bounded to a few dozen lines of VT output so we avoid quadratic scans.
	//  - When trimming, we require both 60% overlap and at least 2 KiB of shared content so we only treat large shifts as truncations.
	private readonly _snapshotPrefixSampleSize = 256;
	private readonly _snapshotOverlapSampleSize = 32 * 1024;
	private readonly _trimOverlapMinChars = 2048;
	private readonly _trimOverlapRatio = 0.6;

	private _isStreaming = false;
	private _streamBuffer: string[] = [];
	private _lastRawSnapshot: string | undefined;
	private _lastSnapshotPrefixLength = 0;
	private _snapshotPrefixSample: string | undefined;
	private _needsReplay = false;
	private _hasRenderableOutput = false;

	constructor(
		private readonly _terminalData: IChatTerminalToolInvocationData,
		private readonly _logService: ILogService
	) { }

	public hydrateFromStoredOutput(text: string | undefined): void {
		if (!text) {
			return;
		}
		const storedOutput = this._terminalData.terminalCommandOutput ?? (this._terminalData.terminalCommandOutput = { text: '' });
		storedOutput.text = text;
		this._streamBuffer = [text];
		this._needsReplay = true;
		this._hasRenderableOutput = text.length > 0;
		this._logService.trace('chatTerminalStreaming.hydrate', { length: text.length });
	}

	public beginStreaming(): void {
		this._isStreaming = true;
		this._streamBuffer = [];
		this._lastRawSnapshot = undefined;
		this._lastSnapshotPrefixLength = 0;
		this._snapshotPrefixSample = undefined;
		this._needsReplay = true;
		this._hasRenderableOutput = false;
		this._terminalData.terminalCommandOutput = { text: '' };
		this._logService.trace('chatTerminalStreaming.begin');
	}

	public endStreaming(): void {
		this._isStreaming = false;
		this._logService.trace('chatTerminalStreaming.end');
	}

	public appendData(data: string): boolean {
		if (!data) {
			return false;
		}
		this._isStreaming = true;
		const storedOutput = this._terminalData.terminalCommandOutput ?? (this._terminalData.terminalCommandOutput = { text: '' });
		this._streamBuffer.push(data);
		storedOutput.text += data;
		this._logService.trace('chatTerminalStreaming.append', { length: data.length, bufferChunks: this._streamBuffer.length });
		return true;
	}

	public applySnapshot(snapshot: string): StreamingSnapshotMutation {
		const previous = this._lastRawSnapshot;
		if (previous === snapshot) {
			this._logService.trace('chatTerminalStreaming.applySnapshot', { mutation: 'noop', previousLength: previous?.length ?? 0, newLength: snapshot.length });
			return { kind: 'noop' };
		}
		if (!previous) {
			this._replaceWithSnapshot(snapshot);
			this._lastRawSnapshot = snapshot;
			this._updateSnapshotCache(snapshot);
			const mutation = { kind: 'replace', snapshot } as const;
			this._logService.trace('chatTerminalStreaming.applySnapshot', { mutation: mutation.kind, previousLength: 0, newLength: snapshot.length });
			return mutation;
		}

		const sampleLength = Math.min(this._snapshotPrefixSampleSize, previous.length, snapshot.length);
		if (sampleLength > 0) {
			const existingSample = this._snapshotPrefixSample && this._snapshotPrefixSample.length >= sampleLength
				? this._snapshotPrefixSample.slice(0, sampleLength)
				: previous.slice(0, sampleLength);
			const nextSample = snapshot.slice(0, sampleLength);
			if (existingSample !== nextSample) {
				this._lastSnapshotPrefixLength = 0;
			}
		}

		this._lastSnapshotPrefixLength = Math.min(this._lastSnapshotPrefixLength, previous.length, snapshot.length);

		let prefixLength = this._lastSnapshotPrefixLength;
		while (prefixLength < previous.length && prefixLength < snapshot.length && previous.charCodeAt(prefixLength) === snapshot.charCodeAt(prefixLength)) {
			prefixLength++;
		}

		if (prefixLength === previous.length && snapshot.length >= previous.length) {
			const appended = snapshot.slice(previous.length);
			this._lastRawSnapshot = snapshot;
			this._updateSnapshotCache(snapshot);
			const mutation: StreamingSnapshotMutation = appended.length ? { kind: 'append', appended } : { kind: 'noop' };
			if (appended.length) {
				this.appendData(appended);
			}
			this._logService.trace('chatTerminalStreaming.applySnapshot', {
				mutation: mutation.kind,
				appendedLength: appended.length,
				previousLength: previous.length,
				newLength: snapshot.length
			});
			return mutation;
		}

		const overlap = this._computeSnapshotOverlap(previous, snapshot);
		const minLength = Math.min(previous.length, snapshot.length);
		const maxOverlapWindow = Math.min(minLength, this._snapshotOverlapSampleSize);
		let requiredOverlap = 0;
		if (maxOverlapWindow > 1) {
			const ratioThreshold = Math.floor(maxOverlapWindow * this._trimOverlapRatio);
			const absoluteThreshold = Math.min(this._trimOverlapMinChars, maxOverlapWindow - 1);
			requiredOverlap = Math.max(ratioThreshold, absoluteThreshold);
		}
		const trimmed = previous.length - overlap;

		if (overlap > 0 && trimmed > 0 && overlap >= requiredOverlap) {
			this._truncatePrefix(trimmed);
			const inserted = snapshot.slice(overlap);
			this._lastRawSnapshot = snapshot;
			this._updateSnapshotCache(snapshot);
			if (inserted.length) {
				this.appendData(inserted);
			}
			const mutation = { kind: 'truncate', truncated: trimmed, appended: inserted } as const;
			this._logService.trace('chatTerminalStreaming.applySnapshot', {
				mutation: mutation.kind,
				trimmed,
				appendedLength: inserted.length,
				previousLength: previous.length,
				newLength: snapshot.length
			});
			return mutation;
		}

		this._replaceWithSnapshot(snapshot);
		this._lastRawSnapshot = snapshot;
		this._updateSnapshotCache(snapshot);
		const mutation = { kind: 'replace', snapshot } as const;
		this._logService.trace('chatTerminalStreaming.applySnapshot', { mutation: mutation.kind, previousLength: previous.length, newLength: snapshot.length });
		return mutation;
	}

	public applyEmptyOutput(): void {
		this._isStreaming = false;
		this._streamBuffer = [];
		this._lastRawSnapshot = undefined;
		this._lastSnapshotPrefixLength = 0;
		this._snapshotPrefixSample = undefined;
		this._needsReplay = false;
		const storedOutput = this._terminalData.terminalCommandOutput ?? (this._terminalData.terminalCommandOutput = { text: '' });
		storedOutput.text = '';
		this._hasRenderableOutput = false;
		this._logService.trace('chatTerminalStreaming.applyEmptyOutput');
	}

	public hasRenderableOutput(): boolean {
		return this._hasRenderableOutput;
	}

	public countRenderableLines(): number {
		if (!this._streamBuffer.length) {
			return 0;
		}
		const concatenated = this._streamBuffer.join('');
		const withoutAnsi = removeAnsiEscapeCodes(concatenated);
		const sanitized = withoutAnsi.replace(/\r/g, '');
		if (!sanitized.length) {
			return 0;
		}
		return sanitized.split('\n').length;
	}

	public get isStreaming(): boolean {
		return this._isStreaming;
	}

	public shouldRender(): boolean {
		return this._isStreaming || this.hasRenderableOutput();
	}

	public get needsReplay(): boolean {
		return this._needsReplay;
	}

	public markNeedsReplay(): void {
		this._needsReplay = true;
	}

	public clearNeedsReplay(): void {
		this._needsReplay = false;
	}

	public getBufferedText(): string {
		return this._streamBuffer.join('');
	}

	public getBuffer(): readonly string[] {
		return this._streamBuffer;
	}

	private _replaceWithSnapshot(snapshot: string): void {
		const storedOutput = this._terminalData.terminalCommandOutput ?? (this._terminalData.terminalCommandOutput = { text: '' });
		this._streamBuffer = [];
		storedOutput.text = '';
		if (snapshot) {
			this._streamBuffer.push(snapshot);
			storedOutput.text = snapshot;
		}
		this._hasRenderableOutput = storedOutput.text.length > 0;
		this._needsReplay = true;
		this._logService.trace('chatTerminalStreaming.replace', { snapshotLength: snapshot.length });
	}

	private _truncatePrefix(chars: number): void {
		if (chars <= 0) {
			return;
		}
		const storedOutput = this._terminalData.terminalCommandOutput ?? (this._terminalData.terminalCommandOutput = { text: '' });
		if (!storedOutput.text) {
			this._hasRenderableOutput = false;
			return;
		}
		if (chars >= storedOutput.text.length) {
			this._streamBuffer = [];
			storedOutput.text = '';
		} else {
			storedOutput.text = storedOutput.text.slice(chars);
			let remaining = chars;
			while (remaining > 0 && this._streamBuffer.length) {
				const chunk = this._streamBuffer[0];
				if (remaining >= chunk.length) {
					this._streamBuffer.shift();
					remaining -= chunk.length;
				} else {
					this._streamBuffer[0] = chunk.slice(remaining);
					remaining = 0;
				}
			}
		}
		this._hasRenderableOutput = storedOutput.text.length > 0;
		this._needsReplay = true;
		this._logService.trace('chatTerminalStreaming.truncate', { chars, bufferChunks: this._streamBuffer.length });
	}

	public markRenderableOutput(): void {
		this._hasRenderableOutput = true;
	}

	private _computeSnapshotOverlap(previous: string, snapshot: string): number {
		// Classic KMP prefix-table driven overlap search so we can quickly detect how much of the
		// existing buffer still matches the new snapshot without rescanning from scratch each time.
		const maxWindow = Math.min(previous.length, snapshot.length, this._snapshotOverlapSampleSize);
		if (maxWindow <= 0) {
			return 0;
		}
		const pattern = snapshot.slice(0, maxWindow);
		const text = previous.slice(previous.length - maxWindow);
		if (!pattern.length || !text.length) {
			return 0;
		}
		const prefixTable = this._buildPrefixTable(pattern);
		let matchLength = 0;
		for (let i = 0; i < text.length; i++) {
			const code = text.charCodeAt(i);
			while (matchLength > 0 && code !== pattern.charCodeAt(matchLength)) {
				matchLength = prefixTable[matchLength - 1];
			}
			if (code === pattern.charCodeAt(matchLength)) {
				matchLength++;
				if (matchLength === pattern.length) {
					return matchLength;
				}
			}
		}
		return matchLength;
	}

	private _buildPrefixTable(pattern: string): number[] {
		// Standard prefix computation used by KMP; stores the length of the longest prefix that is
		// also a suffix for every character boundary in the snapshot prefix window.
		const lps: number[] = new Array(pattern.length).fill(0);
		let length = 0;
		for (let i = 1; i < pattern.length; i++) {
			const code = pattern.charCodeAt(i);
			while (length > 0 && code !== pattern.charCodeAt(length)) {
				length = lps[length - 1];
			}
			if (code === pattern.charCodeAt(length)) {
				length++;
			}
			lps[i] = length;
		}
		return lps;
	}

	private _updateSnapshotCache(snapshot: string): void {
		this._lastSnapshotPrefixLength = snapshot.length;
		if (!snapshot) {
			this._snapshotPrefixSample = undefined;
			return;
		}
		this._snapshotPrefixSample = snapshot.slice(0, Math.min(this._snapshotPrefixSampleSize, snapshot.length));
	}
}
