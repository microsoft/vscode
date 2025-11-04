/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Orientation, Sash } from '../../../../base/browser/ui/sash/sash.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import { localize } from '../../../../nls.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
import product from '../../../../platform/product/common/product.js';
import { IQuickInputService, IQuickWidget } from '../../../../platform/quickinput/common/quickInput.js';
import { editorBackground, inputBackground, quickInputBackground, quickInputForeground } from '../../../../platform/theme/common/colorRegistry.js';
import { EDITOR_DRAG_AND_DROP_BACKGROUND } from '../../../common/theme.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { ChatModel, isCellTextEditOperationArray } from '../common/chatModel.js';
import { ChatMode } from '../common/chatModes.js';
import { IParsedChatRequest } from '../common/chatParserTypes.js';
import { IChatProgress, IChatService } from '../common/chatService.js';
import { ChatAgentLocation } from '../common/constants.js';
import { IQuickChatOpenOptions, IQuickChatService, showChatView } from './chat.js';
import { ChatWidget } from './chatWidget.js';

export class QuickChatService extends Disposable implements IQuickChatService {
	readonly _serviceBrand: undefined;

	private readonly _onDidClose = this._register(new Emitter<void>());
	get onDidClose() { return this._onDidClose.event; }

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
		return !!this.chatService.isEnabled(ChatAgentLocation.Chat);
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
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IViewsService private readonly viewsService: IViewsService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
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
				ChatAgentLocation.Chat,
				{ isQuickChat: true },
				{
					autoScroll: true,
					renderInputOnTop: true,
					renderStyle: 'compact',
					menus: { inputSideToolbar: MenuId.ChatInputSide, telemetrySource: 'chatQuick' },
					enableImplicitContext: true,
					defaultMode: ChatMode.Ask
				},
				{
					listForeground: quickInputForeground,
					listBackground: quickInputBackground,
					overlayBackground: EDITOR_DRAG_AND_DROP_BACKGROUND,
					inputEditorBackground: inputBackground,
					resultEditorBackground: editorBackground
				}));
		this.widget.render(parent);
		this.widget.setVisible(true);
		this.widget.setDynamicChatTreeItemLayout(2, this.maxHeight);
		this.updateModel();
		this.sash = this._register(new Sash(parent, { getHorizontalSashTop: () => parent.offsetHeight }, { orientation: Orientation.HORIZONTAL }));
		this.setupDisclaimer(parent);
		this.registerListeners(parent);
	}

	private setupDisclaimer(parent: HTMLElement): void {
		const disclaimerElement = dom.append(parent, dom.$('.disclaimer.hidden'));
		const disposables = this._store.add(new DisposableStore());

		this._register(autorun(reader => {
			disposables.clear();
			dom.reset(disclaimerElement);

			const sentiment = this.chatEntitlementService.sentimentObs.read(reader);
			const anonymous = this.chatEntitlementService.anonymousObs.read(reader);
			const requestInProgress = this.chatService.requestInProgressObs.read(reader);

			const showDisclaimer = !sentiment.installed && anonymous && !requestInProgress;
			disclaimerElement.classList.toggle('hidden', !showDisclaimer);

			if (showDisclaimer) {
				const renderedMarkdown = disposables.add(this.markdownRendererService.render(new MarkdownString(localize({ key: 'termsDisclaimer', comment: ['{Locked="]({2})"}', '{Locked="]({3})"}'] }, "By continuing with {0} Copilot, you agree to {1}'s [Terms]({2}) and [Privacy Statement]({3})", product.defaultChatAgent?.provider?.default?.name ?? '', product.defaultChatAgent?.provider?.default?.name ?? '', product.defaultChatAgent?.termsStatementUrl ?? '', product.defaultChatAgent?.privacyStatementUrl ?? ''), { isTrusted: true })));
				disclaimerElement.appendChild(renderedMarkdown.element);
			}
		}));
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
		const widget = await showChatView(this.viewsService, this.layoutService);
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
					} else if (item.kind === 'notebookEditGroup') {
						for (const group of item.edits) {
							if (isCellTextEditOperationArray(group)) {
								message.push({
									kind: 'textEdit',
									edits: group.map(e => e.edit),
									uri: group[0].uri
								});
							} else {
								message.push({
									kind: 'notebookEdit',
									edits: group,
									uri: item.uri
								});
							}
						}
					} else {
						message.push(item);
					}
				}

				this.chatService.addCompleteRequest(widget.viewModel.sessionResource,
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
		this.model ??= this.chatService.startSession(ChatAgentLocation.Chat, CancellationToken.None);
		if (!this.model) {
			throw new Error('Could not start chat session');
		}

		this.widget.setModel(this.model, { inputValue: this._currentQuery });
	}
}
