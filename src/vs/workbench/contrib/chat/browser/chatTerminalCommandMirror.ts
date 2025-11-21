/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, ImmortalReference } from '../../../../base/common/lifecycle.js';
import type { ITerminalCommand } from '../../../../platform/terminal/common/capabilities/capabilities.js';
import { ITerminalInstance, ITerminalService, type IDetachedTerminalInstance } from '../../terminal/browser/terminal.js';
import { DetachedProcessInfo } from '../../terminal/browser/detachedTerminal.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { TerminalInstanceColorProvider } from '../../terminal/browser/terminalInstance.js';
import { TerminalLocation } from '../../../../platform/terminal/common/terminal.js';

interface IDetachedTerminalCommandMirror {
	attach(container: HTMLElement): Promise<void>;
	renderCommand(): Promise<{ isEmpty?: boolean } | undefined>;
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

	async renderCommand(): Promise<{ isEmpty?: boolean } | undefined> {
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
			return { isEmpty: !vt.text };
		}
		raw.write(vt.text);
		raw.scrollToBottom();
		raw.refresh(0, raw.rows - 1);
		return { isEmpty: !vt.text };
	}

	private async _getCommandOutputAsVT(): Promise<{ text: string } | undefined> {
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

		if (endLine - startLine < 3) {
			// Fine to call getOutput for this as its minimal lines
			// If we try to detect empty output otherwise, it's sometimes
			// wrong due to VT sequences that contain just the prompt.
			if (this._command.getOutput()?.trim() === '') {
				return { text: '' };
			}
		}

		const vt = await xterm.getRangeAsVT(executedMarker, endMarker);
		if (!vt) {
			return { text: '' };
		}
		return { text: vt };
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
}
