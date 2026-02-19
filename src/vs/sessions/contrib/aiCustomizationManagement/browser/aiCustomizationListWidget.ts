/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/aiCustomizationManagement.css';
import * as DOM from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { autorun } from '../../../../base/common/observable.js';
import { basename, dirname } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchList } from '../../../../platform/list/browser/listService.js';
import { IListVirtualDelegate, IListRenderer, IListContextMenuEvent } from '../../../../base/browser/ui/list/list.js';
import { IPromptsService, PromptsStorage, IPromptPath } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { agentIcon, instructionsIcon, promptIcon, skillIcon, hookIcon, userIcon, workspaceIcon, extensionIcon } from '../../aiCustomizationTreeView/browser/aiCustomizationTreeViewIcons.js';
import { AICustomizationManagementItemMenuId, AICustomizationManagementSection, getActiveSessionRoot } from './aiCustomizationManagement.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { Delayer } from '../../../../base/common/async.js';
import { IContextMenuService, IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { HighlightedLabel } from '../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
import { matchesFuzzy, IMatch } from '../../../../base/common/filters.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ButtonWithDropdown } from '../../../../base/browser/ui/button/button.js';
import { IMenuService } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { getFlatContextMenuActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IPathService } from '../../../../workbench/services/path/common/pathService.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { parseAllHookFiles } from '../../../../workbench/contrib/chat/browser/promptSyntax/hookUtils.js';
import { OS } from '../../../../base/common/platform.js';
import { IRemoteAgentService } from '../../../../workbench/services/remote/common/remoteAgentService.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Action, Separator } from '../../../../base/common/actions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ISCMService } from '../../../../workbench/contrib/scm/common/scm.js';

const $ = DOM.$;

const ITEM_HEIGHT = 44;
const GROUP_HEADER_HEIGHT = 32;
const GROUP_HEADER_HEIGHT_WITH_SEPARATOR = 40;

/**
 * Represents an AI customization item in the list.
 */
export interface IAICustomizationListItem {
	readonly id: string;
	readonly uri: URI;
	readonly name: string;
	readonly filename: string;
	readonly description?: string;
	readonly storage: PromptsStorage;
	readonly promptType: PromptsType;
	gitStatus?: 'uncommitted' | 'committed';
	nameMatches?: IMatch[];
	descriptionMatches?: IMatch[];
}

/**
 * Represents a collapsible group header in the list.
 */
interface IGroupHeaderEntry {
	readonly type: 'group-header';
	readonly id: string;
	readonly storage: PromptsStorage;
	readonly label: string;
	readonly icon: ThemeIcon;
	readonly count: number;
	readonly isFirst: boolean;
	collapsed: boolean;
}

/**
 * Represents an individual file item in the list.
 */
interface IFileItemEntry {
	readonly type: 'file-item';
	readonly item: IAICustomizationListItem;
}

type IListEntry = IGroupHeaderEntry | IFileItemEntry;

/**
 * Delegate for the AI Customization list.
 */
class AICustomizationListDelegate implements IListVirtualDelegate<IListEntry> {
	getHeight(element: IListEntry): number {
		if (element.type === 'group-header') {
			return element.isFirst ? GROUP_HEADER_HEIGHT : GROUP_HEADER_HEIGHT_WITH_SEPARATOR;
		}
		return ITEM_HEIGHT;
	}

	getTemplateId(element: IListEntry): string {
		return element.type === 'group-header' ? 'groupHeader' : 'aiCustomizationItem';
	}
}

interface IAICustomizationItemTemplateData {
	readonly container: HTMLElement;
	readonly actionsContainer: HTMLElement;
	readonly nameLabel: HighlightedLabel;
	readonly description: HighlightedLabel;
	readonly storageBadge: HTMLElement;
	readonly gitStatusBadge: HTMLElement;
	readonly disposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
}

interface IGroupHeaderTemplateData {
	readonly container: HTMLElement;
	readonly chevron: HTMLElement;
	readonly icon: HTMLElement;
	readonly label: HTMLElement;
	readonly count: HTMLElement;
	readonly disposables: DisposableStore;
}

/**
 * Renderer for collapsible group headers (Workspace, User, Extensions).
 * Note: Click handling is done via the list's onDidOpen event, not here.
 */
class GroupHeaderRenderer implements IListRenderer<IGroupHeaderEntry, IGroupHeaderTemplateData> {
	readonly templateId = 'groupHeader';

	renderTemplate(container: HTMLElement): IGroupHeaderTemplateData {
		const disposables = new DisposableStore();
		container.classList.add('ai-customization-group-header');

		const chevron = DOM.append(container, $('.group-chevron'));
		const icon = DOM.append(container, $('.group-icon'));
		const label = DOM.append(container, $('.group-label'));
		const count = DOM.append(container, $('.group-count'));

		return { container, chevron, icon, label, count, disposables };
	}

	renderElement(element: IGroupHeaderEntry, _index: number, templateData: IGroupHeaderTemplateData): void {
		// Chevron
		templateData.chevron.className = 'group-chevron';
		templateData.chevron.classList.add(...ThemeIcon.asClassNameArray(element.collapsed ? Codicon.chevronRight : Codicon.chevronDown));

		// Icon
		templateData.icon.className = 'group-icon';
		templateData.icon.classList.add(...ThemeIcon.asClassNameArray(element.icon));

		// Label + count
		templateData.label.textContent = element.label;
		templateData.count.textContent = `${element.count}`;

		// Collapsed state and separator for non-first groups
		templateData.container.classList.toggle('collapsed', element.collapsed);
		templateData.container.classList.toggle('has-previous-group', !element.isFirst);
	}

	disposeTemplate(templateData: IGroupHeaderTemplateData): void {
		templateData.disposables.dispose();
	}
}

/**
 * Renderer for AI customization list items.
 */
class AICustomizationItemRenderer implements IListRenderer<IFileItemEntry, IAICustomizationItemTemplateData> {
	readonly templateId = 'aiCustomizationItem';

	renderTemplate(container: HTMLElement): IAICustomizationItemTemplateData {
		const disposables = new DisposableStore();
		const elementDisposables = new DisposableStore();

		container.classList.add('ai-customization-list-item');

		const leftSection = DOM.append(container, $('.item-left'));
		// Storage badge on left (shows workspace/user/extension)
		const storageBadge = DOM.append(leftSection, $('.storage-badge'));
		const textContainer = DOM.append(leftSection, $('.item-text'));
		const nameLabel = disposables.add(new HighlightedLabel(DOM.append(textContainer, $('.item-name'))));
		const description = disposables.add(new HighlightedLabel(DOM.append(textContainer, $('.item-description'))));

		// Git status badge (always visible, outside item-right hover container)
		const gitStatusBadge = DOM.append(container, $('.git-status-badge'));

		// Right section for actions (hover-visible)
		const actionsContainer = DOM.append(container, $('.item-right'));

		return {
			container,
			actionsContainer,
			nameLabel,
			description,
			storageBadge,
			gitStatusBadge,
			disposables,
			elementDisposables,
		};
	}

	renderElement(entry: IFileItemEntry, index: number, templateData: IAICustomizationItemTemplateData): void {
		templateData.elementDisposables.clear();
		const element = entry.item;

		// Name with highlights
		templateData.nameLabel.set(element.name, element.nameMatches);

		// Description - show either description or filename as secondary text
		const secondaryText = element.description || element.filename;
		if (secondaryText) {
			templateData.description.set(secondaryText, element.description ? element.descriptionMatches : undefined);
			templateData.description.element.style.display = '';
			// Style differently for filename vs description
			templateData.description.element.classList.toggle('is-filename', !element.description);
		} else {
			templateData.description.set('', undefined);
			templateData.description.element.style.display = 'none';
		}

		// Storage badge
		let storageBadgeIcon: ThemeIcon;
		let storageBadgeLabel: string;
		switch (element.storage) {
			case PromptsStorage.local:
				storageBadgeIcon = workspaceIcon;
				storageBadgeLabel = localize('worktree', "Worktree");
				break;
			case PromptsStorage.user:
				storageBadgeIcon = userIcon;
				storageBadgeLabel = localize('user', "User");
				break;
			case PromptsStorage.extension:
				storageBadgeIcon = extensionIcon;
				storageBadgeLabel = localize('extension', "Extension");
				break;
		}

		templateData.storageBadge.className = 'storage-badge';
		templateData.storageBadge.classList.add(...ThemeIcon.asClassNameArray(storageBadgeIcon));
		templateData.storageBadge.title = storageBadgeLabel;

		// Git status badge
		const gitBadge = templateData.gitStatusBadge;
		gitBadge.className = 'git-status-badge';
		if (element.gitStatus === 'committed') {
			gitBadge.classList.add(...ThemeIcon.asClassNameArray(Codicon.check));
			gitBadge.classList.add('committed');
			gitBadge.textContent = '';
			gitBadge.title = localize('committedStatus', "Committed");
			gitBadge.style.display = '';
		} else {
			gitBadge.style.display = 'none';
		}
	}

	disposeTemplate(templateData: IAICustomizationItemTemplateData): void {
		templateData.elementDisposables.dispose();
		templateData.disposables.dispose();
	}
}

/**
 * Maps section ID to prompt type.
 */
export function sectionToPromptType(section: AICustomizationManagementSection): PromptsType {
	switch (section) {
		case AICustomizationManagementSection.Agents:
			return PromptsType.agent;
		case AICustomizationManagementSection.Skills:
			return PromptsType.skill;
		case AICustomizationManagementSection.Instructions:
			return PromptsType.instructions;
		case AICustomizationManagementSection.Hooks:
			return PromptsType.hook;
		case AICustomizationManagementSection.Prompts:
		default:
			return PromptsType.prompt;
	}
}

/**
 * Widget that displays a searchable list of AI customization items.
 */
export class AICustomizationListWidget extends Disposable {

	readonly element: HTMLElement;

	private sectionHeader!: HTMLElement;
	private sectionDescription!: HTMLElement;
	private sectionLink!: HTMLAnchorElement;
	private searchAndButtonContainer!: HTMLElement;
	private searchContainer!: HTMLElement;
	private searchInput!: InputBox;
	private addButton!: ButtonWithDropdown;
	private listContainer!: HTMLElement;
	private list!: WorkbenchList<IListEntry>;
	private emptyStateContainer!: HTMLElement;
	private emptyStateIcon!: HTMLElement;
	private emptyStateText!: HTMLElement;
	private emptyStateSubtext!: HTMLElement;

	private currentSection: AICustomizationManagementSection = AICustomizationManagementSection.Agents;
	private allItems: IAICustomizationListItem[] = [];
	private displayEntries: IListEntry[] = [];
	private searchQuery: string = '';
	private readonly collapsedGroups = new Set<PromptsStorage>();

	private readonly delayedFilter = new Delayer<void>(200);

	private readonly _onDidSelectItem = this._register(new Emitter<IAICustomizationListItem>());
	readonly onDidSelectItem: Event<IAICustomizationListItem> = this._onDidSelectItem.event;

	private readonly _onDidChangeItemCount = this._register(new Emitter<number>());
	readonly onDidChangeItemCount: Event<number> = this._onDidChangeItemCount.event;

	private readonly _onDidRequestCreate = this._register(new Emitter<PromptsType>());
	readonly onDidRequestCreate: Event<PromptsType> = this._onDidRequestCreate.event;

	private readonly _onDidRequestCreateManual = this._register(new Emitter<{ type: PromptsType; target: 'worktree' | 'user' }>());
	readonly onDidRequestCreateManual: Event<{ type: PromptsType; target: 'worktree' | 'user' }> = this._onDidRequestCreateManual.event;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IPromptsService private readonly promptsService: IPromptsService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IPathService private readonly pathService: IPathService,
		@ILabelService private readonly labelService: ILabelService,
		@IRemoteAgentService private readonly remoteAgentService: IRemoteAgentService,
		@ISessionsManagementService private readonly activeSessionService: ISessionsManagementService,
		@ILogService private readonly logService: ILogService,
		@IClipboardService private readonly clipboardService: IClipboardService,
		@ISCMService private readonly scmService: ISCMService,
	) {
		super();
		this.element = $('.ai-customization-list-widget');
		this.create();

		this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => this.refresh()));
		this._register(autorun(reader => {
			this.activeSessionService.activeSession.read(reader);
			this.updateAddButton();
			this.refresh();
		}));

		// Re-filter when SCM repositories change (updates git status badges after commits)
		const trackRepoChanges = (repo: { provider: { onDidChangeResources: Event<void> } }) => {
			this._register(repo.provider.onDidChangeResources(() => {
				this.updateGitStatus(this.allItems);
				this.filterItems();
			}));
		};
		for (const repo of [...this.scmService.repositories]) {
			trackRepoChanges(repo);
		}
		this._register(this.scmService.onDidAddRepository(repo => trackRepoChanges(repo)));

	}

	private create(): void {
		// Search and button container
		this.searchAndButtonContainer = DOM.append(this.element, $('.list-search-and-button-container'));

		// Search container
		this.searchContainer = DOM.append(this.searchAndButtonContainer, $('.list-search-container'));
		this.searchInput = this._register(new InputBox(this.searchContainer, this.contextViewService, {
			placeholder: localize('searchPlaceholder', "Type to search..."),
			inputBoxStyles: defaultInputBoxStyles,
		}));

		this._register(this.searchInput.onDidChange(() => {
			this.searchQuery = this.searchInput.value;
			this.delayedFilter.trigger(() => this.filterItems());
		}));

		// Add button with dropdown next to search
		const addButtonContainer = DOM.append(this.searchAndButtonContainer, $('.list-add-button-container'));
		this.addButton = this._register(new ButtonWithDropdown(addButtonContainer, {
			...defaultButtonStyles,
			supportIcons: true,
			contextMenuProvider: this.contextMenuService,
			addPrimaryActionToDropdown: false,
			actions: { getActions: () => this.getDropdownActions() },
		}));
		this.addButton.element.classList.add('list-add-button');
		this._register(this.addButton.onDidClick(() => this.executePrimaryCreateAction()));
		this.updateAddButton();

		// List container
		this.listContainer = DOM.append(this.element, $('.list-container'));

		// Empty state container
		this.emptyStateContainer = DOM.append(this.element, $('.list-empty-state'));
		this.emptyStateIcon = DOM.append(this.emptyStateContainer, $('.empty-state-icon'));
		this.emptyStateText = DOM.append(this.emptyStateContainer, $('.empty-state-text'));
		this.emptyStateSubtext = DOM.append(this.emptyStateContainer, $('.empty-state-subtext'));
		this.emptyStateContainer.style.display = 'none';

		// Create list
		this.list = this._register(this.instantiationService.createInstance(
			WorkbenchList<IListEntry>,
			'AICustomizationManagementList',
			this.listContainer,
			new AICustomizationListDelegate(),
			[
				new GroupHeaderRenderer(),
				this.instantiationService.createInstance(AICustomizationItemRenderer),
			],
			{
				identityProvider: {
					getId: (entry: IListEntry) => entry.type === 'group-header' ? entry.id : entry.item.id,
				},
				accessibilityProvider: {
					getAriaLabel: (entry: IListEntry) => {
						if (entry.type === 'group-header') {
							return localize('groupAriaLabel', "{0}, {1} items, {2}", entry.label, entry.count, entry.collapsed ? localize('collapsed', "collapsed") : localize('expanded', "expanded"));
						}
						return entry.item.description
							? localize('itemAriaLabel', "{0}, {1}", entry.item.name, entry.item.description)
							: entry.item.name;
					},
					getWidgetAriaLabel: () => localize('listAriaLabel', "AI Customizations"),
				},
				keyboardNavigationLabelProvider: {
					getKeyboardNavigationLabel: (entry: IListEntry) => entry.type === 'group-header' ? entry.label : entry.item.name,
				},
				multipleSelectionSupport: false,
				openOnSingleClick: true,
			}
		));

		// Handle item selection (single click opens item, group header toggles)
		this._register(this.list.onDidOpen(e => {
			if (e.element) {
				if (e.element.type === 'group-header') {
					this.toggleGroup(e.element);
				} else {
					this._onDidSelectItem.fire(e.element.item);
				}
			}
		}));

		// Handle context menu
		this._register(this.list.onContextMenu(e => this.onContextMenu(e)));

		// Subscribe to prompt service changes
		this._register(this.promptsService.onDidChangeCustomAgents(() => this.refresh()));
		this._register(this.promptsService.onDidChangeSlashCommands(() => this.refresh()));

		// Section footer at bottom with description and link
		this.sectionHeader = DOM.append(this.element, $('.section-footer'));
		this.sectionDescription = DOM.append(this.sectionHeader, $('p.section-footer-description'));
		this.sectionLink = DOM.append(this.sectionHeader, $('a.section-footer-link')) as HTMLAnchorElement;
		this._register(DOM.addDisposableListener(this.sectionLink, 'click', (e) => {
			e.preventDefault();
			const href = this.sectionLink.href;
			if (href) {
				this.openerService.open(URI.parse(href));
			}
		}));
		this.updateSectionHeader();
	}

	/**
	 * Handles context menu for list items.
	 */
	private onContextMenu(e: IListContextMenuEvent<IListEntry>): void {
		if (!e.element || e.element.type !== 'file-item') {
			return;
		}

		const item = e.element.item;

		// Create context for the menu actions
		const context = {
			uri: item.uri.toString(),
			name: item.name,
			promptType: item.promptType,
			storage: item.storage,
		};

		// Get menu actions
		const actions = this.menuService.getMenuActions(AICustomizationManagementItemMenuId, this.contextKeyService, {
			arg: context,
			shouldForwardArgs: true,
		});

		const flatActions = getFlatContextMenuActions(actions);

		// Add copy path actions
		const copyActions = [
			new Separator(),
			new Action('copyFullPath', localize('copyFullPath', "Copy Full Path"), undefined, true, async () => {
				await this.clipboardService.writeText(item.uri.fsPath);
			}),
			new Action('copyRelativePath', localize('copyRelativePath', "Copy Relative Path"), undefined, true, async () => {
				const basePath = getActiveSessionRoot(this.activeSessionService);
				if (basePath && item.uri.fsPath.startsWith(basePath.fsPath)) {
					const relative = item.uri.fsPath.substring(basePath.fsPath.length + 1);
					await this.clipboardService.writeText(relative);
				} else {
					// Fallback to workspace-relative via label service
					const relativePath = this.labelService.getUriLabel(item.uri, { relative: true });
					await this.clipboardService.writeText(relativePath);
				}
			}),
		];

		this.contextMenuService.showContextMenu({
			getAnchor: () => e.anchor,
			getActions: () => [...flatActions, ...copyActions],
		});
	}

	/**
	 * Sets the current section and loads items for that section.
	 */
	async setSection(section: AICustomizationManagementSection): Promise<void> {
		this.currentSection = section;
		this.updateSectionHeader();
		this.updateAddButton();
		await this.loadItems();
	}

	/**
	 * Updates the section header based on the current section.
	 */
	private updateSectionHeader(): void {
		let description: string;
		let docsUrl: string;
		let learnMoreLabel: string;
		switch (this.currentSection) {
			case AICustomizationManagementSection.Agents:
				description = localize('agentsDescription', "Configure the AI to adopt different personas tailored to specific development tasks. Each agent has its own instructions, tools, and behavior.");
				docsUrl = 'https://code.visualstudio.com/docs/copilot/customization/custom-agents';
				learnMoreLabel = localize('learnMoreAgents', "Learn more about custom agents");
				break;
			case AICustomizationManagementSection.Skills:
				description = localize('skillsDescription', "Folders of instructions, scripts, and resources that Copilot loads when relevant to perform specialized tasks.");
				docsUrl = 'https://code.visualstudio.com/docs/copilot/customization/agent-skills';
				learnMoreLabel = localize('learnMoreSkills', "Learn more about agent skills");
				break;
			case AICustomizationManagementSection.Instructions:
				description = localize('instructionsDescription', "Define common guidelines and rules that automatically influence how AI generates code and handles development tasks.");
				docsUrl = 'https://code.visualstudio.com/docs/copilot/customization/custom-instructions';
				learnMoreLabel = localize('learnMoreInstructions', "Learn more about custom instructions");
				break;
			case AICustomizationManagementSection.Hooks:
				description = localize('hooksDescription', "Prompts executed at specific points during an agentic lifecycle.");
				docsUrl = 'https://code.visualstudio.com/docs/copilot/customization/hooks';
				learnMoreLabel = localize('learnMoreHooks', "Learn more about hooks");
				break;
			case AICustomizationManagementSection.Prompts:
			default:
				description = localize('promptsDescription', "Reusable prompts for common development tasks like generating code, performing reviews, or scaffolding components.");
				docsUrl = 'https://code.visualstudio.com/docs/copilot/customization/prompt-files';
				learnMoreLabel = localize('learnMorePrompts', "Learn more about prompt files");
				break;
		}
		this.sectionDescription.textContent = description;
		this.sectionLink.textContent = learnMoreLabel;
		this.sectionLink.href = docsUrl;
	}

	/**
	 * Updates the add button label based on the current section.
	 */
	private updateAddButton(): void {
		const typeLabel = this.getTypeLabel();
		if (this.currentSection === AICustomizationManagementSection.Hooks) {
			this.addButton.label = `$(${Codicon.add.id}) New ${typeLabel}`;
			const hasWorktree = !!this.activeSessionService.getActiveSession()?.worktree;
			this.addButton.enabled = hasWorktree;
			const disabledTitle = hasWorktree
				? ''
				: localize('hooksCreateDisabled', "Open a session with a worktree to configure hooks.");
			this.addButton.primaryButton.setTitle(disabledTitle);
			this.addButton.dropdownButton.setTitle(disabledTitle);
			return;
		}
		this.addButton.primaryButton.setTitle('');
		this.addButton.dropdownButton.setTitle('');
		this.addButton.enabled = true;
		const hasWorktree = this.hasActiveWorktree();
		if (hasWorktree) {
			this.addButton.label = `$(${Codicon.add.id}) New ${typeLabel} (Worktree)`;
		} else {
			this.addButton.label = `$(${Codicon.add.id}) New ${typeLabel} (User)`;
		}
	}

	/**
	 * Gets the dropdown actions for the add button.
	 */
	private getDropdownActions(): Action[] {
		const typeLabel = this.getTypeLabel();
		const actions: Action[] = [];
		const promptType = sectionToPromptType(this.currentSection);
		const hasWorktree = this.hasActiveWorktree();

		if (hasWorktree && promptType !== PromptsType.hook) {
			// Primary is worktree - dropdown shows user + generate
			actions.push(new Action('createUser', `$(${Codicon.account.id}) New ${typeLabel} (User)`, undefined, true, () => {
				this._onDidRequestCreateManual.fire({ type: promptType, target: 'user' });
			}));
		}

		actions.push(new Action('createWithAI', `$(${Codicon.sparkle.id}) Generate ${typeLabel}`, undefined, true, () => {
			this._onDidRequestCreate.fire(promptType);
		}));

		return actions;
	}

	/**
	 * Checks if there's an active session root (worktree or repository).
	 */
	private hasActiveWorktree(): boolean {
		return !!getActiveSessionRoot(this.activeSessionService);
	}

	/**
	 * Executes the primary create action based on context.
	 */
	private executePrimaryCreateAction(): void {
		const promptType = sectionToPromptType(this.currentSection);
		if (promptType === PromptsType.hook && !this.activeSessionService.getActiveSession()?.worktree) {
			return;
		}
		const target = this.hasActiveWorktree() || promptType === PromptsType.hook ? 'worktree' : 'user';
		this._onDidRequestCreateManual.fire({ type: promptType, target });
	}

	/**
	 * Gets the type label for the current section.
	 */
	private getTypeLabel(): string {
		switch (this.currentSection) {
			case AICustomizationManagementSection.Agents:
				return localize('agent', "Agent");
			case AICustomizationManagementSection.Skills:
				return localize('skill', "Skill");
			case AICustomizationManagementSection.Instructions:
				return localize('instructions', "Instructions");
			case AICustomizationManagementSection.Hooks:
				return localize('hook', "Hook");
			case AICustomizationManagementSection.Prompts:
			default:
				return localize('prompt', "Prompt");
		}
	}

	/**
	 * Refreshes the current section's items.
	 */
	async refresh(): Promise<void> {
		this.updateAddButton();
		await this.loadItems();
	}

	/**
	 * Loads items for the current section.
	 */
	private async loadItems(): Promise<void> {
		const promptType = sectionToPromptType(this.currentSection);
		const items: IAICustomizationListItem[] = [];

		const folders = this.workspaceContextService.getWorkspace().folders;
		const activeRepo = getActiveSessionRoot(this.activeSessionService);
		this.logService.info(`[AICustomizationListWidget] loadItems: section=${this.currentSection}, promptType=${promptType}, workspaceFolders=[${folders.map(f => f.uri.toString()).join(', ')}], activeRepo=${activeRepo?.toString() ?? 'none'}`);


		if (promptType === PromptsType.agent) {
			// Use getCustomAgents which has parsed name/description from frontmatter
			const agents = await this.promptsService.getCustomAgents(CancellationToken.None);
			for (const agent of agents) {
				const filename = basename(agent.uri);
				items.push({
					id: agent.uri.toString(),
					uri: agent.uri,
					name: agent.name,
					filename,
					description: agent.description,
					storage: agent.source.storage,
					promptType,
				});
			}
		} else if (promptType === PromptsType.skill) {
			// Use findAgentSkills which has parsed name/description from frontmatter
			const skills = await this.promptsService.findAgentSkills(CancellationToken.None);
			for (const skill of skills || []) {
				const filename = basename(skill.uri);
				const skillName = skill.name || basename(dirname(skill.uri)) || filename;
				items.push({
					id: skill.uri.toString(),
					uri: skill.uri,
					name: skillName,
					filename,
					description: skill.description,
					storage: skill.storage,
					promptType,
				});
			}
		} else if (promptType === PromptsType.prompt) {
			// Use getPromptSlashCommands which has parsed name/description from frontmatter
			const commands = await this.promptsService.getPromptSlashCommands(CancellationToken.None);
			for (const command of commands) {
				const filename = basename(command.promptPath.uri);
				items.push({
					id: command.promptPath.uri.toString(),
					uri: command.promptPath.uri,
					name: command.name,
					filename,
					description: command.description,
					storage: command.promptPath.storage,
					promptType,
				});
			}
		} else if (promptType === PromptsType.hook) {
			// Parse hook files and display individual hooks
			const workspaceFolder = this.workspaceContextService.getWorkspace().folders[0];
			const workspaceRootUri = workspaceFolder?.uri;
			const userHomeUri = await this.pathService.userHome();
			const userHome = userHomeUri.fsPath ?? userHomeUri.path;
			const remoteEnv = await this.remoteAgentService.getEnvironment();
			const targetOS = remoteEnv?.os ?? OS;

			const parsedHooks = await parseAllHookFiles(
				this.promptsService,
				this.fileService,
				this.labelService,
				workspaceRootUri,
				userHome,
				targetOS,
				CancellationToken.None
			);

			for (const hook of parsedHooks) {
				// Determine storage from the file path
				const storage = hook.filePath.startsWith('~') ? PromptsStorage.user : PromptsStorage.local;

				items.push({
					id: `${hook.fileUri.toString()}#${hook.hookType}-${hook.index}`,
					uri: hook.fileUri,
					name: `${hook.hookTypeLabel}: ${hook.commandLabel}`,
					filename: basename(hook.fileUri),
					description: hook.filePath,
					storage,
					promptType,
				});
			}
		} else {
			// For instructions, fetch once and group by storage
			const allItems = await this.promptsService.listPromptFiles(promptType, CancellationToken.None);
			const workspaceItems = allItems.filter(item => item.storage === PromptsStorage.local);
			const userItems = allItems.filter(item => item.storage === PromptsStorage.user);
			const extensionItems = allItems.filter(item => item.storage === PromptsStorage.extension);

			const mapToListItem = (item: IPromptPath): IAICustomizationListItem => {
				const filename = basename(item.uri);
				// For instructions, derive a friendly name from filename
				const friendlyName = item.name || this.getFriendlyName(filename);
				return {
					id: item.uri.toString(),
					uri: item.uri,
					name: friendlyName,
					filename,
					description: item.description,
					storage: item.storage,
					promptType,
				};
			};

			items.push(...workspaceItems.map(mapToListItem));
			items.push(...userItems.map(mapToListItem));
			items.push(...extensionItems.map(mapToListItem));
		}

		// Sort items by name
		items.sort((a, b) => a.name.localeCompare(b.name));

		// Set git status for worktree (local) items
		this.updateGitStatus(items);

		this.logService.info(`[AICustomizationListWidget] loadItems complete: ${items.length} items loaded [${items.map(i => `${i.name}(${i.storage}:${i.uri.toString()})`).join(', ')}]`);

		this.allItems = items;
		this.filterItems();
		this._onDidChangeItemCount.fire(items.length);
	}

	/**
	 * Updates git status on worktree items by checking SCM resource groups.
	 * Files found in resource groups have uncommitted changes; others are committed.
	 */
	private updateGitStatus(items: IAICustomizationListItem[]): void {
		// Build a set of URIs that have uncommitted changes in SCM
		const uncommittedUris = new Set<string>();
		for (const repo of [...this.scmService.repositories]) {
			for (const group of repo.provider.groups) {
				for (const resource of group.resources) {
					uncommittedUris.add(resource.sourceUri.toString());
				}
			}
		}

		for (const item of items) {
			if (item.storage === PromptsStorage.local) {
				item.gitStatus = uncommittedUris.has(item.uri.toString()) ? 'uncommitted' : 'committed';
			}
		}
	}

	/**
	 * Derives a friendly name from a filename by removing extension suffixes.
	 */
	private getFriendlyName(filename: string): string {
		// Remove common prompt file extensions like .instructions.md, .prompt.md, etc.
		let name = filename
			.replace(/\.instructions\.md$/i, '')
			.replace(/\.prompt\.md$/i, '')
			.replace(/\.agent\.md$/i, '')
			.replace(/\.md$/i, '');

		// Convert kebab-case or snake_case to Title Case
		name = name
			.replace(/[-_]/g, ' ')
			.replace(/\b\w/g, c => c.toUpperCase());

		return name || filename;
	}

	/**
	 * Filters items based on the current search query and builds grouped display entries.
	 */
	private filterItems(): void {
		let matchedItems: IAICustomizationListItem[];

		if (!this.searchQuery.trim()) {
			matchedItems = this.allItems.map(item => ({ ...item, nameMatches: undefined, descriptionMatches: undefined }));
		} else {
			const query = this.searchQuery.toLowerCase();
			matchedItems = [];

			for (const item of this.allItems) {
				const nameMatches = matchesFuzzy(query, item.name, true);
				const descriptionMatches = item.description ? matchesFuzzy(query, item.description, true) : null;
				const filenameMatches = matchesFuzzy(query, item.filename, true);

				if (nameMatches || descriptionMatches || filenameMatches) {
					matchedItems.push({
						...item,
						nameMatches: nameMatches || undefined,
						descriptionMatches: descriptionMatches || undefined,
					});
				}
			}
		}

		const totalBeforeFilter = matchedItems.length;
		this.logService.info(`[AICustomizationListWidget] filterItems: allItems=${this.allItems.length}, matched=${totalBeforeFilter}`);

		// Group items by storage
		const groups: { storage: PromptsStorage; label: string; icon: ThemeIcon; items: IAICustomizationListItem[] }[] = [
			{ storage: PromptsStorage.local, label: localize('worktreeGroup', "Worktree"), icon: workspaceIcon, items: [] },
			{ storage: PromptsStorage.user, label: localize('userGroup', "User"), icon: userIcon, items: [] },
			{ storage: PromptsStorage.extension, label: localize('extensionGroup', "Extensions"), icon: extensionIcon, items: [] },
		];

		for (const item of matchedItems) {
			const group = groups.find(g => g.storage === item.storage);
			if (group) {
				group.items.push(item);
			}
		}

		// Sort items within each group
		for (const group of groups) {
			group.items.sort((a, b) => a.name.localeCompare(b.name));
		}

		// Build display entries: group header + items (hidden if collapsed)
		this.displayEntries = [];
		let isFirstGroup = true;
		for (const group of groups) {
			if (group.items.length === 0) {
				continue;
			}

			const collapsed = this.collapsedGroups.has(group.storage);

			this.displayEntries.push({
				type: 'group-header',
				id: `group-${group.storage}`,
				storage: group.storage,
				label: group.label,
				icon: group.icon,
				count: group.items.length,
				isFirst: isFirstGroup,
				collapsed,
			});
			isFirstGroup = false;

			if (!collapsed) {
				for (const item of group.items) {
					this.displayEntries.push({ type: 'file-item', item });
				}
			}
		}

		this.list.splice(0, this.list.length, this.displayEntries);
		this.logService.info(`[AICustomizationListWidget] filterItems complete: ${this.displayEntries.length} display entries spliced into list`);
		this.updateEmptyState();
	}

	/**
	 * Toggles the collapsed state of a group.
	 */
	private toggleGroup(entry: IGroupHeaderEntry): void {
		if (this.collapsedGroups.has(entry.storage)) {
			this.collapsedGroups.delete(entry.storage);
		} else {
			this.collapsedGroups.add(entry.storage);
		}
		this.filterItems();
	}

	private updateEmptyState(): void {
		const hasItems = this.displayEntries.length > 0;
		if (!hasItems) {
			this.emptyStateContainer.style.display = 'flex';
			this.listContainer.style.display = 'none';

			// Update icon based on section
			this.emptyStateIcon.className = 'empty-state-icon';
			const sectionIcon = this.getSectionIcon();
			this.emptyStateIcon.classList.add(...ThemeIcon.asClassNameArray(sectionIcon));

			if (this.searchQuery.trim()) {
				// Search with no results
				this.emptyStateText.textContent = localize('noMatchingItems', "No items match '{0}'", this.searchQuery);
				this.emptyStateSubtext.textContent = localize('tryDifferentSearch', "Try a different search term");
			} else {
				// No items at all - show empty state with create hint
				const emptyInfo = this.getEmptyStateInfo();
				this.emptyStateText.textContent = emptyInfo.title;
				this.emptyStateSubtext.textContent = emptyInfo.description;
			}
		} else {
			this.emptyStateContainer.style.display = 'none';
			this.listContainer.style.display = '';
		}
	}

	private getSectionIcon(): ThemeIcon {
		switch (this.currentSection) {
			case AICustomizationManagementSection.Agents:
				return agentIcon;
			case AICustomizationManagementSection.Skills:
				return skillIcon;
			case AICustomizationManagementSection.Instructions:
				return instructionsIcon;
			case AICustomizationManagementSection.Hooks:
				return hookIcon;
			case AICustomizationManagementSection.Prompts:
			default:
				return promptIcon;
		}
	}

	private getEmptyStateInfo(): { title: string; description: string } {
		switch (this.currentSection) {
			case AICustomizationManagementSection.Agents:
				return {
					title: localize('noAgents', "No agents yet"),
					description: localize('createFirstAgent', "Create your first custom agent to get started"),
				};
			case AICustomizationManagementSection.Skills:
				return {
					title: localize('noSkills', "No skills yet"),
					description: localize('createFirstSkill', "Create your first skill to extend agent capabilities"),
				};
			case AICustomizationManagementSection.Instructions:
				return {
					title: localize('noInstructions', "No instructions yet"),
					description: localize('createFirstInstructions', "Add instructions to teach Copilot about your codebase"),
				};
			case AICustomizationManagementSection.Hooks:
				return {
					title: localize('noHooks', "No hooks yet"),
					description: localize('createFirstHook', "Create hooks to execute commands at agent lifecycle events"),
				};
			case AICustomizationManagementSection.Prompts:
			default:
				return {
					title: localize('noPrompts', "No prompts yet"),
					description: localize('createFirstPrompt', "Create reusable prompts for common tasks"),
				};
		}
	}

	/**
	 * Sets the search query programmatically.
	 */
	setSearchQuery(query: string): void {
		this.searchInput.value = query;
	}

	/**
	 * Clears the search query.
	 */
	clearSearch(): void {
		this.searchInput.value = '';
	}

	/**
	 * Focuses the search input.
	 */
	focusSearch(): void {
		this.searchInput.focus();
	}

	/**
	 * Focuses the list.
	 */
	focusList(): void {
		this.list.domFocus();
		if (this.displayEntries.length > 0) {
			this.list.setFocus([0]);
		}
	}

	/**
	 * Layouts the widget.
	 */
	layout(height: number, width: number): void {
		const sectionFooterHeight = this.sectionHeader.offsetHeight || 100;
		const searchBarHeight = this.searchAndButtonContainer.offsetHeight || 40;
		const margins = 12; // search margin (6+6), not included in offsetHeight
		const listHeight = height - sectionFooterHeight - searchBarHeight - margins;

		this.searchInput.layout();
		this.listContainer.style.height = `${Math.max(0, listHeight)}px`;
		this.list.layout(Math.max(0, listHeight), width);
	}

	/**
	 * Gets the total item count (before filtering).
	 */
	get itemCount(): number {
		return this.allItems.length;
	}
}
