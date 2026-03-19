/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/aiCustomizationManagement.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { autorun } from '../../../../../base/common/observable.js';
import { basename, dirname, isEqualOrParent } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchList } from '../../../../../platform/list/browser/listService.js';
import { IListVirtualDelegate, IListRenderer, IListContextMenuEvent } from '../../../../../base/browser/ui/list/list.js';
import { IPromptsService, PromptsStorage, IPromptPath } from '../../common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { agentIcon, instructionsIcon, promptIcon, skillIcon, hookIcon, userIcon, workspaceIcon, extensionIcon, pluginIcon, builtinIcon } from './aiCustomizationIcons.js';
import { AI_CUSTOMIZATION_ITEM_DISABLED_KEY, AI_CUSTOMIZATION_ITEM_STORAGE_KEY, AI_CUSTOMIZATION_ITEM_TYPE_KEY, AI_CUSTOMIZATION_ITEM_URI_KEY, AICustomizationManagementItemMenuId, AICustomizationManagementSection, BUILTIN_STORAGE } from './aiCustomizationManagement.js';
import { InputBox } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { Delayer } from '../../../../../base/common/async.js';
import { IContextMenuService, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { HighlightedLabel } from '../../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
import { matchesContiguousSubString, IMatch } from '../../../../../base/common/filters.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { Button, ButtonWithDropdown } from '../../../../../base/browser/ui/button/button.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { createActionViewItem, getContextMenuActions } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IAICustomizationWorkspaceService, applyStorageSourceFilter } from '../../common/aiCustomizationWorkspaceService.js';
import { Action, Separator } from '../../../../../base/common/actions.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { generateCustomizationDebugReport } from './aiCustomizationDebugPanel.js';
import { getCustomizationSecondaryText } from './aiCustomizationListWidgetUtils.js';
import { parseHooksFromFile } from '../../common/promptSyntax/hookCompatibility.js';
import { formatHookCommandLabel } from '../../common/promptSyntax/hookSchema.js';
import { HookType, HOOK_METADATA } from '../../common/promptSyntax/hookTypes.js';
import { parse as parseJSONC } from '../../../../../base/common/json.js';
import { Schemas } from '../../../../../base/common/network.js';
import { OS } from '../../../../../base/common/platform.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ICustomizationHarnessService, matchesWorkspaceSubpath, matchesInstructionFileFilter } from '../../common/customizationHarnessService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';

export { truncateToFirstSentence } from './aiCustomizationListWidgetUtils.js';

const $ = DOM.$;

//#region Telemetry

type CustomizationEditorSearchEvent = {
	section: string;
	resultCount: number;
};

type CustomizationEditorSearchClassification = {
	section: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The active section when the search was performed.' };
	resultCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of items matching the search query.' };
	owner: 'joshspicer';
	comment: 'Tracks search usage in the Chat Customizations editor.';
};

//#endregion

const ITEM_HEIGHT = 44;
const GROUP_HEADER_HEIGHT = 36;
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
	readonly disabled: boolean;
	/** When set, overrides `storage` for display grouping purposes. */
	readonly groupKey?: string;
	nameMatches?: IMatch[];
	descriptionMatches?: IMatch[];
}

/**
 * Represents a collapsible group header in the list.
 */
interface IGroupHeaderEntry {
	readonly type: 'group-header';
	readonly id: string;
	readonly groupKey: string;
	readonly label: string;
	readonly icon: ThemeIcon;
	readonly count: number;
	readonly isFirst: boolean;
	readonly description: string;
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
	readonly actionBar: ActionBar;
	readonly typeIcon: HTMLElement;
	readonly nameLabel: HighlightedLabel;
	readonly description: HighlightedLabel;
	readonly disposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
}

interface IGroupHeaderTemplateData {
	readonly container: HTMLElement;
	readonly chevron: HTMLElement;
	readonly icon: HTMLElement;
	readonly label: HTMLElement;
	readonly count: HTMLElement;
	readonly infoIcon: HTMLElement;
	readonly disposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
}

/**
 * Renderer for collapsible group headers (Workspace, User, Extensions).
 * Note: Click handling is done via the list's onDidOpen event, not here.
 */
class GroupHeaderRenderer implements IListRenderer<IGroupHeaderEntry, IGroupHeaderTemplateData> {
	readonly templateId = 'groupHeader';

	constructor(
		private readonly hoverService: IHoverService,
	) { }

	renderTemplate(container: HTMLElement): IGroupHeaderTemplateData {
		const disposables = new DisposableStore();
		const elementDisposables = new DisposableStore();
		container.classList.add('ai-customization-group-header');

		const chevron = DOM.append(container, $('.group-chevron'));
		const icon = DOM.append(container, $('.group-icon'));
		const labelGroup = DOM.append(container, $('.group-label-group'));
		const label = DOM.append(labelGroup, $('.group-label'));
		const infoIcon = DOM.append(labelGroup, $('.group-info'));
		infoIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.info));
		const count = DOM.append(container, $('.group-count'));

		return { container, chevron, icon, label, count, infoIcon, disposables, elementDisposables };
	}

	renderElement(element: IGroupHeaderEntry, _index: number, templateData: IGroupHeaderTemplateData): void {
		templateData.elementDisposables.clear();

		// Chevron
		templateData.chevron.className = 'group-chevron';
		templateData.chevron.classList.add(...ThemeIcon.asClassNameArray(element.collapsed ? Codicon.chevronRight : Codicon.chevronDown));

		// Icon
		templateData.icon.className = 'group-icon';
		templateData.icon.classList.add(...ThemeIcon.asClassNameArray(element.icon));

		// Label + count
		templateData.label.textContent = element.label;
		templateData.count.textContent = `${element.count}`;

		// Info icon hover
		templateData.elementDisposables.add(this.hoverService.setupDelayedHover(templateData.infoIcon, () => ({
			content: element.description,
			appearance: {
				compact: true,
				skipFadeInAnimation: true,
			}
		})));

		// Collapsed state and separator for non-first groups
		templateData.container.classList.toggle('collapsed', element.collapsed);
		templateData.container.classList.toggle('has-previous-group', !element.isFirst);
	}

	disposeTemplate(templateData: IGroupHeaderTemplateData): void {
		templateData.elementDisposables.dispose();
		templateData.disposables.dispose();
	}
}

/**
 * Returns the icon for a given prompt type.
 */
function promptTypeToIcon(type: PromptsType): ThemeIcon {
	switch (type) {
		case PromptsType.agent: return agentIcon;
		case PromptsType.skill: return skillIcon;
		case PromptsType.instructions: return instructionsIcon;
		case PromptsType.prompt: return promptIcon;
		case PromptsType.hook: return hookIcon;
		default: return promptIcon;
	}
}

/**
 * Formats a name for display: strips a trailing .md extension, converts dashes/underscores
 * to spaces and applies title case.
 * Note: callers that pass IMatch highlight ranges must compute those ranges against the
 * formatted string (not the raw input), since .md stripping changes string length.
 */
export function formatDisplayName(name: string): string {
	return name
		.replace(/\.md$/i, '')
		.replace(/[-_]/g, ' ')
		.replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Renderer for AI customization list items.
 */
class AICustomizationItemRenderer implements IListRenderer<IFileItemEntry, IAICustomizationItemTemplateData> {
	readonly templateId = 'aiCustomizationItem';

	constructor(
		@IHoverService private readonly hoverService: IHoverService,
		@ILabelService private readonly labelService: ILabelService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	renderTemplate(container: HTMLElement): IAICustomizationItemTemplateData {
		const disposables = new DisposableStore();
		const elementDisposables = new DisposableStore();

		container.classList.add('ai-customization-list-item');

		const leftSection = DOM.append(container, $('.item-left'));
		const typeIcon = DOM.append(leftSection, $('.item-type-icon'));
		const textContainer = DOM.append(leftSection, $('.item-text'));
		const nameLabel = disposables.add(new HighlightedLabel(DOM.append(textContainer, $('.item-name'))));
		const description = disposables.add(new HighlightedLabel(DOM.append(textContainer, $('.item-description'))));

		// Right section for actions (hover-visible)
		const actionsContainer = DOM.append(container, $('.item-right'));
		const actionBar = disposables.add(new ActionBar(actionsContainer, {
			actionViewItemProvider: createActionViewItem.bind(undefined, this.instantiationService),
		}));

		return {
			container,
			actionsContainer,
			actionBar,
			typeIcon,
			nameLabel,
			description,
			disposables,
			elementDisposables,
		};
	}

	renderElement(entry: IFileItemEntry, index: number, templateData: IAICustomizationItemTemplateData): void {
		templateData.elementDisposables.clear();
		const element = entry.item;

		// Type icon based on prompt type
		templateData.typeIcon.className = 'item-type-icon';
		templateData.typeIcon.classList.add(...ThemeIcon.asClassNameArray(promptTypeToIcon(element.promptType)));

		// Hover tooltip: name + full path
		templateData.elementDisposables.add(this.hoverService.setupDelayedHover(templateData.container, () => {
			const uriLabel = this.labelService.getUriLabel(element.uri, { relative: false });
			return {
				content: `${element.name}\n${uriLabel}`,
				appearance: {
					compact: true,
					skipFadeInAnimation: true,
				}
			};
		}));

		// Apply disabled styling
		templateData.container.classList.toggle('disabled', element.disabled);

		// Name with highlights — nameMatches are pre-computed against the formatted display name
		const displayName = formatDisplayName(element.name);
		templateData.nameLabel.set(displayName, element.nameMatches);

		// Hooks show shell commands here, so keep the full text instead of truncating to the first sentence.
		const secondaryText = getCustomizationSecondaryText(element.description, element.filename, element.promptType);
		let secondaryTextMatches: IMatch[] | undefined;
		if (secondaryText && element.description && element.descriptionMatches) {
			if (secondaryText === element.description) {
				// No truncation, matches can be used as-is.
				secondaryTextMatches = element.descriptionMatches;
			} else {
				// Description was truncated for display; clamp matches to the visible range.
				const maxLength = secondaryText.length;
				const clampedMatches = element.descriptionMatches.map(match => {
					// Discard matches that are entirely outside the visible portion.
					if (match.start >= maxLength || match.end <= 0) {
						return undefined;
					}
					const clampedStart = Math.max(0, match.start);
					const clampedEnd = Math.min(match.end, maxLength);
					return clampedEnd > clampedStart ? { start: clampedStart, end: clampedEnd } : undefined;
				}).filter((match): match is IMatch => !!match);
				secondaryTextMatches = clampedMatches.length ? clampedMatches : undefined;
			}
		}
		if (secondaryText) {
			templateData.description.set(secondaryText, secondaryTextMatches);
			templateData.description.element.style.display = '';
			// Style differently for filename vs description
			templateData.description.element.classList.toggle('is-filename', !element.description);
		} else {
			templateData.description.set('', undefined);
			templateData.description.element.style.display = 'none';
		}

		// Inline action bar from menu
		const context = {
			uri: element.uri.toString(),
			name: element.name,
			promptType: element.promptType,
			storage: element.storage,
		};

		// Create scoped context key service with item-specific keys for when-clause filtering
		const overlay = this.contextKeyService.createOverlay([
			[AI_CUSTOMIZATION_ITEM_TYPE_KEY, element.promptType],
			[AI_CUSTOMIZATION_ITEM_STORAGE_KEY, element.storage],
			[AI_CUSTOMIZATION_ITEM_URI_KEY, element.uri.toString()],
			[AI_CUSTOMIZATION_ITEM_DISABLED_KEY, element.disabled],
		]);

		const menu = templateData.elementDisposables.add(
			this.menuService.createMenu(AICustomizationManagementItemMenuId, overlay)
		);

		const updateActions = () => {
			const actions = menu.getActions({ arg: context, shouldForwardArgs: true });
			const { primary } = getContextMenuActions(actions, 'inline');
			templateData.actionBar.clear();
			templateData.actionBar.push(primary, { icon: true, label: false });
		};
		updateActions();
		templateData.elementDisposables.add(menu.onDidChange(updateActions));

		templateData.actionBar.context = context;
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
 * An ordered create action for the add button.
 */
interface ICreateAction {
	readonly label: string;
	readonly enabled: boolean;
	readonly tooltip?: string;
	run(): void;
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
	private addButtonContainer!: HTMLElement;
	private addButton!: ButtonWithDropdown;
	private addButtonSimple!: Button;
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
	private readonly collapsedGroups = new Set<string>();
	private readonly dropdownActionDisposables = this._register(new DisposableStore());

	private readonly delayedFilter = new Delayer<void>(200);

	private readonly _onDidSelectItem = this._register(new Emitter<IAICustomizationListItem>());
	readonly onDidSelectItem: Event<IAICustomizationListItem> = this._onDidSelectItem.event;

	private readonly _onDidChangeItemCount = this._register(new Emitter<number>());
	readonly onDidChangeItemCount: Event<number> = this._onDidChangeItemCount.event;

	private readonly _onDidRequestCreate = this._register(new Emitter<PromptsType>());
	readonly onDidRequestCreate: Event<PromptsType> = this._onDidRequestCreate.event;

	private readonly _onDidRequestCreateManual = this._register(new Emitter<{ type: PromptsType; target: 'workspace' | 'user' | 'workspace-root'; rootFileName?: string }>());
	readonly onDidRequestCreateManual: Event<{ type: PromptsType; target: 'workspace' | 'user' | 'workspace-root'; rootFileName?: string }> = this._onDidRequestCreateManual.event;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IPromptsService private readonly promptsService: IPromptsService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ILabelService private readonly labelService: ILabelService,
		@IAICustomizationWorkspaceService private readonly workspaceService: IAICustomizationWorkspaceService,
		@IClipboardService private readonly clipboardService: IClipboardService,
		@IHoverService private readonly hoverService: IHoverService,
		@IFileService private readonly fileService: IFileService,
		@IPathService private readonly pathService: IPathService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ICustomizationHarnessService private readonly harnessService: ICustomizationHarnessService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();
		this.element = $('.ai-customization-list-widget');
		this.create();

		this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => this.refresh()));
		this._register(autorun(reader => {
			this.workspaceService.activeProjectRoot.read(reader);
			this.updateAddButton();
			this.refresh();
		}));

		// Re-filter when the active harness changes
		this._register(autorun(reader => {
			this.harnessService.activeHarness.read(reader);
			this.updateAddButton();
			this.refresh();
		}));

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
			this.delayedFilter.trigger(() => {
				const matchCount = this.filterItems();
				if (this.searchQuery.trim()) {
					this.telemetryService.publicLog2<CustomizationEditorSearchEvent, CustomizationEditorSearchClassification>('chatCustomizationEditor.search', {
						section: this.currentSection,
						resultCount: matchCount,
					});
				}
			});
		}));

		// Add button container next to search
		this.addButtonContainer = DOM.append(this.searchAndButtonContainer, $('.list-add-button-container'));

		// Simple button (for single-action case, no dropdown)
		this.addButtonSimple = this._register(new Button(this.addButtonContainer, {
			...defaultButtonStyles,
			supportIcons: true,
		}));
		this.addButtonSimple.element.classList.add('list-add-button');
		this._register(this.addButtonSimple.onDidClick(() => this.executePrimaryCreateAction()));

		// Button with dropdown (for multi-action case)
		this.addButton = this._register(new ButtonWithDropdown(this.addButtonContainer, {
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
				new GroupHeaderRenderer(this.hoverService),
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
						const nameAndDesc = entry.item.description
							? localize('itemAriaLabel', "{0}, {1}", entry.item.name, entry.item.description)
							: entry.item.name;
						return entry.item.disabled
							? localize('itemAriaLabelDisabled', "{0}, disabled", nameAndDesc)
							: nameAndDesc;
					},
					getWidgetAriaLabel: () => localize('listAriaLabel', "Chat Customizations"),
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
		this._register(this.promptsService.onDidChangeSkills(() => this.refresh()));

		// Refresh on file deletions so the list updates after inline delete actions
		this._register(this.fileService.onDidFilesChange(e => {
			if (e.gotDeleted()) {
				this.refresh();
			}
		}));

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

		// Create scoped context key service with item-specific keys for when-clause filtering
		const overlay = this.contextKeyService.createOverlay([
			[AI_CUSTOMIZATION_ITEM_TYPE_KEY, item.promptType],
			[AI_CUSTOMIZATION_ITEM_STORAGE_KEY, item.storage],
			[AI_CUSTOMIZATION_ITEM_URI_KEY, item.uri.toString()],
			[AI_CUSTOMIZATION_ITEM_DISABLED_KEY, item.disabled],
		]);

		// Get menu actions, excluding inline actions to avoid duplicates
		const actions = this.menuService.getMenuActions(AICustomizationManagementItemMenuId, overlay, {
			arg: context,
			shouldForwardArgs: true,
		});

		const { secondary } = getContextMenuActions(actions, 'inline');

		// Add copy path actions
		const copyActions = [
			new Separator(),
			new Action('copyFullPath', localize('copyFullPath', "Copy Full Path"), undefined, true, async () => {
				await this.clipboardService.writeText(item.uri.fsPath);
			}),
			new Action('copyRelativePath', localize('copyRelativePath', "Copy Relative Path"), undefined, true, async () => {
				const basePath = this.workspaceService.getActiveProjectRoot();
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
			getActions: () => [...secondary, ...copyActions],
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
	 * Updates the add button by building a unified action list.
	 * The first action becomes the primary button; the rest go in the dropdown.
	 */
	private updateAddButton(): void {
		const actions = this.buildCreateActions();
		const [primary, ...dropdown] = actions;
		const hasDropdown = dropdown.length > 0;

		// Toggle which button is visible
		this.addButton.element.style.display = hasDropdown ? '' : 'none';
		this.addButtonSimple.element.style.display = hasDropdown ? 'none' : '';

		if (!primary) {
			this.addButtonSimple.element.style.display = 'none';
			this.addButton.element.style.display = 'none';
			return;
		}

		if (hasDropdown) {
			this.addButton.label = primary.label;
			this.addButton.enabled = primary.enabled;
			this.addButton.primaryButton.setTitle(primary.tooltip ?? '');
			this.addButton.dropdownButton.setTitle('');
		} else {
			this.addButtonSimple.label = primary.label;
			this.addButtonSimple.enabled = primary.enabled;
			this.addButtonSimple.setTitle(primary.tooltip ?? '');
		}
	}

	/**
	 * Builds an ordered list of create actions for the current section.
	 * The first entry is the primary button; remaining entries are dropdown items.
	 */
	private buildCreateActions(): ICreateAction[] {
		const typeLabel = this.getTypeLabel();
		const promptType = sectionToPromptType(this.currentSection);
		const descriptor = this.harnessService.getActiveDescriptor();
		const override = descriptor.sectionOverrides?.get(this.currentSection);
		const hasWorkspace = this.hasActiveWorkspace();

		// Full command override (e.g. Claude hooks) — single action, no dropdown
		if (override?.commandId) {
			return [{
				label: `$(${Codicon.add.id}) ${override.label}`,
				enabled: true,
				run: () => { this.commandService.executeCommand(override.commandId!); },
			}];
		}

		const createTypeLabel = override?.typeLabel ?? typeLabel;
		const actions: ICreateAction[] = [];
		const addedTargets = new Set<string>();

		// Root-file primary button (e.g. "Add CLAUDE.md") — only when workspace is open.
		// Without a workspace, user creation becomes primary and rootFile goes to dropdown.
		if (override?.rootFile && hasWorkspace) {
			actions.push({
				label: `$(${Codicon.add.id}) ${override.label}`,
				enabled: true,
				run: () => { this._onDidRequestCreateManual.fire({ type: promptType, target: 'workspace-root' }); },
			});
			addedTargets.add('workspace-root');
		}

		// Hooks have a simplified action set
		if (promptType === PromptsType.hook) {
			if (!this.workspaceService.isSessionsWindow && !descriptor.hideGenerateButton) {
				// Core Local: Generate is primary, configure hooks in dropdown
				actions.push({
					label: `$(${Codicon.sparkle.id}) Generate ${typeLabel}`,
					enabled: true,
					run: () => { this._onDidRequestCreate.fire(promptType); },
				});
				if (hasWorkspace) {
					actions.push({
						label: `$(${Codicon.add.id}) Configure Hooks`,
						enabled: true,
						run: () => { this._onDidRequestCreateManual.fire({ type: promptType, target: 'workspace' }); },
					});
				}
			} else if (!override?.commandId) {
				// Sessions / non-local: workspace creation only
				actions.push({
					label: `$(${Codicon.add.id}) New ${typeLabel} (Workspace)`,
					enabled: hasWorkspace,
					tooltip: hasWorkspace ? undefined : localize('createDisabled', "Open a workspace folder to create customizations."),
					run: () => { this._onDidRequestCreateManual.fire({ type: promptType, target: 'workspace' }); },
				});
			}
			return actions;
		}

		// Non-hook sections: build the full action list

		if (!override?.rootFile) {
			// Determine the primary action (first in list)
			if (!this.workspaceService.isSessionsWindow && !descriptor.hideGenerateButton) {
				// Core Local: Generate is primary
				actions.push({
					label: `$(${Codicon.sparkle.id}) Generate ${typeLabel}`,
					enabled: true,
					run: () => { this._onDidRequestCreate.fire(promptType); },
				});
			} else if (hasWorkspace) {
				// Sessions or non-local harness with workspace: workspace is primary
				actions.push({
					label: `$(${Codicon.add.id}) New ${createTypeLabel} (Workspace)`,
					enabled: true,
					run: () => { this._onDidRequestCreateManual.fire({ type: promptType, target: 'workspace' }); },
				});
				addedTargets.add('workspace');
			} else {
				// No workspace: user is primary
				actions.push({
					label: `$(${Codicon.add.id}) New ${createTypeLabel} (User)`,
					enabled: true,
					run: () => { this._onDidRequestCreateManual.fire({ type: promptType, target: 'user' }); },
				});
				addedTargets.add('user');
			}
		}

		// Secondary actions (dropdown) — only add if not already present
		if (hasWorkspace && !addedTargets.has('workspace')) {
			actions.push({
				label: `$(${Codicon.folder.id}) New ${createTypeLabel} (Workspace)`,
				enabled: true,
				run: () => { this._onDidRequestCreateManual.fire({ type: promptType, target: 'workspace' }); },
			});
		}

		if (!addedTargets.has('user')) {
			actions.push({
				label: `$(${Codicon.account.id}) New ${createTypeLabel} (User)`,
				enabled: true,
				run: () => { this._onDidRequestCreateManual.fire({ type: promptType, target: 'user' }); },
			});
		}

		// Root-file shortcuts from the descriptor (e.g. "New AGENTS.md")
		if (hasWorkspace && override?.rootFileShortcuts && !addedTargets.has('workspace-root')) {
			for (const fileName of override.rootFileShortcuts) {
				actions.push({
					label: `$(${Codicon.file.id}) New ${fileName}`,
					enabled: true,
					run: () => { this._onDidRequestCreateManual.fire({ type: promptType, target: 'workspace-root', rootFileName: fileName }); },
				});
			}
		}

		return actions;
	}

	/**
	 * Gets the dropdown actions for the add button (consumed by ButtonWithDropdown).
	 * Returns all actions except the primary (first) from buildCreateActions.
	 */
	private getDropdownActions(): Action[] {
		this.dropdownActionDisposables.clear();
		const allActions = this.buildCreateActions();
		// Skip the first (primary) action
		return allActions.slice(1).map((a, i) =>
			this.dropdownActionDisposables.add(new Action(`create_${i}`, a.label, undefined, a.enabled, () => a.run()))
		);
	}

	/**
	 * Checks if there's an active project root (workspace folder or session repository).
	 */
	private hasActiveWorkspace(): boolean {
		return !!this.workspaceService.getActiveProjectRoot();
	}

	/**
	 * Executes the primary create action based on context.
	 */
	private executePrimaryCreateAction(): void {
		const actions = this.buildCreateActions();
		if (actions.length > 0 && actions[0].enabled) {
			actions[0].run();
		}
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
		const section = this.currentSection;
		const items = await this.fetchItemsForSection(section);

		if (this.currentSection !== section) {
			return; // section changed while loading
		}

		this.allItems = items;
		this.filterItems();
		this._onDidChangeItemCount.fire(items.length);
	}

	/**
	 * Computes the item count for a given section without updating the display.
	 * Uses the same loading and filtering logic as `loadItems` for consistency.
	 */
	async computeItemCountForSection(section: AICustomizationManagementSection): Promise<number> {
		const items = await this.fetchItemsForSection(section);
		return items.length;
	}

	/**
	 * Fetches and filters items for a given section.
	 * Shared between `loadItems` (active section) and `computeItemCountForSection` (any section).
	 */
	private async fetchItemsForSection(section: AICustomizationManagementSection): Promise<IAICustomizationListItem[]> {
		const promptType = sectionToPromptType(section);
		const items: IAICustomizationListItem[] = [];
		const disabledUris = this.promptsService.getDisabledPromptFiles(promptType);


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
					disabled: disabledUris.has(agent.uri),
				});
			}
		} else if (promptType === PromptsType.skill) {
			// Use findAgentSkills for enabled skills (has parsed name/description from frontmatter)
			const skills = await this.promptsService.findAgentSkills(CancellationToken.None);
			const seenUris = new ResourceSet();
			for (const skill of skills || []) {
				const filename = basename(skill.uri);
				const skillName = skill.name || basename(dirname(skill.uri)) || filename;
				seenUris.add(skill.uri);
				items.push({
					id: skill.uri.toString(),
					uri: skill.uri,
					name: skillName,
					filename,
					description: skill.description,
					storage: skill.storage,
					promptType,
					disabled: false,
				});
			}
			// Also include disabled skills from the raw file list
			if (disabledUris.size > 0) {
				const allSkillFiles = await this.promptsService.listPromptFiles(PromptsType.skill, CancellationToken.None);
				for (const file of allSkillFiles) {
					if (!seenUris.has(file.uri) && disabledUris.has(file.uri)) {
						const filename = basename(file.uri);
						items.push({
							id: file.uri.toString(),
							uri: file.uri,
							name: file.name || basename(dirname(file.uri)) || filename,
							filename,
							description: file.description,
							storage: file.storage,
							promptType,
							disabled: true,
						});
					}
				}
			}
		} else if (promptType === PromptsType.prompt) {
			// Use getPromptSlashCommands which has parsed name/description from frontmatter
			// Filter out skills since they have their own section
			const commands = await this.promptsService.getPromptSlashCommands(CancellationToken.None);
			for (const command of commands) {
				if (command.promptPath.type === PromptsType.skill) {
					continue;
				}
				const filename = basename(command.promptPath.uri);
				items.push({
					id: command.promptPath.uri.toString(),
					uri: command.promptPath.uri,
					name: command.name,
					filename,
					description: command.description,
					storage: command.promptPath.storage,
					promptType,
					disabled: disabledUris.has(command.promptPath.uri),
				});
			}
		} else if (promptType === PromptsType.hook) {
			// Try to parse individual hooks from each file; fall back to showing the file itself
			const hookFiles = await this.promptsService.listPromptFiles(PromptsType.hook, CancellationToken.None);
			const activeRoot = this.workspaceService.getActiveProjectRoot();
			const userHomeUri = await this.pathService.userHome();
			const userHome = userHomeUri.scheme === Schemas.file ? userHomeUri.fsPath : userHomeUri.path;

			for (const hookFile of hookFiles) {
				let parsedHooks = false;
				try {
					const content = await this.fileService.readFile(hookFile.uri);
					const json = parseJSONC(content.value.toString());
					const { hooks } = parseHooksFromFile(hookFile.uri, json, activeRoot, userHome);

					if (hooks.size > 0) {
						parsedHooks = true;
						for (const [hookType, entry] of hooks) {
							const hookMeta = HOOK_METADATA[hookType];
							for (let i = 0; i < entry.hooks.length; i++) {
								const hook = entry.hooks[i];
								const cmdLabel = formatHookCommandLabel(hook, OS);
								const truncatedCmd = cmdLabel.length > 60 ? cmdLabel.substring(0, 57) + '...' : cmdLabel;
								items.push({
									id: `${hookFile.uri.toString()}#${entry.originalId}[${i}]`,
									uri: hookFile.uri,
									name: hookMeta?.label ?? entry.originalId,
									filename: basename(hookFile.uri),
									description: truncatedCmd || localize('hookUnset', "(unset)"),
									storage: hookFile.storage,
									promptType,
									disabled: disabledUris.has(hookFile.uri),
								});
							}
						}
					}
				} catch {
					// Parse failed — fall through to show raw file
				}

				if (!parsedHooks) {
					const filename = basename(hookFile.uri);
					items.push({
						id: hookFile.uri.toString(),
						uri: hookFile.uri,
						name: this.getFriendlyName(filename),
						filename,
						storage: hookFile.storage,
						promptType,
						disabled: disabledUris.has(hookFile.uri),
					});
				}
			}

			// Also include hooks defined in agent frontmatter (not in sessions window)
			// TODO: add this back when Copilot CLI supports this
			const agents = !this.workspaceService.isSessionsWindow ? await this.promptsService.getCustomAgents(CancellationToken.None) : [];
			for (const agent of agents) {
				if (!agent.hooks) {
					continue;
				}
				for (const hookType of Object.values(HookType)) {
					const hookCommands = agent.hooks[hookType];
					if (!hookCommands || hookCommands.length === 0) {
						continue;
					}
					const hookMeta = HOOK_METADATA[hookType];
					for (let i = 0; i < hookCommands.length; i++) {
						const hook = hookCommands[i];
						const cmdLabel = formatHookCommandLabel(hook, OS);
						const truncatedCmd = cmdLabel.length > 60 ? cmdLabel.substring(0, 57) + '...' : cmdLabel;
						items.push({
							id: `${agent.uri.toString()}#hook:${hookType}[${i}]`,
							uri: agent.uri,
							name: hookMeta?.label ?? hookType,
							filename: basename(agent.uri),
							description: `${agent.name}: ${truncatedCmd || localize('hookUnset', "(unset)")}`,
							storage: agent.source.storage,
							groupKey: 'agents',
							promptType,
							disabled: disabledUris.has(agent.uri),
						});
					}
				}
			}
		} else {
			// For instructions, fetch prompt files and group by storage
			const promptFiles = await this.promptsService.listPromptFiles(promptType, CancellationToken.None);
			const allItems: IPromptPath[] = [...promptFiles];

			// Also include agent instruction files (AGENTS.md, CLAUDE.md, copilot-instructions.md)
			if (promptType === PromptsType.instructions) {
				const agentInstructions = await this.promptsService.listAgentInstructions(CancellationToken.None, undefined);
				const workspaceFolderUris = this.workspaceContextService.getWorkspace().folders.map(f => f.uri);
				const activeRoot = this.workspaceService.getActiveProjectRoot();
				if (activeRoot) {
					workspaceFolderUris.push(activeRoot);
				}
				for (const file of agentInstructions) {
					const isWorkspaceFile = workspaceFolderUris.some(root => isEqualOrParent(file.uri, root));
					allItems.push({
						uri: file.uri,
						storage: isWorkspaceFile ? PromptsStorage.local : PromptsStorage.user,
						type: PromptsType.instructions,
						name: basename(file.uri),
					});
				}
			}

			const workspaceItems = allItems.filter(item => item.storage === PromptsStorage.local);
			const userItems = allItems.filter(item => item.storage === PromptsStorage.user);
			const extensionItems = allItems.filter(item => item.storage === PromptsStorage.extension);
			const pluginItems = allItems.filter(item => item.storage === PromptsStorage.plugin);
			const builtinItems = allItems.filter(item => item.storage === BUILTIN_STORAGE);

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
					disabled: disabledUris.has(item.uri),
				};
			};

			items.push(...workspaceItems.map(mapToListItem));
			items.push(...userItems.map(mapToListItem));
			items.push(...extensionItems.map(mapToListItem));
			items.push(...pluginItems.map(mapToListItem));
			items.push(...builtinItems.map(mapToListItem));
		}

		// Apply storage source filter (removes items not in visible sources or excluded user roots)
		const filter = this.workspaceService.getStorageSourceFilter(promptType);
		const filteredItems = applyStorageSourceFilter(items, filter);
		items.length = 0;
		items.push(...filteredItems);

		// Apply workspace subpath filter — when the active harness specifies
		// workspaceSubpaths, hide workspace-local items that aren't under one
		// of the recognized sub-paths (e.g. Claude only shows .claude/ items).
		// Exception: instruction files matched by the harness's instructionFileFilter
		// are exempt (e.g. CLAUDE.md at workspace root is a Claude-native file
		// even though it's not under .claude/).
		const descriptor = this.harnessService.getActiveDescriptor();
		const subpaths = descriptor.workspaceSubpaths;
		const instrFilter = descriptor.instructionFileFilter;
		if (subpaths) {
			const projectRoot = this.workspaceService.getActiveProjectRoot();
			for (let i = items.length - 1; i >= 0; i--) {
				const item = items[i];
				if (item.storage === PromptsStorage.local && projectRoot && isEqualOrParent(item.uri, projectRoot)) {
					if (!matchesWorkspaceSubpath(item.uri.path, subpaths)) {
						// Keep instruction files that match the harness's native patterns
						if (instrFilter && promptType === PromptsType.instructions && matchesInstructionFileFilter(item.uri.path, instrFilter)) {
							continue;
						}
						items.splice(i, 1);
					}
				}
			}
		}

		// Apply instruction file filter — when the active harness specifies
		// instructionFileFilter, hide instruction files that don't match the
		// recognized patterns (e.g. Claude doesn't support *.instructions.md).
		if (instrFilter && promptType === PromptsType.instructions) {
			for (let i = items.length - 1; i >= 0; i--) {
				if (!matchesInstructionFileFilter(items[i].uri.path, instrFilter)) {
					items.splice(i, 1);
				}
			}
		}

		// Sort items by name
		items.sort((a, b) => a.name.localeCompare(b.name));

		return items;
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
	private filterItems(): number {
		let matchedItems: IAICustomizationListItem[];

		if (!this.searchQuery.trim()) {
			matchedItems = this.allItems.map(item => ({ ...item, nameMatches: undefined, descriptionMatches: undefined }));
		} else {
			const query = this.searchQuery.toLowerCase();
			matchedItems = [];

			for (const item of this.allItems) {
				// Compute matches against the formatted display name so highlight positions
				// are correct even after .md stripping and title-casing.
				const displayName = formatDisplayName(item.name);
				const nameMatches = matchesContiguousSubString(query, displayName);
				const descriptionMatches = item.description ? matchesContiguousSubString(query, item.description) : null;
				const filenameMatches = matchesContiguousSubString(query, item.filename);

				if (nameMatches || descriptionMatches || filenameMatches) {
					matchedItems.push({
						...item,
						nameMatches: nameMatches || undefined,
						descriptionMatches: descriptionMatches || undefined,
					});
				}
			}
		}

		// Group items by storage
		const promptType = sectionToPromptType(this.currentSection);
		const visibleSources = new Set(this.workspaceService.getStorageSourceFilter(promptType).sources);
		const groups: { groupKey: string; label: string; icon: ThemeIcon; description: string; items: IAICustomizationListItem[] }[] = [
			{ groupKey: PromptsStorage.local, label: localize('workspaceGroup', "Workspace"), icon: workspaceIcon, description: localize('workspaceGroupDescription', "Customizations stored as files in your project folder and shared with your team via version control."), items: [] },
			{ groupKey: PromptsStorage.user, label: localize('userGroup', "User"), icon: userIcon, description: localize('userGroupDescription', "Customizations stored locally on your machine in a central location. Private to you and available across all projects."), items: [] },
			{ groupKey: PromptsStorage.extension, label: localize('extensionGroup', "Extensions"), icon: extensionIcon, description: localize('extensionGroupDescription', "Read-only customizations provided by installed extensions."), items: [] },
			{ groupKey: PromptsStorage.plugin, label: localize('pluginGroup', "Plugins"), icon: pluginIcon, description: localize('pluginGroupDescription', "Read-only customizations provided by installed plugins."), items: [] },
			{ groupKey: BUILTIN_STORAGE, label: localize('builtinGroup', "Built-in"), icon: builtinIcon, description: localize('builtinGroupDescription', "Built-in customizations shipped with the application."), items: [] },
			{ groupKey: 'agents', label: localize('agentsGroup', "Agents"), icon: agentIcon, description: localize('agentsGroupDescription', "Hooks defined in agent files."), items: [] },
		].filter(g => visibleSources.has(g.groupKey as PromptsStorage) || g.groupKey === 'agents');

		for (const item of matchedItems) {
			const key = item.groupKey ?? item.storage;
			const group = groups.find(g => g.groupKey === key);
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

			const collapsed = this.collapsedGroups.has(group.groupKey);

			this.displayEntries.push({
				type: 'group-header',
				id: `group-${group.groupKey}`,
				groupKey: group.groupKey,
				label: group.label,
				icon: group.icon,
				count: group.items.length,
				isFirst: isFirstGroup,
				description: group.description,
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
		this.updateEmptyState();
		return matchedItems.length;
	}

	/**
	 * Toggles the collapsed state of a group.
	 */
	private toggleGroup(entry: IGroupHeaderEntry): void {
		if (this.collapsedGroups.has(entry.groupKey)) {
			this.collapsedGroups.delete(entry.groupKey);
		} else {
			this.collapsedGroups.add(entry.groupKey);
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
		const sectionFooterHeight = this.sectionHeader.offsetHeight || 0;
		const searchBarHeight = this.searchAndButtonContainer.offsetHeight || 52;
		const listHeight = height - sectionFooterHeight - searchBarHeight;

		this.searchInput.layout();
		this.listContainer.style.height = `${Math.max(0, listHeight)}px`;
		this.list.layout(Math.max(0, listHeight), width);

		// Re-layout once after footer renders if we used a zero fallback
		if (sectionFooterHeight === 0) {
			DOM.getWindow(this.listContainer).requestAnimationFrame(() => {
				if (this._store.isDisposed) {
					return;
				}
				const actualFooterHeight = this.sectionHeader.offsetHeight;
				if (actualFooterHeight > 0) {
					const correctedHeight = height - actualFooterHeight - searchBarHeight;
					this.listContainer.style.height = `${Math.max(0, correctedHeight)}px`;
					this.list.layout(Math.max(0, correctedHeight), width);
				}
			});
		}
	}

	/**
	 * Gets the total item count (before filtering).
	 */
	get itemCount(): number {
		return this.allItems.length;
	}

	/**
	 * Generates a debug report for the current section.
	 */
	async generateDebugReport(): Promise<string> {
		return generateCustomizationDebugReport(
			this.currentSection,
			this.promptsService,
			this.workspaceService,
			{ allItems: this.allItems, displayEntries: this.displayEntries },
		);
	}
}
