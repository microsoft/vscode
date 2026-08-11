/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatViewTitleControl.css';
import { addDisposableListener, EventType, h, isHTMLElement } from '../../../../../../base/browser/dom.js';
import { renderAsPlaintext } from '../../../../../../base/browser/markdownRenderer.js';
import { Gesture, EventType as TouchEventType } from '../../../../../../base/browser/touch.js';
import { ActionViewItem, IActionViewItemOptions } from '../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Action, IAction } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { MarshalledId } from '../../../../../../base/common/marshallingIds.js';
import { autorun, IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar, WorkbenchToolBar } from '../../../../../../platform/actions/browser/toolbar.js';
import { Action2, MenuId, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { SessionChangesMetaActionViewItem, SessionHeaderMetaActionViewItem } from '../../../../../browser/parts/sessionHeaderMetaActionViewItem.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IChatViewTitleActionContext } from '../../../common/actions/chatActions.js';
import { IChatModel } from '../../../common/model/chatModel.js';
import { createAgentSessionChangesEditorInput, getAgentChangesSummary, getAgentSessionPullRequestUri, hasValidDiff, IAgentSession } from '../../agentSessions/agentSessionsModel.js';
import { AgentSessionsPicker } from '../../agentSessions/agentSessionsPicker.js';
import { IAgentSessionsService } from '../../agentSessions/agentSessionsService.js';

const VIEW_ALL_AGENT_SESSION_CHANGES_COMMAND_ID = 'chatEditing.viewAllSessionChanges';
const VIEW_AGENT_SESSION_CHANGES_ACTION_ID = 'workbench.action.chat.viewAgentSessionChanges';
const OPEN_AGENT_SESSION_PULL_REQUEST_ACTION_ID = 'workbench.action.chat.openAgentSessionPullRequest';

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
	private modelDisposables = this._register(new MutableDisposable<DisposableStore>());
	private readonly session = observableValue<IAgentSession | undefined>(this, undefined);

	private navigationToolbar?: MenuWorkbenchToolBar;
	private sessionMetaToolbar?: WorkbenchToolBar;
	private sessionMetaContainer?: HTMLElement;
	private actionsToolbar?: MenuWorkbenchToolBar;
	private readonly sessionMetaActionViewItems = new Map<string, SessionHeaderMetaActionViewItem>();
	private readonly viewChangesAction: Action;
	private readonly openPullRequestAction: Action;

	private lastKnownHeight = 0;

	constructor(
		private readonly container: HTMLElement,
		private readonly delegate: IChatViewTitleDelegate,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();

		this.viewChangesAction = this._register(new Action(
			VIEW_AGENT_SESSION_CHANGES_ACTION_ID,
			localize('chat.viewAgentSessionChanges', "Changes"),
			ThemeIcon.asClassName(Codicon.diffMultiple),
			true,
			async () => this.executeSessionMetaAction(VIEW_AGENT_SESSION_CHANGES_ACTION_ID),
		));
		this.openPullRequestAction = this._register(new Action(
			OPEN_AGENT_SESSION_PULL_REQUEST_ACTION_ID,
			localize('chat.openAgentSessionPullRequest', "Open Pull Request"),
			ThemeIcon.asClassName(Codicon.gitPullRequest),
			true,
			async () => this.executeSessionMetaAction(OPEN_AGENT_SESSION_PULL_REQUEST_ACTION_ID),
		));

		this.render(this.container);

		this.registerActions();
	}

	private registerActions(): void {
		const that = this;

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

				const agentSessionsPicker = instantiationService.createInstance(AgentSessionsPicker, that.titleLabel.value?.element, undefined);
				await agentSessionsPicker.pickAgentSession();
			}
		}));
	}

	private render(parent: HTMLElement): void {
		const elements = h('div.chat-view-title-container', [
			h('div.chat-view-title-inner', [
				h('div.chat-view-title-navigation-toolbar@navigationToolbar'),
				h('div.chat-view-title-session-meta.chat-composite-bar-meta-toolbar@sessionMeta'),
				h('div.chat-view-title-actions-toolbar@actionsToolbar'),
			]),
		]);

		// Toolbar on the left
		this.navigationToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, elements.navigationToolbar, MenuId.ChatViewSessionTitleNavigationToolbar, {
			actionViewItemProvider: action => {
				if (action.id === ChatViewTitleControl.PICK_AGENT_SESSION_ACTION_ID) {
					this.titleLabel.value = new ChatViewTitleLabel(action);
					this.titleLabel.value.updateTitle(this.title ?? ChatViewTitleControl.DEFAULT_TITLE);

					return this.titleLabel.value;
				}

				return undefined;
			},
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			menuOptions: { shouldForwardArgs: true }
		}));

		this.sessionMetaContainer = elements.sessionMeta;
		this.sessionMetaToolbar = this._register(this.instantiationService.createInstance(WorkbenchToolBar, elements.sessionMeta, {
			ariaLabel: localize('chat.sessionMetadata', "Chat Session Metadata"),
			responsiveBehavior: {
				enabled: true,
				kind: 'all',
				minItems: 0,
				observedElement: elements.sessionMeta,
			},
			actionViewItemProvider: (action, options) => {
				if (options.isMenu) {
					return undefined;
				}

				let item: SessionHeaderMetaActionViewItem | undefined;
				if (action.id === VIEW_AGENT_SESSION_CHANGES_ACTION_ID) {
					item = new SessionChangesMetaActionViewItem(undefined, action, options, reader => {
						const session = this.session.read(reader);
						const summary = getAgentChangesSummary(session?.changes);
						const branchName = session?.metadata?.branchName;
						const branch = session?.metadata?.branch;
						return {
							branch: typeof branchName === 'string' ? branchName : typeof branch === 'string' ? branch : undefined,
							files: summary?.files ?? 0,
							insertions: summary?.insertions ?? 0,
							deletions: summary?.deletions ?? 0,
						};
					});
				} else if (action.id === OPEN_AGENT_SESSION_PULL_REQUEST_ACTION_ID) {
					item = new ChatViewTitlePullRequestActionViewItem(action, options, this.session);
				}

				if (item) {
					this.sessionMetaActionViewItems.set(action.id, item);
				}
				return item;
			},
		}));
		this._register(autorun(reader => {
			const session = this.session.read(reader);
			const actions: IAction[] = [];
			if (hasValidDiff(session?.changes)) {
				actions.push(this.viewChangesAction);
			}
			if (session && getAgentSessionPullRequestUri(session)) {
				actions.push(this.openPullRequestAction);
			}
			this.setSessionMetaActions(actions);
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

	private executeSessionMetaAction(actionId: string): Promise<unknown> | undefined {
		const context = this.getTitleActionContext();
		return context ? this.commandService.executeCommand(actionId, context) : undefined;
	}

	private getTitleActionContext(): IChatViewTitleActionContext | undefined {
		return this.model && {
			$mid: MarshalledId.ChatViewContext,
			sessionResource: this.model.sessionResource,
		};
	}

	private setSessionMetaActions(actions: readonly IAction[]): void {
		if (!this.sessionMetaToolbar || !this.sessionMetaContainer) {
			return;
		}

		const activeElement = this.sessionMetaContainer.ownerDocument.activeElement;
		const focusedActionId = isHTMLElement(activeElement) && this.sessionMetaToolbar.getElement().contains(activeElement)
			? this.sessionMetaToolbar.getItemAction(activeElement)?.id
			: undefined;

		this.sessionMetaContainer.classList.toggle('visible', actions.length > 0);
		this.sessionMetaActionViewItems.clear();
		this.sessionMetaToolbar.setActions(actions);

		if (focusedActionId) {
			const focusedItem = this.sessionMetaActionViewItems.get(focusedActionId);
			if (focusedItem) {
				focusedItem.focus();
			} else {
				this.navigationToolbar?.focus();
			}
		}
	}

	update(model: IChatModel | undefined): void {
		this.model = model;

		const store = new DisposableStore();
		this.modelDisposables.value = store;
		this.session.set(undefined, undefined);
		if (model) {
			store.add(model.onDidChange(e => {
				if (e.kind === 'setCustomTitle' || e.kind === 'addRequest') {
					this.doUpdate();
				}
			}));
			const session = this.agentSessionsService.model.observeSession(model.sessionResource);
			store.add(autorun(reader => this.session.set(session.read(reader), undefined)));
		}

		this.doUpdate();
	}

	private doUpdate(): void {
		const markdownTitle = new MarkdownString(this.model?.title ?? '');
		this.title = renderAsPlaintext(markdownTitle);

		this.updateTitle(this.title ?? ChatViewTitleControl.DEFAULT_TITLE);

		const context = this.getTitleActionContext();

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
		this.titleLabel.value?.updateTitle(title);

		const currentHeight = this.getHeight();
		if (currentHeight !== this.lastKnownHeight) {
			this.lastKnownHeight = currentHeight;

			this._onDidChangeHeight.fire();
		}
	}

	private shouldRender(): boolean {
		return !!this.model?.title; // we need a chat showing and not being empty
	}

	getHeight(): number {
		if (!this.titleContainer || this.titleContainer.style.display === 'none') {
			return 0;
		}

		return this.titleContainer.offsetHeight;
	}
}

class ViewAgentSessionChangesAction extends Action2 {

	constructor() {
		super({
			id: VIEW_AGENT_SESSION_CHANGES_ACTION_ID,
			title: localize('chat.viewAgentSessionChanges', "Changes"),
			icon: Codicon.diffMultiple,
			f1: false,
		});
	}

	override async run(accessor: ServicesAccessor, context?: IChatViewTitleActionContext): Promise<void> {
		const resource = context?.sessionResource;
		const session = resource && accessor.get(IAgentSessionsService).getSession(resource);
		if (!resource || !session) {
			accessor.get(INotificationService).warn(localize('chat.agentSessionChangesUnavailable', "The chat session changes are no longer available."));
			return;
		}

		if (CommandsRegistry.getCommand(VIEW_ALL_AGENT_SESSION_CHANGES_COMMAND_ID)) {
			await accessor.get(ICommandService).executeCommand(VIEW_ALL_AGENT_SESSION_CHANGES_COMMAND_ID, resource, session.metadata);
			return;
		}

		const editorInput = createAgentSessionChangesEditorInput(session);
		if (!editorInput) {
			accessor.get(INotificationService).warn(localize('chat.agentSessionChangesCannotOpen', "The chat session did not provide file changes that can be opened."));
			return;
		}
		await accessor.get(IEditorService).openEditor(editorInput);
	}
}
registerAction2(ViewAgentSessionChangesAction);

class OpenAgentSessionPullRequestAction extends Action2 {

	constructor() {
		super({
			id: OPEN_AGENT_SESSION_PULL_REQUEST_ACTION_ID,
			title: localize('chat.openAgentSessionPullRequest', "Open Pull Request"),
			icon: Codicon.gitPullRequest,
			f1: false,
		});
	}

	override async run(accessor: ServicesAccessor, context?: IChatViewTitleActionContext): Promise<void> {
		const resource = context?.sessionResource;
		const session = resource && accessor.get(IAgentSessionsService).getSession(resource);
		const pullRequestUri = session && getAgentSessionPullRequestUri(session);
		if (!pullRequestUri) {
			accessor.get(INotificationService).warn(localize('chat.agentSessionPullRequestUnavailable', "The chat session pull request is no longer available."));
			return;
		}

		await accessor.get(IOpenerService).open(pullRequestUri, { openExternal: true });
	}
}
registerAction2(OpenAgentSessionPullRequestAction);

class ChatViewTitlePullRequestActionViewItem extends SessionHeaderMetaActionViewItem {

	constructor(
		action: IAction,
		options: IActionViewItemOptions,
		private readonly session: IObservable<IAgentSession | undefined>,
	) {
		super(undefined, action, options);

		this._register(autorun(reader => {
			this.session.read(reader);
			this.updateLabel();
			this.updateTooltip();
			this.updateAriaLabel();
		}));
	}

	protected override getLabelText(): string {
		const pullRequestNumber = this.session.get()?.metadata?.pullRequestNumber;
		return typeof pullRequestNumber === 'number'
			? `#${pullRequestNumber}`
			: localize('chat.agentSessionPullRequest', "Pull Request");
	}

	protected override getTooltip(): string {
		const pullRequestNumber = this.session.get()?.metadata?.pullRequestNumber;
		return typeof pullRequestNumber === 'number'
			? localize('chat.openAgentSessionPullRequest.tooltipWithNumber', "Open Pull Request #{0}", pullRequestNumber)
			: localize('chat.openAgentSessionPullRequest.tooltip', "Open Pull Request");
	}
}

class ChatViewTitleLabel extends ActionViewItem {

	private title: string | undefined;

	private titleLabel: HTMLSpanElement | undefined = undefined;

	constructor(action: IAction, options?: IActionViewItemOptions) {
		super(null, action, { ...options, icon: false, label: true });
	}

	override render(container: HTMLElement): void {
		super.render(container);

		container.classList.add('chat-view-title-action-item');
		this.label?.classList.add('chat-view-title-label-container');

		this.titleLabel = this.label?.appendChild(h('span.chat-view-title-label').root);

		this.updateLabel();
	}

	updateTitle(title: string): void {
		this.title = title;

		this.updateLabel();
	}

	protected override updateLabel(): void {
		if (!this.titleLabel) {
			return;
		}

		if (this.title) {
			this.titleLabel.textContent = this.title;
		} else {
			this.titleLabel.textContent = '';
		}
	}
}
