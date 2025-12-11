/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatViewTitleControl.css';
import { addDisposableListener, EventType, h } from '../../../../base/browser/dom.js';
import { renderAsPlaintext } from '../../../../base/browser/markdownRenderer.js';
import { Gesture, EventType as TouchEventType } from '../../../../base/browser/touch.js';
import { getBaseLayerHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegate2.js';
import { Emitter } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { MarshalledId } from '../../../../base/common/marshallingIds.js';
import { localize } from '../../../../nls.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IViewContainerModel, IViewDescriptorService } from '../../../common/views.js';
import { ActivityBarPosition, LayoutSettings } from '../../../services/layout/browser/layoutService.js';
import { IChatViewTitleActionContext } from '../common/chatActions.js';
import { IChatModel } from '../common/chatModel.js';
import { ChatConfiguration } from '../common/constants.js';
import { ChatViewId } from './chat.js';
import { AgentSessionProviders, getAgentSessionProviderIcon, getAgentSessionProviderName } from './agentSessions/agentSessions.js';
import { ActionViewItem, IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction } from '../../../../base/common/actions.js';
import { AgentSessionsPicker } from './agentSessions/agentSessionsPicker.js';

export interface IChatViewTitleDelegate {
	updateTitle(title: string): void;
	focusChat(): void;
}

export class ChatViewTitleControl extends Disposable {

	private static readonly DEFAULT_TITLE = localize('chat', "Chat");
	private static readonly PICK_AGENT_SESSION_ACTION_ID = 'workbench.action.chat.pickAgentSession';

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	readonly onDidChangeHeight = this._onDidChangeHeight.event;

	private get viewContainerModel(): IViewContainerModel | undefined {
		const viewContainer = this.viewDescriptorService.getViewContainerByViewId(ChatViewId);
		if (viewContainer) {
			return this.viewDescriptorService.getViewContainerModel(viewContainer);
		}

		return undefined;
	}

	private title: string | undefined = undefined;

	private titleContainer: HTMLElement | undefined;
	private titleLabel: ChatViewTitleLabel | undefined;
	private titleIcon: HTMLElement | undefined;

	private model: IChatModel | undefined;
	private modelDisposables = this._register(new MutableDisposable());

	private navigationToolbar?: MenuWorkbenchToolBar;
	private actionsToolbar?: MenuWorkbenchToolBar;

	private lastKnownHeight = 0;

	constructor(
		private readonly container: HTMLElement,
		private readonly delegate: IChatViewTitleDelegate,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this.render(this.container);

		this.registerListeners();
		this.registerActions();
	}

	private registerListeners(): void {

		// Update when views change in container
		if (this.viewContainerModel) {
			this._register(this.viewContainerModel.onDidAddVisibleViewDescriptors(() => this.doUpdate()));
			this._register(this.viewContainerModel.onDidRemoveVisibleViewDescriptors(() => this.doUpdate()));
		}

		// Update on configuration changes
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (
				e.affectsConfiguration(LayoutSettings.ACTIVITY_BAR_LOCATION) ||
				e.affectsConfiguration(ChatConfiguration.ChatViewTitleEnabled)
			) {
				this.doUpdate();
			}
		}));
	}

	private registerActions(): void {
		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: ChatViewTitleControl.PICK_AGENT_SESSION_ACTION_ID,
					title: localize('chat.pickAgentSession', "Pick Agent Session"),
					f1: false,
					menu: [{
						id: MenuId.ChatViewSessionTitleNavigationToolbar,
						group: 'navigation',
						order: 2
					}]
				});
			}

			async run(accessor: ServicesAccessor): Promise<void> {
				const instantiationService = accessor.get(IInstantiationService);

				const agentSessionsPicker = instantiationService.createInstance(AgentSessionsPicker);
				await agentSessionsPicker.pickAgentSession();
			}
		}));
	}

	private render(parent: HTMLElement): void {
		const elements = h('div.chat-view-title-container', [
			h('div.chat-view-title-navigation-toolbar@navigationToolbar'),
			h('span.chat-view-title-icon@icon'),
			h('div.chat-view-title-actions-toolbar@actionsToolbar'),
		]);

		// Toolbar on the left
		this.navigationToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, elements.navigationToolbar, MenuId.ChatViewSessionTitleNavigationToolbar, {
			actionViewItemProvider: (action: IAction) => {
				if (action.id === ChatViewTitleControl.PICK_AGENT_SESSION_ACTION_ID) {
					this.titleLabel?.dispose();
					this.titleLabel = this._register(new ChatViewTitleLabel(action));
					this.titleLabel?.updateTitle(this.title ?? ChatViewTitleControl.DEFAULT_TITLE);

					return this.titleLabel;
				}

				return undefined;
			},
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			menuOptions: { shouldForwardArgs: true }
		}));

		// Actions toolbar on the right
		this.actionsToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, elements.actionsToolbar, MenuId.ChatViewSessionTitleToolbar, {
			menuOptions: { shouldForwardArgs: true },
			hiddenItemStrategy: HiddenItemStrategy.NoHide
		}));

		// Title controls
		this.titleContainer = elements.root;
		this.titleIcon = elements.icon;
		this._register(getBaseLayerHoverDelegate().setupDelayedHoverAtMouse(this.titleIcon, () => ({
			content: this.getIconHoverContent() ?? '',
			appearance: { compact: true }
		})));

		// Click to focus chat
		this._register(Gesture.addTarget(this.titleContainer));
		for (const eventType of [TouchEventType.Tap, EventType.CLICK]) {
			this._register(addDisposableListener(this.titleContainer, eventType, () => {
				this.delegate.focusChat();
			}));
		}

		parent.appendChild(this.titleContainer);
	}

	update(model: IChatModel | undefined): void {
		this.model = model;

		this.modelDisposables.value = model?.onDidChange(e => {
			if (e.kind === 'setCustomTitle' || e.kind === 'addRequest') {
				this.doUpdate();
			}
		});

		this.doUpdate();
	}

	private doUpdate(): void {
		const markdownTitle = new MarkdownString(this.model?.title ?? '');
		this.title = renderAsPlaintext(markdownTitle);

		this.delegate.updateTitle(this.getTitleWithPrefix());

		this.updateTitle(this.title ?? ChatViewTitleControl.DEFAULT_TITLE);
		this.updateIcon();

		const context = this.model && {
			$mid: MarshalledId.ChatViewContext,
			sessionResource: this.model.sessionResource
		} satisfies IChatViewTitleActionContext;

		if (this.navigationToolbar) {
			this.navigationToolbar.context = context;
		}

		if (this.actionsToolbar) {
			this.actionsToolbar.context = context;
		}
	}

	private updateIcon(): void {
		if (!this.titleIcon) {
			return;
		}

		const icon = this.getIcon();
		if (icon) {
			this.titleIcon.className = `chat-view-title-icon ${ThemeIcon.asClassName(icon)}`;
		} else {
			this.titleIcon.className = 'chat-view-title-icon';
		}
	}

	private getIcon(): ThemeIcon | undefined {
		const sessionType = this.model?.contributedChatSession?.chatSessionType;
		switch (sessionType) {
			case AgentSessionProviders.Background:
			case AgentSessionProviders.Cloud:
				return getAgentSessionProviderIcon(sessionType);
		}

		return undefined;
	}

	private getIconHoverContent(): string | undefined {
		const sessionType = this.model?.contributedChatSession?.chatSessionType;
		switch (sessionType) {
			case AgentSessionProviders.Background:
			case AgentSessionProviders.Cloud:
				return localize('backgroundSession', "{0} Agent Session", getAgentSessionProviderName(sessionType));
		}

		return undefined;
	}

	private updateTitle(title: string): void {
		if (!this.titleContainer) {
			return;
		}

		this.titleContainer.classList.toggle('visible', this.shouldRender());
		this.titleLabel?.updateTitle(title);

		const currentHeight = this.getHeight();
		if (currentHeight !== this.lastKnownHeight) {
			this.lastKnownHeight = currentHeight;

			this._onDidChangeHeight.fire();
		}
	}

	private shouldRender(): boolean {
		if (!this.isEnabled()) {
			return false; // title hidden via setting
		}

		if (this.viewContainerModel && this.viewContainerModel.visibleViewDescriptors.length > 1) {
			return false; // multiple views visible, chat view shows a title already
		}

		if (this.configurationService.getValue<ActivityBarPosition>(LayoutSettings.ACTIVITY_BAR_LOCATION) !== ActivityBarPosition.DEFAULT) {
			return false; // activity bar not in default location, view title shown already
		}

		return !!this.model?.title;
	}

	private isEnabled(): boolean {
		return this.configurationService.getValue<boolean>(ChatConfiguration.ChatViewTitleEnabled) === true;
	}

	getSingleViewPaneContainerTitle(): string | undefined {
		if (
			!this.isEnabled() ||	// title disabled
			this.shouldRender()		// title is rendered in the view, do not repeat
		) {
			return undefined;
		}

		return this.getTitleWithPrefix();
	}

	private getTitleWithPrefix(): string {
		if (this.title) {
			return localize('chatTitleWithPrefixCustom', "Chat: {0}", this.title);
		}

		return ChatViewTitleControl.DEFAULT_TITLE;
	}

	getHeight(): number {
		if (!this.titleContainer || this.titleContainer.style.display === 'none') {
			return 0;
		}

		return this.titleContainer.offsetHeight;
	}
}

class ChatViewTitleLabel extends ActionViewItem {

	private title: string | undefined;

	constructor(action: IAction, options?: IActionViewItemOptions) {
		super(null, action, { ...options, icon: false, label: true });
	}

	override render(container: HTMLElement): void {
		super.render(container);

		this.label?.classList.add('chat-view-title-label');
	}

	protected override updateLabel(): void {
		if (this.options.label && this.label && this.title) {
			this.label.textContent = this.title;
		}
	}

	updateTitle(title: string): void {
		this.title = title;
		this.updateLabel();
	}
}
