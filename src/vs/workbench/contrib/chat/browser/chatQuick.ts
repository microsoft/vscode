/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Orientation, Sash } from 'vs/base/browser/ui/sash/sash';
import { disposableTimeout } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { Selection } from 'vs/editor/common/core/selection';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { ILayoutService } from 'vs/platform/layout/browser/layoutService';
import { IQuickInputService, IQuickWidget } from 'vs/platform/quickinput/common/quickInput';
import { editorBackground, inputBackground, quickInputBackground, quickInputForeground } from 'vs/platform/theme/common/colorRegistry';
import { IQuickChatOpenOptions, IQuickChatService, showChatView } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatWidget } from 'vs/workbench/contrib/chat/browser/chatWidget';
import { ChatAgentLocation } from 'vs/workbench/contrib/chat/common/chatAgents';
import { ChatModel } from 'vs/workbench/contrib/chat/common/chatModel';
import { IParsedChatRequest } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { IChatProgress, IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';

export class QuickChatService extends Disposable implements IQuickChatService {
	readonly _serviceBrand: undefined;

	private readonly _onDidClose = this._register(new Emitter<void>());
	readonly onDidClose = this._onDidClose.event;

	private _input: IQuickWidget | undefined;
	// TODO@TylerLeonhardt: support multiple chat providers eventually
	private _currentChat: QuickChat | undefined;
	private _container: HTMLElement | undefined;

	constructor(
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IChatService private readonly chatService: IChatService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
	}

	get enabled(): boolean {
		return !!this.chatService.isEnabled(ChatAgentLocation.Panel);
	}

	get focused(): boolean {
		const widget = this._input?.widget as HTMLElement | undefined;
		if (!widget) {
			return false;
		}
		return dom.isAncestorOfActiveElement(widget);
	}

	toggle(options?: IQuickChatOpenOptions): void {
		// If the input is already shown, hide it. This provides a toggle behavior of the quick
		// pick. This should not happen when there is a query.
		if (this.focused && !options?.query) {
			this.close();
		} else {
			this.open(options);
			// If this is a partial query, the value should be cleared when closed as otherwise it
			// would remain for the next time the quick chat is opened in any context.
			if (options?.isPartialQuery) {
				const disposable = this._store.add(Event.once(this.onDidClose)(() => {
					this._currentChat?.clearValue();
					this._store.delete(disposable);
				}));
			}
		}
	}

	open(options?: IQuickChatOpenOptions): void {
		if (this._input) {
			if (this._currentChat && options?.query) {
				this._currentChat.focus();
				this._currentChat.setValue(options.query, options.selection);
				if (!options.isPartialQuery) {
					this._currentChat.acceptInput();
				}
				return;
			}
			return this.focus();
		}

		const disposableStore = new DisposableStore();

		this._input = this.quickInputService.createQuickWidget();
		this._input.contextKey = 'chatInputVisible';
		this._input.ignoreFocusOut = true;
		disposableStore.add(this._input);

		this._container ??= dom.$('.interactive-session');
		this._input.widget = this._container;

		this._input.show();
		if (!this._currentChat) {
			this._currentChat = this.instantiationService.createInstance(QuickChat);

			// show needs to come after the quickpick is shown
			this._currentChat.render(this._container);
		} else {
			this._currentChat.show();
		}

		disposableStore.add(this._input.onDidHide(() => {
			disposableStore.dispose();
			this._currentChat!.hide();
			this._input = undefined;
			this._onDidClose.fire();
		}));

		this._currentChat.focus();

		if (options?.query) {
			this._currentChat.setValue(options.query, options.selection);
			if (!options.isPartialQuery) {
				this._currentChat.acceptInput();
			}
		}
	}
	focus(): void {
		this._currentChat?.focus();
	}
	close(): void {
		this._input?.dispose();
		this._input = undefined;
	}
	async openInChatView(): Promise<void> {
		await this._currentChat?.openChatView();
		this.close();
	}
}

class QuickChat extends Disposable {
	// TODO@TylerLeonhardt: be responsive to window size
	static DEFAULT_MIN_HEIGHT = 200;
	private static readonly DEFAULT_HEIGHT_OFFSET = 100;

	private widget!: ChatWidget;
	private sash!: Sash;
	private model: ChatModel | undefined;
	private _currentQuery: string | undefined;
	private readonly maintainScrollTimer: MutableDisposable<IDisposable> = this._register(new MutableDisposable<IDisposable>());
	private _deferUpdatingDynamicLayout: boolean = false;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IChatService private readonly chatService: IChatService,
		@ILayoutService private readonly layoutService: ILayoutService,
		@IViewsService private readonly viewsService: IViewsService,
	) {
		super();
	}

	clear() {
		this.model?.dispose();
		this.model = undefined;
		this.updateModel();
		this.widget.inputEditor.setValue('');
	}

	focus(selection?: Selection): void {
		if (this.widget) {
			this.widget.focusInput();
			const value = this.widget.inputEditor.getValue();
			if (value) {
				this.widget.inputEditor.setSelection(selection ?? {
					startLineNumber: 1,
					startColumn: 1,
					endLineNumber: 1,
					endColumn: value.length + 1
				});
			}
		}
	}

	hide(): void {
		this.widget.setVisible(false);
		// Maintain scroll position for a short time so that if the user re-shows the chat
		// the same scroll position will be used.
		this.maintainScrollTimer.value = disposableTimeout(() => {
			// At this point, clear this mutable disposable which will be our signal that
			// the timer has expired and we should stop maintaining scroll position
			this.maintainScrollTimer.clear();
		}, 30 * 1000); // 30 seconds
	}

	show(): void {
		this.widget.setVisible(true);
		// If the mutable disposable is set, then we are keeping the existing scroll position
		// so we should not update the layout.
		if (this._deferUpdatingDynamicLayout) {
			this._deferUpdatingDynamicLayout = false;
			this.widget.updateDynamicChatTreeItemLayout(2, this.maxHeight);
		}
		if (!this.maintainScrollTimer.value) {
			this.widget.layoutDynamicChatTreeItemMode();
		}
	}

	render(parent: HTMLElement): void {
		if (this.widget) {
			// NOTE: if this changes, we need to make sure disposables in this function are tracked differently.
			throw new Error('Cannot render quick chat twice');
		}
		const scopedInstantiationService = this._register(this.instantiationService.createChild(
			new ServiceCollection([
				IContextKeyService,
				this._register(this.contextKeyService.createScoped(parent))
			])
		));
		this.widget = this._register(
			scopedInstantiationService.createInstance(
				ChatWidget,
				ChatAgentLocation.Panel,
				{ isQuickChat: true },
				{ renderInputOnTop: true, renderStyle: 'compact', menus: { inputSideToolbar: MenuId.ChatInputSide } },
				{
					listForeground: quickInputForeground,
					listBackground: quickInputBackground,
					inputEditorBackground: inputBackground,
					resultEditorBackground: editorBackground
				}));
		this.widget.render(parent);
		this.widget.setVisible(true);
		this.widget.setDynamicChatTreeItemLayout(2, this.maxHeight);
		this.updateModel();
		this.sash = this._register(new Sash(parent, { getHorizontalSashTop: () => parent.offsetHeight }, { orientation: Orientation.HORIZONTAL }));
		this.registerListeners(parent);
	}

	private get maxHeight(): number {
		return this.layoutService.mainContainerDimension.height - QuickChat.DEFAULT_HEIGHT_OFFSET;
	}

	private registerListeners(parent: HTMLElement): void {
		this._register(this.layoutService.onDidLayoutMainContainer(() => {
			if (this.widget.visible) {
				this.widget.updateDynamicChatTreeItemLayout(2, this.maxHeight);
			} else {
				// If the chat is not visible, then we should defer updating the layout
				// because it relies on offsetHeight which only works correctly
				// when the chat is visible.
				this._deferUpdatingDynamicLayout = true;
			}
		}));
		this._register(this.widget.inputEditor.onDidChangeModelContent((e) => {
			this._currentQuery = this.widget.inputEditor.getValue();
		}));
		this._register(this.widget.onDidClear(() => this.clear()));
		this._register(this.widget.onDidChangeHeight((e) => this.sash.layout()));
		const width = parent.offsetWidth;
		this._register(this.sash.onDidStart(() => {
			this.widget.isDynamicChatTreeItemLayoutEnabled = false;
		}));
		this._register(this.sash.onDidChange((e) => {
			if (e.currentY < QuickChat.DEFAULT_MIN_HEIGHT || e.currentY > this.maxHeight) {
				return;
			}
			this.widget.layout(e.currentY, width);
			this.sash.layout();
		}));
		this._register(this.sash.onDidReset(() => {
			this.widget.isDynamicChatTreeItemLayoutEnabled = true;
			this.widget.layoutDynamicChatTreeItemMode();
		}));
	}

	async acceptInput() {
		return this.widget.acceptInput();
	}

	async openChatView(): Promise<void> {
		const widget = await showChatView(this.viewsService);
		if (!widget?.viewModel || !this.model) {
			return;
		}

		for (const request of this.model.getRequests()) {
			if (request.response?.response.value || request.response?.result) {


				const message: IChatProgress[] = [];
				for (const item of request.response.response.value) {
					if (item.kind === 'textEditGroup') {
						for (const group of item.edits) {
							message.push({
								kind: 'textEdit',
								edits: group,
								uri: item.uri
							});
						}
					} else {
						message.push(item);
					}
				}

				this.chatService.addCompleteRequest(widget.viewModel.sessionId,
					request.message as IParsedChatRequest,
					request.variableData,
					request.attempt,
					{
						message,
						result: request.response.result,
						followups: request.response.followups
					});
			} else if (request.message) {

			}
		}

		const value = this.widget.inputEditor.getValue();
		if (value) {
			widget.inputEditor.setValue(value);
		}
		widget.focusInput();
	}

	setValue(value: string, selection?: Selection): void {
		this.widget.inputEditor.setValue(value);
		this.focus(selection);
	}

	clearValue(): void {
		this.widget.inputEditor.setValue('');
	}

	private updateModel(): void {
		this.model ??= this.chatService.startSession(ChatAgentLocation.Panel, CancellationToken.None);
		if (!this.model) {
			throw new Error('Could not start chat session');
		}

		this.widget.setModel(this.model, { inputValue: this._currentQuery });
	}
}
