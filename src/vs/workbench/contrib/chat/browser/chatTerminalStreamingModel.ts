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
	| { readonly kind: 'replace'; readonly snapshot: string };

// Encapsulates the rolling buffer of serialized terminal output so the UI only needs to worry
// about mirroring data into the preview. The heavy lifting happens here, including diffing the
// newest VT snapshot to decide when we can append, truncate, or fully replace content.
export class ChatTerminalStreamingModel {
	private _isStreaming = false;
	private _streamBuffer: string[] = [];
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
		this._hasRenderableOutput = storedOutput.text.length > 0;
		this._logService.trace('chatTerminalStreaming.append', { length: data.length, bufferChunks: this._streamBuffer.length });
		return true;
	}

	public applySnapshot(snapshot: string): StreamingSnapshotMutation {
		const storedOutput = this._terminalData.terminalCommandOutput ?? (this._terminalData.terminalCommandOutput = { text: '' });
		const previous = storedOutput.text ?? '';
		if (snapshot === previous) {
			this._logService.trace('chatTerminalStreaming.applySnapshot', { mutation: 'noop', previousLength: previous.length, newLength: snapshot.length });
			return { kind: 'noop' };
		}
		if (snapshot.length < previous.length || !snapshot.startsWith(previous)) {
			this._streamBuffer = [];
			storedOutput.text = '';
			if (snapshot) {
				this.appendData(snapshot);
				this._needsReplay = true;
			}
			this._logService.trace('chatTerminalStreaming.applySnapshot', { mutation: 'replace', previousLength: previous.length, newLength: snapshot.length });
			return { kind: 'replace', snapshot };
		}

		const appended = snapshot.slice(previous.length);
		if (!appended.length) {
			this._logService.trace('chatTerminalStreaming.applySnapshot', { mutation: 'noop', previousLength: previous.length, newLength: snapshot.length });
			return { kind: 'noop' };
		}

		this.appendData(appended);
		this._logService.trace('chatTerminalStreaming.applySnapshot', {
			mutation: 'append',
			appendedLength: appended.length,
			previousLength: previous.length,
			newLength: snapshot.length
		});
		return { kind: 'append', appended };
	}

	public applyEmptyOutput(): void {
		this._isStreaming = false;
		this._streamBuffer = [];
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

	public markRenderableOutput(): void {
		this._hasRenderableOutput = true;
	}

	public getBuffer(): readonly string[] {
		return this._streamBuffer;
	}
}
