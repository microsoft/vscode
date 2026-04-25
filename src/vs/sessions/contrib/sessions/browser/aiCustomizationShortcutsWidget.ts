/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../browser/media/sidebarActionButton.css';
import './media/customizationsToolbar.css';
import * as DOM from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IPromptsService } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { IMcpService } from '../../../../workbench/contrib/mcp/common/mcpTypes.js';
import { IAICustomizationWorkspaceService } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { Menus } from '../../../browser/menus.js';
import { getCustomizationTotalCount, getActiveItemProvider } from './customizationCounts.js';
import { IAgentPluginService } from '../../../../workbench/contrib/chat/common/plugins/agentPluginService.js';
import { ICustomizationHarnessService } from '../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

const $ = DOM.$;

const CUSTOMIZATIONS_COLLAPSED_KEY = 'agentSessions.customizationsCollapsed';

export interface IAICustomizationShortcutsWidgetOptions {
	readonly onDidChangeLayout?: () => void;
}

export class AICustomizationShortcutsWidget extends Disposable {

	private _headerButton: Button | undefined;

	constructor(
		container: HTMLElement,
		options: IAICustomizationShortcutsWidgetOptions | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IStorageService private readonly storageService: IStorageService,
		@IPromptsService private readonly promptsService: IPromptsService,
		@IMcpService private readonly mcpService: IMcpService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IAICustomizationWorkspaceService private readonly workspaceService: IAICustomizationWorkspaceService,
		@IAgentPluginService private readonly agentPluginService: IAgentPluginService,
		@ICustomizationHarnessService private readonly harnessService: ICustomizationHarnessService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
	) {
		super();

		this._render(container, options);
	}

	private _render(parent: HTMLElement, options: IAICustomizationShortcutsWidgetOptions | undefined): void {
		// Get initial collapsed state
		const isCollapsed = this.storageService.getBoolean(CUSTOMIZATIONS_COLLAPSED_KEY, StorageScope.PROFILE, false);

		const container = DOM.append(parent, $('.ai-customization-toolbar'));
		if (isCollapsed) {
			container.classList.add('collapsed');
		}

		// Header (clickable to toggle)
		const header = DOM.append(container, $('.ai-customization-header'));
		header.classList.toggle('collapsed', isCollapsed);

		const headerButtonContainer = DOM.append(header, $('.customization-link-button-container'));
		const headerButton = this._register(new Button(headerButtonContainer, {
			...defaultButtonStyles,
			secondary: true,
			title: false,
			supportIcons: true,
			buttonSecondaryBackground: 'transparent',
			buttonSecondaryHoverBackground: undefined,
			buttonSecondaryForeground: undefined,
			buttonSecondaryBorder: undefined,
		}));
		headerButton.element.classList.add('customization-link-button', 'sidebar-action-button');
		headerButton.element.setAttribute('aria-expanded', String(!isCollapsed));
		headerButton.label = localize('customizations', "Customizations");
		this._headerButton = headerButton;

		const chevronContainer = DOM.append(headerButton.element, $('span.customization-link-counts'));
		const chevron = DOM.append(chevronContainer, $('.ai-customization-chevron'));
		const headerTotalCount = DOM.append(chevronContainer, $('span.ai-customization-header-total.hidden'));
		chevron.classList.add(...ThemeIcon.asClassNameArray(isCollapsed ? Codicon.chevronRight : Codicon.chevronDown));

		// Toolbar container
		const toolbarContainer = DOM.append(container, $('.ai-customization-toolbar-content.sidebar-action-list'));

		const toolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, toolbarContainer, Menus.SidebarCustomizations, {
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			toolbarOptions: { primaryGroup: () => true },
			telemetrySource: 'sidebarCustomizations',
		}));

		// Re-layout when toolbar items change (e.g., Plugins item appearing after extension activation)
		this._register(toolbar.onDidChangeMenuItems(() => {
			options?.onDidChangeLayout?.();
		}));

		let updateCountRequestId = 0;

		const updateHeaderTotalCount = async () => {
			const requestId = ++updateCountRequestId;
			const totalCount = await getCustomizationTotalCount(this.promptsService, this.mcpService, this.workspaceService, this.workspaceContextService, this.agentPluginService, getActiveItemProvider(this.sessionsManagementService, this.harnessService));
			if (requestId !== updateCountRequestId) {
				return;
			}

			headerTotalCount.classList.toggle('hidden', totalCount === 0);
			headerTotalCount.textContent = `${totalCount}`;
		};

		this._register(this.promptsService.onDidChangeCustomAgents(() => updateHeaderTotalCount()));
		this._register(this.promptsService.onDidChangeSlashCommands(() => updateHeaderTotalCount()));
		this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => updateHeaderTotalCount()));
		this._register(autorun(reader => {
			this.mcpService.servers.read(reader);
			updateHeaderTotalCount();
		}));
		this._register(autorun(reader => {
			this.workspaceService.activeProjectRoot.read(reader);
			updateHeaderTotalCount();
		}));
		this._register(autorun(reader => {
			this.sessionsManagementService.activeSession.read(reader);
			this.harnessService.availableHarnesses.read(reader);
			const provider = getActiveItemProvider(this.sessionsManagementService, this.harnessService);
			if (provider) {
				reader.store.add(provider.onDidChange(() => updateHeaderTotalCount()));
			}
			updateHeaderTotalCount();
		}));
		updateHeaderTotalCount();

		// Toggle collapse on header click
		const transitionListener = this._register(new MutableDisposable());
		const toggleCollapse = () => {
			const collapsed = container.classList.toggle('collapsed');
			header.classList.toggle('collapsed', collapsed);
			this.storageService.store(CUSTOMIZATIONS_COLLAPSED_KEY, collapsed, StorageScope.PROFILE, StorageTarget.USER);
			headerButton.element.setAttribute('aria-expanded', String(!collapsed));
			chevron.classList.remove(...ThemeIcon.asClassNameArray(Codicon.chevronRight), ...ThemeIcon.asClassNameArray(Codicon.chevronDown));
			chevron.classList.add(...ThemeIcon.asClassNameArray(collapsed ? Codicon.chevronRight : Codicon.chevronDown));

			// Re-layout after the transition
			transitionListener.value = DOM.addDisposableListener(toolbarContainer, 'transitionend', () => {
				transitionListener.clear();
				options?.onDidChangeLayout?.();
			});
		};

		this._register(headerButton.onDidClick(() => toggleCollapse()));
	}

	focus(): void {
		this._headerButton?.element.focus();
	}
}
