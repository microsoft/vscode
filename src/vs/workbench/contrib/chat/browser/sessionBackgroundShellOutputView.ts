/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow, h, scheduleAtNextAnimationFrame } from '../../../../base/browser/dom.js';
import { createPixelSpinner } from '../../../../base/browser/ui/pixelSpinner/pixelSpinner.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../base/common/observable.js';
import { removeAnsiEscapeCodes } from '../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { asCssVariable, menuBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { computeChatTerminalMirrorCols } from '../../terminal/browser/chatTerminalCommandMirror.js';
import { DetachedProcessInfo } from '../../terminal/browser/detachedTerminal.js';
import { IDetachedTerminalInstance, ITerminalService } from '../../terminal/browser/terminal.js';
import { DecorationSelector, getTerminalCommandDecorationState } from '../../terminal/browser/xterm/decorationStyles.js';
import type { ChatBackgroundShellOutput } from '../common/sessionChatPills.js';
import { getChatMarkdownRenderOptions } from './widget/chatContentMarkdownRenderer.js';
import './widget/chatContentParts/media/chatTerminalToolProgressPart.css';
import './media/sessionBackgroundShellOutput.css';

const enum BackgroundShellOutputViewConstants {
	/** Rows grow with the output up to the same limit as a chat terminal tool call's output. */
	MaxRows = 10,
	FallbackCols = 80,
}

/** Agent Host shell tool calls highlight their commands the same way. */
const commandLanguage = 'shellscript';

/** Hides the cursor, which would otherwise sit on the latest line of this read-only preview. */
const hideCursor = '\x1b[?25l';

function toTerminalText(text: string): string {
	return text.replace(/\r?\n/g, '\r\n');
}

/** Counts the terminal rows the end of the output fills at the given width, up to the limit. */
function countTrailingRows(text: string, cols: number, limit: number): number {
	let rows = 0;
	let end = text.length;
	while (rows < limit) {
		const start = end === 0 ? 0 : text.lastIndexOf('\n', end - 1) + 1;
		const visible = removeAnsiEscapeCodes(text.slice(start, end)).replaceAll('\r', '');
		rows += Math.max(1, Math.ceil(visible.length / cols));
		if (start === 0) {
			break;
		}
		end = start - 1;
	}
	return Math.min(rows, limit);
}

/**
 * A background shell's command and live output, presented like a chat
 * terminal tool call: the command with its status, above a small read-only
 * terminal that streams the output.
 */
export class BackgroundShellOutputView extends Disposable {
	readonly element: HTMLElement;
	private readonly _decoration: HTMLElement;
	private readonly _terminalContainer: HTMLElement;
	private readonly _emptyElement: HTMLElement;
	private _terminal: IDetachedTerminalInstance | undefined;
	/** The output written to the terminal, which withholds a trailing line break so no empty row follows the output. */
	private _displayed = '';
	private _cols: number = BackgroundShellOutputViewConstants.FallbackCols;
	private _size: { readonly cols: number; readonly rows: number } | undefined;

	constructor(
		command: string,
		private readonly _output: IObservable<ChatBackgroundShellOutput>,
		@ITerminalService terminalService: ITerminalService,
		@IMarkdownRendererService markdownRendererService: IMarkdownRendererService,
	) {
		super();
		const elements = h('.chat-terminal-content-part.chat-background-shell-output@root', [
			h('.chat-terminal-content-title.chat-terminal-content-title-no-bottom-radius', [
				h('.chat-terminal-command-block@commandBlock', [
					h('span.chat-terminal-command-decoration@decoration', { role: 'img' }),
				]),
			]),
			h('.chat-terminal-output-container.expanded@output', [
				h('.chat-terminal-output-body', [
					h('.chat-terminal-output-content', [
						h('.chat-terminal-output-terminal.chat-terminal-output-terminal-no-output@terminal'),
						h('.chat-terminal-output-empty@empty'),
					]),
				]),
			]),
		]);
		this.element = elements.root;
		this._decoration = elements.decoration;
		this._terminalContainer = elements.terminal;
		this._emptyElement = elements.empty;
		this._register(toDisposable(() => this.element.remove()));
		this._register(createPixelSpinner(this._decoration));
		const renderedCommand = this._register(markdownRendererService.render(new MarkdownString().appendCodeblock(commandLanguage, command), getChatMarkdownRenderOptions()));
		elements.commandBlock.appendChild(renderedCommand.element);
		elements.output.style.backgroundColor = asCssVariable(menuBackground);
		elements.output.setAttribute('aria-label', localize('backgroundShells.outputAria', "Output of {0}", command));

		const processInfo = this._register(new DetachedProcessInfo({ initialCwd: '' }));
		void terminalService.createDetachedTerminal({
			cols: BackgroundShellOutputViewConstants.FallbackCols,
			rows: 1,
			readonly: true,
			processInfo,
			disableOverviewRuler: true,
			colorProvider: { getBackgroundColor: theme => theme.getColor(menuBackground) },
		}).then(terminal => {
			if (this._store.isDisposed) {
				terminal.dispose();
				return;
			}
			this._terminal = this._register(terminal);
			terminal.attachToElement(this._terminalContainer, { enableGpu: false });
			terminal.xterm.write(hideCursor);
			// The details are laid out after they are built, so measure on the next frame.
			this._register(scheduleAtNextAnimationFrame(getWindow(this._terminalContainer), () => this._layout()));
			this._render(this._output.get());
		});
		this._register(autorun(reader => this._render(this._output.read(reader))));
	}

	private _render(output: ChatBackgroundShellOutput): void {
		this._renderStatus(output);
		const text = output.status === 'running' || output.status === 'exited' ? output.text : '';
		this._terminalContainer.classList.toggle('chat-terminal-output-terminal-no-output', !text);
		const empty = text ? '' : this._emptyText(output);
		if (this._emptyElement.textContent !== empty) {
			this._emptyElement.textContent = empty;
		}
		const terminal = this._terminal;
		if (!terminal) {
			return;
		}
		const displayed = text.replace(/\r?\n$/, '');
		if (displayed.startsWith(this._displayed)) {
			const unseen = displayed.slice(this._displayed.length);
			if (unseen) {
				terminal.xterm.write(toTerminalText(unseen));
			}
		} else {
			// Older output was trimmed or rewritten, so show the current transcript from the start.
			terminal.xterm.reset();
			terminal.xterm.write(hideCursor + toTerminalText(displayed));
		}
		this._displayed = displayed;
		this._layout();
	}

	private _layout(): void {
		const terminal = this._terminal;
		if (!terminal) {
			return;
		}
		const width = this._terminalContainer.clientWidth;
		if (width > 0) {
			this._cols = computeChatTerminalMirrorCols(width, terminal.xterm.getFont(), getWindow(this._terminalContainer).devicePixelRatio);
		}
		const cols = this._cols;
		const rows = this._displayed ? countTrailingRows(this._displayed, cols, BackgroundShellOutputViewConstants.MaxRows) : 1;
		if (this._size?.cols !== cols || this._size.rows !== rows) {
			this._size = { cols, rows };
			terminal.xterm.resize(cols, rows);
		}
	}

	private _renderStatus(output: ChatBackgroundShellOutput): void {
		const decoration = this._decoration;
		decoration.className = `chat-terminal-command-decoration ${DecorationSelector.CommandDecoration}`;
		let label: string;
		if (output.status === 'loading' || output.status === 'running') {
			decoration.classList.add('chat-terminal-running-spinner', DecorationSelector.DefaultColor, DecorationSelector.Default);
			label = localize('backgroundShells.running', "Running");
		} else {
			const exitCode = output.status === 'exited' ? output.exitCode : undefined;
			const state = getTerminalCommandDecorationState(undefined, exitCode === undefined ? undefined : { exitCode });
			decoration.classList.add(DecorationSelector.Codicon, ...state.classNames, ...ThemeIcon.asClassNameArray(state.icon));
			label = output.status === 'unavailable'
				? localize('backgroundShells.statusUnknown', "Status unknown")
				: exitCode === undefined
					? localize('backgroundShells.exited', "Exited")
					: localize('backgroundShells.exitedWithCode', "Exited with code {0}", exitCode);
		}
		decoration.setAttribute('aria-label', label);
	}

	private _emptyText(output: ChatBackgroundShellOutput): string {
		switch (output.status) {
			case 'loading':
				return localize('backgroundShells.loadingOutput', "Waiting for output...");
			case 'unavailable':
				return localize('backgroundShells.outputUnavailable', "Output unavailable: {0}", output.message);
			case 'exited':
				return localize('backgroundShells.noOutput', "No output.");
			case 'running':
				return localize('backgroundShells.noOutputYet', "No output yet.");
		}
	}
}
