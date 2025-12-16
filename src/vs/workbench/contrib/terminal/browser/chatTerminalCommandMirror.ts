/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import type { IMarker as IXtermMarker } from '@xterm/xterm';
import type { ITerminalCommand } from '../../../../platform/terminal/common/capabilities/capabilities.js';
import { ITerminalService, type IDetachedTerminalInstance } from './terminal.js';
import { DetachedProcessInfo } from './detachedTerminal.js';
import { TerminalCapabilityStore } from '../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import { XtermTerminal } from './xterm/xtermTerminal.js';
import { TERMINAL_BACKGROUND_COLOR } from '../common/terminalColorRegistry.js';
import { PANEL_BACKGROUND } from '../../../common/theme.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../../chat/common/chatContextKeys.js';
import { editorBackground } from '../../../../platform/theme/common/colorRegistry.js';

export async function getCommandOutputSnapshot(
	xtermTerminal: XtermTerminal,
	command: ITerminalCommand,
	log?: (reason: 'fallback' | 'primary', error: unknown) => void
): Promise<{ text: string; lineCount: number } | undefined> {
	const executedMarker = command.executedMarker;
	const endMarker = command.endMarker;

	if (!endMarker || endMarker.isDisposed) {
		return undefined;
	}

	if (!executedMarker || executedMarker.isDisposed) {
		const raw = xtermTerminal.raw;
		const buffer = raw.buffer.active;
		const offsets = [
			-(buffer.baseY + buffer.cursorY),
			-buffer.baseY,
			0
		];
		let startMarker: IXtermMarker | undefined;
		for (const offset of offsets) {
			startMarker = raw.registerMarker(offset);
			if (startMarker) {
				break;
			}
		}
		if (!startMarker || startMarker.isDisposed) {
			return { text: '', lineCount: 0 };
		}
		const startLine = startMarker.line;
		let text: string | undefined;
		try {
			text = await xtermTerminal.getRangeAsVT(startMarker, endMarker, true);
		} catch (error) {
			log?.('fallback', error);
			return undefined;
		} finally {
			startMarker.dispose();
		}
		if (!text) {
			return { text: '', lineCount: 0 };
		}
		const endLine = endMarker.line - 1;
		const lineCount = Math.max(endLine - startLine + 1, 0);
		return { text, lineCount };
	}

	const startLine = executedMarker.line;
	const endLine = endMarker.line - 1;
	const lineCount = Math.max(endLine - startLine + 1, 0);

	let text: string | undefined;
	try {
		text = await xtermTerminal.getRangeAsVT(executedMarker, endMarker, true);
	} catch (error) {
		log?.('primary', error);
		return undefined;
	}
	if (!text) {
		return { text: '', lineCount: 0 };
	}

	return { text, lineCount };
}

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
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
	) {
		super();
		this._detachedTerminal = this._createTerminal();
	}

	async attach(container: HTMLElement): Promise<void> {
		const terminal = await this._detachedTerminal;
		container.classList.add('chat-terminal-output-terminal');
		const needsAttach = this._attachedContainer !== container || container.firstChild === null;
		if (needsAttach) {
			terminal.attachToElement(container);
			this._attachedContainer = container;
		}
	}

	async renderCommand(): Promise<{ lineCount?: number } | undefined> {
		const vt = await getCommandOutputSnapshot(this._xtermTerminal, this._command);
		if (!vt) {
			return undefined;
		}
		if (!vt.text) {
			return { lineCount: 0 };
		}
		const detached = await this._detachedTerminal;
		detached.xterm.clearBuffer();
		detached.xterm.clearSearchDecorations?.();
		await new Promise<void>(resolve => {
			detached.xterm.write(vt.text, () => resolve());
		});
		return { lineCount: vt.lineCount };
	}

	private async _createTerminal(): Promise<IDetachedTerminalInstance> {
		const processInfo = this._register(new DetachedProcessInfo({ initialCwd: '' }));
		const capabilities = this._register(new TerminalCapabilityStore());
		const detached = await this._terminalService.createDetachedTerminal({
			cols: this._xtermTerminal.raw!.cols,
			rows: 10,
			readonly: true,
			processInfo,
			disableOverviewRuler: true,
			capabilities,
			colorProvider: {
				getBackgroundColor: theme => {
					const terminalBackground = theme.getColor(TERMINAL_BACKGROUND_COLOR);
					if (terminalBackground) {
						return terminalBackground;
					}
					// Use editor background when in chat editor, panel background otherwise
					const isInEditor = ChatContextKeys.inChatEditor.getValue(this._contextKeyService);
					return theme.getColor(isInEditor ? editorBackground : PANEL_BACKGROUND);
				},
			}
		});
		return this._register(detached);
	}

}
