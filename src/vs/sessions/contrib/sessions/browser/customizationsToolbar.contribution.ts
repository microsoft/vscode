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
import { AICustomizationManagementSection } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagement.js';
import { AICustomizationManagementEditorInput } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditorInput.js';
import { IPromptsService } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { IMcpService } from '../../../../workbench/contrib/mcp/common/mcpTypes.js';
import { Menus } from '../../../browser/menus.js';
import { agentIcon, instructionsIcon, promptIcon, skillIcon, hookIcon, workspaceIcon, userIcon } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationIcons.js';
import { ActionViewItem, IBaseActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction } from '../../../../base/common/actions.js';
import { $, append } from '../../../../base/browser/dom.js';
import { autorun } from '../../../../base/common/observable.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ISessionsManagementService } from './sessionsManagementService.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { getPromptSourceCounts, getSkillSourceCounts, getSourceCountsTotal, ISourceCounts } from './customizationCounts.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IAICustomizationWorkspaceService } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';

import { URI } from '../../../../base/common/uri.js';

interface ICustomizationItemConfig {
	readonly id: string;
	readonly label: string;
	readonly icon: ThemeIcon;
	readonly section: AICustomizationManagementSection;
	readonly getSourceCounts?: (promptsService: IPromptsService, excludedUserFileRoots: readonly URI[]) => Promise<ISourceCounts>;
	readonly getCount?: (languageModelsService: ILanguageModelsService, mcpService: IMcpService) => Promise<number>;
}

const CUSTOMIZATION_ITEMS: ICustomizationItemConfig[] = [
	{
		id: 'sessions.customization.agents',
		label: localize('agents', "Agents"),
		icon: agentIcon,
		section: AICustomizationManagementSection.Agents,
		getSourceCounts: (ps, ex) => getPromptSourceCounts(ps, PromptsType.agent, ex),
	},
	{
		id: 'sessions.customization.skills',
		label: localize('skills', "Skills"),
		icon: skillIcon,
		section: AICustomizationManagementSection.Skills,
		getSourceCounts: (ps, ex) => getSkillSourceCounts(ps, ex),
	},
	{
		id: 'sessions.customization.instructions',
		label: localize('instructions', "Instructions"),
		icon: instructionsIcon,
		section: AICustomizationManagementSection.Instructions,
		getSourceCounts: (ps, ex) => getPromptSourceCounts(ps, PromptsType.instructions, ex),
	},
	{
		id: 'sessions.customization.prompts',
		label: localize('prompts', "Prompts"),
		icon: promptIcon,
		section: AICustomizationManagementSection.Prompts,
		getSourceCounts: (ps, ex) => getPromptSourceCounts(ps, PromptsType.prompt, ex),
	},
	{
		id: 'sessions.customization.hooks',
		label: localize('hooks', "Hooks"),
		icon: hookIcon,
		section: AICustomizationManagementSection.Hooks,
		getSourceCounts: (ps, ex) => getPromptSourceCounts(ps, PromptsType.hook, ex),
	},
	// TODO: Re-enable MCP Servers once CLI MCP configuration is unified with VS Code
];

/**
 * Custom ActionViewItem for each customization link in the toolbar.
 * Renders icon + label + source count badges, matching the sidebar footer style.
 */
class CustomizationLinkViewItem extends ActionViewItem {

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
		this._viewItemDisposables.add(this._workspaceContextService.onDidChangeWorkspaceFolders(() => this._updateCounts()));
		this._viewItemDisposables.add(autorun(reader => {
			this._activeSessionService.activeSession.read(reader);
			this._updateCounts();
		}));

		// Initial count
		this._updateCounts();
	}

	private async _updateCounts(): Promise<void> {
		if (!this._countContainer) {
			return;
		}

		if (this._config.getSourceCounts) {
			const counts = await this._config.getSourceCounts(this._promptsService, this._workspaceService.excludedUserFileRoots);
			this._renderSourceCounts(this._countContainer, counts);
		} else if (this._config.getCount) {
			const count = await this._config.getCount(this._languageModelsService, this._mcpService);
			this._renderSimpleCount(this._countContainer, count);
		}
	}

	private _renderSourceCounts(container: HTMLElement, counts: ISourceCounts): void {
		container.textContent = '';
		const total = getSourceCountsTotal(counts, this._workspaceService);
		container.classList.toggle('hidden', total === 0);
		if (total === 0) {
			return;
		}

		const sources: { count: number; icon: ThemeIcon; title: string }[] = [
			{ count: counts.workspace, icon: workspaceIcon, title: localize('workspaceCount', "{0} from workspace", counts.workspace) },
			{ count: counts.user, icon: userIcon, title: localize('userCount', "{0} from user", counts.user) },
		];

		for (const source of sources) {
			if (source.count === 0) {
				continue;
			}
			const badge = append(container, $('span.source-count-badge'));
			badge.title = source.title;
			const icon = append(badge, $('span.source-count-icon'));
			icon.classList.add(...ThemeIcon.asClassNameArray(source.icon));
			const num = append(badge, $('span.source-count-num'));
			num.textContent = `${source.count}`;
		}
	}

	private _renderSimpleCount(container: HTMLElement, count: number): void {
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

class CustomizationsToolbarContribution extends Disposable implements IWorkbenchContribution {

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
					const input = AICustomizationManagementEditorInput.getOrCreate();
					const editor = await editorService.openEditor(input, { pinned: true });
					if (editor instanceof AICustomizationManagementEditor) {
						editor.selectSectionById(config.section);
					}
				}
			}));
		}
	}
}

registerWorkbenchContribution2(CustomizationsToolbarContribution.ID, CustomizationsToolbarContribution, WorkbenchPhase.AfterRestored);
