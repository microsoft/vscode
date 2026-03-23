/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentSessionCustomViewPane.css';
import { $, append, clearNode, getWindow } from '../../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { MutableDisposable, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { autorun, IReader } from '../../../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { editorBackground } from '../../../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { IViewPaneOptions, ViewPane } from '../../../../../browser/parts/views/viewPane.js';
import { SIDE_BAR_FOREGROUND } from '../../../../../common/theme.js';
import { IViewDescriptorService } from '../../../../../common/views.js';
import { IChatModel } from '../../../common/model/chatModel.js';
import { IChatModelReference, IChatService } from '../../../common/chatService/chatService.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { getChatSessionType } from '../../../common/model/chatUri.js';
import { ChatAgentLocation, ChatModeKind } from '../../../common/constants.js';
import { IChatSessionCustomViewService, IChatSessionCustomHeaderData, IChatSessionCustomHeaderRenderer } from '../../../common/chatSessionCustomViewService.js';
import { ChatWidget } from '../../widget/chatWidget.js';
import { IWorkbenchLayoutService } from '../../../../../services/layout/browser/layoutService.js';

export const AgentSessionCustomViewId = 'workbench.panel.chat.view.agentSessionCustom';

export class AgentSessionCustomViewPane extends ViewPane {

	private _widget!: ChatWidget;
	private customHeaderContainer!: HTMLElement;
	private chatContainer!: HTMLElement;
	private readonly modelRef = this._register(new MutableDisposable<IChatModelReference>());
	private readonly headerDisposables = this._register(new DisposableStore());
	private readonly loadSessionCts = this._register(new MutableDisposable<CancellationTokenSource>());

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IChatService private readonly chatService: IChatService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IChatSessionCustomViewService private readonly customViewService: IChatSessionCustomViewService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		this._register(this.customViewService.onDidChangeHeaderData(uri => {
			if (this.modelRef.value && this.modelRef.value.object.sessionResource.toString() === uri.toString()) {
				this.updateCustomHeader();
			}
		}));

		this._register(this.customViewService.onDidChangeRenderers(() => {
			this.updateCustomHeader();
		}));
	}

	protected override renderBody(parent: HTMLElement): void {
		super.renderBody(parent);

		parent.classList.add('agent-session-custom-viewpane');

		// Custom header section
		this.customHeaderContainer = append(parent, $('.agent-session-custom-header'));

		// Chat widget container
		this.chatContainer = append(parent, $('.agent-session-custom-chat'));

		const locationBasedColors = this.getLocationBasedColors();

		const editorOverflowWidgetsDomNode = this.layoutService.getContainer(getWindow(this.chatContainer)).appendChild($('.chat-editor-overflow.monaco-editor'));
		this._register(toDisposable(() => editorOverflowWidgetsDomNode.remove()));

		const scopedInstantiationService = this._register(this.instantiationService.createChild(
			new ServiceCollection([IContextKeyService, this.scopedContextKeyService])
		));

		this._widget = this._register(scopedInstantiationService.createInstance(
			ChatWidget,
			ChatAgentLocation.Chat,
			{ viewId: this.id },
			{
				autoScroll: mode => mode !== ChatModeKind.Ask,
				renderFollowups: true,
				supportsFileReferences: true,
				rendererOptions: {
					renderTextEditsAsSummary: () => true,
					referencesExpandedWhenEmptyResponse: false,
					progressMessageAtBottomOfResponse: mode => mode !== ChatModeKind.Ask,
				},
				editorOverflowWidgetsDomNode,
				enableImplicitContext: true,
				enableWorkingSet: 'explicit',
				supportsChangingModes: true,
				dndContainer: parent,
			},
			{
				listForeground: SIDE_BAR_FOREGROUND,
				listBackground: locationBasedColors.background,
				overlayBackground: locationBasedColors.overlayBackground,
				inputEditorBackground: locationBasedColors.background,
				resultEditorBackground: editorBackground,
			}
		));

		this._widget.render(this.chatContainer);

		const updateWidgetVisibility = (reader?: IReader) => this._widget.setVisible(this.isBodyVisible());
		this._register(this.onDidChangeBodyVisibility(() => updateWidgetVisibility()));
		this._register(autorun(reader => updateWidgetVisibility(reader)));
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);

		const headerHeight = this.customHeaderContainer.offsetHeight;
		this.chatContainer.style.height = `${height - headerHeight}px`;

		if (this._widget) {
			this._widget.layout(height - headerHeight, width);
		}
	}

	/**
	 * Load and display a chat session by its resource URI.
	 * The custom header will be rendered if a renderer is registered for the session type.
	 */
	async loadSession(sessionResource: URI): Promise<IChatModel | undefined> {
		this.loadSessionCts.value?.cancel();
		const cts = this.loadSessionCts.value = new CancellationTokenSource();
		const token = cts.token;

		this.modelRef.value = undefined;

		const ref = await this.chatService.acquireOrLoadSession(sessionResource, ChatAgentLocation.Chat, token);
		if (token.isCancellationRequested) {
			ref?.dispose();
			return undefined;
		}

		this.modelRef.value = ref;
		const model = ref?.object;

		if (model) {
			await this.updateWidgetLockState(getChatSessionType(model.sessionResource));

			if (token.isCancellationRequested) {
				this.modelRef.value = undefined;
				return undefined;
			}
		}

		this._widget.setModel(model);
		this.updateCustomHeader();

		return model;
	}

	private async updateWidgetLockState(sessionType: string): Promise<void> {
		let canResolve = false;
		try {
			canResolve = await this.chatSessionsService.canResolveChatSession(sessionType);
		} catch {
			// ignore
		}

		if (!canResolve) {
			this._widget.unlockFromCodingAgent();
			return;
		}

		const contribution = this.chatSessionsService.getChatSessionContribution(sessionType);
		if (contribution) {
			this._widget.lockToCodingAgent(contribution.name, contribution.displayName, contribution.type);
		} else {
			this._widget.unlockFromCodingAgent();
		}
	}

	private readonly defaultRenderer = new DefaultChatSessionCustomHeaderRenderer();

	private updateCustomHeader(): void {
		this.headerDisposables.clear();
		clearNode(this.customHeaderContainer);

		const model = this.modelRef.value?.object;
		if (!model) {
			this.customHeaderContainer.style.display = 'none';
			this.layoutBody(this.chatContainer.parentElement!.clientHeight, this.chatContainer.parentElement!.clientWidth);
			return;
		}

		const data = this.customViewService.getHeaderData(model.sessionResource);
		if (!data) {
			this.customHeaderContainer.style.display = 'none';
			this.layoutBody(this.chatContainer.parentElement!.clientHeight, this.chatContainer.parentElement!.clientWidth);
			return;
		}

		const sessionType = getChatSessionType(model.sessionResource);
		const renderer = this.customViewService.getHeaderRenderer(sessionType) ?? this.defaultRenderer;

		this.customHeaderContainer.style.display = '';
		this.headerDisposables.add(renderer.renderHeader(this.customHeaderContainer, data));

		if (renderer.onDidChangeHeight) {
			this.headerDisposables.add(renderer.onDidChangeHeight(() => {
				if (this.chatContainer.parentElement) {
					this.layoutBody(this.chatContainer.parentElement.clientHeight, this.chatContainer.parentElement.clientWidth);
				}
			}));
		}

		// Re-layout to account for header height change
		if (this.chatContainer.parentElement) {
			this.layoutBody(this.chatContainer.parentElement.clientHeight, this.chatContainer.parentElement.clientWidth);
		}
	}

	override focus(): void {
		super.focus();
		this._widget?.focusInput();
	}

	get widget(): ChatWidget {
		return this._widget;
	}
}

/**
 * Default header renderer that renders a simple status bar with label, description, and status indicator.
 */
export class DefaultChatSessionCustomHeaderRenderer implements IChatSessionCustomHeaderRenderer {

	readonly onDidChangeHeight = undefined;

	renderHeader(container: HTMLElement, data: IChatSessionCustomHeaderData): DisposableStore {
		const disposables = new DisposableStore();

		container.classList.add('agent-session-custom-header-default');

		// Status indicator
		const statusElement = append(container, $('.agent-session-header-status'));
		const statusClass = data.status === 'active' ? 'status-active' : data.status === 'error' ? 'status-error' : 'status-idle';
		statusElement.classList.add(statusClass);

		// Icon
		if (data.iconId) {
			const iconElement = append(container, $('.agent-session-header-icon'));
			const iconNode = renderIcon(ThemeIcon.fromId(data.iconId));
			iconElement.appendChild(iconNode);
		}

		// Label
		const labelElement = append(container, $('.agent-session-header-label'));
		labelElement.textContent = data.label;

		// Description
		if (data.description) {
			const descElement = append(container, $('.agent-session-header-description'));
			descElement.textContent = data.description;
		}

		// Detail key-value pairs
		if (data.details && data.details.length > 0) {
			const detailsContainer = append(container, $('.agent-session-header-details'));
			for (const detail of data.details) {
				const detailElement = append(detailsContainer, $('.agent-session-header-detail'));
				const keyElement = append(detailElement, $('.detail-key'));
				keyElement.textContent = detail.key + ':';
				const valueElement = append(detailElement, $('.detail-value'));
				valueElement.textContent = detail.value;
			}
		}

		return disposables;
	}

	dispose(): void {
		// no-op
	}
}
