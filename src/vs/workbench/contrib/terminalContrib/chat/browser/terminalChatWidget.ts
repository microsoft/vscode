/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal as RawXtermTerminal } from '@xterm/xterm';
import { Dimension, getActiveWindow, IFocusTracker, trackFocus } from 'vs/base/browser/dom';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { MicrotaskDelay } from 'vs/base/common/symbols';
import 'vs/css!./media/terminalChatWidget';
import { localize } from 'vs/nls';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ChatAgentLocation } from 'vs/workbench/contrib/chat/common/chatAgents';
import { IChatProgress } from 'vs/workbench/contrib/chat/common/chatService';
import { InlineChatWidget } from 'vs/workbench/contrib/inlineChat/browser/inlineChatWidget';
import { ITerminalInstance, type IXtermTerminal } from 'vs/workbench/contrib/terminal/browser/terminal';
import { MENU_TERMINAL_CHAT_INPUT, MENU_TERMINAL_CHAT_WIDGET, MENU_TERMINAL_CHAT_WIDGET_FEEDBACK, MENU_TERMINAL_CHAT_WIDGET_STATUS, TerminalChatCommandId, TerminalChatContextKeys } from 'vs/workbench/contrib/terminalContrib/chat/browser/terminalChat';
import { TerminalStickyScrollContribution } from 'vs/workbench/contrib/terminalContrib/stickyScroll/browser/terminalStickyScrollContribution';

const enum Constants {
	HorizontalMargin = 10
}

export class TerminalChatWidget extends Disposable {

	private readonly _container: HTMLElement;

	private readonly _onDidHide = this._register(new Emitter<void>());
	readonly onDidHide = this._onDidHide.event;

	private readonly _inlineChatWidget: InlineChatWidget;
	public get inlineChatWidget(): InlineChatWidget { return this._inlineChatWidget; }

	private readonly _focusTracker: IFocusTracker;

	private readonly _focusedContextKey: IContextKey<boolean>;
	private readonly _visibleContextKey: IContextKey<boolean>;

	constructor(
		private readonly _terminalElement: HTMLElement,
		private readonly _instance: ITerminalInstance,
		private readonly _xterm: IXtermTerminal & { raw: RawXtermTerminal },
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService
	) {
		super();

		this._focusedContextKey = TerminalChatContextKeys.focused.bindTo(this._contextKeyService);
		this._visibleContextKey = TerminalChatContextKeys.visible.bindTo(this._contextKeyService);

		this._container = document.createElement('div');
		this._container.classList.add('terminal-inline-chat');
		_terminalElement.appendChild(this._container);

		this._inlineChatWidget = this._instantiationService.createInstance(
			InlineChatWidget,
			ChatAgentLocation.Terminal,
			{
				inputMenuId: MENU_TERMINAL_CHAT_INPUT,
				widgetMenuId: MENU_TERMINAL_CHAT_WIDGET,
				statusMenuId: {
					menu: MENU_TERMINAL_CHAT_WIDGET_STATUS,
					options: {
						buttonConfigProvider: action => {
							if (action.id === TerminalChatCommandId.ViewInChat || action.id === TerminalChatCommandId.RunCommand || action.id === TerminalChatCommandId.RunFirstCommand) {
								return { isSecondary: false };
							} else {
								return { isSecondary: true };
							}
						}
					}
				},
				feedbackMenuId: MENU_TERMINAL_CHAT_WIDGET_FEEDBACK,
				telemetrySource: 'terminal-inline-chat',
				rendererOptions: { editableCodeBlock: true }
			}
		);
		this._register(Event.any(
			this._inlineChatWidget.onDidChangeHeight,
			this._instance.onDimensionsChanged,
			Event.debounce(this._xterm.raw.onCursorMove, () => void 0, MicrotaskDelay),
		)(() => this._relayout()));

		const observer = new ResizeObserver(() => this._relayout());
		observer.observe(this._terminalElement);
		this._register(toDisposable(() => observer.disconnect()));

		this._reset();
		this._container.appendChild(this._inlineChatWidget.domNode);

		this._focusTracker = this._register(trackFocus(this._container));
		this._register(this._focusTracker.onDidBlur(() => {
			if (!this.inlineChatWidget.responseContent) {
				this.hide();
			}
		}));
		this.hide();
	}

	private _dimension?: Dimension;

	private _relayout() {
		if (this._dimension) {
			this._doLayout(this._inlineChatWidget.contentHeight);
		}
	}

	private _doLayout(heightInPixel: number) {
		const xtermElement = this._xterm.raw!.element;
		if (!xtermElement) {
			return;
		}
		const style = getActiveWindow().getComputedStyle(xtermElement);
		const xtermPadding = parseInt(style.paddingLeft) + parseInt(style.paddingRight);
		const width = Math.min(640, xtermElement.clientWidth - 12/* padding */ - 2/* border */ - Constants.HorizontalMargin - xtermPadding);
		const height = Math.min(480, heightInPixel, this._getTerminalWrapperHeight() ?? Number.MAX_SAFE_INTEGER);
		if (width === 0 || height === 0) {
			return;
		}
		this._container.style.paddingLeft = style.paddingLeft;
		this._dimension = new Dimension(width, height);
		this._inlineChatWidget.layout(this._dimension);

		this._updateVerticalPosition();
	}

	private _reset() {
		this._inlineChatWidget.placeholder = localize('default.placeholder', "Ask how to do something in the terminal");
		this._inlineChatWidget.updateInfo(localize('welcome.1', "AI-generated commands may be incorrect"));
	}

	reveal(): void {
		this._doLayout(this._inlineChatWidget.contentHeight);
		this._container.classList.remove('hide');
		this._focusedContextKey.set(true);
		this._visibleContextKey.set(true);
		this._inlineChatWidget.focus();
		this._instance.scrollToBottom();
	}

	private _updateVerticalPosition(): void {
		const font = this._instance.xterm?.getFont();
		if (!font?.charHeight) {
			return;
		}
		const terminalWrapperHeight = this._getTerminalWrapperHeight() ?? 0;
		const cellHeight = font.charHeight * font.lineHeight;
		const topPadding = terminalWrapperHeight - (this._instance.rows * cellHeight);
		const cursorY = (this._instance.xterm?.raw.buffer.active.cursorY ?? 0) + 1;
		const top = topPadding + cursorY * cellHeight;
		this._container.style.top = `${top}px`;
		const widgetHeight = this._inlineChatWidget.contentHeight;
		if (!terminalWrapperHeight) {
			return;
		}
		if (top > terminalWrapperHeight - widgetHeight) {
			this._setTerminalOffset(top - (terminalWrapperHeight - widgetHeight));
		} else {
			this._setTerminalOffset(undefined);
		}
	}

	private _getTerminalWrapperHeight(): number | undefined {
		return this._terminalElement.clientHeight;
	}

	hide(): void {
		this._container.classList.add('hide');
		this._reset();
		this._inlineChatWidget.updateChatMessage(undefined);
		this._inlineChatWidget.updateProgress(false);
		this._inlineChatWidget.updateToolbar(false);
		this._inlineChatWidget.reset();
		this._focusedContextKey.set(false);
		this._visibleContextKey.set(false);
		this._inlineChatWidget.value = '';
		this._instance.focus();
		this._setTerminalOffset(undefined);
		this._onDidHide.fire();
	}
	private _setTerminalOffset(offset: number | undefined) {
		if (offset === undefined || this._container.classList.contains('hide')) {
			this._terminalElement.style.position = '';
			this._terminalElement.style.bottom = '';
			TerminalStickyScrollContribution.get(this._instance)?.hideUnlock();
		} else {
			this._terminalElement.style.position = 'relative';
			this._terminalElement.style.bottom = `${offset}px`;
			TerminalStickyScrollContribution.get(this._instance)?.hideLock();
		}
	}
	focus(): void {
		this._inlineChatWidget.focus();
	}
	hasFocus(): boolean {
		return this._inlineChatWidget.hasFocus();
	}
	input(): string {
		return this._inlineChatWidget.value;
	}
	addToHistory(input: string): void {
		this._inlineChatWidget.addToHistory(input);
		this._inlineChatWidget.saveState();
		this._inlineChatWidget.value = input;
		this._inlineChatWidget.selectAll(true);
	}
	setValue(value?: string) {
		this._inlineChatWidget.value = value ?? '';
	}
	acceptCommand(code: string, shouldExecute: boolean): void {
		this._instance.runCommand(code, shouldExecute);
		this.hide();
	}

	updateProgress(progress?: IChatProgress): void {
		this._inlineChatWidget.updateProgress(progress?.kind === 'markdownContent');
	}
	public get focusTracker(): IFocusTracker {
		return this._focusTracker;
	}
}
