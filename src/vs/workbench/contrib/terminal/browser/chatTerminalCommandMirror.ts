/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import type { ITerminalCommand } from '../../../../platform/terminal/common/capabilities/capabilities.js';
import { ITerminalService, type IDetachedTerminalInstance } from './terminal.js';
import { DetachedProcessInfo } from './detachedTerminal.js';
import { XtermTerminal } from './xterm/xtermTerminal.js';
import { TERMINAL_BACKGROUND_COLOR } from '../common/terminalColorRegistry.js';
import { PANEL_BACKGROUND } from '../../../common/theme.js';

interface IDetachedTerminalCommandMirror {
	attach(container: HTMLElement): Promise<void>;
	renderCommand(): Promise<{ lineCount?: number } | undefined>;
}

/**
 * Mirrors a terminal command's output into a detached terminal instance.
 * Used in the chat terminal tool progress part to show command output for example.
 */
export class DetachedTerminalCommandMirror extends Disposable implements IDetachedTerminalCommandMirror {
	private _detachedTerminal: Promise<IDetachedTerminalInstance>;
	private _attachedContainer?: HTMLElement;

	constructor(
		private readonly _xtermTerminal: XtermTerminal,
		private readonly _command: ITerminalCommand,
		@ITerminalService private readonly _terminalService: ITerminalService,
	) {
		super();
		this._detachedTerminal = this._createTerminal();
	}

	async attach(container: HTMLElement): Promise<void> {
		const terminal = await this._detachedTerminal;
		if (this._attachedContainer !== container) {
			container.classList.add('chat-terminal-output-terminal');
			terminal.attachToElement(container);
			this._attachedContainer = container;
		}
	}

	async renderCommand(): Promise<{ lineCount?: number } | undefined> {
		const vt = await this._getCommandOutputAsVT();
		if (!vt) {
			return undefined;
		}
		if (!vt.text) {
			return { lineCount: 0 };
		}
		const detached = await this._detachedTerminal;
		detached.xterm.write(vt.text);
		return { lineCount: vt.lineCount };
	}

	private async _getCommandOutputAsVT(): Promise<{ text: string; lineCount: number } | undefined> {
		const executedMarker = this._command.executedMarker;
		const endMarker = this._command.endMarker;
		if (!executedMarker || executedMarker.isDisposed || !endMarker || endMarker.isDisposed) {
			return undefined;
		}

		const startLine = executedMarker.line;
		const endLine = endMarker.line - 1;
		const lineCount = Math.max(endLine - startLine + 1, 0);

		const text = await this._xtermTerminal.getRangeAsVT(executedMarker, endMarker, true);
		if (!text) {
			return { text: '', lineCount: 0 };
		}

		return { text, lineCount };
	}

	private async _createTerminal(): Promise<IDetachedTerminalInstance> {
		const detached = await this._terminalService.createDetachedTerminal({
			cols: this._xtermTerminal.raw!.cols,
			rows: 10,
			readonly: true,
			processInfo: new DetachedProcessInfo({ initialCwd: '' }),
			disableOverviewRuler: true,
			colorProvider: {
				getBackgroundColor: theme => {
					const terminalBackground = theme.getColor(TERMINAL_BACKGROUND_COLOR);
					if (terminalBackground) {
						return terminalBackground;
					}
					return theme.getColor(PANEL_BACKGROUND);
				},
			}
		});
		return this._register(detached);
	}

}
