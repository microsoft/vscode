/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { setTimeout0 } from 'vs/base/common/platform';
import { ThemeIcon } from 'vs/base/common/themables';
import { localize } from 'vs/nls';
import { IContextKeyService, IScopedContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IQuickInputService, IQuickPick, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { editorForeground, editorBackground } from 'vs/platform/theme/common/colorRegistry';
import { SIDE_BAR_BACKGROUND } from 'vs/workbench/common/theme';
import { AskQuickQuestionAction, IQuickQuestionMode, QuickQuestionMode } from 'vs/workbench/contrib/chat/browser/actions/quickQuestionActions/quickQuestionAction';
import { IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { IChatViewOptions } from 'vs/workbench/contrib/chat/browser/chatViewPane';
import { ChatWidget } from 'vs/workbench/contrib/chat/browser/chatWidget';
import { ChatModel } from 'vs/workbench/contrib/chat/common/chatModel';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';

class BaseChatQuickQuestionMode implements IQuickQuestionMode {
	private _currentTimer: any | undefined;
	private _input: IQuickPick<IQuickPickItem> | undefined;
	private _currentChat: QuickChat | undefined;

	constructor(
		private readonly renderInputOnTop: boolean
	) { }

	run(accessor: ServicesAccessor, query: string): void {
		const quickInputService = accessor.get(IQuickInputService);
		const chatService = accessor.get(IChatService);
		const instantiationService = accessor.get(IInstantiationService);

		// First things first, clear the existing timer that will dispose the session
		clearTimeout(this._currentTimer);
		this._currentTimer = undefined;

		// If the input is already shown, hide it. This provides a toggle behavior of the quick pick
		if (this._input !== undefined) {
			this._input.hide();
			return;
		}

		// Check if any providers are available. If not, show nothing
		// This shouldn't be needed because of the precondition, but just in case
		const providerInfo = chatService.getProviderInfos()[0];
		if (!providerInfo) {
			return;
		}

		const disposableStore = new DisposableStore();

		//#region Setup quick pick

		this._input = quickInputService.createQuickPick();
		disposableStore.add(this._input);
		this._input.hideInput = true;


		const containerList = dom.$('.interactive-list');
		const containerSession = dom.$('.interactive-session', undefined, containerList);
		containerList.style.position = 'relative';
		this._input.widget = containerSession;

		const clearButton = {
			iconClass: ThemeIcon.asClassName(Codicon.clearAll),
			tooltip: localize('clear', "Clear"),
		};
		this._input.buttons = [
			clearButton,
			{
				iconClass: ThemeIcon.asClassName(Codicon.commentDiscussion),
				tooltip: localize('openInChat', "Open in chat view"),
			}
		];
		this._input.title = providerInfo.displayName;

		disposableStore.add(this._input.onDidHide(() => {
			disposableStore.dispose();
			this._input = undefined;
			this._currentTimer = setTimeout(() => {
				this._currentChat?.dispose();
				this._currentChat = undefined;
			}, 1000 * 30); // 30 seconds
		}));

		//#endregion

		this._currentChat ??= instantiationService.createInstance(QuickChat, {
			providerId: providerInfo.id,
			renderInputOnTop: this.renderInputOnTop,
		});
		this._currentChat.render(containerSession);

		disposableStore.add(this._input.onDidAccept(() => {
			this._currentChat?.acceptInput();
		}));

		disposableStore.add(this._input.onDidTriggerButton((e) => {
			if (e === clearButton) {
				this._currentChat?.clear();
			} else {
				this._currentChat?.openChatView();
			}
		}));

		this._input.show();
		this._currentChat.layout();
		this._currentChat.focus();

		if (query) {
			this._currentChat.setValue(query);
			this._currentChat.acceptInput();
		}
	}
}

class ModelData extends Disposable {
	addDisposable(disposable: IDisposable) {
		this._register(disposable);
	}

	constructor(readonly model: ChatModel) {
		super();
		this._register(model);
	}

}

class QuickChat extends Disposable {
	private widget!: ChatWidget;
	private modelData: ModelData | undefined;
	private _currentQuery: string | undefined;

	private _scopedContextKeyService!: IScopedContextKeyService;
	get scopedContextKeyService() {
		return this._scopedContextKeyService;
	}

	private _currentParentElement?: HTMLElement;

	constructor(
		private readonly chatViewOptions: IChatViewOptions & { renderInputOnTop: boolean },
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IChatService private readonly chatService: IChatService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService
	) {
		super();
	}

	clear() {
		this.modelData?.dispose();
		this.modelData = undefined;
		this.updateModel();
		this.widget.inputEditor.setValue('');
	}

	focus(): void {
		if (this.widget) {
			this.widget.focusInput();
		}
	}

	render(parent: HTMLElement): void {
		this.widget?.dispose();
		this._currentParentElement = parent;
		this._scopedContextKeyService = this._register(this.contextKeyService.createScoped(parent));
		const scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService]));
		this.widget = this._register(
			scopedInstantiationService.createInstance(
				ChatWidget,
				{ resource: true, renderInputOnTop: this.chatViewOptions.renderInputOnTop },
				{
					listForeground: editorForeground,
					listBackground: editorBackground,
					inputEditorBackground: SIDE_BAR_BACKGROUND,
					resultEditorBackground: SIDE_BAR_BACKGROUND
				}));
		this.widget.render(parent);
		this.widget.setVisible(true);
		this.updateModel();
		if (this._currentQuery) {
			this.widget.inputEditor.setSelection({
				startLineNumber: 1,
				startColumn: 1,
				endLineNumber: 1,
				endColumn: this._currentQuery.length + 1
			});
		}

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(dom.addDisposableListener(parent, dom.EventType.RESIZE, () => this.layout()));
		this._register(this.widget.inputEditor.onDidChangeModelContent((e) => {
			this._currentQuery = this.widget.inputEditor.getValue();
		}));
	}

	async acceptInput(): Promise<void> {
		if (this.widget.inputEditor.getValue().trim() === '/clear') {
			this.clear();
		} else {
			await this.widget.acceptInput();
		}
	}

	async openChatView(): Promise<void> {
		const widget = await this._chatWidgetService.revealViewForProvider(this.chatViewOptions.providerId);
		if (!widget?.viewModel || !this.modelData) {
			return;
		}

		for (const request of this.modelData.model.getRequests()) {
			if (request.response?.response.value || request.response?.errorDetails) {
				this.chatService.addCompleteRequest(widget.viewModel.sessionId,
					request.message as string,
					{
						message: request.response.response.value,
						errorDetails: request.response.errorDetails
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

	setValue(value: string): void {
		this.widget.inputEditor.setValue(value);
	}

	layout(): void {
		if (this._currentParentElement) {
			this.widget.layout(500, this._currentParentElement.offsetWidth);
			// adjust height
			if (this.chatViewOptions.renderInputOnTop) {
				const offsetWidth = this._currentParentElement.offsetWidth;
				// Needed to allow the widget to first be rendered so that the height of the container can be calculated
				setTimeout0(() => {
					const inputPartHeight = this.widget.inputPart.layout(500, offsetWidth);
					const items = this.widget.viewModel?.getItems() ?? [];
					switch (items.length) {
						case 0:
							this.widget.layout(inputPartHeight, offsetWidth);
							break;
						case 1: {
							const listHeight = items[0].currentRenderedHeight ?? 500 - inputPartHeight;
							this.widget.layout(listHeight + inputPartHeight, offsetWidth);
							break;
						}
						default:
							// the list has already been laid out to the hard coded value at this point
							break;
					}
				});
			}
		}
	}

	private updateModel(): void {
		if (this.modelData) {
			return this.widget.setModel(this.modelData.model, { inputValue: this._currentQuery });
		}

		const model = this.chatService.startSession(this.chatViewOptions.providerId, CancellationToken.None);
		if (!model) {
			throw new Error('Could not start chat session');
		}

		this.modelData = new ModelData(model);
		this.registerModelListeners();
		this.widget.setModel(model, { inputValue: this._currentQuery });
	}

	private registerModelListeners(): void {
		this.modelData?.addDisposable(this.modelData!.model.onDidChange(() => this.layout()));
	}
}

AskQuickQuestionAction.registerMode(
	QuickQuestionMode.InputOnTopChat,
	class InputOnTopChatQuickQuestionMode extends BaseChatQuickQuestionMode {
		constructor() {
			super(true);
		}
	}
);

AskQuickQuestionAction.registerMode(
	QuickQuestionMode.InputOnBottomChat,
	class InputOnBottomChatQuickQuestionMode extends BaseChatQuickQuestionMode {
		constructor() {
			super(false);
		}
	}
);
