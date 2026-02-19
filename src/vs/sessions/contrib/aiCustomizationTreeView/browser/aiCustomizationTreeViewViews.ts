/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/aiCustomizationTreeView.css';
import * as dom from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { basename, dirname } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { getContextMenuActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { WorkbenchAsyncDataTree } from '../../../../platform/list/browser/listService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IViewPaneOptions, ViewPane } from '../../../../workbench/browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../../workbench/common/views.js';
import { IPromptsService, PromptsStorage, IAgentSkill, IPromptPath } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { agentIcon, extensionIcon, instructionsIcon, promptIcon, skillIcon, userIcon, workspaceIcon } from './aiCustomizationTreeViewIcons.js';
import { AICustomizationItemMenuId } from './aiCustomizationTreeView.js';
import { IAsyncDataSource, ITreeNode, ITreeRenderer, ITreeContextMenuEvent } from '../../../../base/browser/ui/tree/tree.js';
import { FuzzyScore } from '../../../../base/common/filters.js';
import { IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';

//#region Context Keys

/**
 * Context key indicating whether the AI Customization view has no items.
 */
export const AICustomizationIsEmptyContextKey = new RawContextKey<boolean>('aiCustomization.isEmpty', true);

/**
 * Context key for the current item's prompt type in context menus.
 */
export const AICustomizationItemTypeContextKey = new RawContextKey<string>('aiCustomizationItemType', '');

//#endregion

//#region Tree Item Types

/**
 * Root element marker for the tree.
 */
const ROOT_ELEMENT = Symbol('root');
type RootElement = typeof ROOT_ELEMENT;

/**
 * Represents a type category in the tree (e.g., "Custom Agents", "Skills").
 */
interface IAICustomizationTypeItem {
	readonly type: 'category';
	readonly id: string;
	readonly label: string;
	readonly promptType: PromptsType;
	readonly icon: ThemeIcon;
}

/**
 * Represents a storage group header in the tree (e.g., "Workspace", "User", "Extensions").
 */
interface IAICustomizationGroupItem {
	readonly type: 'group';
	readonly id: string;
	readonly label: string;
	readonly storage: PromptsStorage;
	readonly promptType: PromptsType;
	readonly icon: ThemeIcon;
}

/**
 * Represents an individual AI customization item (agent, skill, instruction, or prompt).
 */
interface IAICustomizationFileItem {
	readonly type: 'file';
	readonly id: string;
	readonly uri: URI;
	readonly name: string;
	readonly description?: string;
	readonly storage: PromptsStorage;
	readonly promptType: PromptsType;
}

type AICustomizationTreeItem = IAICustomizationTypeItem | IAICustomizationGroupItem | IAICustomizationFileItem;

//#endregion

//#region Tree Infrastructure

class AICustomizationTreeDelegate implements IListVirtualDelegate<AICustomizationTreeItem> {
	getHeight(_element: AICustomizationTreeItem): number {
		return 22;
	}

	getTemplateId(element: AICustomizationTreeItem): string {
		switch (element.type) {
			case 'category':
				return 'category';
			case 'group':
				return 'group';
			case 'file':
				return 'file';
		}
	}
}

interface ICategoryTemplateData {
	readonly container: HTMLElement;
	readonly icon: HTMLElement;
	readonly label: HTMLElement;
}

interface IGroupTemplateData {
	readonly container: HTMLElement;
	readonly label: HTMLElement;
}

interface IFileTemplateData {
	readonly container: HTMLElement;
	readonly icon: HTMLElement;
	readonly name: HTMLElement;
}

class AICustomizationCategoryRenderer implements ITreeRenderer<IAICustomizationTypeItem, FuzzyScore, ICategoryTemplateData> {
	readonly templateId = 'category';

	renderTemplate(container: HTMLElement): ICategoryTemplateData {
		const element = dom.append(container, dom.$('.ai-customization-category'));
		const icon = dom.append(element, dom.$('.icon'));
		const label = dom.append(element, dom.$('.label'));
		return { container: element, icon, label };
	}

	renderElement(node: ITreeNode<IAICustomizationTypeItem, FuzzyScore>, _index: number, templateData: ICategoryTemplateData): void {
		templateData.icon.className = 'icon';
		templateData.icon.classList.add(...ThemeIcon.asClassNameArray(node.element.icon));
		templateData.label.textContent = node.element.label;
	}

	disposeTemplate(_templateData: ICategoryTemplateData): void { }
}

class AICustomizationGroupRenderer implements ITreeRenderer<IAICustomizationGroupItem, FuzzyScore, IGroupTemplateData> {
	readonly templateId = 'group';

	renderTemplate(container: HTMLElement): IGroupTemplateData {
		const element = dom.append(container, dom.$('.ai-customization-group-header'));
		const label = dom.append(element, dom.$('.label'));
		return { container: element, label };
	}

	renderElement(node: ITreeNode<IAICustomizationGroupItem, FuzzyScore>, _index: number, templateData: IGroupTemplateData): void {
		templateData.label.textContent = node.element.label;
	}

	disposeTemplate(_templateData: IGroupTemplateData): void { }
}

class AICustomizationFileRenderer implements ITreeRenderer<IAICustomizationFileItem, FuzzyScore, IFileTemplateData> {
	readonly templateId = 'file';

	renderTemplate(container: HTMLElement): IFileTemplateData {
		const element = dom.append(container, dom.$('.ai-customization-tree-item'));
		const icon = dom.append(element, dom.$('.icon'));
		const name = dom.append(element, dom.$('.name'));
		return { container: element, icon, name };
	}

	renderElement(node: ITreeNode<IAICustomizationFileItem, FuzzyScore>, _index: number, templateData: IFileTemplateData): void {
		const item = node.element;

		// Set icon based on prompt type
		let icon: ThemeIcon;
		switch (item.promptType) {
			case PromptsType.agent:
				icon = agentIcon;
				break;
			case PromptsType.skill:
				icon = skillIcon;
				break;
			case PromptsType.instructions:
				icon = instructionsIcon;
				break;
			case PromptsType.prompt:
			default:
				icon = promptIcon;
				break;
		}

		templateData.icon.className = 'icon';
		templateData.icon.classList.add(...ThemeIcon.asClassNameArray(icon));

		templateData.name.textContent = item.name;

		// Set tooltip with name and description
		const tooltip = item.description ? `${item.name} - ${item.description}` : item.name;
		templateData.container.title = tooltip;
	}

	disposeTemplate(_templateData: IFileTemplateData): void { }
}

/**
 * Cached data for a specific prompt type.
 */
interface ICachedTypeData {
	skills?: IAgentSkill[];
	files?: Map<PromptsStorage, readonly IPromptPath[]>;
}

/**
 * Data source for the AI Customization tree with efficient caching.
 * Caches data per-type to avoid redundant fetches when expanding groups.
 */
class UnifiedAICustomizationDataSource implements IAsyncDataSource<RootElement, AICustomizationTreeItem> {
	private cache = new Map<PromptsType, ICachedTypeData>();
	private totalItemCount = 0;

	constructor(
		private readonly promptsService: IPromptsService,
		private readonly logService: ILogService,
		private readonly onItemCountChanged: (count: number) => void,
	) { }

	/**
	 * Clears the cache. Should be called when the view refreshes.
	 */
	clearCache(): void {
		this.cache.clear();
		this.totalItemCount = 0;
	}

	hasChildren(element: RootElement | AICustomizationTreeItem): boolean {
		if (element === ROOT_ELEMENT) {
			return true;
		}
		return element.type === 'category' || element.type === 'group';
	}

	async getChildren(element: RootElement | AICustomizationTreeItem): Promise<AICustomizationTreeItem[]> {
		try {
			if (element === ROOT_ELEMENT) {
				return this.getTypeCategories();
			}

			if (element.type === 'category') {
				return this.getStorageGroups(element.promptType);
			}

			if (element.type === 'group') {
				return this.getFilesForStorageAndType(element.storage, element.promptType);
			}

			return [];
		} catch (error) {
			this.logService.error('[AICustomization] Error fetching tree children:', error);
			return [];
		}
	}

	private getTypeCategories(): IAICustomizationTypeItem[] {
		return [
			{
				type: 'category',
				id: 'category-agents',
				label: localize('customAgents', "Custom Agents"),
				promptType: PromptsType.agent,
				icon: agentIcon,
			},
			{
				type: 'category',
				id: 'category-skills',
				label: localize('skills', "Skills"),
				promptType: PromptsType.skill,
				icon: skillIcon,
			},
			{
				type: 'category',
				id: 'category-instructions',
				label: localize('instructions', "Instructions"),
				promptType: PromptsType.instructions,
				icon: instructionsIcon,
			},
			{
				type: 'category',
				id: 'category-prompts',
				label: localize('prompts', "Prompts"),
				promptType: PromptsType.prompt,
				icon: promptIcon,
			},
		];
	}

	/**
	 * Fetches and caches data for a prompt type, returning storage groups with items.
	 */
	private async getStorageGroups(promptType: PromptsType): Promise<IAICustomizationGroupItem[]> {
		const groups: IAICustomizationGroupItem[] = [];

		// Check cache first
		let cached = this.cache.get(promptType);
		if (!cached) {
			cached = {};
			this.cache.set(promptType, cached);
		}

		// For skills, use findAgentSkills which has the proper names from frontmatter
		if (promptType === PromptsType.skill) {
			if (!cached.skills) {
				const skills = await this.promptsService.findAgentSkills(CancellationToken.None);
				cached.skills = skills || [];
				this.totalItemCount += cached.skills.length;
				this.onItemCountChanged(this.totalItemCount);
			}

			const workspaceSkills = cached.skills.filter(s => s.storage === PromptsStorage.local);
			const userSkills = cached.skills.filter(s => s.storage === PromptsStorage.user);
			const extensionSkills = cached.skills.filter(s => s.storage === PromptsStorage.extension);

			if (workspaceSkills.length > 0) {
				groups.push(this.createGroupItem(promptType, PromptsStorage.local, workspaceSkills.length));
			}
			if (userSkills.length > 0) {
				groups.push(this.createGroupItem(promptType, PromptsStorage.user, userSkills.length));
			}
			if (extensionSkills.length > 0) {
				groups.push(this.createGroupItem(promptType, PromptsStorage.extension, extensionSkills.length));
			}

			return groups;
		}

		// For other types, fetch once and cache grouped by storage
		if (!cached.files) {
			const allItems = await this.promptsService.listPromptFiles(promptType, CancellationToken.None);
			const workspaceItems = allItems.filter(item => item.storage === PromptsStorage.local);
			const userItems = allItems.filter(item => item.storage === PromptsStorage.user);
			const extensionItems = allItems.filter(item => item.storage === PromptsStorage.extension);

			cached.files = new Map<PromptsStorage, readonly IPromptPath[]>([
				[PromptsStorage.local, workspaceItems],
				[PromptsStorage.user, userItems],
				[PromptsStorage.extension, extensionItems],
			]);

			const itemCount = allItems.length;
			this.totalItemCount += itemCount;
			this.onItemCountChanged(this.totalItemCount);
		}

		const workspaceItems = cached.files!.get(PromptsStorage.local) || [];
		const userItems = cached.files!.get(PromptsStorage.user) || [];
		const extensionItems = cached.files!.get(PromptsStorage.extension) || [];

		if (workspaceItems.length > 0) {
			groups.push(this.createGroupItem(promptType, PromptsStorage.local, workspaceItems.length));
		}
		if (userItems.length > 0) {
			groups.push(this.createGroupItem(promptType, PromptsStorage.user, userItems.length));
		}
		if (extensionItems.length > 0) {
			groups.push(this.createGroupItem(promptType, PromptsStorage.extension, extensionItems.length));
		}

		return groups;
	}

	/**
	 * Creates a group item with consistent structure.
	 */
	private createGroupItem(promptType: PromptsType, storage: PromptsStorage, count: number): IAICustomizationGroupItem {
		const storageLabels: Record<PromptsStorage, string> = {
			[PromptsStorage.local]: localize('workspaceWithCount', "Workspace ({0})", count),
			[PromptsStorage.user]: localize('userWithCount', "User ({0})", count),
			[PromptsStorage.extension]: localize('extensionsWithCount', "Extensions ({0})", count),
		};

		const storageIcons: Record<PromptsStorage, ThemeIcon> = {
			[PromptsStorage.local]: workspaceIcon,
			[PromptsStorage.user]: userIcon,
			[PromptsStorage.extension]: extensionIcon,
		};

		const storageSuffixes: Record<PromptsStorage, string> = {
			[PromptsStorage.local]: 'workspace',
			[PromptsStorage.user]: 'user',
			[PromptsStorage.extension]: 'extensions',
		};

		return {
			type: 'group',
			id: `group-${promptType}-${storageSuffixes[storage]}`,
			label: storageLabels[storage],
			storage,
			promptType,
			icon: storageIcons[storage],
		};
	}

	/**
	 * Returns files for a specific storage/type combination from cache.
	 * getStorageGroups must be called first to populate the cache.
	 */
	private async getFilesForStorageAndType(storage: PromptsStorage, promptType: PromptsType): Promise<IAICustomizationFileItem[]> {
		const cached = this.cache.get(promptType);

		// For skills, use the cached skills data
		if (promptType === PromptsType.skill) {
			const skills = cached?.skills || [];
			const filtered = skills.filter(skill => skill.storage === storage);
			return filtered
				.map(skill => {
					// Use skill name from frontmatter, or fallback to parent folder name
					const skillName = skill.name || basename(dirname(skill.uri)) || basename(skill.uri);
					return {
						type: 'file' as const,
						id: skill.uri.toString(),
						uri: skill.uri,
						name: skillName,
						description: skill.description,
						storage: skill.storage,
						promptType,
					};
				});
		}

		// Use cached files data (already fetched in getStorageGroups)
		const items = [...(cached?.files?.get(storage) || [])];
		return items.map(item => ({
			type: 'file' as const,
			id: item.uri.toString(),
			uri: item.uri,
			name: item.name || basename(item.uri),
			description: item.description,
			storage: item.storage,
			promptType,
		}));
	}
}

//#endregion

//#region Unified View Pane

/**
 * Unified view pane for all AI Customization items (agents, skills, instructions, prompts).
 */
export class AICustomizationViewPane extends ViewPane {
	static readonly ID = 'aiCustomization.view';

	private tree: WorkbenchAsyncDataTree<RootElement, AICustomizationTreeItem, FuzzyScore> | undefined;
	private dataSource: UnifiedAICustomizationDataSource | undefined;
	private treeContainer: HTMLElement | undefined;
	private readonly treeDisposables = this._register(new DisposableStore());

	// Context keys for controlling menu visibility and welcome content
	private readonly isEmptyContextKey: IContextKey<boolean>;
	private readonly itemTypeContextKey: IContextKey<string>;

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
		@IPromptsService private readonly promptsService: IPromptsService,
		@IEditorService private readonly editorService: IEditorService,
		@IMenuService private readonly menuService: IMenuService,
		@ILogService private readonly logService: ILogService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ISessionsManagementService private readonly activeSessionService: ISessionsManagementService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		// Initialize context keys
		this.isEmptyContextKey = AICustomizationIsEmptyContextKey.bindTo(contextKeyService);
		this.itemTypeContextKey = AICustomizationItemTypeContextKey.bindTo(contextKeyService);

		// Subscribe to prompt service events to refresh tree
		this._register(this.promptsService.onDidChangeCustomAgents(() => this.refresh()));
		this._register(this.promptsService.onDidChangeSlashCommands(() => this.refresh()));

		// Listen to workspace folder changes to refresh tree
		this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => this.refresh()));
		this._register(autorun(reader => {
			this.activeSessionService.activeSession.read(reader);
			this.refresh();
		}));

	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		container.classList.add('ai-customization-view');
		this.treeContainer = dom.append(container, dom.$('.tree-container'));

		this.createTree();
	}

	private createTree(): void {
		if (!this.treeContainer) {
			return;
		}

		// Create data source with callback for tracking item count
		this.dataSource = new UnifiedAICustomizationDataSource(
			this.promptsService,
			this.logService,
			(count) => this.isEmptyContextKey.set(count === 0),
		);

		this.tree = this.treeDisposables.add(this.instantiationService.createInstance(
			WorkbenchAsyncDataTree<RootElement, AICustomizationTreeItem, FuzzyScore>,
			'AICustomization',
			this.treeContainer,
			new AICustomizationTreeDelegate(),
			[
				new AICustomizationCategoryRenderer(),
				new AICustomizationGroupRenderer(),
				new AICustomizationFileRenderer(),
			],
			this.dataSource,
			{
				identityProvider: {
					getId: (element: AICustomizationTreeItem) => element.id,
				},
				accessibilityProvider: {
					getAriaLabel: (element: AICustomizationTreeItem) => {
						if (element.type === 'category') {
							return element.label;
						}
						if (element.type === 'group') {
							return element.label;
						}
						// For files, include description if available
						return element.description
							? localize('fileAriaLabel', "{0}, {1}", element.name, element.description)
							: element.name;
					},
					getWidgetAriaLabel: () => localize('aiCustomizationTree', "AI Customization Items"),
				},
				keyboardNavigationLabelProvider: {
					getKeyboardNavigationLabel: (element: AICustomizationTreeItem) => {
						if (element.type === 'file') {
							return element.name;
						}
						return element.label;
					},
				},
			}
		));

		// Handle double-click to open file
		this.treeDisposables.add(this.tree.onDidOpen(e => {
			if (e.element && e.element.type === 'file') {
				this.editorService.openEditor({
					resource: e.element.uri
				});
			}
		}));

		// Handle context menu
		this.treeDisposables.add(this.tree.onContextMenu(e => this.onContextMenu(e)));

		// Initial load and auto-expand category nodes
		void this.tree.setInput(ROOT_ELEMENT).then(() => this.autoExpandCategories());
	}

	private async autoExpandCategories(): Promise<void> {
		if (!this.tree) {
			return;
		}
		// Auto-expand all category nodes to show storage groups
		const rootNode = this.tree.getNode(ROOT_ELEMENT);
		for (const child of rootNode.children) {
			if (child.element !== ROOT_ELEMENT) {
				await this.tree.expand(child.element);
			}
		}
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.tree?.layout(height, width);
	}

	public refresh(): void {
		// Clear the cache before refreshing
		this.dataSource?.clearCache();
		this.isEmptyContextKey.set(true); // Reset until we know the count
		void this.tree?.setInput(ROOT_ELEMENT).then(() => this.autoExpandCategories());
	}

	public collapseAll(): void {
		this.tree?.collapseAll();
	}

	public expandAll(): void {
		this.tree?.expandAll();
	}

	private onContextMenu(e: ITreeContextMenuEvent<AICustomizationTreeItem | null>): void {
		// Only show context menu for file items
		if (!e.element || e.element.type !== 'file') {
			return;
		}

		const element = e.element;

		// Set context key for the item type so menu items can use `when` clauses
		this.itemTypeContextKey.set(element.promptType);

		// Get menu actions from the menu service
		const context = {
			uri: element.uri.toString(),
			name: element.name,
			promptType: element.promptType,
		};
		const menu = this.menuService.getMenuActions(AICustomizationItemMenuId, this.contextKeyService, { arg: context, shouldForwardArgs: true });
		const { secondary } = getContextMenuActions(menu, 'inline');

		// Show the context menu
		if (secondary.length > 0) {
			this.contextMenuService.showContextMenu({
				getAnchor: () => e.anchor,
				getActions: () => secondary,
				getActionsContext: () => context,
				onHide: () => {
					// Clear the context key when menu closes
					this.itemTypeContextKey.reset();
				},
			});
		}
	}
}

//#endregion
