/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../browser/media/sidebarActionButton.css';
import './media/customizationsToolbar.css';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { AICustomizationManagementEditor } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.js';
import { AICustomizationManagementEditorInput } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditorInput.js';
import { IPromptsService } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { IMcpService } from '../../../../workbench/contrib/mcp/common/mcpTypes.js';
import { Menus } from '../../../browser/menus.js';
import { agentIcon, instructionsIcon, mcpServerIcon, pluginIcon, skillIcon, hookIcon } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationIcons.js';
import { ActionViewItem, IBaseActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction } from '../../../../base/common/actions.js';
import { $, append } from '../../../../base/browser/dom.js';
import { autorun } from '../../../../base/common/observable.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { getActiveHarnessProviders, getItemCount } from './customizationCounts.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { AICustomizationManagementSection, IAICustomizationWorkspaceService } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { IAgentPluginService } from '../../../../workbench/contrib/chat/common/plugins/agentPluginService.js';
import { ICustomizationHarnessService } from '../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

export interface ICustomizationItemConfig {
	readonly id: string;
	readonly label: string;
	readonly icon: ThemeIcon;
	readonly section: typeof AICustomizationManagementSection[keyof typeof AICustomizationManagementSection];
	readonly promptType?: PromptsType;
	readonly isMcp?: boolean;
	readonly isPlugins?: boolean;
}

export const CUSTOMIZATION_ITEMS: ICustomizationItemConfig[] = [
	{
		id: 'sessions.customization.agents',
		label: localize('agents', "Agents"),
		icon: agentIcon,
		section: AICustomizationManagementSection.Agents,
		promptType: PromptsType.agent,
	},
	{
		id: 'sessions.customization.skills',
		label: localize('skills', "Skills"),
		icon: skillIcon,
		section: AICustomizationManagementSection.Skills,
		promptType: PromptsType.skill,
	},
	{
		id: 'sessions.customization.instructions',
		label: localize('instructions', "Instructions"),
		icon: instructionsIcon,
		section: AICustomizationManagementSection.Instructions,
		promptType: PromptsType.instructions,
	},
	{
		id: 'sessions.customization.hooks',
		label: localize('hooks', "Hooks"),
		icon: hookIcon,
		section: AICustomizationManagementSection.Hooks,
		promptType: PromptsType.hook,
	},
	{
		id: 'sessions.customization.mcpServers',
		label: localize('mcpServers', "MCP Servers"),
		icon: mcpServerIcon,
		section: AICustomizationManagementSection.McpServers,
		isMcp: true,
	},
	{
		id: 'sessions.customization.plugins',
		label: localize('plugins', "Plugins"),
		icon: pluginIcon,
		section: AICustomizationManagementSection.Plugins,
		isPlugins: true,
	},
];

/**
 * Custom ActionViewItem for each customization link in the toolbar.
 * Renders icon + label + source count badges, matching the sidebar footer style.
 */
export class CustomizationLinkViewItem extends ActionViewItem {

	private readonly _viewItemDisposables: DisposableStore;
	private _button: Button | undefined;
	private _countContainer: HTMLElement | undefined;

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions,
		private readonly _config: ICustomizationItemConfig,
		@IPromptsService private readonly _promptsService: IPromptsService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@IMcpService private readonly _mcpService: IMcpService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@ISessionsManagementService private readonly _activeSessionService: ISessionsManagementService,
		@IAICustomizationWorkspaceService private readonly _workspaceService: IAICustomizationWorkspaceService,
		@IFileService private readonly _fileService: IFileService,
		@IAgentPluginService private readonly _agentPluginService: IAgentPluginService,
		@ICustomizationHarnessService private readonly _harnessService: ICustomizationHarnessService,
	) {
		super(undefined, action, { ...options, icon: false, label: false });
		this._viewItemDisposables = this._register(new DisposableStore());
	}

	protected override getTooltip(): string | undefined {
		return undefined;
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('customization-link-widget', 'sidebar-action');

		// Button (left) - uses supportIcons to render codicon in label
		const buttonContainer = append(container, $('.customization-link-button-container'));
		this._button = this._viewItemDisposables.add(new Button(buttonContainer, {
			...defaultButtonStyles,
			secondary: true,
			title: false,
			supportIcons: true,
			buttonSecondaryBackground: 'transparent',
			buttonSecondaryHoverBackground: undefined,
			buttonSecondaryForeground: undefined,
			buttonSecondaryBorder: undefined,
		}));
		this._button.element.classList.add('customization-link-button', 'sidebar-action-button');
		this._button.label = `$(${this._config.icon.id}) ${this._config.label}`;

		this._viewItemDisposables.add(this._button.onDidClick(() => {
			this._action.run();
		}));

		// Count container (inside button, floating right)
		this._countContainer = append(this._button.element, $('span.customization-link-counts'));

		// Subscribe to changes
		this._viewItemDisposables.add(this._promptsService.onDidChangeCustomAgents(() => this._updateCounts()));
		this._viewItemDisposables.add(this._promptsService.onDidChangeSlashCommands(() => this._updateCounts()));
		this._viewItemDisposables.add(this._languageModelsService.onDidChangeLanguageModels(() => this._updateCounts()));
		this._viewItemDisposables.add(autorun(reader => {
			this._mcpService.servers.read(reader);
			this._updateCounts();
		}));
		this._viewItemDisposables.add(autorun(reader => {
			this._agentPluginService.plugins.read(reader);
			this._updateCounts();
		}));
		this._viewItemDisposables.add(this._workspaceContextService.onDidChangeWorkspaceFolders(() => this._updateCounts()));
		this._viewItemDisposables.add(autorun(reader => {
			this._activeSessionService.activeSession.read(reader);
			this._harnessService.availableHarnesses.read(reader);
			const { itemProvider, syncProvider } = getActiveHarnessProviders(this._activeSessionService, this._harnessService);
			if (itemProvider) {
				reader.store.add(itemProvider.onDidChange(() => this._updateCounts()));
			}
			if (syncProvider) {
				reader.store.add(syncProvider.onDidChange(() => this._updateCounts()));
			}
			this._updateCounts();
		}));

		// Initial count
		this._updateCounts();
	}

	private _updateCountsRequestId = 0;

	private async _updateCounts(): Promise<void> {
		if (!this._countContainer) {
			return;
		}

		const requestId = ++this._updateCountsRequestId;

		if (this._config.promptType) {
			const { itemProvider, syncProvider } = getActiveHarnessProviders(this._activeSessionService, this._harnessService);
			const total = await getItemCount(
				this._config.promptType,
				this._promptsService,
				this._workspaceService,
				this._workspaceContextService,
				itemProvider,
				syncProvider,
				this._fileService,
			);
			if (requestId !== this._updateCountsRequestId) {
				return;
			}
			this._renderTotalCount(this._countContainer, total);
		} else if (this._config.isMcp) {
			const total = this._mcpService.servers.get().length;
			this._renderTotalCount(this._countContainer, total);
		} else if (this._config.isPlugins) {
			const total = this._agentPluginService.plugins.get().length;
			this._renderTotalCount(this._countContainer, total);
		}
	}

	private _renderTotalCount(container: HTMLElement, count: number): void {
		container.textContent = '';
		container.classList.toggle('hidden', count === 0);
		if (count > 0) {
			const badge = append(container, $('span.source-count-badge'));
			const num = append(badge, $('span.source-count-num'));
			num.textContent = `${count}`;
		}
	}
}

// --- Register actions and view items --- //

export class CustomizationsToolbarContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsCustomizationsToolbar';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		for (const [index, config] of CUSTOMIZATION_ITEMS.entries()) {
			// Register the custom ActionViewItem for this action
			this._register(actionViewItemService.register(Menus.SidebarCustomizations, config.id, (action, options) => {
				return instantiationService.createInstance(CustomizationLinkViewItem, action, options, config);
			}, undefined));

			// Register the action with menu item
			this._register(registerAction2(class extends Action2 {
				constructor() {
					super({
						id: config.id,
						title: localize2('customizationAction', '{0}', config.label),
						menu: {
							id: Menus.SidebarCustomizations,
							group: 'navigation',
							order: index + 1,
						}
					});
				}
				async run(accessor: ServicesAccessor): Promise<void> {
					const editorService = accessor.get(IEditorService);
					const harnessService = accessor.get(ICustomizationHarnessService);
					const sessionsManagementService = accessor.get(ISessionsManagementService);
					const activeSessionType = sessionsManagementService.activeSession.get()?.sessionType;
					if (activeSessionType && harnessService.findHarnessById(activeSessionType)) {
						harnessService.setActiveHarness(activeSessionType);
					}
					const input = AICustomizationManagementEditorInput.getOrCreate();
					const pane = await editorService.openEditor(input, { pinned: true });
					if (pane instanceof AICustomizationManagementEditor) {
						pane.selectSectionById(config.section);
					}
				}
			}));
		}
	}
}

registerWorkbenchContribution2(CustomizationsToolbarContribution.ID, CustomizationsToolbarContribution, WorkbenchPhase.AfterRestored);
