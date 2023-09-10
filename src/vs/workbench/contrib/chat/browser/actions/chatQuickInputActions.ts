/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/base/common/themables';
import { localize } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr, IContextKeyService, IScopedContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IQuickInputService, IQuickPick, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { editorBackground, editorForeground } from 'vs/platform/theme/common/colorRegistry';
import { SIDE_BAR_BACKGROUND } from 'vs/workbench/common/theme';
import { CHAT_CATEGORY } from 'vs/workbench/contrib/chat/browser/actions/chatActions';
import { IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { IChatViewOptions } from 'vs/workbench/contrib/chat/browser/chatViewPane';
import { ChatWidget } from 'vs/workbench/contrib/chat/browser/chatWidget';
import { CONTEXT_PROVIDER_EXISTS } from 'vs/workbench/contrib/chat/common/chatContextKeys';
import { ChatModel } from 'vs/workbench/contrib/chat/common/chatModel';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';

export const ASK_QUICK_QUESTION_ACTION_ID = 'chat.action.askQuickQuestion';
export function registerQuickChatActions() {
	registerAction2(QuickChatGlobalAction);
}

class QuickChatGlobalAction extends Action2 {
	constructor() {
		super({
			id: ASK_QUICK_QUESTION_ACTION_ID,
			title: { value: localize('quickChat', "Quick Chat"), original: 'Quick Chat' },
			precondition: CONTEXT_PROVIDER_EXISTS,
			icon: Codicon.commentDiscussion,
			f1: false,
			category: CHAT_CATEGORY,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyI,
				linux: {
					primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.KeyI
				}
			},
			menu: {
				id: MenuId.LayoutControlMenu,
				group: '0_workbench_toggles',
				when: ContextKeyExpr.notEquals('config.chat.experimental.defaultMode', 'chatView'),
				order: 0
			}
		});
	}

	override async run(accessor: ServicesAccessor, query: string): Promise<void> {
		const chatService = accessor.get(IChatService);
		const commandService = accessor.get(ICommandService);
		// Grab the first provider and run its command
		const info = chatService.getProviderInfos()[0];
		if (info) {
			await commandService.executeCommand(`workbench.action.openChat.${info.id}`, query);
		}
	}
}

/**
 * Returns a provider specific action that will open the quick chat for that provider.
 * This is used to include the provider label in the action title so it shows up in
 * the command palette.
 * @param id The id of the provider
 * @param label The label of the provider
 * @returns An action that will open the quick chat for this provider
 */
export function getQuickChatActionForProvider(id: string, label: string) {
	return class AskQuickQuestionAction extends Action2 {
		_currentTimer: any | undefined;
		_input: IQuickPick<IQuickPickItem> | undefined;
		_currentChat: QuickChat | undefined;

		constructor() {
			super({
				id: `workbench.action.openChat.${id}`,
				category: CHAT_CATEGORY,
				title: { value: localize('interactiveSession.open', "Open Quick Chat ({0})", label), original: `Open Quick Chat (${label})` },
				f1: true
			});
		}

		override run(accessor: ServicesAccessor, query: string): void {
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


			const containerSession = dom.$('.interactive-session');
			this._input.widget = containerSession;

			this._currentChat ??= instantiationService.createInstance(QuickChat, {
				providerId: providerInfo.id,
			});
			// show needs to come before the current chat rendering
			this._input.show();
			this._currentChat.render(containerSession);

			const clearButton = {
				iconClass: ThemeIcon.asClassName(Codicon.clearAll),
				tooltip: localize('clear', "Clear"),
			};
			this._input.buttons = [
				clearButton,
				{
					iconClass: ThemeIcon.asClassName(Codicon.commentDiscussion),
					tooltip: localize('openInChat', "Open In Chat View"),
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

			disposableStore.add(this._input.onDidTriggerButton((e) => {
				if (e === clearButton) {
					this._currentChat?.clear();
				} else {
					this._currentChat?.openChatView();
				}
			}));

			//#endregion

			this._currentChat.focus();

			if (query) {
				this._currentChat.setValue(query);
				this._currentChat.acceptInput();
			}
		}
	};
}

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
				{ resource: true, renderInputOnTop: true },
				{
					listForeground: editorForeground,
					listBackground: editorBackground,
					inputEditorBackground: SIDE_BAR_BACKGROUND,
					resultEditorBackground: SIDE_BAR_BACKGROUND
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
	}

	async acceptInput(): Promise<void> {
		if (this.widget.inputEditor.getValue().trim() === '/clear') {
			this.clear();
		} else {
			await this.widget.acceptInput();
		}
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
