/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatViewTitleControl.css';
import { addDisposableListener, EventType, h } from '../../../../base/browser/dom.js';
import { renderAsPlaintext } from '../../../../base/browser/markdownRenderer.js';
import { Gesture, EventType as TouchEventType } from '../../../../base/browser/touch.js';
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
import { IChatViewTitleActionContext } from '../common/chatActions.js';
import { IChatModel } from '../common/chatModel.js';
import { ChatConfiguration } from '../common/constants.js';
import { AgentSessionProviders, getAgentSessionProviderIcon } from './agentSessions/agentSessions.js';
import { ActionViewItem, IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction } from '../../../../base/common/actions.js';
import { AgentSessionsPicker } from './agentSessions/agentSessionsPicker.js';

export interface IChatViewTitleDelegate {
	focusChat(): void;
}

export class ChatViewTitleControl extends Disposable {

	private static readonly DEFAULT_TITLE = localize('chat', "Chat");
	private static readonly PICK_AGENT_SESSION_ACTION_ID = 'workbench.action.chat.pickAgentSession';

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	readonly onDidChangeHeight = this._onDidChangeHeight.event;

	private title: string | undefined = undefined;

	private titleContainer: HTMLElement | undefined;
	private titleLabel = this._register(new MutableDisposable<ChatViewTitleLabel>());

	private model: IChatModel | undefined;
	private modelDisposables = this._register(new MutableDisposable());

	private navigationToolbar?: MenuWorkbenchToolBar;
	private actionsToolbar?: MenuWorkbenchToolBar;

	private lastKnownHeight = 0;

	constructor(
		private readonly container: HTMLElement,
		private readonly delegate: IChatViewTitleDelegate,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this.render(this.container);

		this.registerListeners();
		this.registerActions();
	}

	private registerListeners(): void {

		// Update on configuration changes
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.ChatViewTitleEnabled)) {
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
					this.titleLabel.value = new ChatViewTitleLabel(action);
					this.titleLabel.value.updateTitle(this.title ?? ChatViewTitleControl.DEFAULT_TITLE, this.getIcon());

					return this.titleLabel.value;
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

		this.updateTitle(this.title ?? ChatViewTitleControl.DEFAULT_TITLE);

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

	private updateTitle(title: string): void {
		if (!this.titleContainer) {
			return;
		}

		this.titleContainer.classList.toggle('visible', this.shouldRender());
		this.titleLabel.value?.updateTitle(title, this.getIcon());

		const currentHeight = this.getHeight();
		if (currentHeight !== this.lastKnownHeight) {
			this.lastKnownHeight = currentHeight;

			this._onDidChangeHeight.fire();
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

	private shouldRender(): boolean {
		if (!this.isEnabled()) {
			return false; // title hidden via setting
		}

		return !!this.model?.title; // we need a chat showing and not being empty
	}

	private isEnabled(): boolean {
		return this.configurationService.getValue<boolean>(ChatConfiguration.ChatViewTitleEnabled) === true;
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

	private titleLabel: HTMLSpanElement | undefined = undefined;
	private titleIcon: HTMLSpanElement | undefined = undefined;

	constructor(action: IAction, options?: IActionViewItemOptions) {
		super(null, action, { ...options, icon: false, label: true });
	}

	override render(container: HTMLElement): void {
		super.render(container);

		container.classList.add('chat-view-title-action-item');
		this.label?.classList.add('chat-view-title-label-container');

		this.titleIcon = this.label?.appendChild(h('span').root);
		this.titleLabel = this.label?.appendChild(h('span.chat-view-title-label').root);
	}

	updateTitle(title: string, icon: ThemeIcon | undefined): void {
		this.title = title;

		this.updateLabel();
		this.updateIcon(icon);
	}

	protected override updateLabel(): void {
		if (this.options.label && this.titleLabel && typeof this.title === 'string') {
			this.titleLabel.textContent = this.title;
		}
	}

	private updateIcon(icon: ThemeIcon | undefined): void {
		if (!this.titleIcon) {
			return;
		}

		if (icon) {
			this.titleIcon.className = ThemeIcon.asClassName(icon);
		} else {
			this.titleIcon.className = '';
		}
	}
}
