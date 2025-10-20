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
import { WorkbenchCompressibleAsyncDataTree } from '../../../../../platform/list/browser/listService.js';
import { $, append } from '../../../../../base/browser/dom.js';
import { AgentSessionsViewModel, IAgentSessionViewModel, IAgentSessionsViewModel } from './agentSessionViewModel.js';
import { AgentSessionRenderer, AgentSessionsAccessibilityProvider, AgentSessionsCompressionDelegate, AgentSessionsDataSource, AgentSessionsFilter, AgentSessionsIdentityProvider, AgentSessionsListDelegate } from './agentSessionsViewer.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { ButtonWithDropdown } from '../../../../../base/browser/ui/button/button.js';
import { IAction, Separator, toAction } from '../../../../../base/common/actions.js';
import { FuzzyScore } from '../../../../../base/common/filters.js';
import { MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';

export class AgentSessionsView extends FilterViewPane {

	private static FILTER_FOCUS_CONTEXT_KEY = new RawContextKey<boolean>('agentSessionsViewFilterFocus', false);

	private list: WorkbenchCompressibleAsyncDataTree<IAgentSessionsViewModel, IAgentSessionViewModel, FuzzyScore> | undefined;
	private filter: AgentSessionsFilter | undefined;

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
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService
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

		// New Button
		this.createNewSessionButton(container);

		// List
		this.createList(container);

		this.registerListeners();
	}

	private registerListeners(): void {

		// Filter
		this._register(this.filterWidget.onDidChangeFilterText(() => {
			if (this.filter) {
				this.filter.pattern = this.filterWidget.getFilterText() || '';
				this.list?.refilter();
			}
		}));

		this._register(this.filterWidget.onDidAcceptFilterText(() => {
			this.list?.domFocus();
			if (this.list?.getFocus().length === 0) {
				this.list?.focusFirst();
			}
		}));

		// List
		this._register(this.onDidChangeBodyVisibility(visible => {
			if (!visible || this.sessionsViewModel) {
				return;
			}

			this.sessionsViewModel = this._register(this.instantiationService.createInstance(AgentSessionsViewModel));
			this.list?.setInput(this.sessionsViewModel);
		}));

		this._register(this.chatSessionsService.onDidChangeItemsProviders(() => this.list?.updateChildren()));
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
					title: localize2('refresh', "Refresh Sessions"),
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
				view.list?.updateChildren();
			}
		}));
	}

	//#region New Session Controls

	private newSessionContainer: HTMLElement | undefined;

	private createNewSessionButton(container: HTMLElement): void {
		this.newSessionContainer = append(container, $('.agent-sessions-new-session-container'));

		// TODO@bpasero: Implement new session creation and registry lookup of providers

		const dropdownActions: IAction[] = [
			toAction({ id: 'action1', label: localize('agentSessions.action1', "Local Chat"), run: () => { /* TODO */ } }),
			toAction({ id: 'action2', label: localize('agentSessions.action2', "Remote Chat"), run: () => { /* TODO */ } }),
			new Separator(),
			toAction({ id: 'installMore', label: localize('agentSessions.installMore', "Install More..."), run: () => { /* TODO */ } })
		];

		const newSessionButton = this._register(new ButtonWithDropdown(this.newSessionContainer, {
			...defaultButtonStyles,
			title: localize('agentSessions.newSession', "New Agent Session"),
			ariaLabel: localize('agentSessions.newSessionAriaLabel', "New Agent Session"),
			contextMenuProvider: this.contextMenuService,
			actions: dropdownActions,
			addPrimaryActionToDropdown: false
		}));

		newSessionButton.label = localize('agentSessions.newSession', "New Agent Session");

		this._register(newSessionButton.onDidClick(() => {
			// TODO
		}));
	}

	//#endregion

	//#region Sessions List

	private createList(container: HTMLElement): void {
		const listContainer = append(container, $('.agent-sessions-viewer'));

		this.filter = this._register(new AgentSessionsFilter());

		this.list = this._register(this.instantiationService.createInstance(WorkbenchCompressibleAsyncDataTree,
			'AgentSessionsView',
			listContainer,
			new AgentSessionsListDelegate(),
			new AgentSessionsCompressionDelegate(),
			[
				new AgentSessionRenderer()
			],
			new AgentSessionsDataSource(),
			{
				accessibilityProvider: new AgentSessionsAccessibilityProvider(),
				identityProvider: new AgentSessionsIdentityProvider(),
				horizontalScrolling: false,
				multipleSelectionSupport: false,
				filter: this.filter
			}
		)) as WorkbenchCompressibleAsyncDataTree<IAgentSessionsViewModel, IAgentSessionViewModel, FuzzyScore>;
	}

	//#endregion

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);

		let treeHeight = height;
		treeHeight -= this.filterContainer?.offsetHeight ?? 0;
		if (this.newSessionContainer) {
			treeHeight -= this.newSessionContainer.offsetHeight;
		}

		this.list?.layout(treeHeight, width);
	}

	protected override layoutBodyContent(height: number, width: number): void {
		// TODO@bpasero we deal with layout in layoutBody because we heavily customize it, reconsider using view filter inheritance
	}

	override focus(): void {
		super.focus();

		if (this.list?.getFocus().length) {
			this.list?.domFocus();
		} else {
			this.filterWidget.focus();
		}
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
}, ViewContainerLocation.Sidebar);

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
