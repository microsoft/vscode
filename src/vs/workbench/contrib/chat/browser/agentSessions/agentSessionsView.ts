/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { localize2 } from '../../../../../nls.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../../platform/theme/common/iconRegistry.js';
import { IViewPaneOptions, ViewPane } from '../../../../browser/parts/views/viewPane.js';
import { ViewPaneContainer } from '../../../../browser/parts/views/viewPaneContainer.js';
import { IViewContainersRegistry, Extensions as ViewExtensions, ViewContainerLocation, IViewsRegistry, IViewDescriptor, IViewDescriptorService } from '../../../../common/views.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { ChatConfiguration } from '../../common/constants.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { WorkbenchCompressibleAsyncDataTree } from '../../../../../platform/list/browser/listService.js';
import { $, append } from '../../../../../base/browser/dom.js';
import { AgentSessionsViewModel, IAgentSessionViewModel, IAgentSessionsViewModel } from './agentSessionViewModel.js';
import { AgentSessionRenderer, AgentSessionsAccessibilityProvider, AgentSessionsCompressionDelegate, AgentSessionsDataSource, AgentSessionsIdentityProvider, AgentSessionsListDelegate } from './agentSessionsViewer.js';

export class AgentSessionsView extends ViewPane {

	private listContainer: HTMLElement | undefined;
	private list: WorkbenchCompressibleAsyncDataTree<IAgentSessionsViewModel, IAgentSessionViewModel> | undefined;

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

	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		container.classList.add('agent-sessions-view');

		this.listContainer = append(container, $('.agent-sessions-viewer'));
		this.createList(this.listContainer);

		this._register(this.onDidChangeBodyVisibility(visible => {
			if (!visible || this.sessionsViewModel) {
				return;
			}

			this.sessionsViewModel = this._register(this.instantiationService.createInstance(AgentSessionsViewModel));
			this.list?.setInput(this.sessionsViewModel);
		}));
	}

	private createList(container: HTMLElement): void {
		this.list = this._register(this.instantiationService.createInstance(WorkbenchCompressibleAsyncDataTree,
			'AgentSessionsView',
			container,
			new AgentSessionsListDelegate(),
			new AgentSessionsCompressionDelegate(),
			[new AgentSessionRenderer()],
			new AgentSessionsDataSource(),
			{
				accessibilityProvider: new AgentSessionsAccessibilityProvider(),
				identityProvider: new AgentSessionsIdentityProvider(),
				horizontalScrolling: false,
				multipleSelectionSupport: false
			}
		)) as WorkbenchCompressibleAsyncDataTree<IAgentSessionsViewModel, IAgentSessionViewModel>;
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);

		this.list?.layout(height, width);
	}

	override focus(): void {
		super.focus();

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
