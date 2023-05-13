/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Toggle } from 'vs/base/browser/ui/toggle/toggle';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { Emitter, Event } from 'vs/base/common/event';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IQuickInputService, IQuickPick, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { asCssVariable, editorBackground, foreground, inputActiveOptionBackground, inputActiveOptionBorder, inputActiveOptionForeground } from 'vs/platform/theme/common/colorRegistry';
import { InteractiveListItemRenderer } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionListRenderer';
import { InteractiveSessionEditorOptions } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionOptions';
import { InteractiveSessionModel } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionModel';
import { IInteractiveSessionReplyFollowup, IInteractiveSessionService } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionService';
import { InteractiveSessionViewModel } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionViewModel';
import { INTERACTIVE_SESSION_CATEGORY } from 'vs/workbench/contrib/interactiveSession/browser/actions/interactiveSessionActions';
import { IInteractiveSessionWidgetService } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSession';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';

export function registerInteractiveSessionQuickQuestionActions() {
	registerAction2(AskQuickQuestionAction);
}

class AskQuickQuestionAction extends Action2 {

	private _currentSession: InteractiveQuickPickSession | undefined;
	private _currentQuery: string | undefined;
	private _currentTimer: any | undefined;
	private _input: IQuickPick<IQuickPickItem> | undefined;

	constructor() {
		super({
			id: 'interactiveSession.action.askQuickQuestion',
			title: { value: localize('askQuickQuestion', "Ask Quick Question"), original: 'Ask Quick Question' },
			f1: true,
			category: INTERACTIVE_SESSION_CATEGORY,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyI,
				when: ContextKeyExpr.equals('config.interactiveSession.experimental.quickQuestion.enable', true),
			}
		});
	}

	run(accessor: ServicesAccessor, query: string): void {
		const quickInputService = accessor.get(IQuickInputService);
		const interactiveSessionService = accessor.get(IInteractiveSessionService);
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
		const providerInfo = interactiveSessionService.getProviderInfos()[0];
		if (!providerInfo) {
			return;
		}

		const disposableStore = new DisposableStore();

		//#region Setup quick pick

		this._input = quickInputService.createQuickPick();
		disposableStore.add(this._input);
		this._input.ignoreFocusOut = true;
		this._input.placeholder = localize('askabot', "Ask {0} a question...", providerInfo.displayName);

		// Setup toggle that will be used to open the chat view
		const openInChat = new Toggle({
			title: 'Open in chat view',
			icon: Codicon.commentDiscussion,
			isChecked: false,
			inputActiveOptionBorder: asCssVariable(inputActiveOptionBorder),
			inputActiveOptionForeground: asCssVariable(inputActiveOptionForeground),
			inputActiveOptionBackground: asCssVariable(inputActiveOptionBackground)
		});
		disposableStore.add(openInChat);
		disposableStore.add(openInChat.onChange(async () => {
			await this._currentSession?.openInChat(this._input!.value);
			this._input!.hide();
			this._currentQuery = undefined;
			this._currentSession?.dispose();
			this._currentSession = undefined;
		}));
		this._input.toggles = [openInChat];

		// Setup the widget that will be used to render the chat response
		const containerList = dom.$('.interactive-list');
		const containerSession = dom.$('.interactive-session', undefined, containerList);
		containerList.style.position = 'relative';
		this._input.widget = containerSession;

		//#endregion

		//#region quick pick events

		disposableStore.add(this._input.onDidChangeValue((value) => {
			if (value !== this._currentQuery) {
				this._currentQuery = value;
			}
		}));
		disposableStore.add(this._input.onDidHide(() => {
			disposableStore.dispose();
			this._input = undefined;
			this._currentTimer = setTimeout(() => {
				this._currentQuery = undefined;
				this._currentSession?.dispose();
				this._currentSession = undefined;
			}, 1000 * 10); // 10 seconds
		}));
		disposableStore.add(this._input.onDidAccept(async () => {
			await this._currentSession?.accept(this._input!.value);
		}));

		//#endregion

		// If we were given a query (via executeCommand), then clear past state
		if (query) {
			this._currentSession?.dispose();
			this._currentSession = undefined;
		}
		this._currentSession ??= instantiationService.createInstance(InteractiveQuickPickSession);
		this._input.show();
		// This line must come after showing the input so the offsetWidth is correct
		this._currentSession.createList(containerList, containerList.offsetWidth);

		disposableStore.add(this._currentSession.onDidClickFollowup(async e => {
			this._input!.value = e.message;
			await this._currentSession?.accept(e.message);
		}));

		// If we were given a query (via executeCommand), then accept it
		if (query) {
			this._input.value = query;
			this._input.valueSelection = [0, this._input.value.length];
			this._currentQuery = query;
			this._currentSession.accept(query);
		} else if (this._currentQuery) {
			this._input.value = this._currentQuery;
			this._input.valueSelection = [0, this._input.value.length];
		}
	}
}

class InteractiveQuickPickSession extends Disposable {

	private _model: InteractiveSessionModel;
	private _viewModel: InteractiveSessionViewModel;

	private readonly _onDidClickFollowup: Emitter<IInteractiveSessionReplyFollowup> = this._register(new Emitter<IInteractiveSessionReplyFollowup>());
	onDidClickFollowup: Event<IInteractiveSessionReplyFollowup> = this._onDidClickFollowup.event;

	private _listDisposable: DisposableStore | undefined;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IInteractiveSessionService private readonly _interactiveSessionService: IInteractiveSessionService,
		@IInteractiveSessionWidgetService private readonly _interactiveSessionWidgetService: IInteractiveSessionWidgetService
	) {
		super();

		const providerInfo = _interactiveSessionService.getProviderInfos()[0];
		this._model = this._register(_interactiveSessionService.startSession(providerInfo.id, CancellationToken.None)!);
		this._viewModel = this._register(new InteractiveSessionViewModel(this._model, _instantiationService));
	}

	createList(container: HTMLElement, offsetWidth: number) {
		this._listDisposable?.dispose();
		this._listDisposable = new DisposableStore();
		const options = this._listDisposable.add(this._instantiationService.createInstance(InteractiveSessionEditorOptions, 'quickpick-interactive', foreground, editorBackground, editorBackground));
		const list = this._listDisposable.add(this._instantiationService.createInstance(
			InteractiveListItemRenderer,
			options,
			{
				getListLength: () => {
					return this._viewModel.getItems().length;
				},
				getSlashCommands() {
					return [];
				},
			}
		));

		const template = list.renderTemplate(container);
		list.layout(offsetWidth);
		this._listDisposable.add(this._viewModel.onDidChange(() => {
			const items = this._viewModel.getItems();
			const node = {
				element: items[items.length - 1],
				children: [],
				collapsed: false,
				collapsible: false,
				depth: 0,
				filterData: undefined,
				visible: true,
				visibleChildIndex: 0,
				visibleChildrenCount: 1,
			};
			list.disposeElement(node, 0, template);
			list.renderElement(node, 0, template);
		}));

		if (this._viewModel.getItems().length) {
			const items = this._viewModel.getItems();
			const node = {
				element: items[items.length - 1],
				children: [],
				collapsed: false,
				collapsible: false,
				depth: 0,
				filterData: undefined,
				visible: true,
				visibleChildIndex: 0,
				visibleChildrenCount: 1,
			};
			list.disposeElement(node, 0, template);
			list.renderElement(node, 0, template);
		}

		this._listDisposable.add(list.onDidClickFollowup(e => {
			this._onDidClickFollowup.fire(e);
		}));
	}

	get providerId() {
		return this._model.providerId;
	}

	get sessionId() {
		return this._model.sessionId;
	}

	async accept(query: string) {
		await this._model.waitForInitialization();
		if (this._model.requestInProgress) {
			const requests = this._model.getRequests();
			const lastRequest = requests[requests.length - 1];
			this._model.cancelRequest(lastRequest);
		}
		await this._interactiveSessionService.sendRequest(this.sessionId, query);
	}

	async openInChat(value: string) {
		const widget = await this._interactiveSessionWidgetService.revealViewForProvider(this.providerId);
		if (!widget?.viewModel) {
			return;
		}

		const requests = this._model.getRequests().reverse();
		const response = requests.find(r => r.response?.response.value !== undefined);
		const message = response?.response?.response.value;
		if (message) {
			this._interactiveSessionService.addCompleteRequest(widget.viewModel.sessionId, value, { message });
		} else if (value) {
			this._interactiveSessionService.sendRequest(widget.viewModel.sessionId, value);
		}
		widget.focusInput();
	}
}
