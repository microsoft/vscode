/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/base/common/themables';
import { localize } from 'vs/nls';
import { IScopedContextKeyService, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { DefaultQuickAccessFilterValue, Extensions, IQuickAccessProvider, IQuickAccessProviderRunOptions, IQuickAccessRegistry } from 'vs/platform/quickinput/common/quickAccess';
import { IQuickPick, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { Registry } from 'vs/platform/registry/common/platform';
import { editorForeground, editorBackground, inputBackground } from 'vs/platform/theme/common/colorRegistry';
import { ASK_QUICK_QUESTION_ACTION_ID } from 'vs/workbench/contrib/chat/browser/actions/chatQuickInputActions';
import { IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { IChatViewOptions } from 'vs/workbench/contrib/chat/browser/chatViewPane';
import { ChatWidget } from 'vs/workbench/contrib/chat/browser/chatWidget';
import { ChatModel } from 'vs/workbench/contrib/chat/common/chatModel';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';

export interface ChatQuickAccessProviderOptions extends IQuickAccessProviderRunOptions {
	providerId?: string;
}

export class ChatQuickAccessProvider implements IQuickAccessProvider {
	static PREFIX = 'chat ';

	defaultFilterValue?: string | DefaultQuickAccessFilterValue | undefined;

	_currentTimer: any | undefined;
	_input: IQuickPick<IQuickPickItem> | undefined;
	_currentChat: QuickChat | undefined;

	constructor(
		@IChatService private readonly chatService: IChatService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) { }

	provide(picker: IQuickPick<IQuickPickItem>, token: CancellationToken, options?: ChatQuickAccessProviderOptions | undefined): IDisposable {
		// First things first, clear the existing timer that will dispose the session
		clearTimeout(this._currentTimer);
		this._currentTimer = undefined;

		// If the input is already shown, hide it. This provides a toggle behavior of the quick pick
		if (this._input !== undefined) {
			this._input.hide();
			return Disposable.None;
		}

		// Check if any providers are available. If not, show nothing
		// This shouldn't be needed because of the precondition, but just in case
		const providerInfo = options?.providerId
			? this.chatService.getProviderInfos().find(p => p.id === options.providerId)
			: this.chatService.getProviderInfos()[0];
		if (!providerInfo) {
			return Disposable.None;
		}

		const disposableStore = new DisposableStore();

		//#region Setup quick pick

		this._input = picker;
		disposableStore.add(this._input);
		this._input.hideInput = true;


		const containerSession = dom.$('.interactive-session');
		this._input.widget = containerSession;

		this._currentChat ??= this.instantiationService.createInstance(QuickChat, {
			providerId: providerInfo.id,
		});
		// show needs to come before the current chat rendering
		this._input.show();
		this._currentChat.render(containerSession);

		const clearButton = {
			iconClass: ThemeIcon.asClassName(Codicon.clearAll),
			tooltip: localize('clear', "Clear"),
		};
		// this._input.buttons = [
		// 	clearButton,
		// 	{
		// 		iconClass: ThemeIcon.asClassName(Codicon.commentDiscussion),
		// 		tooltip: localize('openInChat', "Open In Chat View"),
		// 	}
		// ];
		// this._input.title = providerInfo.displayName;

		// disposableStore.add(this._input.onDidHide(() => {
		// 	disposableStore.dispose();
		// 	this._input = undefined;
		// 	this._currentTimer = setTimeout(() => {
		// 		this._currentChat?.dispose();
		// 		this._currentChat = undefined;
		// 	}, 1000 * 30); // 30 seconds
		// }));

		disposableStore.add(this._input.onDidTriggerButton((e) => {
			if (e === clearButton) {
				this._currentChat?.clear();
			} else {
				this._currentChat?.openChatView();
			}
		}));

		//#endregion

		this._currentChat.focus();

		const query = picker.value.substring(ChatQuickAccessProvider.PREFIX.length).trim();
		if (query) {
			this._currentChat.setValue(query);
			this._currentChat.acceptInput();
		}

		return toDisposable(() => {
			disposableStore.dispose();
			this._input = undefined;
			this._currentTimer = setTimeout(() => {
				this._currentChat?.dispose();
				this._currentChat = undefined;
			}, 1000 * 30); // 30 seconds
		});
	}

}

const quickAccessRegistry = Registry.as<IQuickAccessRegistry>(Extensions.Quickaccess);

quickAccessRegistry.registerQuickAccessProvider({
	ctor: ChatQuickAccessProvider,
	prefix: ChatQuickAccessProvider.PREFIX,
	placeholder: localize('helpQuickAccessPlaceholder', "Type '{0}' to enter a Quick Chat session.", ChatQuickAccessProvider.PREFIX),
	helpEntries: [{ description: localize('helpQuickAccess', "Start a Quick Chat"), commandId: ASK_QUICK_QUESTION_ACTION_ID }],
	contextKey: 'inQuickChat',
});

class QuickChat extends Disposable {
	private widget!: ChatWidget;
	private model: ChatModel | undefined;
	private _currentQuery: string | undefined;

	private _scopedContextKeyService!: IScopedContextKeyService;
	get scopedContextKeyService() {
		return this._scopedContextKeyService;
	}

	constructor(
		private readonly _options: IChatViewOptions,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IChatService private readonly chatService: IChatService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService
	) {
		super();
	}

	clear() {
		this.model?.dispose();
		this.model = undefined;
		this.updateModel();
		this.widget.inputEditor.setValue('');
	}

	focus(): void {
		if (this.widget) {
			this.widget.focusInput();
		}
	}

	render(parent: HTMLElement): void {
		this._scopedContextKeyService?.dispose();
		this._scopedContextKeyService = this._register(this.contextKeyService.createScoped(parent));
		const scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService]));
		this.widget?.dispose();
		this.widget = this._register(
			scopedInstantiationService.createInstance(
				ChatWidget,
				{ resource: true, renderInputOnTop: true, renderStyle: 'compact' },
				{
					listForeground: editorForeground,
					listBackground: editorBackground,
					inputEditorBackground: inputBackground,
					resultEditorBackground: editorBackground
				}));
		this.widget.render(parent);
		this.widget.setVisible(true);
		this.widget.setDynamicChatTreeItemLayout(2, 600);
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
		this._register(this.widget.inputEditor.onDidChangeModelContent((e) => {
			this._currentQuery = this.widget.inputEditor.getValue();
		}));
		this._register(this.widget.onDidClear(() => this.clear()));
	}

	async acceptInput(): Promise<void> {
		return this.widget.acceptInput();
	}

	async openChatView(): Promise<void> {
		const widget = await this._chatWidgetService.revealViewForProvider(this._options.providerId);
		if (!widget?.viewModel || !this.model) {
			return;
		}

		for (const request of this.model.getRequests()) {
			if (request.response?.response.value || request.response?.errorDetails) {
				this.chatService.addCompleteRequest(widget.viewModel.sessionId,
					request.message as string,
					{
						message: request.response.response.asString(),
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

	private updateModel(): void {
		this.model ??= this.chatService.startSession(this._options.providerId, CancellationToken.None);
		if (!this.model) {
			throw new Error('Could not start chat session');
		}

		this.widget.setModel(this.model, { inputValue: this._currentQuery });
	}
}
