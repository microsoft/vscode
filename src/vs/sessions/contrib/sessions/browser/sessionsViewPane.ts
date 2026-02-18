/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionsViewPane.css';
import * as DOM from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { autorun } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IViewPaneOptions, ViewPane } from '../../../../workbench/browser/parts/views/viewPane.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../workbench/common/views.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { localize, localize2 } from '../../../../nls.js';
import { AgentSessionsControl } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsControl.js';
import { AgentSessionsFilter, AgentSessionsGrouping } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsFilter.js';
import { ISessionsManagementService } from './sessionsManagementService.js';
import { Action2, ISubmenuItem, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ACTION_ID_NEW_CHAT } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { AICustomizationManagementEditor } from '../../aiCustomizationManagement/browser/aiCustomizationManagementEditor.js';
import { AICustomizationManagementSection } from '../../aiCustomizationManagement/browser/aiCustomizationManagement.js';
import { AICustomizationManagementEditorInput } from '../../aiCustomizationManagement/browser/aiCustomizationManagementEditorInput.js';
import { IPromptsService, PromptsStorage } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { IMcpService } from '../../../../workbench/contrib/mcp/common/mcpTypes.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { agentIcon, instructionsIcon, promptIcon, skillIcon, hookIcon, workspaceIcon, userIcon, extensionIcon } from '../../aiCustomizationTreeView/browser/aiCustomizationTreeViewIcons.js';

const $ = DOM.$;
export const SessionsViewId = 'agentic.workbench.view.sessionsView';
const SessionsViewFilterSubMenu = new MenuId('AgentSessionsViewFilterSubMenu');

/**
 * Per-source breakdown of item counts.
 */
interface ISourceCounts {
	readonly workspace: number;
	readonly user: number;
	readonly extension: number;
}

interface IShortcutItem {
	readonly label: string;
	readonly icon: ThemeIcon;
	readonly action: () => Promise<void>;
	readonly getSourceCounts?: () => Promise<ISourceCounts>;
	/** For items without per-source breakdown (MCP, Models). */
	readonly getCount?: () => Promise<number>;
	countContainer?: HTMLElement;
}

const CUSTOMIZATIONS_COLLAPSED_KEY = 'agentSessions.customizationsCollapsed';

export class AgenticSessionsViewPane extends ViewPane {

	private viewPaneContainer: HTMLElement | undefined;
	private sessionsControlContainer: HTMLElement | undefined;
	sessionsControl: AgentSessionsControl | undefined;
	private aiCustomizationContainer: HTMLElement | undefined;
	private readonly shortcuts: IShortcutItem[] = [];

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
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@ICommandService commandService: ICommandService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IPromptsService private readonly promptsService: IPromptsService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IMcpService private readonly mcpService: IMcpService,
		@IStorageService private readonly storageService: IStorageService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ISessionsManagementService private readonly activeSessionService: ISessionsManagementService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		// Initialize shortcuts
		this.shortcuts = [
			{ label: localize('agents', "Agents"), icon: agentIcon, action: () => this.openAICustomizationSection(AICustomizationManagementSection.Agents), getSourceCounts: () => this.getPromptSourceCounts(PromptsType.agent) },
			{ label: localize('skills', "Skills"), icon: skillIcon, action: () => this.openAICustomizationSection(AICustomizationManagementSection.Skills), getSourceCounts: () => this.getSkillSourceCounts() },
			{ label: localize('instructions', "Instructions"), icon: instructionsIcon, action: () => this.openAICustomizationSection(AICustomizationManagementSection.Instructions), getSourceCounts: () => this.getPromptSourceCounts(PromptsType.instructions) },
			{ label: localize('prompts', "Prompts"), icon: promptIcon, action: () => this.openAICustomizationSection(AICustomizationManagementSection.Prompts), getSourceCounts: () => this.getPromptSourceCounts(PromptsType.prompt) },
			{ label: localize('hooks', "Hooks"), icon: hookIcon, action: () => this.openAICustomizationSection(AICustomizationManagementSection.Hooks), getSourceCounts: () => this.getPromptSourceCounts(PromptsType.hook) },
			{ label: localize('mcpServers', "MCP Servers"), icon: Codicon.server, action: () => this.openAICustomizationSection(AICustomizationManagementSection.McpServers), getCount: () => Promise.resolve(this.mcpService.servers.get().length) },
			{ label: localize('models', "Models"), icon: Codicon.vm, action: () => this.openAICustomizationSection(AICustomizationManagementSection.Models), getCount: () => Promise.resolve(this.languageModelsService.getLanguageModelIds().length) },
		];

		// Listen to changes to update counts
		this._register(this.promptsService.onDidChangeCustomAgents(() => this.updateCounts()));
		this._register(this.promptsService.onDidChangeSlashCommands(() => this.updateCounts()));
		this._register(this.languageModelsService.onDidChangeLanguageModels(() => this.updateCounts()));
		this._register(autorun(reader => {
			this.mcpService.servers.read(reader);
			this.updateCounts();
		}));

		// Listen to workspace folder changes to update counts
		this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => this.updateCounts()));
		this._register(autorun(reader => {
			this.activeSessionService.activeSession.read(reader);
			this.updateCounts();
		}));

	}

	protected override renderBody(parent: HTMLElement): void {
		super.renderBody(parent);

		this.viewPaneContainer = parent;
		this.viewPaneContainer.classList.add('agent-sessions-viewpane');

		this.createControls(parent);
	}

	private createControls(parent: HTMLElement): void {
		const sessionsContainer = DOM.append(parent, $('.agent-sessions-container'));

		// Sessions Filter (actions go to view title bar via menu registration)
		const sessionsFilter = this._register(this.instantiationService.createInstance(AgentSessionsFilter, {
			filterMenuId: SessionsViewFilterSubMenu,
			groupResults: () => AgentSessionsGrouping.Date
		}));

		// Sessions section (top, fills available space)
		const sessionsSection = DOM.append(sessionsContainer, $('.agent-sessions-section'));

		// Sessions content container
		const sessionsContent = DOM.append(sessionsSection, $('.agent-sessions-content'));

		// New Session Button
		const newSessionButtonContainer = DOM.append(sessionsContent, $('.agent-sessions-new-button-container'));
		const newSessionButton = this._register(new Button(newSessionButtonContainer, { ...defaultButtonStyles, secondary: true }));
		newSessionButton.label = localize('newSession', "New Session");
		this._register(newSessionButton.onDidClick(() => this.activeSessionService.openNewSession()));

		// Keybinding hint inside the button
		const keybinding = this.keybindingService.lookupKeybinding(ACTION_ID_NEW_CHAT);
		if (keybinding) {
			const keybindingHint = DOM.append(newSessionButton.element, $('span.new-session-keybinding-hint'));
			keybindingHint.textContent = keybinding.getLabel() ?? '';
		}

		// Sessions Control
		this.sessionsControlContainer = DOM.append(sessionsContent, $('.agent-sessions-control-container'));
		const sessionsControl = this.sessionsControl = this._register(this.instantiationService.createInstance(AgentSessionsControl, this.sessionsControlContainer, {
			source: 'agentSessionsViewPane',
			filter: sessionsFilter,
			overrideStyles: this.getLocationBasedColors().listOverrideStyles,
			getHoverPosition: () => this.getSessionHoverPosition(),
			trackActiveEditorSession: () => true,
			collapseOlderSections: () => true,
			overrideSessionOpen: (resource, openOptions) => this.activeSessionService.openSession(resource, openOptions),
		}));
		this._register(this.onDidChangeBodyVisibility(visible => sessionsControl.setVisible(visible)));

		// Listen to tree updates and restore selection if nothing is selected
		this._register(sessionsControl.onDidUpdate(() => {
			if (!sessionsControl.hasFocusOrSelection()) {
				this.restoreLastSelectedSession();
			}
		}));

		// When the active session changes, select it in the tree
		this._register(autorun(reader => {
			const activeSession = this.activeSessionService.activeSession.read(reader);
			if (activeSession) {
				if (!sessionsControl.reveal(activeSession.resource)) {
					sessionsControl.clearFocus();
				}
			}
		}));

		// AI Customization shortcuts (bottom, fixed height)
		this.aiCustomizationContainer = DOM.append(sessionsContainer, $('.ai-customization-shortcuts'));
		this.createAICustomizationShortcuts(this.aiCustomizationContainer);
	}

	private restoreLastSelectedSession(): void {
		const activeSession = this.activeSessionService.getActiveSession();
		if (activeSession && this.sessionsControl) {
			this.sessionsControl.reveal(activeSession.resource);
		}
	}

	private createAICustomizationShortcuts(container: HTMLElement): void {
		// Get initial collapsed state
		const isCollapsed = this.storageService.getBoolean(CUSTOMIZATIONS_COLLAPSED_KEY, StorageScope.PROFILE, false);

		// Header (clickable to toggle)
		const header = DOM.append(container, $('.ai-customization-header'));
		header.tabIndex = 0;
		header.setAttribute('role', 'button');
		header.setAttribute('aria-expanded', String(!isCollapsed));

		// Header text
		const headerText = DOM.append(header, $('span'));
		headerText.textContent = localize('customizations', "CUSTOMIZATIONS");

		// Chevron icon (right-aligned, shown on hover)
		const chevron = DOM.append(header, $('.ai-customization-chevron'));
		chevron.classList.add(...ThemeIcon.asClassNameArray(isCollapsed ? Codicon.chevronRight : Codicon.chevronDown));

		// Links container
		const linksContainer = DOM.append(container, $('.ai-customization-links'));
		if (isCollapsed) {
			linksContainer.classList.add('collapsed');
		}

		// Toggle collapse on header click
		const toggleCollapse = () => {
			const collapsed = linksContainer.classList.toggle('collapsed');
			this.storageService.store(CUSTOMIZATIONS_COLLAPSED_KEY, collapsed, StorageScope.PROFILE, StorageTarget.USER);
			header.setAttribute('aria-expanded', String(!collapsed));
			chevron.classList.remove(...ThemeIcon.asClassNameArray(Codicon.chevronRight), ...ThemeIcon.asClassNameArray(Codicon.chevronDown));
			chevron.classList.add(...ThemeIcon.asClassNameArray(collapsed ? Codicon.chevronRight : Codicon.chevronDown));

			// Re-layout after the transition so sessions control gets the right height
			const onTransitionEnd = () => {
				linksContainer.removeEventListener('transitionend', onTransitionEnd);
				if (this.viewPaneContainer) {
					const { offsetHeight, offsetWidth } = this.viewPaneContainer;
					this.layoutBody(offsetHeight, offsetWidth);
				}
			};
			linksContainer.addEventListener('transitionend', onTransitionEnd);
		};

		this._register(DOM.addDisposableListener(header, 'click', toggleCollapse));
		this._register(DOM.addDisposableListener(header, 'keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				toggleCollapse();
			}
		}));

		for (const shortcut of this.shortcuts) {
			const link = DOM.append(linksContainer, $('a.ai-customization-link'));
			link.tabIndex = 0;
			link.setAttribute('role', 'button');
			link.setAttribute('aria-label', shortcut.label);

			// Icon
			const iconElement = DOM.append(link, $('.link-icon'));
			iconElement.classList.add(...ThemeIcon.asClassNameArray(shortcut.icon));

			// Label
			const labelElement = DOM.append(link, $('.link-label'));
			labelElement.textContent = shortcut.label;

			// Count container (right-aligned, shows per-source badges)
			const countContainer = DOM.append(link, $('.link-counts'));
			shortcut.countContainer = countContainer;

			this._register(DOM.addDisposableListener(link, 'click', (e) => {
				DOM.EventHelper.stop(e);
				shortcut.action();
			}));

			this._register(DOM.addDisposableListener(link, 'keydown', (e: KeyboardEvent) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					shortcut.action();
				}
			}));
		}

		// Load initial counts
		this.updateCounts();
	}

	private async updateCounts(): Promise<void> {
		for (const shortcut of this.shortcuts) {
			if (!shortcut.countContainer) {
				continue;
			}

			if (shortcut.getSourceCounts) {
				const counts = await shortcut.getSourceCounts();
				this.renderSourceCounts(shortcut.countContainer, counts);
			} else if (shortcut.getCount) {
				const count = await shortcut.getCount();
				this.renderSimpleCount(shortcut.countContainer, count);
			}
		}
	}

	private renderSourceCounts(container: HTMLElement, counts: ISourceCounts): void {
		DOM.clearNode(container);
		const total = counts.workspace + counts.user + counts.extension;
		container.classList.toggle('hidden', total === 0);
		if (total === 0) {
			return;
		}

		const sources: { count: number; icon: ThemeIcon; title: string }[] = [
			{ count: counts.workspace, icon: workspaceIcon, title: localize('workspaceCount', "{0} from workspace", counts.workspace) },
			{ count: counts.user, icon: userIcon, title: localize('userCount', "{0} from user", counts.user) },
			{ count: counts.extension, icon: extensionIcon, title: localize('extensionCount', "{0} from extensions", counts.extension) },
		];

		for (const source of sources) {
			if (source.count === 0) {
				continue;
			}
			const badge = DOM.append(container, $('.source-count-badge'));
			badge.title = source.title;
			const icon = DOM.append(badge, $('.source-count-icon'));
			icon.classList.add(...ThemeIcon.asClassNameArray(source.icon));
			const num = DOM.append(badge, $('.source-count-num'));
			num.textContent = `${source.count}`;
		}
	}

	private renderSimpleCount(container: HTMLElement, count: number): void {
		DOM.clearNode(container);
		container.classList.toggle('hidden', count === 0);
		if (count > 0) {
			const badge = DOM.append(container, $('.source-count-badge'));
			const num = DOM.append(badge, $('.source-count-num'));
			num.textContent = `${count}`;
		}
	}

	private async getPromptSourceCounts(promptType: PromptsType): Promise<ISourceCounts> {
		const [workspaceItems, userItems, extensionItems] = await Promise.all([
			this.promptsService.listPromptFilesForStorage(promptType, PromptsStorage.local, CancellationToken.None),
			this.promptsService.listPromptFilesForStorage(promptType, PromptsStorage.user, CancellationToken.None),
			this.promptsService.listPromptFilesForStorage(promptType, PromptsStorage.extension, CancellationToken.None),
		]);

		return {
			workspace: workspaceItems.length,
			user: userItems.length,
			extension: extensionItems.length,
		};
	}

	private async getSkillSourceCounts(): Promise<ISourceCounts> {
		const skills = await this.promptsService.findAgentSkills(CancellationToken.None);
		if (!skills || skills.length === 0) {
			return { workspace: 0, user: 0, extension: 0 };
		}

		const workspaceSkills = skills.filter(s => s.storage === PromptsStorage.local);

		return {
			workspace: workspaceSkills.length,
			user: skills.filter(s => s.storage === PromptsStorage.user).length,
			extension: skills.filter(s => s.storage === PromptsStorage.extension).length,
		};
	}

	private async openAICustomizationSection(sectionId: AICustomizationManagementSection): Promise<void> {
		const input = AICustomizationManagementEditorInput.getOrCreate();
		const editor = await this.editorGroupsService.activeGroup.openEditor(input, { pinned: true });

		if (editor instanceof AICustomizationManagementEditor) {
			editor.selectSectionById(sectionId);
		}
	}

	private getSessionHoverPosition(): HoverPosition {
		const viewLocation = this.viewDescriptorService.getViewLocationById(this.id);
		const sideBarPosition = this.layoutService.getSideBarPosition();

		return {
			[ViewContainerLocation.Sidebar]: sideBarPosition === 0 ? HoverPosition.RIGHT : HoverPosition.LEFT,
			[ViewContainerLocation.AuxiliaryBar]: sideBarPosition === 0 ? HoverPosition.LEFT : HoverPosition.RIGHT,
			[ViewContainerLocation.ChatBar]: HoverPosition.RIGHT,
			[ViewContainerLocation.Panel]: HoverPosition.ABOVE
		}[viewLocation ?? ViewContainerLocation.AuxiliaryBar];
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);

		if (!this.sessionsControl || !this.sessionsControlContainer) {
			return;
		}

		this.sessionsControl.layout(this.sessionsControlContainer.offsetHeight, width);
	}

	override focus(): void {
		super.focus();

		this.sessionsControl?.focus();
	}

	refresh(): void {
		this.sessionsControl?.refresh();
	}

	openFind(): void {
		this.sessionsControl?.openFind();
	}
}

// Register Cmd+N / Ctrl+N keybinding for new session in the agent sessions window
KeybindingsRegistry.registerKeybindingRule({
	id: ACTION_ID_NEW_CHAT,
	weight: KeybindingWeight.WorkbenchContrib + 1,
	primary: KeyMod.CtrlCmd | KeyCode.KeyN,
});

MenuRegistry.appendMenuItem(MenuId.ViewTitle, {
	submenu: SessionsViewFilterSubMenu,
	title: localize2('filterAgentSessions', "Filter Agent Sessions"),
	group: 'navigation',
	order: 3,
	icon: Codicon.filter,
	when: ContextKeyExpr.equals('view', SessionsViewId)
} satisfies ISubmenuItem);

registerAction2(class RefreshAgentSessionsViewerAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsView.refresh',
			title: localize2('refresh', "Refresh Agent Sessions"),
			icon: Codicon.refresh,
			menu: [{
				id: MenuId.ViewTitle,
				group: 'navigation',
				order: 1,
				when: ContextKeyExpr.equals('view', SessionsViewId),
			}],
		});
	}
	override run(accessor: ServicesAccessor) {
		const viewsService = accessor.get(IViewsService);
		const view = viewsService.getViewWithId<AgenticSessionsViewPane>(SessionsViewId);
		return view?.sessionsControl?.refresh();
	}
});

registerAction2(class FindAgentSessionInViewerAction extends Action2 {

	constructor() {
		super({
			id: 'sessionsView.find',
			title: localize2('find', "Find Agent Session"),
			icon: Codicon.search,
			menu: [{
				id: MenuId.ViewTitle,
				group: 'navigation',
				order: 2,
				when: ContextKeyExpr.equals('view', SessionsViewId),
			}]
		});
	}

	override run(accessor: ServicesAccessor) {
		const viewsService = accessor.get(IViewsService);
		const view = viewsService.getViewWithId<AgenticSessionsViewPane>(SessionsViewId);
		return view?.sessionsControl?.openFind();
	}
});
