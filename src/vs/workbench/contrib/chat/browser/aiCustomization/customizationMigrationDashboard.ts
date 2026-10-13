/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/customizationMigrationDashboard.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { Checkbox } from '../../../../../base/browser/ui/toggle/toggle.js';
import { IListRenderer, IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { RenderIndentGuides } from '../../../../../base/browser/ui/tree/abstractTree.js';
import { IObjectTreeElement, ObjectTreeElementCollapseState } from '../../../../../base/browser/ui/tree/tree.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchObjectTree } from '../../../../../platform/list/browser/listService.js';
import { defaultButtonStyles, defaultCheckboxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { mcpServerIcon, promptIcon, workspaceIcon } from './aiCustomizationIcons.js';
import { CustomizationGroupHeaderRenderer, CUSTOMIZATION_GROUP_HEADER_HEIGHT, ICustomizationGroupHeaderEntry } from './customizationGroupHeaderRenderer.js';
import { CustomizationMigrationCategoryId } from './customizationMigrationCategories.js';
import { asTreeRenderer, customizationTreeStyles, getCustomizationTreeContentHeight } from './customizationTree.js';

const $ = DOM.$;
const focusPreferredTarget = Symbol('focusPreferredTarget');
const MIGRATION_ITEM_HEIGHT = 48;
const MIGRATION_ITEM_WITH_CHANGES_HEIGHT = 68;
const MIGRATION_GROUP_HEADER_HEIGHT_WITH_DESCRIPTION = 52;

export interface ICustomizationMigrationDashboardItem {
	readonly id: string;
	readonly label: string;
	readonly scopeLabel: string;
	readonly sourceLabel: string;
	readonly changesLabel?: string;
	readonly manualReviewReason?: string;
	readonly resource?: URI;
	readonly promptType?: PromptsType;
	readonly mcpServerId?: string;
	readonly candidateKey?: string;
	readonly selected?: boolean;
}

export interface ICustomizationMigrationDashboardDestination {
	readonly targetType: PromptsType;
	readonly storage: PromptsStorage;
	readonly contextLabel: string;
	readonly label: string;
	readonly ariaLabel: string;
}

export interface ICustomizationMigrationDashboardCategory {
	readonly id: CustomizationMigrationCategoryId;
	readonly label: string;
	readonly description: string;
	readonly count: number;
	readonly countLabel: string;
	readonly highRisk?: boolean;
	readonly migrateDisabled?: boolean;
	readonly selectedCount?: number;
	readonly destinationLabel?: string;
	readonly destinationAriaLabel?: string;
	readonly items: readonly ICustomizationMigrationDashboardItem[];
}

export interface ICustomizationMigrationDashboardScope {
	readonly storage: PromptsStorage;
	readonly label: string;
	readonly count: number;
	readonly hasConfigurableDestinations: boolean;
	readonly categories: readonly ICustomizationMigrationDashboardCategory[];
}

export interface ICustomizationMigrationDashboardOverview {
	readonly scopes: readonly ICustomizationMigrationDashboardScope[];
	readonly manualReviewItems?: readonly (ICustomizationMigrationDashboardItem & { readonly storage: PromptsStorage })[];
	readonly hasIgnoredGroups?: boolean;
	readonly supportsAgentMigration?: boolean;
}

export interface ICustomizationMigrationDashboardCallbacks {
	readonly actionClicked: (action: 'retryClicked' | 'destinationsClicked' | 'migrationCategoryClicked' | 'agentMigrationClicked', categoryId?: CustomizationMigrationCategoryId) => void;
	readonly configureLocations: (id: CustomizationMigrationCategoryId, storage: PromptsStorage) => void;
	readonly migrateWithAgent: () => void;
	readonly migrateCategory: (id: CustomizationMigrationCategoryId, storage: PromptsStorage) => void;
	readonly setItemSelected: (item: ICustomizationMigrationDashboardItem, selected: boolean) => void;
	readonly showItemActions: (item: ICustomizationMigrationDashboardItem, storage: PromptsStorage, anchor: HTMLElement) => void;
	readonly ignoreCategory: (id: CustomizationMigrationCategoryId, storage: PromptsStorage) => void;
	readonly restoreIgnoredCategories: () => void;
	readonly openCustomization: (item: ICustomizationMigrationDashboardItem, storage: PromptsStorage) => void;
	readonly onDidChangeContent?: () => void;
}

interface IMigrationGroupEntry extends ICustomizationGroupHeaderEntry {
	readonly categoryId?: CustomizationMigrationCategoryId;
	readonly storage?: PromptsStorage;
	readonly groupKey: string;
	readonly hasConfigurableDestination: boolean;
	readonly destinationLabel?: string;
	readonly destinationAriaLabel?: string;
	readonly manualReview: boolean;
	selectedCount: number;
	migrateDisabled: boolean;
}

interface IMigrationItemEntry extends ICustomizationMigrationDashboardItem {
	readonly type: 'migration-item';
	readonly categoryId: CustomizationMigrationCategoryId;
	readonly storage: PromptsStorage;
	readonly groupKey: string;
	selected: boolean;
}

type MigrationTreeEntry = IMigrationGroupEntry | IMigrationItemEntry;

class MigrationTreeDelegate implements IListVirtualDelegate<MigrationTreeEntry> {
	getHeight(element: MigrationTreeEntry): number {
		return element.type === 'group-header'
			? element.destinationLabel ? MIGRATION_GROUP_HEADER_HEIGHT_WITH_DESCRIPTION : CUSTOMIZATION_GROUP_HEADER_HEIGHT
			: element.changesLabel ? MIGRATION_ITEM_WITH_CHANGES_HEIGHT : MIGRATION_ITEM_HEIGHT;
	}

	hasDynamicHeight(element: MigrationTreeEntry): boolean {
		return element.type === 'migration-item' && element.changesLabel !== undefined;
	}

	getTemplateId(element: MigrationTreeEntry): string {
		return element.type === 'group-header' ? 'migrationGroupHeader' : 'migrationItem';
	}
}

interface IMigrationItemTemplateData {
	readonly container: HTMLElement;
	readonly checkbox: Checkbox;
	readonly checkboxContainer: HTMLElement;
	readonly content: HTMLElement;
	readonly label: HTMLElement;
	readonly metadata: HTMLElement;
	readonly source: HTMLElement;
	readonly changes: HTMLElement;
	readonly reviewButton: Button;
	readonly moreButton: Button;
	readonly disposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
}

class MigrationItemRenderer implements IListRenderer<IMigrationItemEntry, IMigrationItemTemplateData> {
	readonly templateId = 'migrationItem';

	constructor(
		private readonly hoverService: IHoverService,
		private readonly selectionChanged: (entry: IMigrationItemEntry, selected: boolean) => void,
		private readonly reviewItem: (entry: IMigrationItemEntry) => void,
		private readonly showActions: (entry: IMigrationItemEntry, anchor: HTMLElement) => void,
	) { }

	renderTemplate(container: HTMLElement): IMigrationItemTemplateData {
		const disposables = new DisposableStore();
		const elementDisposables = disposables.add(new DisposableStore());
		container.classList.add('migration-tree-item');
		const checkboxContainer = DOM.append(container, $('.migration-tree-item-checkbox'));
		const checkbox = disposables.add(new Checkbox('', true, defaultCheckboxStyles));
		checkboxContainer.replaceChildren(checkbox.domNode);
		const content = DOM.append(container, $('.migration-tree-item-content'));
		const header = DOM.append(content, $('.migration-tree-item-header'));
		const label = DOM.append(header, $('.migration-tree-item-label'));
		const metadata = DOM.append(content, $('.migration-tree-item-metadata'));
		const source = DOM.append(metadata, $('.migration-tree-item-source'));
		const changes = DOM.append(content, $('.migration-tree-item-changes'));
		const reviewButton = disposables.add(new Button(container, {
			...defaultButtonStyles,
			secondary: true,
			title: false,
		}));
		reviewButton.element.classList.add('migration-tree-item-review');
		reviewButton.label = localize('reviewMigrationItem', "Review");
		const moreButton = disposables.add(new Button(container, {
			...defaultButtonStyles,
			secondary: true,
			buttonSecondaryBackground: 'transparent',
			buttonSecondaryForeground: 'var(--vscode-foreground)',
			buttonSecondaryHoverBackground: 'var(--vscode-list-hoverBackground)',
			buttonSecondaryBorder: 'transparent',
			supportIcons: true,
			title: false,
		}));
		moreButton.element.classList.add('migration-tree-item-more');
		moreButton.label = `$(${Codicon.ellipsis.id})`;
		return { container, checkbox, checkboxContainer, content, label, metadata, source, changes, reviewButton, moreButton, disposables, elementDisposables };
	}

	renderElement(element: IMigrationItemEntry, _index: number, templateData: IMigrationItemTemplateData): void {
		templateData.elementDisposables.clear();
		templateData.label.textContent = element.label;
		const manualReview = element.manualReviewReason !== undefined;
		templateData.container.classList.toggle('manual-review', manualReview);
		templateData.checkboxContainer.style.visibility = '';
		templateData.checkbox.domNode.tabIndex = manualReview ? -1 : 0;
		templateData.checkbox.domNode.setAttribute('aria-hidden', String(manualReview));
		templateData.checkbox.checked = element.selected;
		templateData.checkbox.domNode.setAttribute('aria-label', localize('selectMigrationItem', "Select {0} for migration", element.label));
		templateData.reviewButton.element.style.display = manualReview ? '' : 'none';
		templateData.reviewButton.element.setAttribute('aria-label', localize('reviewMigrationItemAriaLabel', "Review {0}", element.label));
		templateData.moreButton.element.setAttribute('aria-label', localize('migrationItemActions', "More actions for {0}", element.label));
		templateData.source.textContent = element.sourceLabel;
		templateData.changes.textContent = element.changesLabel ?? '';
		templateData.changes.style.display = element.changesLabel ? '' : 'none';
		templateData.elementDisposables.add(templateData.checkbox.onChange(() => this.selectionChanged(element, templateData.checkbox.checked)));
		templateData.elementDisposables.add(DOM.addDisposableListener(templateData.checkbox.domNode, DOM.EventType.CLICK, event => event.stopPropagation()));
		templateData.elementDisposables.add(templateData.reviewButton.onDidClick(event => {
			event.stopPropagation();
			this.reviewItem(element);
		}));
		templateData.elementDisposables.add(DOM.addDisposableListener(templateData.reviewButton.element, DOM.EventType.CLICK, event => event.stopPropagation()));
		templateData.elementDisposables.add(templateData.moreButton.onDidClick(event => {
			event.stopPropagation();
			this.showActions(element, templateData.moreButton.element);
		}));
		templateData.elementDisposables.add(DOM.addDisposableListener(templateData.moreButton.element, DOM.EventType.CLICK, event => event.stopPropagation()));
		templateData.elementDisposables.add(this.hoverService.setupDelayedHover(templateData.moreButton.element, { content: localize('moreActions', "More Actions") }));
		templateData.elementDisposables.add(this.hoverService.setupDelayedHover(templateData.reviewButton.element, { content: localize('reviewMigrationItemAriaLabel', "Review {0}", element.label) }));
		templateData.elementDisposables.add(this.hoverService.setupDelayedHover(templateData.label, {
			content: element.manualReviewReason
				? localize('manualReviewItemHover', "{0}\n\n{1}", element.label, element.manualReviewReason)
				: element.label,
		}));
		templateData.elementDisposables.add(this.hoverService.setupDelayedHover(templateData.source, { content: element.sourceLabel }));
		if (element.changesLabel) {
			templateData.elementDisposables.add(this.hoverService.setupDelayedHover(templateData.changes, { content: element.changesLabel }));
		}
	}

	disposeTemplate(templateData: IMigrationItemTemplateData): void {
		templateData.disposables.dispose();
	}
}

export class CustomizationMigrationDashboard extends Disposable {
	readonly element: HTMLElement;

	private readonly renderDisposables = this._register(new DisposableStore());
	private readonly focusTargets = new Map<string, HTMLElement>();
	private readonly collapsedMigrationGroups = new Set<string>();
	private readonly migrationGroups = new Map<string, IMigrationGroupEntry>();
	private readonly migrateButtons = new Map<string, Button>();
	private pendingFocus: string | typeof focusPreferredTarget | undefined;
	private allMigrationsComplete = false;
	private layoutTree: (() => void) | undefined;
	private availableHeight = 0;

	constructor(
		parent: HTMLElement,
		private readonly callbacks: ICustomizationMigrationDashboardCallbacks,
		@IHoverService private readonly hoverService: IHoverService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this.element = DOM.append(parent, $('.customization-migration-dashboard'));
	}

	showLoading(title: string, description: string, retry?: () => void): void {
		this.allMigrationsComplete = false;
		const activeElement = DOM.getActiveElement();
		if (this.element.contains(activeElement)) {
			this.pendingFocus ??= this.getFocusedKey() ?? focusPreferredTarget;
		}
		const shouldFocusError = retry !== undefined
			&& this.pendingFocus !== undefined
			&& (this.element.contains(activeElement) || activeElement === DOM.getWindow(this.element).document.body);
		this.prepareRender();
		const page = this.renderHeader(title, description);
		page.setAttribute('aria-busy', String(!retry));
		let retryButton: Button | undefined;
		if (retry) {
			retryButton = this.button(page, 'retry', localize('retry', "Retry"), localize('retryMigrations', "Retry loading migrations"), () => {
				this.callbacks.actionClicked('retryClicked');
				retry();
			});
		}
		this.callbacks.onDidChangeContent?.();
		if (shouldFocusError) {
			(retryButton?.element ?? this.focusTargets.get('title'))?.focus();
		}
	}

	showOverview(overview: ICustomizationMigrationDashboardOverview): void {
		const focusedKey = this.pendingFocus ?? this.getFocusedKey();
		this.pendingFocus = undefined;
		const migrationGroups = this.getMigrationGroups(overview);
		this.allMigrationsComplete = migrationGroups.length === 0 && !overview.hasIgnoredGroups;
		this.prepareRender();
		const supportsAgentMigration = migrationGroups.length > 0 && overview.supportsAgentMigration !== false;
		const page = this.renderHeader(
			localize('migrationsTitle', "Migrations"),
			this.allMigrationsComplete
				? localize('migrationsCompletedDescription', "Your customizations use supported formats and locations.")
				: supportsAgentMigration
					? localize('migrationsDescriptionWithAgent', "Some of your agent customizations need an update to keep working. Use Migrate to have VS Code update selected customizations, or Migrate with Agent for a guided migration in chat. Agent migration uses credits.")
					: localize('migrationsDescription', "Some of your agent customizations need an update to keep working. Review and migrate them to the new formats and locations."),
			overview.hasIgnoredGroups === true,
			supportsAgentMigration ? () => {
				this.callbacks.actionClicked('agentMigrationClicked');
				this.callbacks.migrateWithAgent();
			} : undefined,
		);

		if (migrationGroups.length) {
			this.renderMigrationWarnings(page, migrationGroups);
			this.renderMigrationTree(page, migrationGroups);
		} else {
			DOM.append(page, $('p.migration-empty', {}, overview.hasIgnoredGroups
				? localize('noActiveMigrations', "No active migrations. Restore ignored migrations to review them.")
				: localize('noMigrations', "No migrations are needed.")));
		}

		this.layoutTree?.();
		this.callbacks.onDidChangeContent?.();
		if (this.allMigrationsComplete) {
			return;
		}
		if (focusedKey === focusPreferredTarget) {
			this.focus();
		} else if (focusedKey) {
			(this.focusTargets.get(focusedKey) ?? this.focusTargets.get('title'))?.focus();
		}
	}

	/**
	 * Sizes the migration tree to the space left below the sticky page header so that the tree owns
	 * its own scrolling, matching the other customization pages.
	 */
	layout(height: number): void {
		this.availableHeight = height;
		this.element.style.height = `${height}px`;
		this.layoutTree?.();
	}

	focus(): void {
		if (this.allMigrationsComplete) {
			return;
		}
		const migrateAction = this.findFirstTarget(key => key.startsWith('migrate:'));
		const firstAction = this.findFirstTarget((_key, element) => element.getAttribute('role') === 'button');
		const preferredTarget = migrateAction ?? firstAction;
		if (preferredTarget) {
			preferredTarget.focus();
			return;
		}

		this.pendingFocus = focusPreferredTarget;
		this.focusTargets.get('title')?.focus();
	}

	focusDestination(storage: PromptsStorage): void {
		this.findFirstTarget(key => key.startsWith(`destinations:${storage}:`))?.focus();
	}

	/**
	 * Resolves the matching focus target that appears first in the rendered document,
	 * because tree rows are virtualized and may be registered out of visual order.
	 */
	private findFirstTarget(predicate: (key: string, element: HTMLElement) => boolean): HTMLElement | undefined {
		let first: HTMLElement | undefined;
		for (const [key, element] of this.focusTargets) {
			if (!predicate(key, element)) {
				continue;
			}
			if (!first || (first.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_PRECEDING)) {
				first = element;
			}
		}
		return first;
	}

	private prepareRender(): void {
		this.renderDisposables.clear();
		this.layoutTree = undefined;
		this.focusTargets.clear();
		this.migrationGroups.clear();
		this.migrateButtons.clear();
		DOM.clearNode(this.element);
	}

	private getFocusedKey(): string | undefined {
		const active = DOM.getActiveElement();
		return [...this.focusTargets].find(([, element]) => element === active)?.[0];
	}

	private renderHeader(title: string, description: string, hasIgnoredGroups = false, migrateWithAgent?: () => void): HTMLElement {
		const page = DOM.append(this.element, $('.migration-page'));
		const header = DOM.append(page, $('.migration-page-header'));
		const titleRow = DOM.append(header, $('.migration-page-title-row'));
		const heading = DOM.append(titleRow, $('h1', { tabindex: -1 }, title));
		this.focusTargets.set('title', heading);
		const actions = DOM.append(titleRow, $('.migration-page-title-actions'));
		if (hasIgnoredGroups) {
			this.button(
				actions,
				'restoreIgnored',
				localize('showIgnoredMigrations', "Show Ignored Migrations"),
				localize('showIgnoredMigrationsAriaLabel', "Show and restore ignored migrations"),
				this.callbacks.restoreIgnoredCategories,
				'link',
			);
		}
		if (migrateWithAgent) {
			this.button(
				actions,
				'migrateWithAgent',
				localize('migrateWithAgent', "Migrate with Agent"),
				localize('migrateWithAgentAriaLabel', "Start an agent-guided customization migration"),
				migrateWithAgent,
				'secondary',
			);
		}
		DOM.append(header, $('p.migration-intro', {}, description));
		return page;
	}

	private getMigrationGroups(overview: ICustomizationMigrationDashboardOverview): readonly (
		| { readonly kind: 'migration'; readonly scope: ICustomizationMigrationDashboardScope; readonly category: ICustomizationMigrationDashboardCategory }
		| { readonly kind: 'manual-review'; readonly items: readonly (ICustomizationMigrationDashboardItem & { readonly storage: PromptsStorage })[] }
	)[] {
		const categoryOrder = new Map<CustomizationMigrationCategoryId, number>([
			[CustomizationMigrationCategoryId.PromptFiles, 0],
			[CustomizationMigrationCategoryId.McpServers, 1],
			[CustomizationMigrationCategoryId.UserData, 2],
			[CustomizationMigrationCategoryId.ConfiguredLocations, 3],
		]);
		const migrationGroups = overview.scopes.flatMap(scope => scope.categories
			.filter(category => category.items.length > 0)
			.map(category => ({ kind: 'migration' as const, scope, category })))
			.sort((a, b) => (categoryOrder.get(a.category.id) ?? Number.MAX_SAFE_INTEGER) - (categoryOrder.get(b.category.id) ?? Number.MAX_SAFE_INTEGER)
				|| Number(a.scope.storage === PromptsStorage.user) - Number(b.scope.storage === PromptsStorage.user));
		const manualReviewItems = overview.manualReviewItems ?? [];
		return manualReviewItems.length
			? [...migrationGroups, { kind: 'manual-review', items: manualReviewItems }]
			: migrationGroups;
	}

	private renderMigrationWarnings(parent: HTMLElement, groups: ReturnType<CustomizationMigrationDashboard['getMigrationGroups']>): void {
		const promptMigration = groups.find(group => group.kind === 'migration' && group.category.id === CustomizationMigrationCategoryId.PromptFiles);
		if (!promptMigration || promptMigration.kind !== 'migration') {
			return;
		}

		const warning = DOM.append(parent, $('section.mcp-detail-diagnostic-card.migration.warning.migration-warning-banner'));
		const header = DOM.append(warning, $('.mcp-detail-diagnostic-header'));
		const icon = DOM.append(header, $('.mcp-detail-diagnostic-icon'));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.warning));
		icon.setAttribute('aria-hidden', 'true');
		DOM.append(header, $('.mcp-detail-diagnostic-summary', {}, localize('promptMigrationWarningSummary', "Prompt-to-skill conversion changes")));
		const details = DOM.append(warning, $('.mcp-detail-diagnostic-details'));
		DOM.append(details, $('p.mcp-detail-diagnostic-message', {}, promptMigration.category.description));
	}

	private renderMigrationTree(parent: HTMLElement, groups: ReturnType<CustomizationMigrationDashboard['getMigrationGroups']>): void {
		const treeContainer = DOM.append(parent, $('.migration-tree.customization-tree-container'));
		const groupRenderer = new CustomizationGroupHeaderRenderer<IMigrationGroupEntry>(
			'migrationGroupHeader',
			this.hoverService,
			(entry, container, disposables) => this.renderMigrationGroupActions(entry, container, disposables),
			(entry, container, disposables) => this.renderMigrationGroupDescription(entry, container, disposables),
		);
		const tree = this.renderDisposables.add(this.instantiationService.createInstance(
			WorkbenchObjectTree<MigrationTreeEntry>,
			'CustomizationMigrationTree',
			treeContainer,
			new MigrationTreeDelegate(),
			[
				asTreeRenderer(groupRenderer),
				asTreeRenderer(new MigrationItemRenderer(
					this.hoverService,
					(entry, selected) => this.setMigrationItemSelected(entry, selected),
					entry => this.openMigrationItem(entry),
					(entry, anchor) => this.callbacks.showItemActions(entry, entry.storage, anchor),
				)),
			],
			{
				indent: 8,
				renderIndentGuides: RenderIndentGuides.None,
				hideTwistiesOfChildlessElements: false,
				overrideStyles: customizationTreeStyles,
				multipleSelectionSupport: false,
				horizontalScrolling: false,
				openOnSingleClick: true,
				identityProvider: { getId: entry => entry.id },
				accessibilityProvider: {
					getWidgetAriaLabel: () => localize('migrationTreeAriaLabel', "Customization migrations"),
					getAriaLabel: entry => entry.type === 'group-header'
						? localize('migrationGroupAriaLabel', "{0}, {1} migrations", entry.label, entry.count)
						: entry.manualReviewReason
							? localize('migrationItemWithStatusAriaLabel', "{0}, needs manual review, {1}, {2}, source {3}", entry.label, entry.manualReviewReason, entry.scopeLabel, entry.sourceLabel)
							: entry.changesLabel
								? localize('migrationItemWithChangesAriaLabel', "{0}, {1}, source {2}. Migration changes: {3}", entry.label, entry.scopeLabel, entry.sourceLabel, entry.changesLabel)
								: localize('migrationItemAriaLabel', "{0}, {1}, source {2}", entry.label, entry.scopeLabel, entry.sourceLabel),
				},
				keyboardNavigationLabelProvider: {
					getKeyboardNavigationLabel: entry => entry.label,
				},
			},
		));
		const treeGroups = groups.map((group, index) => {
			if (group.kind === 'manual-review') {
				const groupKey = 'manual-review';
				const items: IMigrationItemEntry[] = group.items.map(item => ({
					...item,
					type: 'migration-item',
					categoryId: CustomizationMigrationCategoryId.McpServers,
					storage: item.storage,
					groupKey,
					selected: false,
				}));
				const element: IMigrationGroupEntry = {
					type: 'group-header',
					id: 'migration-group:manual-review',
					groupKey,
					label: localize('migrationManualReviewGroup', "Needs manual review"),
					icon: Codicon.warning,
					count: items.length,
					isFirst: index === 0,
					description: localize('migrationManualReviewGroupDescription', "These customizations cannot be migrated automatically. Open their details or use the item menu to resolve them."),
					collapsed: this.collapsedMigrationGroups.has(groupKey),
					hasConfigurableDestination: false,
					manualReview: true,
					selectedCount: 0,
					migrateDisabled: true,
				};
				return { element, items };
			}
			const { scope, category } = group;
			const groupId = `${category.id}:${scope.storage}`;
			const scopeLabel = scope.storage === PromptsStorage.local
				? localize('migrationWorkspaceScope', "Workspace")
				: localize('migrationUserScope', "User");
			const label = localize('migrationGroupWithScope', "{0} ({1})", category.label, scopeLabel);
			const items: IMigrationItemEntry[] = category.items.map(item => ({
				...item,
				type: 'migration-item',
				categoryId: category.id,
				storage: scope.storage,
				groupKey: groupId,
				selected: item.selected !== false,
			}));
			const element: IMigrationGroupEntry = {
				type: 'group-header',
				id: `migration-group:${groupId}`,
				groupKey: groupId,
				label,
				icon: this.getMigrationGroupIcon(category.id),
				count: items.length,
				isFirst: index === 0,
				description: category.highRisk
					? localize('highRiskMigrationDescription', "High risk")
					: category.description,
				collapsed: this.collapsedMigrationGroups.has(groupId),
				categoryId: category.id,
				storage: scope.storage,
				hasConfigurableDestination: scope.hasConfigurableDestinations && category.id !== CustomizationMigrationCategoryId.McpServers,
				destinationLabel: category.destinationLabel,
				destinationAriaLabel: category.destinationAriaLabel,
				manualReview: false,
				selectedCount: category.selectedCount ?? items.length,
				migrateDisabled: category.migrateDisabled === true,
			};
			return { element, items };
		});
		for (const group of treeGroups) {
			this.migrationGroups.set(group.element.groupKey, group.element);
		}
		const children: IObjectTreeElement<MigrationTreeEntry>[] = treeGroups.map(group => ({
			element: group.element,
			collapsible: true,
			collapsed: this.collapsedMigrationGroups.has(group.element.groupKey)
				? ObjectTreeElementCollapseState.PreserveOrCollapsed
				: ObjectTreeElementCollapseState.PreserveOrExpanded,
			children: group.items.map(element => ({ element })),
		}));
		const layoutTree = () => {
			// Clear the explicit height first so flex can resolve the space left by the header,
			// result strip and activity list before the tree viewport is measured.
			treeContainer.style.height = '';
			const height = treeContainer.clientHeight || getCustomizationTreeContentHeight(this.element, treeContainer, this.availableHeight);
			treeContainer.style.height = `${height}px`;
			tree.layout(height);
			this.callbacks.onDidChangeContent?.();
		};
		this.layoutTree = layoutTree;
		this.renderDisposables.add(tree.onDidChangeSelection(() => tree.setSelection([])));
		this.renderDisposables.add(tree.onDidChangeCollapseState(event => {
			const entry = event.node.element;
			if (!entry || entry.type !== 'group-header') {
				return;
			}
			entry.collapsed = event.node.collapsed;
			if (event.node.collapsed) {
				this.collapsedMigrationGroups.add(entry.groupKey);
			} else {
				this.collapsedMigrationGroups.delete(entry.groupKey);
			}
		}));
		this.renderDisposables.add(tree.onDidOpen(event => {
			const entry = event.element;
			if (!entry || entry.type === 'group-header') {
				return;
			}
			this.openMigrationItem(entry);
		}));
		tree.setChildren(null, children);
		layoutTree();
	}

	private getMigrationGroupIcon(id: CustomizationMigrationCategoryId): ThemeIcon {
		switch (id) {
			case CustomizationMigrationCategoryId.PromptFiles:
				return promptIcon;
			case CustomizationMigrationCategoryId.McpServers:
				return mcpServerIcon;
			default:
				return workspaceIcon;
		}
	}

	private renderMigrationGroupActions(entry: IMigrationGroupEntry, container: HTMLElement, disposables: DisposableStore): void {
		if (entry.manualReview || entry.categoryId === undefined || entry.storage === undefined) {
			return;
		}
		const categoryId = entry.categoryId;
		const storage = entry.storage;
		const actions = DOM.append(container, $('.migration-tree-group-actions'));
		this.button(actions, `ignore:${storage}:${categoryId}`, localize('ignoreMigrationGroup', "Ignore"),
			localize('ignoreMigrationCategory', "Ignore {0}", entry.label),
			() => this.callbacks.ignoreCategory(categoryId, storage), 'secondary', undefined, disposables);
		const migrateButton = this.button(actions, `migrate:${storage}:${categoryId}`, localize('migrate', "Migrate"),
			localize('migrateMigrationCategory', "Migrate {0}", entry.label),
			() => this.migrateMigrationGroup(categoryId, storage), 'secondary', undefined, disposables);
		this.migrateButtons.set(entry.groupKey, migrateButton);
		this.updateMigrateButton(entry);
	}

	private renderMigrationGroupDescription(entry: IMigrationGroupEntry, container: HTMLElement, disposables: DisposableStore): void {
		if (!entry.destinationLabel) {
			return;
		}
		const label = localize('migrationDestinationPath', "Destination: {0}", entry.destinationLabel);
		if (!entry.hasConfigurableDestination || entry.categoryId === undefined || entry.storage === undefined) {
			DOM.append(container, $('span.migration-tree-group-destination', {}, label));
			return;
		}
		const destination = this.button(
			container,
			`destinations:${entry.storage}:${entry.categoryId}`,
			label,
			entry.destinationAriaLabel ?? localize('changeMigrationDestinations', "Change destinations for {0}", entry.label),
			() => {
				this.callbacks.actionClicked('destinationsClicked');
				this.callbacks.configureLocations(entry.categoryId!, entry.storage!);
			},
			'link',
			undefined,
			disposables,
		);
		destination.element.classList.add('migration-tree-group-destination');
		destination.element.setAttribute('aria-haspopup', 'listbox');
		disposables.add(DOM.addDisposableListener(destination.element, DOM.EventType.CLICK, event => event.stopPropagation()));
	}

	private migrateMigrationGroup(categoryId: CustomizationMigrationCategoryId, storage: PromptsStorage): void {
		this.callbacks.actionClicked('migrationCategoryClicked', categoryId);
		this.callbacks.migrateCategory(categoryId, storage);
	}

	private openMigrationItem(entry: IMigrationItemEntry): void {
		this.callbacks.openCustomization(entry, entry.storage);
	}

	private setMigrationItemSelected(entry: IMigrationItemEntry, selected: boolean): void {
		if (entry.manualReviewReason || entry.selected === selected) {
			return;
		}
		entry.selected = selected;
		const group = this.migrationGroups.get(entry.groupKey);
		if (group) {
			group.selectedCount += selected ? 1 : -1;
			group.migrateDisabled = group.selectedCount === 0;
			this.updateMigrateButton(group);
		}
		this.callbacks.setItemSelected(entry, selected);
	}

	private updateMigrateButton(entry: IMigrationGroupEntry): void {
		const button = this.migrateButtons.get(entry.groupKey);
		if (!button) {
			return;
		}
		button.label = entry.selectedCount === entry.count
			? localize('migrate', "Migrate")
			: localize('migrateSelectedCount', "Migrate {0}", entry.selectedCount);
		button.enabled = !entry.migrateDisabled && entry.selectedCount > 0;
	}

	private button(parent: HTMLElement, key: string, label: string, ariaLabel: string, run: () => void, kind: 'primary' | 'secondary' | 'link' | 'icon' = 'secondary', icon?: ThemeIcon, disposables: DisposableStore = this.renderDisposables): Button {
		const button = disposables.add(new Button(parent, {
			...defaultButtonStyles,
			secondary: kind !== 'primary',
			buttonSecondaryBackground: 'transparent',
			buttonSecondaryForeground: kind === 'link' ? 'var(--vscode-textLink-foreground)' : 'var(--vscode-foreground)',
			buttonSecondaryHoverBackground: 'var(--vscode-list-hoverBackground)',
			buttonSecondaryBorder: kind === 'secondary' ? 'var(--vscode-contrastBorder, var(--vscode-widget-border))' : 'transparent',
			ariaLabel,
			title: false,
		}));
		button.element.classList.add(`migration-${kind}-button`);
		button.label = label;
		if (icon) {
			DOM.append(button.element, $('span', { class: ThemeIcon.asClassName(icon), 'aria-hidden': 'true' }));
		}
		this.focusTargets.set(key, button.element);
		this.hover(button.element, ariaLabel, disposables);
		disposables.add(button.onDidClick(run));
		return button;
	}

	private hover(element: HTMLElement, content: string, disposables: DisposableStore = this.renderDisposables): void {
		disposables.add(this.hoverService.setupDelayedHover(element, { content }));
	}
}
