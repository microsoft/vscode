/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentsessionsview.css';
import { Codicon } from '../../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../../nls.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../../platform/theme/common/iconRegistry.js';
import { FilterViewPane, IViewPaneOptions, ViewAction } from '../../../../browser/parts/views/viewPane.js';
import { ViewPaneContainer } from '../../../../browser/parts/views/viewPaneContainer.js';
import { IViewContainersRegistry, Extensions as ViewExtensions, ViewContainerLocation, IViewsRegistry, IViewDescriptor, IViewDescriptorService } from '../../../../common/views.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { ChatConfiguration } from '../../common/constants.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IOpenEvent, WorkbenchCompressibleAsyncDataTree } from '../../../../../platform/list/browser/listService.js';
import { $, append } from '../../../../../base/browser/dom.js';
import { AgentSessionsViewModel, IAgentSessionViewModel, IAgentSessionsViewModel, LOCAL_AGENT_SESSION_TYPE, isLocalAgentSessionItem } from './agentSessionViewModel.js';
import { AgentSessionRenderer, AgentSessionsAccessibilityProvider, AgentSessionsCompressionDelegate, AgentSessionsDataSource, AgentSessionsFilter, AgentSessionsIdentityProvider, AgentSessionsListDelegate, AgentSessionsSorter } from './agentSessionsViewer.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { ButtonWithDropdown } from '../../../../../base/browser/ui/button/button.js';
import { IAction, toAction } from '../../../../../base/common/actions.js';
import { FuzzyScore } from '../../../../../base/common/filters.js';
import { MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { findExistingChatEditorByUri, NEW_CHAT_SESSION_ACTION_ID } from '../chatSessions/common.js';
import { ACTION_ID_OPEN_CHAT } from '../actions/chatActions.js';
import { IProgressService } from '../../../../../platform/progress/common/progress.js';
import { ChatSessionUri } from '../../common/chatUri.js';
import { IChatEditorOptions } from '../chatEditor.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ChatEditorInput } from '../chatEditorInput.js';
import { assertReturnsDefined } from '../../../../../base/common/types.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { URI } from '../../../../../base/common/uri.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { MutableDisposable } from '../../../../../base/common/lifecycle.js';

export class AgentSessionsView extends FilterViewPane {

	private static FILTER_FOCUS_CONTEXT_KEY = new RawContextKey<boolean>('agentSessionsViewFilterFocus', false);

	private sessionsViewModel: IAgentSessionsViewModel | undefined;

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
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@ICommandService private readonly commandService: ICommandService,
		@IProgressService private readonly progressService: IProgressService,
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
	) {
		super({
			...options,
			filterOptions: {
				placeholder: localize('agentSessions.filterPlaceholder', "Type to filter agent sessions"),
				ariaLabel: localize('agentSessions.filterAriaLabel', "Filter Agent Sessions"),
				focusContextKey: AgentSessionsView.FILTER_FOCUS_CONTEXT_KEY.key
			}
		}, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		this.registerActions();
	}

	override shouldShowFilterInHeader(): boolean {
		return false;
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		container.classList.add('agent-sessions-view');

		// New Session
		this.createNewSessionButton(container);

		// Sessions List
		this.createList(container);

		this.registerListeners();
	}

	private registerListeners(): void {
		const list = assertReturnsDefined(this.list);

		// Sessions Filter
		this._register(this.filterWidget.onDidChangeFilterText(() => {
			if (this.filter) {
				this.filter.pattern = this.filterWidget.getFilterText() || '';
				list.refilter();
			}
		}));

		// Sessions List
		this._register(this.onDidChangeBodyVisibility(visible => {
			if (!visible || this.sessionsViewModel) {
				return;
			}

			this.createViewModel();
		}));

		this._register(list.onDidOpen(e => {
			this.openAgentSession(e);
		}));

		this._register(list.onMouseDblClick(({ element }) => {
			if (element === null) {
				this.commandService.executeCommand(ACTION_ID_OPEN_CHAT);
			}
		}));
	}

	private async openAgentSession(e: IOpenEvent<IAgentSessionViewModel | undefined>) {
		const session = e.element;
		if (!session) {
			return;
		}

		if (session.resource.scheme !== ChatSessionUri.scheme) {
			await this.openerService.open(session.resource);
			return;
		}

		const uri = ChatSessionUri.forSession(session.provider.chatSessionType, session.id);
		const existingSessionEditor = findExistingChatEditorByUri(uri, session.id, this.editorGroupsService);
		if (existingSessionEditor) {
			await this.editorGroupsService.getGroup(existingSessionEditor.groupId)?.openEditor(existingSessionEditor.editor, e.editorOptions);
			return;
		}

		let sessionResource: URI;
		let sessionOptions: IChatEditorOptions;
		if (isLocalAgentSessionItem(session)) {
			sessionResource = ChatEditorInput.getNewEditorUri();
			sessionOptions = { target: { sessionId: session.id } };
		} else {
			sessionResource = ChatSessionUri.forSession(session.provider.chatSessionType, session.id);
			sessionOptions = { title: { preferred: session.label } };
		}

		sessionOptions.ignoreInView = true;

		await this.editorService.openEditor({ resource: sessionResource, options: sessionOptions });
	}

	private registerActions(): void {
		this._register(registerAction2(class extends ViewAction<AgentSessionsView> {
			constructor() {
				super({
					id: 'agentSessionsView.clearFilterText',
					title: localize('clearFiltersText', "Clear Filter"),
					keybinding: {
						when: AgentSessionsView.FILTER_FOCUS_CONTEXT_KEY,
						weight: KeybindingWeight.WorkbenchContrib,
						primary: KeyCode.Escape
					},
					viewId: AGENT_SESSIONS_VIEW_ID
				});
			}
			runInView(accessor: ServicesAccessor, view: AgentSessionsView): void {
				view.filterWidget?.setFilterText('');
			}
		}));

		this._register(registerAction2(class extends ViewAction<AgentSessionsView> {
			constructor() {
				super({
					id: 'agentSessionsView.refresh',
					title: localize2('refresh', "Refresh Agent Sessions"),
					icon: Codicon.refresh,
					menu: {
						id: MenuId.ViewTitle,
						when: ContextKeyExpr.equals('view', AGENT_SESSIONS_VIEW_ID),
						group: 'navigation'
					},
					viewId: AGENT_SESSIONS_VIEW_ID
				});
			}
			runInView(accessor: ServicesAccessor, view: AgentSessionsView): void {
				view.sessionsViewModel?.resolve(undefined);
			}
		}));
	}

	//#region New Session Controls

	private newSessionContainer: HTMLElement | undefined;

	private createNewSessionButton(container: HTMLElement): void {
		this.newSessionContainer = append(container, $('.agent-sessions-new-session-container'));

		const primaryAction = toAction({
			id: 'agentSessions.newSession.primary',
			label: localize('agentSessions.newSession', "New Session"),
			run: () => this.commandService.executeCommand(ACTION_ID_OPEN_CHAT)
		});

		const newSessionButton = this._register(new ButtonWithDropdown(this.newSessionContainer, {
			title: localize('agentSessions.newSession', "New Session"),
			ariaLabel: localize('agentSessions.newSessionAriaLabel', "New Session"),
			contextMenuProvider: this.contextMenuService,
			actions: {
				getActions: () => {
					const actions: IAction[] = [];
					for (const provider of this.chatSessionsService.getAllChatSessionContributions()) {
						if (provider.type === LOCAL_AGENT_SESSION_TYPE) {
							continue; // local is the primary action
						}

						actions.push(toAction({
							id: `newChatSessionFromProvider.${provider.type}`,
							label: localize('newChatSessionFromProvider', "New Session ({0})", provider.displayName),
							run: () => this.commandService.executeCommand(`${NEW_CHAT_SESSION_ACTION_ID}.${provider.type}`)
						}));
					}
					return actions;
				}
			},
			addPrimaryActionToDropdown: false,
			...defaultButtonStyles,
		}));

		newSessionButton.label = localize('agentSessions.newSession', "New Session");

		this._register(newSessionButton.onDidClick(() => primaryAction.run()));
	}

	//#endregion

	//#region Sessions List

	private listContainer: HTMLElement | undefined;
	private list: WorkbenchCompressibleAsyncDataTree<IAgentSessionsViewModel, IAgentSessionViewModel, FuzzyScore> | undefined;
	private filter: AgentSessionsFilter | undefined;

	private createList(container: HTMLElement): void {
		this.listContainer = append(container, $('.agent-sessions-viewer'));

		this.filter = this._register(new AgentSessionsFilter());

		this.list = this._register(this.instantiationService.createInstance(WorkbenchCompressibleAsyncDataTree,
			'AgentSessionsView',
			this.listContainer,
			new AgentSessionsListDelegate(),
			new AgentSessionsCompressionDelegate(),
			[
				this.instantiationService.createInstance(AgentSessionRenderer)
			],
			new AgentSessionsDataSource(),
			{
				accessibilityProvider: new AgentSessionsAccessibilityProvider(),
				identityProvider: new AgentSessionsIdentityProvider(),
				horizontalScrolling: false,
				multipleSelectionSupport: false,
				filter: this.filter,
				sorter: new AgentSessionsSorter(),
				paddingBottom: AgentSessionsListDelegate.ITEM_HEIGHT
			}
		)) as WorkbenchCompressibleAsyncDataTree<IAgentSessionsViewModel, IAgentSessionViewModel, FuzzyScore>;
	}

	private createViewModel(): void {
		const sessionsViewModel = this.sessionsViewModel = this._register(this.instantiationService.createInstance(AgentSessionsViewModel));
		this.list?.setInput(sessionsViewModel);

		this._register(sessionsViewModel.onDidChangeSessions(() => this.list?.updateChildren()));

		const didResolveDisposable = this._register(new MutableDisposable());
		this._register(sessionsViewModel.onWillResolve(() => {
			const didResolve = new DeferredPromise<void>();
			didResolveDisposable.value = Event.once(sessionsViewModel.onDidResolve)(() => didResolve.complete());

			this.progressService.withProgress(
				{
					location: this.id,
					title: localize('agentSessions.refreshing', 'Refreshing agent sessions...'),
					delay: 500
				},
				() => didResolve.p
			);
		}));
	}

	//#endregion

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);

		let treeHeight = height;
		treeHeight -= this.filterContainer?.offsetHeight ?? 0;
		treeHeight -= this.newSessionContainer?.offsetHeight ?? 0;

		this.list?.layout(treeHeight, width);
	}

	protected override layoutBodyContent(height: number, width: number): void {
		// TODO@bpasero we deal with layout in layoutBody because we heavily customize it, reconsider using view filter inheritance
	}

	override focus(): void {
		super.focus();

		if (this.list?.getFocus().length) {
			this.list.domFocus();
		} else {
			this.filterWidget.focus();
		}
	}

	protected override focusBodyContent(): void {
		this.list?.domFocus();
	}
}

//#region View Registration

const chatAgentsIcon = registerIcon('chat-sessions-icon', Codicon.commentDiscussionSparkle, 'Icon for Agent Sessions View');

const AGENT_SESSIONS_VIEW_CONTAINER_ID = 'workbench.viewContainer.agentSessions';
const AGENT_SESSIONS_VIEW_ID = 'workbench.view.agentSessions';
const AGENT_SESSIONS_VIEW_TITLE = localize2('agentSessions.view.label', "Agent Sessions");

const agentSessionsViewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: AGENT_SESSIONS_VIEW_CONTAINER_ID,
	title: AGENT_SESSIONS_VIEW_TITLE,
	icon: chatAgentsIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [AGENT_SESSIONS_VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: AGENT_SESSIONS_VIEW_CONTAINER_ID,
	hideIfEmpty: true,
	order: 6,
}, ViewContainerLocation.AuxiliaryBar);

const agentSessionsViewDescriptor: IViewDescriptor = {
	id: AGENT_SESSIONS_VIEW_ID,
	containerIcon: chatAgentsIcon,
	containerTitle: AGENT_SESSIONS_VIEW_TITLE.value,
	singleViewPaneContainerTitle: AGENT_SESSIONS_VIEW_TITLE.value,
	name: AGENT_SESSIONS_VIEW_TITLE,
	canToggleVisibility: false,
	canMoveView: true,
	openCommandActionDescriptor: {
		id: AGENT_SESSIONS_VIEW_ID,
		title: AGENT_SESSIONS_VIEW_TITLE
	},
	ctorDescriptor: new SyncDescriptor(AgentSessionsView),
	when: ContextKeyExpr.and(
		ChatContextKeys.Setup.hidden.negate(),
		ChatContextKeys.Setup.disabled.negate(),
		ContextKeyExpr.equals(`config.${ChatConfiguration.AgentSessionsViewLocation}`, 'single-view'),
	)
};
Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([agentSessionsViewDescriptor], agentSessionsViewContainer);

//#endregion
