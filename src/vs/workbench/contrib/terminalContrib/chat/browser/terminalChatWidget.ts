/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal as RawXtermTerminal } from '@xterm/xterm';
import { Dimension, getActiveWindow, IFocusTracker, trackFocus } from '../../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { MicrotaskDelay } from '../../../../../base/common/symbols.js';
import './media/terminalChatWidget.css';
import { localize } from '../../../../../nls.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ChatAgentLocation, IChatAgentCommand, IChatAgentData } from '../../../chat/common/chatAgents.js';
import { InlineChatWidget } from '../../../inlineChat/browser/inlineChatWidget.js';
import { ITerminalInstance, type IXtermTerminal } from '../../../terminal/browser/terminal.js';
import { MENU_TERMINAL_CHAT_INPUT, MENU_TERMINAL_CHAT_WIDGET, MENU_TERMINAL_CHAT_WIDGET_STATUS, TerminalChatCommandId, TerminalChatContextKeys } from './terminalChat.js';
import { TerminalStickyScrollContribution } from '../../stickyScroll/browser/terminalStickyScrollContribution.js';
import { ChatTreeItem, IChatCodeBlockInfo, IChatFileTreeInfo, IChatWidget, IChatWidgetViewContext } from '../../../chat/browser/chat.js';
import { URI } from '../../../../../base/common/uri.js';
import { IChatWidgetContrib, IChatViewState } from '../../../chat/browser/chatWidget.js';
import { IChatRequestVariableEntry, IChatResponseModel } from '../../../chat/common/chatModel.js';
import { IChatResponseViewModel, IChatViewModel } from '../../../chat/common/chatViewModel.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { IParsedChatRequest } from '../../../chat/common/chatParserTypes.js';
import { MENU_INLINE_CHAT_WIDGET_SECONDARY } from '../../../inlineChat/common/inlineChat.js';

const enum Constants {
	HorizontalMargin = 10,
	VerticalMargin = 30
}

export class TerminalChatWidget extends Disposable implements IChatWidget {

	private readonly _container: HTMLElement;

	private readonly _onDidHide = this._register(new Emitter<void>());
	readonly onDidHide = this._onDidHide.event;

	private readonly _inlineChatWidget: InlineChatWidget;
	public get inlineChatWidget(): InlineChatWidget { return this._inlineChatWidget; }

	private readonly _focusTracker: IFocusTracker;

	private readonly _focusedContextKey: IContextKey<boolean>;
	private readonly _visibleContextKey: IContextKey<boolean>;

	onDidChangeViewModel!: Event<void>;
	onDidAcceptInput!: Event<void>;
	onDidSubmitAgent!: Event<{ agent: IChatAgentData; slashCommand?: IChatAgentCommand }>;
	onDidChangeAgent!: Event<{ agent: IChatAgentData; slashCommand?: IChatAgentCommand }>;
	onDidChangeParsedInput!: Event<void>;
	onDidChangeContext!: Event<{ removed?: IChatRequestVariableEntry[]; added?: IChatRequestVariableEntry[] }>;
	location!: ChatAgentLocation;
	viewContext!: IChatWidgetViewContext;
	viewModel: IChatViewModel | undefined;
	inputEditor!: ICodeEditor;
	supportsFileReferences!: boolean;
	parsedInput!: IParsedChatRequest;
	lastSelectedAgent: IChatAgentData | undefined;
	scopedContextKeyService!: IContextKeyService;

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
			{
				location: ChatAgentLocation.Terminal,
				resolveData: () => {
					// TODO@meganrogge return something that identifies this terminal
					return undefined;
				}
			},
			{
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
				secondaryMenuId: MENU_INLINE_CHAT_WIDGET_SECONDARY,
				chatWidgetViewOptions: {
					rendererOptions: { editableCodeBlock: true },
					menus: {
						telemetrySource: 'terminal-inline-chat',
						executeToolbar: MENU_TERMINAL_CHAT_INPUT,
						inputSideToolbar: MENU_TERMINAL_CHAT_WIDGET,
					}
				}
			}
		);
		this._register(Event.any(
			this._inlineChatWidget.onDidChangeHeight,
			this._instance.onDimensionsChanged,
			this._inlineChatWidget.chatWidget.onDidChangeContentHeight,
			Event.debounce(this._xterm.raw.onCursorMove, () => void 0, MicrotaskDelay),
		)(() => this._relayout()));

		const observer = new ResizeObserver(() => this._relayout());
		observer.observe(this._terminalElement);
		this._register(toDisposable(() => observer.disconnect()));

		this._reset();
		this._container.appendChild(this._inlineChatWidget.domNode);

		this._focusTracker = this._register(trackFocus(this._container));
		this._register(this._focusTracker.onDidFocus(() => this._focusedContextKey.set(true)));
		this._register(this._focusTracker.onDidBlur(() => {
			this._focusedContextKey.set(false);
			if (!this.inlineChatWidget.responseContent) {
				this.hide();
			}
		}));

		this.hide();
		this.onDidChangeViewModel = this.inlineChatWidget.chatWidget.onDidChangeViewModel;
		this.onDidAcceptInput = this.inlineChatWidget.chatWidget.onDidAcceptInput;
		this.onDidSubmitAgent = this.inlineChatWidget.chatWidget.onDidSubmitAgent;
		this.onDidChangeAgent = this.inlineChatWidget.chatWidget.onDidChangeAgent;
		this.onDidChangeParsedInput = this.inlineChatWidget.chatWidget.onDidChangeParsedInput;
		this.onDidChangeContext = this.inlineChatWidget.chatWidget.onDidChangeContext;
		this.location = this.inlineChatWidget.chatWidget.location;
		this.viewContext = this.inlineChatWidget.chatWidget.viewContext;
		this.viewModel = this.inlineChatWidget.chatWidget.viewModel;
		this.inputEditor = this.inlineChatWidget.chatWidget.inputEditor;
		this.supportsFileReferences = this.inlineChatWidget.chatWidget.supportsFileReferences;
		this.parsedInput = this.inlineChatWidget.chatWidget.parsedInput;
		this.scopedContextKeyService = this.inlineChatWidget.chatWidget.scopedContextKeyService;
	}

	getContrib<T extends IChatWidgetContrib>(id: string): T | undefined {
		return this.inlineChatWidget.chatWidget.getContrib(id);
	}
	getSibling(item: ChatTreeItem, type: 'next' | 'previous'): ChatTreeItem | undefined {
		return this.inlineChatWidget.chatWidget.getSibling(item, type);
	}
	getFocus(): ChatTreeItem | undefined {
		return this.inlineChatWidget.chatWidget.getFocus();
	}
	setInput(query?: string): void {
		this.inlineChatWidget.chatWidget.setInput(query);
	}
	getInput(): string {
		return this.inlineChatWidget.chatWidget.getInput();
	}
	logInputHistory(): void {
		this.inlineChatWidget.chatWidget.logInputHistory();
	}
	acceptInput(query?: string, isVoiceInput?: boolean): Promise<IChatResponseModel | undefined> {
		return this.inlineChatWidget.chatWidget.acceptInput(query, isVoiceInput);
	}
	acceptInputWithPrefix(prefix: string): void {
		this.inlineChatWidget.chatWidget.acceptInputWithPrefix(prefix);
	}
	setInputPlaceholder(placeholder: string): void {
		this.inlineChatWidget.chatWidget.setInputPlaceholder(placeholder);
	}
	resetInputPlaceholder(): void {
		this.inlineChatWidget.chatWidget.resetInputPlaceholder();
	}
	focusLastMessage(): void {
		this.inlineChatWidget.chatWidget.focusLastMessage();
	}
	focusInput(): void {
		this.inlineChatWidget.chatWidget.focusInput();
	}
	hasInputFocus(): boolean {
		return this.inlineChatWidget.chatWidget.hasInputFocus();
	}
	getCodeBlockInfoForEditor(uri: URI): IChatCodeBlockInfo | undefined {
		return this.inlineChatWidget.chatWidget.getCodeBlockInfoForEditor(uri);
	}
	getCodeBlockInfosForResponse(response: IChatResponseViewModel): IChatCodeBlockInfo[] {
		return this.inlineChatWidget.chatWidget.getCodeBlockInfosForResponse(response);
	}
	getFileTreeInfosForResponse(response: IChatResponseViewModel): IChatFileTreeInfo[] {
		return this.inlineChatWidget.chatWidget.getFileTreeInfosForResponse(response);
	}
	getLastFocusedFileTreeForResponse(response: IChatResponseViewModel): IChatFileTreeInfo | undefined {
		return this.inlineChatWidget.chatWidget.getLastFocusedFileTreeForResponse(response);
	}
	setContext(overwrite: boolean, ...context: IChatRequestVariableEntry[]): void {
		this.inlineChatWidget.chatWidget.setContext(overwrite, ...context);
	}
	clear(): void {
		this.inlineChatWidget.chatWidget.clear();
	}
	getViewState(): IChatViewState {
		return this.inlineChatWidget.chatWidget.getViewState();
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
		const terminalWrapperHeight = this._getTerminalWrapperHeight() ?? Number.MAX_SAFE_INTEGER;
		let height = Math.min(480, heightInPixel, terminalWrapperHeight);
		const top = this._getTop() ?? 0;
		if (width === 0 || height === 0) {
			return;
		}

		let adjustedHeight = undefined;
		if (height < this._inlineChatWidget.contentHeight) {
			if (height - top > 0) {
				height = height - top - Constants.VerticalMargin;
			} else {
				height = height - Constants.VerticalMargin;
				adjustedHeight = height;
			}
		}
		this._container.style.paddingLeft = style.paddingLeft;
		this._dimension = new Dimension(width, height);
		this._inlineChatWidget.layout(this._dimension);
		this._updateVerticalPosition(adjustedHeight);
	}

	private _reset() {
		this._inlineChatWidget.placeholder = localize('default.placeholder', "Ask how to do something in the terminal");
		this._inlineChatWidget.updateInfo(localize('welcome.1', "AI-generated commands may be incorrect"));
	}

	reveal(): void {
		this._doLayout(this._inlineChatWidget.contentHeight);
		this._container.classList.remove('hide');
		this._visibleContextKey.set(true);
		this._inlineChatWidget.focus();
		this._instance.scrollToBottom();
	}

	private _getTop(): number | undefined {
		const font = this._instance.xterm?.getFont();
		if (!font?.charHeight) {
			return;
		}
		const terminalWrapperHeight = this._getTerminalWrapperHeight() ?? 0;
		const cellHeight = font.charHeight * font.lineHeight;
		const topPadding = terminalWrapperHeight - (this._instance.rows * cellHeight);
		const cursorY = (this._instance.xterm?.raw.buffer.active.cursorY ?? 0) + 1;
		return topPadding + cursorY * cellHeight;
	}

	private _updateVerticalPosition(adjustedHeight?: number): void {
		const top = this._getTop();
		if (!top) {
			return;
		}
		this._container.style.top = `${top}px`;
		const widgetHeight = this._inlineChatWidget.contentHeight;
		const terminalWrapperHeight = this._getTerminalWrapperHeight();
		if (!terminalWrapperHeight) {
			return;
		}
		if (top > terminalWrapperHeight - widgetHeight && terminalWrapperHeight - widgetHeight > 0) {
			this._setTerminalOffset(top - (terminalWrapperHeight - widgetHeight));
		} else if (adjustedHeight) {
			this._setTerminalOffset(adjustedHeight);
		} else {
			this._setTerminalOffset(undefined);
		}
	}

	private _getTerminalWrapperHeight(): number | undefined {
		return this._terminalElement.clientHeight;
	}

	hide(): void {
		this._container.classList.add('hide');
		this._inlineChatWidget.reset();
		this._reset();
		this._inlineChatWidget.updateToolbar(false);
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
	setValue(value?: string) {
		this._inlineChatWidget.value = value ?? '';
	}
	acceptCommand(code: string, shouldExecute: boolean): void {
		this._instance.runCommand(code, shouldExecute);
		this.hide();
	}
	public get focusTracker(): IFocusTracker {
		return this._focusTracker;
	}
}
