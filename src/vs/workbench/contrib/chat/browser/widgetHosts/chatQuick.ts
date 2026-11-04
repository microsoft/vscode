/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Orientation, Sash } from '../../../../../base/browser/ui/sash/sash.js';
import { disposableTimeout, raceCancellationError } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { Selection } from '../../../../../editor/common/core/selection.js';
import { localize } from '../../../../../nls.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { IAgentHostEnablementService } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IManagedSettingsService, requiresCopilotAgentHost } from '../../../../../platform/policy/common/copilotManagedSettings.js';
import product from '../../../../../platform/product/common/product.js';
import { IQuickInputService, IQuickWidget } from '../../../../../platform/quickinput/common/quickInput.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { editorBackground, inputBackground, quickInputBackground, quickInputForeground } from '../../../../../platform/theme/common/colorRegistry.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { EDITOR_DRAG_AND_DROP_BACKGROUND } from '../../../../common/theme.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { IAccountPolicyGateService, whenAccountPolicySettled } from '../../../../services/policies/common/accountPolicyService.js';
import { ChatMode } from '../../common/chatModes.js';
import { IChatModelReference, IChatService } from '../../common/chatService/chatService.js';
import { ChatAgentLocation, ChatModeKind, getDefaultNewChatSessionTypeAndReasonFromServices } from '../../common/constants.js';
import { IChatSessionsService, localChatSessionType } from '../../common/chatSessionsService.js';
import { getChatSessionType, getNewChatSessionResource } from '../../common/model/chatUri.js';
import { ChatViewPaneTarget, IChatWidgetService, IQuickChatOpenOptions, IQuickChatService } from '../chat.js';
import { ChatWidget } from '../widget/chatWidget.js';

export class QuickChatService extends Disposable implements IQuickChatService {
	readonly _serviceBrand: undefined;

	private readonly _onDidClose = this._register(new Emitter<void>());
	get onDidClose() { return this._onDidClose.event; }

	private _input: IQuickWidget | undefined;
	// TODO@TylerLeonhardt: support multiple chat providers eventually
	private _currentChat: QuickChat | undefined;
	private _container: HTMLElement | undefined;
	private queryGeneration = 0;

	constructor(
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IChatService private readonly chatService: IChatService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@INotificationService private readonly notificationService: INotificationService,
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

	get sessionResource(): URI | undefined {
		return this._input && this._currentChat?.sessionResource;
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
		this.doOpen(options).catch(error => {
			if (!isCancellationError(error)) {
				this.notificationService.error(error);
			}
		});
	}

	private async doOpen(options?: IQuickChatOpenOptions): Promise<void> {
		const queryGeneration = options?.query ? ++this.queryGeneration : this.queryGeneration;
		if (this._input) {
			if (this._currentChat && options?.query) {
				const input = this._input;
				const chat = this._currentChat;
				chat.focus();
				chat.setValue(options.query, options.selection);
				await chat.whenReady();
				if (this._input !== input || queryGeneration !== this.queryGeneration) {
					return;
				}
				if (!options.isPartialQuery) {
					await chat.acceptInput();
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
			this._currentChat = this._register(this.instantiationService.createInstance(QuickChat));

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
		}
		const input = this._input;
		await this._currentChat.whenReady();
		if (this._input !== input || queryGeneration !== this.queryGeneration) {
			return;
		}

		if (options?.query) {
			if (!options.isPartialQuery) {
				await this._currentChat.acceptInput();
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

export class QuickChat extends Disposable {
	// TODO@TylerLeonhardt: be responsive to window size
	static DEFAULT_MIN_HEIGHT = 200;
	private static readonly DEFAULT_HEIGHT_OFFSET = 100;

	private widget!: ChatWidget;
	private sash!: Sash;
	private modelRef: IChatModelReference | undefined;
	private modelPromise: Promise<void> | undefined;
	private modelGeneration = 0;
	private readonly modelCancellation = this._register(new CancellationTokenSource());
	private readonly maintainScrollTimer: MutableDisposable<IDisposable> = this._register(new MutableDisposable<IDisposable>());
	private _deferUpdatingDynamicLayout: boolean = false;

	public get sessionResource() {
		return this.widget?.viewModel?.sessionResource ?? this.modelRef?.object.sessionResource;
	}

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IChatService private readonly chatService: IChatService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IStorageService private readonly storageService: IStorageService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IAgentHostEnablementService private readonly agentHostEnablementService: IAgentHostEnablementService,
		@IManagedSettingsService private readonly managedSettingsService: IManagedSettingsService,
		@IAccountPolicyGateService private readonly accountPolicyGateService: IAccountPolicyGateService,
	) {
		super();
	}

	private async clear() {
		const currentSessionType = this.sessionResource && getChatSessionType(this.sessionResource);
		this.widget.inputEditor.setValue('');
		this.widget.attachmentModel.clear(true);
		this.modelRef?.dispose();
		this.modelRef = undefined;
		this.modelPromise = undefined;
		await this.initializeModel(currentSessionType);
	}

	whenReady(): Promise<void> {
		return this.initializeModel();
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
		this.initializeModel();
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
					defaultMode: ChatMode.Ask,
					supportsChangingModes: true,
					clear: () => this.clear(),
					submitHandler: async () => {
						await this.whenReady();
						return false;
					},
				},
				{
					listForeground: quickInputForeground,
					listBackground: quickInputBackground,
					overlayBackground: EDITOR_DRAG_AND_DROP_BACKGROUND,
					inputEditorBackground: inputBackground,
					resultEditorBackground: editorBackground
				}));
		this._register(this.widget.onDidChangeViewModel(({ currentSessionResource }) => {
			if (!currentSessionResource || this.modelCancellation.token.isCancellationRequested || isEqual(currentSessionResource, this.modelRef?.object.sessionResource)) {
				return;
			}
			const modelRef = this.chatService.acquireExistingSession(currentSessionResource, 'ChatQuick#onDidChangeViewModel');
			if (modelRef) {
				this.modelRef?.dispose();
				this.modelRef = modelRef;
			}
		}));
		this.widget.render(parent);
		this._register(this.widget.input.onDidChangeCurrentChatMode(() => {
			if (this.widget.input.currentModeObs.get().kind !== ChatModeKind.Ask) {
				this.widget.input.setChatMode(ChatMode.Ask.id, false);
			}
		}));
		this.widget.setVisible(true);
		this.widget.setDynamicChatTreeItemLayout(2, this.maxHeight);
		this.initializeModel();
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

			const showDisclaimer = !sentiment.completed && anonymous && !requestInProgress;
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
		await this.whenReady();
		const sessionResource = this.sessionResource;
		if (!sessionResource) {
			return;
		}
		const value = this.widget.getInputState();
		const widget = await this.chatWidgetService.openSession(sessionResource, ChatViewPaneTarget);
		if (!widget?.viewModel || !isEqual(widget.viewModel.sessionResource, sessionResource)) {
			throw new Error(localize('quickChat.openSessionFailed', "Could not open this conversation in Chat. Please try again."));
		}
		if (value) {
			widget.viewModel.model.inputModel.setState(value);
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

	private initializeModel(currentSessionType?: string): Promise<void> {
		if (!this.modelPromise) {
			const pending = this.updateModel(currentSessionType);
			this.modelPromise = pending;
			pending.catch(() => {
				if (this.modelPromise === pending) {
					this.modelPromise = undefined;
				}
			});
		}
		return this.modelPromise;
	}

	private async updateModel(currentSessionType?: string): Promise<void> {
		const generation = ++this.modelGeneration;
		const token = this.modelCancellation.token;
		await raceCancellationError(whenAccountPolicySettled(this.accountPolicyGateService), token);
		if (token.isCancellationRequested || generation !== this.modelGeneration) {
			throw new CancellationError();
		}
		const resolved = getDefaultNewChatSessionTypeAndReasonFromServices(this.configurationService, this.chatSessionsService, this.storageService, this.workspaceContextService.getWorkspace(), this.agentHostEnablementService.enabled.get(), { currentSessionType }, this.agentHostEnablementService.managedSandboxEnforced.get(), requiresCopilotAgentHost(this.managedSettingsService, this.configurationService));
		const modelRef = resolved.sessionType === localChatSessionType
			? this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { disableBackgroundKeepAlive: true, debugOwner: 'ChatQuick#updateModel', sessionTypeSelectionReason: resolved.selectionReason })
			: await this.chatService.acquireOrLoadSession(getNewChatSessionResource(resolved.sessionType), ChatAgentLocation.Chat, token, 'ChatQuick#updateModel', resolved.selectionReason);
		if (token.isCancellationRequested || generation !== this.modelGeneration) {
			modelRef?.dispose();
			throw new CancellationError();
		}
		if (!modelRef) {
			throw new Error(localize('quickChat.startSessionFailed', "Could not start the selected chat session. Please try again."));
		}
		const inputState = { ...this.widget.getInputState() };
		if ((currentSessionType ?? localChatSessionType) !== resolved.sessionType && inputState.selectedModel?.metadata.targetChatSessionType !== resolved.sessionType) {
			delete inputState.selectedModel;
			delete inputState.modelConfiguration;
			delete inputState.modelConfigurationIsTransient;
			delete inputState.selectedModelReason;
		}
		this.modelRef?.dispose();
		this.modelRef = modelRef;

		modelRef.object.inputModel.setState({
			...inputState,
			mode: { id: ChatMode.Ask.id, kind: ChatModeKind.Ask }
		});
		this.widget.setModel(modelRef.object);
		await raceCancellationError(this.widget.input.currentChatModesObs.get().waitForPendingUpdates(), token);
		if (token.isCancellationRequested || generation !== this.modelGeneration) {
			throw new CancellationError();
		}
		// Mode controls stay hidden in Quick Chat, but Ask must resolve to the host's read-only agent.
		this.widget.input.setChatMode(ChatMode.Ask.id, false);
	}

	override dispose(): void {
		this.modelCancellation.cancel();
		this.modelRef?.dispose();
		this.modelRef = undefined;
		super.dispose();
	}
}
