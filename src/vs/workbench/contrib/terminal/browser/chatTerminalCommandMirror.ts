/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, ImmortalReference } from '../../../../base/common/lifecycle.js';
import type { ITerminalCommand } from '../../../../platform/terminal/common/capabilities/capabilities.js';
import { ITerminalInstance, ITerminalService, type IDetachedTerminalInstance } from './terminal.js';
import { DetachedProcessInfo } from './detachedTerminal.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { TerminalInstanceColorProvider } from './terminalInstance.js';
import { TerminalLocation } from '../../../../platform/terminal/common/terminal.js';

interface IDetachedTerminalCommandMirror {
	attach(container: HTMLElement): Promise<void>;
	renderCommand(): Promise<{ lineCount?: number } | undefined>;
}

/**
 * Mirrors a terminal command's output into a detached terminal instance.
 * Used in the chat terminal tool progress part to show command output for example.
 */
export class DetachedTerminalCommandMirror extends Disposable implements IDetachedTerminalCommandMirror {
	private _detachedTerminal?: IDetachedTerminalInstance;
	private _attachedContainer?: HTMLElement;

	constructor(
		private readonly _terminalInstance: ITerminalInstance,
		private readonly _command: ITerminalCommand,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IInstantiationService private readonly _instantationService: IInstantiationService
	) {
		super();
	}

	async attach(container: HTMLElement): Promise<void> {
		const terminal = await this._getOrCreateTerminal();
		if (this._attachedContainer !== container) {
			container.classList.add('chat-terminal-output-terminal');
			terminal.attachToElement(container);
			this._attachedContainer = container;
		}
	}

	async renderCommand(): Promise<{ lineCount?: number } | undefined> {
		const detached = await this._getOrCreateTerminal();
		const raw = detached.xterm.raw;
		if (!raw) {
			return;
		}
		const vt = await this._getCommandOutputAsVT();
		raw.reset();
		if (!vt) {
			return undefined;
		}
		if (!vt.text) {
			return { lineCount: 0 };
		}
		raw.write(vt.text);
		raw.scrollToBottom();
		raw.refresh(0, raw.rows - 1);
		return { lineCount: vt.lineCount };
	}

	private async _getCommandOutputAsVT(): Promise<{ text: string; lineCount: number } | undefined> {
		const executedMarker = this._command.executedMarker;
		const endMarker = this._command.endMarker;
		if (!executedMarker || executedMarker.isDisposed || !endMarker || endMarker.isDisposed) {
			return undefined;
		}

		const xterm = await this._terminalInstance.xtermReadyPromise;
		if (!xterm) {
			return undefined;
		}

		const startLine = executedMarker.line;
		const endLine = endMarker.line - 1;
		const lineCount = Math.max(endLine - startLine + 1, 0);
		if (endLine - startLine < 3) {
			// Fine to call getOutput for this as its minimal lines
			// If we try to detect empty output otherwise, it's sometimes
			// wrong due to VT sequences that contain just the prompt.
			if (this._command.getOutput()?.trim() === '') {
				return { text: '', lineCount: 0 };
			}
		}

		const vt = await xterm.getRangeAsVT(executedMarker, endMarker);
		if (!vt) {
			return { text: '', lineCount: 0 };
		}
		const text = this._trimTrailingPrompt(vt, lineCount);
		return { text, lineCount: text ? lineCount : 0 };
	}

	private async _getOrCreateTerminal(): Promise<IDetachedTerminalInstance> {
		if (this._detachedTerminal) {
			return this._detachedTerminal;
		}
		const targetRef = this._terminalInstance?.targetRef ?? new ImmortalReference<TerminalLocation | undefined>(undefined);
		const colorProvider = this._instantationService.createInstance(TerminalInstanceColorProvider, targetRef);
		const detached = await this._terminalService.createDetachedTerminal({
			cols: this._terminalInstance?.cols ?? 80,
			rows: 10,
			readonly: true,
			processInfo: new DetachedProcessInfo({ initialCwd: '' }),
			colorProvider
		});
		this._detachedTerminal = detached;
		this._register(detached);
		return detached;
	}

	private _trimTrailingPrompt(vt: string, lineCount: number): string {
		if (!vt || lineCount <= 0) {
			return '';
		}

		const vtLines = vt.split('\r\n');
		if (vtLines.length <= lineCount) {
			return vt;
		}

		const trimmedLines = vtLines.slice(0, lineCount);
		if (vtLines.length === lineCount + 1 && vtLines[lineCount] === '' && vt.endsWith('\r\n')) {
			return `${trimmedLines.join('\r\n')}\r\n`;
		}

		return trimmedLines.join('\r\n');
	}
}
