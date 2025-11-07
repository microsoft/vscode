/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { raceCancellationError } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import * as nls from '../../../../nls.js';
import { IContextKeyService, IScopedContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { editorBackground, editorForeground, inputBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { Memento } from '../../../common/memento.js';
import { EDITOR_DRAG_AND_DROP_BACKGROUND } from '../../../common/theme.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { ChatContextKeys } from '../common/chatContextKeys.js';
import { IChatModel, IExportableChatData, ISerializableChatData } from '../common/chatModel.js';
import { CHAT_PROVIDER_ID } from '../common/chatParticipantContribTypes.js';
import { IChatSessionsService, localChatSessionType } from '../common/chatSessionsService.js';
import { ChatAgentLocation, ChatModeKind } from '../common/constants.js';
import { clearChatEditor } from './actions/chatClear.js';
import { ChatEditorInput } from './chatEditorInput.js';
import { ChatWidget, IChatViewState } from './chatWidget.js';

export interface IChatEditorOptions extends IEditorOptions {
	target?: { data: IExportableChatData | ISerializableChatData };
	title?: {
		preferred?: string;
		fallback?: string;
	};
	ignoreInView?: boolean;
}

export class ChatEditor extends EditorPane {
	private _widget!: ChatWidget;
	public get widget(): ChatWidget {
		return this._widget;
	}
	private _scopedContextKeyService!: IScopedContextKeyService;
	override get scopedContextKeyService() {
		return this._scopedContextKeyService;
	}

	private _memento: Memento<IChatViewState> | undefined;
	private _viewState: IChatViewState | undefined;
	private dimension = new dom.Dimension(0, 0);
	private _loadingContainer: HTMLElement | undefined;
	private _editorContainer: HTMLElement | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IStorageService private readonly storageService: IStorageService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super(ChatEditorInput.EditorID, group, telemetryService, themeService, storageService);
	}

	private async clear() {
		if (this.input) {
			return this.instantiationService.invokeFunction(clearChatEditor, this.input as ChatEditorInput);
		}
	}

	protected override createEditor(parent: HTMLElement): void {
		this._editorContainer = parent;
		// Ensure the container has position relative for the loading overlay
		parent.classList.add('chat-editor-relative');
		this._scopedContextKeyService = this._register(this.contextKeyService.createScoped(parent));
		const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));
		ChatContextKeys.inChatEditor.bindTo(this._scopedContextKeyService).set(true);

		this._widget = this._register(
			scopedInstantiationService.createInstance(
				ChatWidget,
				ChatAgentLocation.Chat,
				undefined,
				{
					autoScroll: mode => mode !== ChatModeKind.Ask,
					renderFollowups: true,
					supportsFileReferences: true,
					rendererOptions: {
						renderTextEditsAsSummary: (uri) => {
							return true;
						},
						referencesExpandedWhenEmptyResponse: false,
						progressMessageAtBottomOfResponse: mode => mode !== ChatModeKind.Ask,
					},
					enableImplicitContext: true,
					enableWorkingSet: 'explicit',
					supportsChangingModes: true,
				},
				{
					listForeground: editorForeground,
					listBackground: editorBackground,
					overlayBackground: EDITOR_DRAG_AND_DROP_BACKGROUND,
					inputEditorBackground: inputBackground,
					resultEditorBackground: editorBackground
				}));
		this._register(this.widget.onDidClear(() => this.clear()));
		this.widget.render(parent);
		this.widget.setVisible(true);
	}

	protected override setEditorVisible(visible: boolean): void {
		super.setEditorVisible(visible);

		this.widget?.setVisible(visible);

		if (visible && this.widget) {
			this.widget.layout(this.dimension.height, this.dimension.width);
		}
	}

	public override focus(): void {
		super.focus();

		this.widget?.focusInput();
	}

	override clearInput(): void {
		this.saveState();
		super.clearInput();
	}

	private showLoadingInChatWidget(message: string): void {
		if (!this._editorContainer) {
			return;
		}

		// If already showing, just update text
		if (this._loadingContainer) {
			// eslint-disable-next-line no-restricted-syntax
			const existingText = this._loadingContainer.querySelector('.chat-loading-content span');
			if (existingText) {
				existingText.textContent = message;
				return; // aria-live will announce the text change
			}
			this.hideLoadingInChatWidget(); // unexpected structure
		}

		// Mark container busy for assistive technologies
		this._editorContainer.setAttribute('aria-busy', 'true');

		this._loadingContainer = dom.append(this._editorContainer, dom.$('.chat-loading-overlay'));
		// Accessibility: announce loading state politely without stealing focus
		this._loadingContainer.setAttribute('role', 'status');
		this._loadingContainer.setAttribute('aria-live', 'polite');
		// Rely on live region text content instead of aria-label to avoid duplicate announcements
		this._loadingContainer.tabIndex = -1; // ensure it isn't focusable
		const loadingContent = dom.append(this._loadingContainer, dom.$('.chat-loading-content'));
		const spinner = renderIcon(ThemeIcon.modify(Codicon.loading, 'spin'));
		spinner.setAttribute('aria-hidden', 'true');
		loadingContent.appendChild(spinner);
		const text = dom.append(loadingContent, dom.$('span'));
		text.textContent = message;
	}

	private hideLoadingInChatWidget(): void {
		if (this._loadingContainer) {
			this._loadingContainer.remove();
			this._loadingContainer = undefined;
		}
		if (this._editorContainer) {
			this._editorContainer.removeAttribute('aria-busy');
		}
	}

	override async setInput(input: ChatEditorInput, options: IChatEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		// Show loading indicator early for non-local sessions to prevent layout shifts
		let isContributedChatSession = false;
		const chatSessionType = input.getSessionType();
		if (chatSessionType !== localChatSessionType) {
			const loadingMessage = nls.localize('chatEditor.loadingSession', "Loading...");
			this.showLoadingInChatWidget(loadingMessage);
		}

		await super.setInput(input, options, context, token);
		if (token.isCancellationRequested) {
			this.hideLoadingInChatWidget();
			return;
		}

		if (!this.widget) {
			throw new Error('ChatEditor lifecycle issue: no editor widget');
		}

		if (chatSessionType !== localChatSessionType) {
			try {
				await raceCancellationError(this.chatSessionsService.canResolveChatSession(input.resource), token);
				const contributions = this.chatSessionsService.getAllChatSessionContributions();
				const contribution = contributions.find(c => c.type === chatSessionType);
				if (contribution) {
					this.widget.lockToCodingAgent(contribution.name, contribution.displayName, contribution.type);
					isContributedChatSession = true;
				} else {
					this.widget.unlockFromCodingAgent();
				}
			} catch (error) {
				this.hideLoadingInChatWidget();
				throw error;
			}
		} else {
			this.widget.unlockFromCodingAgent();
		}

		try {
			const editorModel = await raceCancellationError(input.resolve(), token);

			if (!editorModel) {
				throw new Error(`Failed to get model for chat editor. resource: ${input.sessionResource}`);
			}

			// Hide loading state before updating model
			if (chatSessionType !== localChatSessionType) {
				this.hideLoadingInChatWidget();
			}

			const viewState = options?.viewState ?? input.options.viewState;
			this.updateModel(editorModel.model, viewState);

			if (isContributedChatSession && options?.title?.preferred) {
				editorModel.model.setCustomTitle(options.title.preferred);
			}
		} catch (error) {
			this.hideLoadingInChatWidget();
			throw error;
		}
	}

	private updateModel(model: IChatModel, viewState?: IChatViewState): void {
		this._memento = new Memento('interactive-session-editor-' + CHAT_PROVIDER_ID, this.storageService);
		this._viewState = viewState ?? this._memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
		this.widget.setModel(model, { ...this._viewState });
	}

	protected override saveState(): void {
		this.widget?.saveState();

		if (this._memento && this._viewState) {
			const widgetViewState = this.widget.getViewState();

			// Need to set props individually on the memento
			this._viewState.inputValue = widgetViewState.inputValue;
			this._viewState.inputState = widgetViewState.inputState;
			this._memento.saveMemento();
		}
	}

	override getViewState(): object | undefined {
		return { ...this._viewState };
	}

	override layout(dimension: dom.Dimension, position?: dom.IDomPosition | undefined): void {
		this.dimension = dimension;
		if (this.widget) {
			this.widget.layout(dimension.height, dimension.width);
		}
	}
}
