/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Action } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { IListRenderer, IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, autorun } from '../../../../../base/common/observable.js';
import { ScrollbarVisibility } from '../../../../../base/common/scrollable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { DomScrollableElement } from '../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Checkbox, TriStateCheckbox } from '../../../../../base/browser/ui/toggle/toggle.js';
import { localize } from '../../../../../nls.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchList } from '../../../../../platform/list/browser/listService.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { defaultButtonStyles, defaultCheckboxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { layoutVirtualizedSectionList, layoutVirtualizedSections, setVirtualizedRowActionsTabbable, setupCollapsibleSection } from './customizationCardList.js';

const $ = DOM.$;

export interface ICustomizationMigrationBanner {
	readonly message: string;
	readonly consequence?: string;
}

export interface ICustomizationMigrationPageGroup<T> {
	readonly key: string;
	readonly label: string;
	readonly customizations: readonly T[];
}

export interface ICustomizationMigrationPageCategory<T> {
	readonly id: string;
	readonly pageTitle: string;
	readonly pageLinkLabel: string;
	readonly pageLinkUrl: string;
	readonly pageEmptyMessage: string;
	readonly migrateButtonTooltip: string;

	group(candidates: readonly T[]): readonly ICustomizationMigrationPageGroup<T>[];
	getPageDescription(candidates: readonly T[], harnessLabel: string): string;
	getBanner?(candidates: readonly T[], harnessLabel: string, destinationLabel?: string): ICustomizationMigrationBanner | undefined;
	getMigrateButtonLabel(selectedCount: number): string;
}

export interface ICustomizationMigrationCandidatePresentation {
	readonly name: string;
	readonly pathLabel: string;
	readonly selectionAriaLabel: string;
	readonly openAriaLabel?: string;
}

export interface ICustomizationMigrationPageAction {
	readonly id: string;
	readonly label: string;
	readonly icon?: ThemeIcon;
	run(): void | Promise<void>;
}

export interface ICustomizationMigrationPageDelegate<T> {
	/**
	 * Returns a stable key that is unique among candidates in this page.
	 */
	getCandidateKey(candidate: T): string;
	getCandidatePresentation(candidate: T): ICustomizationMigrationCandidatePresentation;
	getCandidateActions?(candidate: T): readonly ICustomizationMigrationPageAction[];
	getHarnessLabel(): string;
	getDestinationLabel(candidates: readonly T[]): string | undefined;
	openCandidate?(candidate: T): void | Promise<void>;
	migrate(candidates: readonly T[]): void | Promise<void>;
	retry(): void | Promise<void>;
}

export interface ICustomizationMigrationPageState<T> {
	readonly loading: boolean;
	readonly loadError?: string;
	readonly candidates: readonly T[];
}

const emptyState: ICustomizationMigrationPageState<never> = {
	loading: false,
	candidates: [],
};

const MIGRATION_ITEM_HEIGHT = 56;
const UNGROUPED_SECTION_KEY = 'ungrouped';

type MigrationItemControl = 'checkbox' | 'open' | 'more' | 'list';
type MigrationGroupControl = 'toggle' | 'checkbox';

interface IMigrationSectionList<T> {
	readonly list: WorkbenchList<T>;
	readonly renderer: MigrationItemRenderer<T>;
	readonly container: HTMLElement;
	readonly items: readonly T[];
	readonly key: string;
}

interface IMigrationGroupControls {
	readonly key: string;
	readonly toggle: HTMLButtonElement;
	readonly checkbox?: HTMLElement;
}

type MigrationFocusState =
	| { readonly type: 'item'; readonly sectionKey: string; readonly candidateKey: string; readonly control: MigrationItemControl }
	| { readonly type: 'group'; readonly sectionKey: string; readonly control: MigrationGroupControl };

interface IMigrationItemTemplateData<T> {
	readonly container: HTMLElement;
	readonly checkbox: Checkbox;
	readonly openButton: Button;
	readonly staticText: HTMLElement;
	readonly openNameLabel: HTMLElement;
	readonly openPathLabel: HTMLElement;
	readonly staticNameLabel: HTMLElement;
	readonly staticPathLabel: HTMLElement;
	readonly itemRight: HTMLElement;
	readonly moreButton: HTMLButtonElement;
	readonly templateDisposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
	currentIndex?: number;
	currentElement?: T;
	hasOpenAction: boolean;
	hasMoreAction: boolean;
}

class MigrationItemDelegate<T> implements IListVirtualDelegate<T> {
	getHeight(): number {
		return MIGRATION_ITEM_HEIGHT;
	}

	getTemplateId(): string {
		return 'migrationItem';
	}
}

class MigrationItemRenderer<T> implements IListRenderer<T, IMigrationItemTemplateData<T>> {
	readonly templateId = 'migrationItem';
	private readonly templates = new Set<IMigrationItemTemplateData<T>>();
	private focusedIndex = -1;

	constructor(
		private readonly delegate: ICustomizationMigrationPageDelegate<T>,
		private readonly isSelected: (candidate: T) => boolean,
		private readonly onSelectionChange: (candidate: T, selected: boolean) => void,
		private readonly onMore: (candidate: T, anchor: HTMLElement) => void,
		private readonly onControlFocus: (index: number) => void,
		private readonly hoverService: IHoverService,
	) { }

	renderTemplate(container: HTMLElement): IMigrationItemTemplateData<T> {
		container.classList.add('ai-customization-list-item', 'prompt-migration-item');
		const templateDisposables = new DisposableStore();
		const elementDisposables = templateDisposables.add(new DisposableStore());

		const checkboxContainer = DOM.append(container, $('.item-sync-checkbox.prompt-migration-checkbox'));
		const checkbox = templateDisposables.add(new Checkbox('', false, defaultCheckboxStyles));
		checkboxContainer.replaceChildren(checkbox.domNode);

		const itemLeft = DOM.append(container, $('span.item-left'));
		const openButton = templateDisposables.add(new Button(itemLeft, {}));
		DOM.clearNode(openButton.element);
		const openNameRow = DOM.append(openButton.element, $('span.item-name-row'));
		const openNameLabel = DOM.append(openNameRow, $('span.item-name.prompt-migration-item-name'));
		const openPathLabel = DOM.append(openButton.element, $('span.item-description.is-filename.prompt-migration-item-path'));
		const staticText = DOM.append(itemLeft, $('span.item-text'));
		const staticNameRow = DOM.append(staticText, $('span.item-name-row'));
		const staticNameLabel = DOM.append(staticNameRow, $('span.item-name.prompt-migration-item-name'));
		const staticPathLabel = DOM.append(staticText, $('span.item-description.is-filename.prompt-migration-item-path'));

		const itemRight = DOM.append(container, $('span.item-right'));
		const moreButton = DOM.append(itemRight, $('button.icon-button.prompt-migration-more-action', { type: 'button' })) as HTMLButtonElement;
		moreButton.classList.add(...ThemeIcon.asClassNameArray(Codicon.ellipsis));

		const template: IMigrationItemTemplateData<T> = {
			container,
			checkbox,
			openButton,
			staticText,
			openNameLabel,
			openPathLabel,
			staticNameLabel,
			staticPathLabel,
			itemRight,
			moreButton,
			templateDisposables,
			elementDisposables,
			hasOpenAction: false,
			hasMoreAction: false,
		};
		this.templates.add(template);
		return template;
	}

	renderElement(candidate: T, index: number, templateData: IMigrationItemTemplateData<T>): void {
		templateData.elementDisposables.clear();
		templateData.container.removeAttribute('aria-selected');
		templateData.currentIndex = index;
		templateData.currentElement = candidate;

		const presentation = this.delegate.getCandidatePresentation(candidate);
		const actions = this.delegate.getCandidateActions?.(candidate) ?? [];
		templateData.hasOpenAction = !!presentation.openAriaLabel && !!this.delegate.openCandidate;
		templateData.hasMoreAction = actions.length > 0;
		this.updateCheckboxState(templateData, candidate);
		templateData.checkbox.domNode.setAttribute('aria-label', presentation.selectionAriaLabel);
		templateData.openNameLabel.textContent = presentation.name;
		templateData.openPathLabel.textContent = presentation.pathLabel;
		templateData.staticNameLabel.textContent = presentation.name;
		templateData.staticPathLabel.textContent = presentation.pathLabel;

		templateData.openButton.element.classList.toggle('item-text', templateData.hasOpenAction);
		templateData.openButton.element.classList.toggle('prompt-migration-open-button', templateData.hasOpenAction);
		templateData.openButton.element.style.display = templateData.hasOpenAction ? '' : 'none';
		templateData.openButton.enabled = templateData.hasOpenAction;
		if (templateData.hasOpenAction) {
			templateData.openButton.element.setAttribute('aria-label', presentation.openAriaLabel!);
			templateData.elementDisposables.add(templateData.openButton.onDidClick(() => this.delegate.openCandidate!(candidate)));
		} else {
			templateData.openButton.element.removeAttribute('aria-label');
		}
		templateData.staticText.style.display = templateData.hasOpenAction ? 'none' : '';

		templateData.itemRight.style.display = templateData.hasMoreAction ? '' : 'none';
		templateData.moreButton.disabled = !templateData.hasMoreAction;
		templateData.moreButton.classList.toggle('prompt-migration-more-action', templateData.hasMoreAction);
		if (templateData.hasMoreAction) {
			templateData.moreButton.setAttribute('aria-label', localize('customizationMigrationMoreActions', "More actions for {0}", presentation.name));
			templateData.elementDisposables.add(this.hoverService.setupManagedHover(
				getDefaultHoverDelegate('element'),
				templateData.moreButton,
				localize('moreActions', "More Actions"),
			));
			templateData.elementDisposables.add(DOM.addDisposableListener(templateData.moreButton, 'click', event => {
				event.stopPropagation();
				this.onMore(candidate, templateData.moreButton);
			}));
		} else {
			templateData.moreButton.removeAttribute('aria-label');
		}

		templateData.elementDisposables.add(templateData.checkbox.onChange(() => {
			this.onSelectionChange(candidate, templateData.checkbox.checked);
		}));
		for (const control of this.getControls(index)) {
			templateData.elementDisposables.add(DOM.addDisposableListener(control, 'focus', () => this.onControlFocus(index)));
		}
		this.updateTabStops(templateData);
	}

	disposeElement(_candidate: T, _index: number, templateData: IMigrationItemTemplateData<T>): void {
		templateData.elementDisposables.clear();
		templateData.currentIndex = undefined;
		templateData.currentElement = undefined;
		templateData.hasOpenAction = false;
		templateData.hasMoreAction = false;
		setVirtualizedRowActionsTabbable(templateData.container, false);
	}

	refreshSelectionState(): void {
		for (const template of this.templates) {
			if (template.currentElement !== undefined) {
				this.updateCheckboxState(template, template.currentElement);
			}
		}
	}

	setFocusedIndex(index: number): void {
		this.focusedIndex = index;
		for (const template of this.templates) {
			this.updateTabStops(template);
		}
	}

	getControl(target: HTMLElement): { readonly index: number; readonly control: Exclude<MigrationItemControl, 'list'> } | undefined {
		for (const template of this.templates) {
			const index = template.currentIndex;
			if (index === undefined || !template.container.contains(target)) {
				continue;
			}
			if (template.checkbox.domNode === target || template.checkbox.domNode.contains(target)) {
				return { index, control: 'checkbox' };
			}
			if (template.hasOpenAction && (template.openButton.element === target || template.openButton.element.contains(target))) {
				return { index, control: 'open' };
			}
			if (template.hasMoreAction && (template.moreButton === target || template.moreButton.contains(target))) {
				return { index, control: 'more' };
			}
		}
		return undefined;
	}

	getControls(index: number): HTMLElement[] {
		for (const template of this.templates) {
			if (template.currentIndex === index) {
				const controls = [template.checkbox.domNode];
				if (template.hasOpenAction) {
					controls.push(template.openButton.element);
				}
				if (template.hasMoreAction) {
					controls.push(template.moreButton);
				}
				return controls;
			}
		}
		return [];
	}

	focusControl(index: number, control: MigrationItemControl): boolean {
		if (control === 'list') {
			return false;
		}
		const controls = this.getControls(index);
		const target = control === 'checkbox'
			? controls[0]
			: controls.find(element => control === 'open'
				? element.classList.contains('prompt-migration-open-button')
				: element.classList.contains('prompt-migration-more-action'));
		target?.focus();
		return !!target;
	}

	disposeTemplate(templateData: IMigrationItemTemplateData<T>): void {
		this.templates.delete(templateData);
		templateData.templateDisposables.dispose();
	}

	private updateCheckboxState(templateData: IMigrationItemTemplateData<T>, candidate: T): void {
		const selected = this.isSelected(candidate);
		templateData.checkbox.checked = selected;
		templateData.checkbox.domNode.setAttribute('aria-checked', String(selected));
	}

	private updateTabStops(templateData: IMigrationItemTemplateData<T>): void {
		setVirtualizedRowActionsTabbable(templateData.container, templateData.currentIndex === this.focusedIndex);
	}
}

/**
 * Shared selectable page for customization migrations.
 */
export class SelectableCustomizationMigrationPage<T> extends Disposable {

	private state: ICustomizationMigrationPageState<T> = emptyState;
	private selectedCandidateKeys = new Set<string>();
	private presentedCandidateKeys = new Set<string>();
	private listContainer: HTMLElement | undefined;
	private listScrollable: DomScrollableElement | undefined;
	private migrateButton: Button | undefined;
	private titleElement: HTMLElement | undefined;
	private descriptionElement: HTMLElement | undefined;
	private descriptionTextElement: HTMLElement | undefined;
	private bannerContainer: HTMLElement | undefined;
	private linkElement: HTMLAnchorElement | undefined;
	private selectedCountElement: HTMLElement | undefined;
	private firstFocusableElement: HTMLElement | undefined;
	private migrationSectionLists: IMigrationSectionList<T>[] = [];
	private migrationGroupControls: IMigrationGroupControls[] = [];
	private readonly migrationSectionScrollPositions = new Map<string, number>();
	private readonly collapsedMigrationSections = new Set<string>();
	private migrationFocusState: MigrationFocusState | undefined;
	private restoreFocusWhenAvailable = false;
	private visible = false;
	private readonly viewDisposables = this._register(new DisposableStore());
	private readonly pageDisposables = this._register(new DisposableStore());
	private readonly pendingMigrationLayout = this._register(new MutableDisposable());
	private readonly candidateActionMenuDisposables = this._register(new MutableDisposable());

	constructor(
		private readonly category: ICustomizationMigrationPageCategory<T>,
		private readonly migrationInProgress: IObservable<boolean>,
		private readonly delegate: ICustomizationMigrationPageDelegate<T>,
		@IOpenerService private readonly openerService: IOpenerService,
		@IHoverService private readonly hoverService: IHoverService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this._register(autorun(reader => {
			this.migrationInProgress.read(reader);
			this.updateActionState();
		}));
	}

	activate(container: HTMLElement): void {
		this.deactivate();
		DOM.clearNode(container);

		const header = DOM.append(container, $('.section-title-header'));
		const titleRow = DOM.append(header, $('.section-title-row'));
		this.titleElement = DOM.append(titleRow, $('h2.section-title'));
		this.descriptionElement = DOM.append(header, $('p.section-title-description'));
		this.descriptionTextElement = DOM.append(this.descriptionElement, $('span.section-title-description-text'));
		this.descriptionElement.appendChild(mainWindow.document.createTextNode(' '));
		this.linkElement = DOM.append(this.descriptionElement, $('a.section-title-link')) as HTMLAnchorElement;
		this.linkElement.classList.add('migration-learn-more-link');
		this.viewDisposables.add(DOM.addDisposableListener(this.linkElement, 'click', event => {
			event.preventDefault();
			void this.openerService.open(URI.parse(this.linkElement!.href));
		}));

		this.bannerContainer = DOM.append(container, $('.customization-migration-banner'));
		this.bannerContainer.style.display = 'none';

		this.listContainer = $('.prompt-migration-list.list-container');
		this.listScrollable = this.viewDisposables.add(new DomScrollableElement(this.listContainer, {
			horizontal: ScrollbarVisibility.Hidden,
			vertical: ScrollbarVisibility.Auto,
			useShadows: false,
		}));
		const listScrollableNode = this.listScrollable.getDomNode();
		listScrollableNode.classList.add('prompt-migration-list-scrollable');
		container.appendChild(listScrollableNode);
		const targetWindow = DOM.getWindow(container);
		const resizeObserver = this.viewDisposables.add(new DOM.DisposableResizeObserver(
			'SelectableCustomizationMigrationPage.listScrollable',
			() => this.scheduleMigrationSectionLayout(),
			targetWindow,
		));
		this.viewDisposables.add(resizeObserver.observe(listScrollableNode));

		const footer = DOM.append(container, $('.prompt-migration-footer'));
		this.selectedCountElement = DOM.append(footer, $('span.prompt-migration-selected-count'));
		this.selectedCountElement.setAttribute('aria-live', 'polite');
		const actionButtonContainer = DOM.append(footer, $('.list-add-button-container'));
		this.migrateButton = this.viewDisposables.add(new Button(actionButtonContainer, defaultButtonStyles));
		this.migrateButton.element.classList.add('list-add-button', 'prompt-migration-button');
		this.viewDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), this.migrateButton.element, () => this.category.migrateButtonTooltip));
		this.viewDisposables.add(this.migrateButton.onDidClick(() => {
			void this.delegate.migrate(this.selectedCandidates);
		}));

		this.render();
	}

	deactivate(): void {
		this.captureFocusState();
		this.captureMigrationSectionScrollPositions();
		this.pendingMigrationLayout.clear();
		this.candidateActionMenuDisposables.clear();
		this.pageDisposables.clear();
		this.viewDisposables.clear();
		this.migrationSectionLists = [];
		this.migrationGroupControls = [];
		this.listContainer = undefined;
		this.listScrollable = undefined;
		this.migrateButton = undefined;
		this.titleElement = undefined;
		this.descriptionElement = undefined;
		this.descriptionTextElement = undefined;
		this.bannerContainer = undefined;
		this.linkElement = undefined;
		this.selectedCountElement = undefined;
		this.firstFocusableElement = undefined;
	}

	update(state: ICustomizationMigrationPageState<T>): void {
		if (!state.loading && !state.loadError) {
			const selectedCandidateKeys = new Set<string>();
			const presentedCandidateKeys = new Set<string>();
			for (const candidate of state.candidates) {
				const key = this.delegate.getCandidateKey(candidate);
				presentedCandidateKeys.add(key);
				if (!this.presentedCandidateKeys.has(key) || this.selectedCandidateKeys.has(key)) {
					selectedCandidateKeys.add(key);
				}
			}
			this.selectedCandidateKeys = selectedCandidateKeys;
			this.presentedCandidateKeys = presentedCandidateKeys;
		}
		this.state = state;
		this.render();
	}

	focus(): void {
		if (!this.restoreMigrationFocus()) {
			(this.firstFocusableElement ?? this.linkElement ?? this.migrateButton?.element)?.focus();
		}
	}

	setVisible(visible: boolean): void {
		this.visible = visible;
		if (visible) {
			this.layout();
		} else {
			this.pendingMigrationLayout.clear();
		}
	}

	layout(): void {
		if (!this.visible) {
			return;
		}
		this.layoutMigrationSectionLists();
		this.listScrollable?.scanDomNode();
		this.scheduleMigrationSectionLayout();
	}

	private get selectedCandidates(): readonly T[] {
		return this.state.candidates.filter(candidate => this.isSelected(candidate));
	}

	private isSelected(candidate: T): boolean {
		return this.selectedCandidateKeys.has(this.delegate.getCandidateKey(candidate));
	}

	private setSelected(candidate: T, selected: boolean): void {
		const key = this.delegate.getCandidateKey(candidate);
		if (selected) {
			this.selectedCandidateKeys.add(key);
		} else {
			this.selectedCandidateKeys.delete(key);
		}
	}

	private render(): void {
		if (!this.listContainer || !this.migrateButton) {
			return;
		}

		const activeElement = DOM.getWindow(this.listContainer).document.activeElement;
		const hadFocus = this.captureFocusState();
		const shouldRestoreFocus = hadFocus || this.restoreFocusWhenAvailable && (
			activeElement === null
			|| activeElement === DOM.getWindow(this.listContainer).document.body
			|| !activeElement.isConnected
		);
		this.captureMigrationSectionScrollPositions();
		this.pendingMigrationLayout.clear();
		this.candidateActionMenuDisposables.clear();
		this.pageDisposables.clear();
		DOM.clearNode(this.listContainer);
		this.firstFocusableElement = undefined;
		this.migrationSectionLists = [];
		this.migrationGroupControls = [];
		this.updatePageHeader();

		if (this.state.loading) {
			this.renderState(
				localize('customizationMigrationLoading', "Loading customizations..."),
				localize('customizationMigrationLoadingDescription', "Checking the active harness and available destinations."),
			);
			this.migrateButton.enabled = false;
			this.restoreFocusWhenAvailable = shouldRestoreFocus;
			return;
		}

		if (this.state.loadError) {
			this.renderState(
				localize('customizationMigrationLoadError', "Customizations could not be loaded"),
				localize('customizationMigrationLoadErrorDescription', "Check the active agent connection, then try again."),
				() => void this.delegate.retry(),
			);
			this.migrateButton.enabled = false;
			this.restoreFocusWhenAvailable = shouldRestoreFocus;
			return;
		}

		if (this.state.candidates.length === 0) {
			DOM.append(this.listContainer, $('p.prompt-migration-empty')).textContent = this.category.pageEmptyMessage;
			this.migrateButton.enabled = false;
			this.listScrollable?.scanDomNode();
			this.restoreFocusWhenAvailable = shouldRestoreFocus;
			return;
		}

		const groupedCandidateKeys = new Set<string>();
		for (const group of this.category.group(this.state.candidates)) {
			for (const candidate of group.customizations) {
				groupedCandidateKeys.add(this.delegate.getCandidateKey(candidate));
			}
			this.renderGroup(group);
		}

		const ungroupedCandidates = this.state.candidates.filter(candidate => !groupedCandidateKeys.has(this.delegate.getCandidateKey(candidate)));
		if (ungroupedCandidates.length > 0) {
			const ungroupedItems = DOM.append(this.listContainer, $('.prompt-migration-group-items.virtualized-section-list'));
			this.createMigrationSectionList(
				ungroupedItems,
				this.getSectionKey(UNGROUPED_SECTION_KEY),
				this.category.pageTitle,
				ungroupedCandidates,
			);
		}

		this.updateActionState();
		if (this.visible) {
			this.layoutMigrationSectionLists();
			this.listScrollable?.scanDomNode();
		}
		if (shouldRestoreFocus) {
			this.restoreFocusWhenAvailable = !this.restoreMigrationFocus();
		} else {
			this.restoreFocusWhenAvailable = false;
		}
		if (this.visible) {
			this.scheduleMigrationSectionLayout();
		}
	}

	private renderGroup(group: ICustomizationMigrationPageGroup<T>): void {
		const groupContainer = DOM.append(this.listContainer!, $('.prompt-migration-group'));
		const sectionKey = this.getSectionKey(group.key);
		groupContainer.dataset.migrationSectionKey = sectionKey;
		const groupHeader = DOM.append(groupContainer, $('.prompt-migration-group-header'));
		const groupHeading = DOM.append(groupHeader, $('.prompt-migration-group-heading'));
		DOM.append(groupHeading, $('h3.prompt-migration-group-title')).textContent = group.label;
		if (group.customizations.length === 0) {
			DOM.append(groupHeading, $('span.prompt-migration-group-count')).textContent = '0';
			const emptyItems = DOM.append(groupContainer, $('.prompt-migration-group-items'));
			DOM.append(emptyItems, $('.plugin-inventory-empty.prompt-migration-group-empty')).textContent = localize(
				'customizationMigrationGroupEmpty',
				"No customizations are available to migrate from {0}.",
				group.label,
			);
			const toggle = this.setupMigrationCollapsibleSection(groupHeading, emptyItems, group.label, sectionKey);
			this.migrationGroupControls.push({ key: sectionKey, toggle });
			return;
		}

		const selectedInGroup = group.customizations.filter(candidate => this.isSelected(candidate)).length;
		const initialGroupState: boolean | 'mixed' = selectedInGroup === group.customizations.length ? true : selectedInGroup === 0 ? false : 'mixed';
		const groupCheckboxAriaLabel = localize('customizationMigrationSelectGroupAriaLabel', "Select all customizations in {0}", group.label);
		const groupCheckbox = this.pageDisposables.add(new TriStateCheckbox(groupCheckboxAriaLabel, initialGroupState, defaultCheckboxStyles));
		DOM.append(groupHeading, $('span.prompt-migration-group-count')).textContent = String(group.customizations.length);
		const groupControls = DOM.append(groupHeader, $('.prompt-migration-group-controls'));
		const groupCheckboxContainer = DOM.append(groupControls, $('.item-sync-checkbox.prompt-migration-group-checkbox'));
		groupCheckboxContainer.replaceChildren(groupCheckbox.domNode);
		this.firstFocusableElement ??= groupCheckbox.domNode;
		const selectAllLabel = DOM.append(groupControls, $('span.prompt-migration-select-all-label'));
		selectAllLabel.textContent = localize('customizationMigrationSelectAll', "Select all");
		const setGroupCheckboxState = (state: boolean | 'mixed'): void => {
			groupCheckbox.checked = state;
			groupCheckbox.domNode.setAttribute('aria-checked', String(state));
		};
		setGroupCheckboxState(initialGroupState);
		const setGroupSelection = (selected: boolean): void => {
			for (const candidate of group.customizations) {
				this.setSelected(candidate, selected);
			}
			this.updateActionState();
		};
		const updateGroupCheckboxState = (): void => {
			const selectedCount = group.customizations.filter(candidate => this.isSelected(candidate)).length;
			setGroupCheckboxState(selectedCount === group.customizations.length ? true : selectedCount === 0 ? false : 'mixed');
		};
		const groupItems = DOM.append(groupContainer, $('.prompt-migration-group-items.virtualized-section-list'));
		groupItems.id = `prompt-migration-group-${this.category.id}-${group.key}-items`;
		const toggle = this.setupMigrationCollapsibleSection(groupHeading, groupItems, group.label, sectionKey);
		this.migrationGroupControls.push({ key: sectionKey, toggle, checkbox: groupCheckbox.domNode });
		const section = this.createMigrationSectionList(groupItems, sectionKey, group.label, group.customizations, updateGroupCheckboxState);
		const setGroupSelectionAndRefresh = (selected: boolean): void => {
			setGroupSelection(selected);
			section.renderer.refreshSelectionState();
		};
		this.pageDisposables.add(groupCheckbox.onChange(() => setGroupSelectionAndRefresh(groupCheckbox.checked === true)));
		this.pageDisposables.add(DOM.addDisposableListener(selectAllLabel, 'click', event => {
			DOM.EventHelper.stop(event, true);
			const selected = groupCheckbox.checked !== true;
			setGroupCheckboxState(selected);
			setGroupSelectionAndRefresh(selected);
			groupCheckbox.focus();
		}));
	}

	private setupMigrationCollapsibleSection(
		heading: HTMLElement,
		content: HTMLElement,
		label: string,
		sectionKey: string,
	): HTMLButtonElement {
		return setupCollapsibleSection(
			heading,
			content,
			label,
			this.pageDisposables,
			this.collapsedMigrationSections.has(sectionKey),
			collapsed => {
				if (collapsed) {
					this.collapsedMigrationSections.add(sectionKey);
				} else {
					this.collapsedMigrationSections.delete(sectionKey);
				}
				this.scheduleMigrationSectionLayout();
			},
		);
	}

	private createMigrationSectionList(
		container: HTMLElement,
		key: string,
		label: string,
		items: readonly T[],
		onSelectionChange?: () => void,
	): IMigrationSectionList<T> {
		container.style.height = `${MIGRATION_ITEM_HEIGHT}px`;
		const listReference: { value?: WorkbenchList<T> } = {};
		const renderer = new MigrationItemRenderer(
			this.delegate,
			candidate => this.isSelected(candidate),
			(candidate, selected) => {
				this.setSelected(candidate, selected);
				this.updateActionState();
				onSelectionChange?.();
			},
			(candidate, anchor) => this.showCandidateActions(candidate, anchor),
			index => listReference.value?.setFocus([index]),
			this.hoverService,
		);
		const list = this.pageDisposables.add(this.instantiationService.createInstance(
			WorkbenchList<T>,
			`CustomizationMigration.${label}`,
			container,
			new MigrationItemDelegate(),
			[renderer],
			{
				multipleSelectionSupport: false,
				horizontalScrolling: false,
				accessibilityProvider: {
					getWidgetAriaLabel: () => label,
					getAriaLabel: candidate => {
						const presentation = this.delegate.getCandidatePresentation(candidate);
						return presentation.pathLabel
							? localize('customizationMigrationItemAriaLabel', "{0}, {1}", presentation.name, presentation.pathLabel)
							: presentation.name;
					},
					getSetSize: (_candidate, _index, listLength) => listLength,
					getPosInSet: (_candidate, index) => index + 1,
				},
				identityProvider: {
					getId: candidate => this.delegate.getCandidateKey(candidate),
				},
			},
		));
		listReference.value = list;
		list.splice(0, 0, [...items]);
		list.scrollTop = this.migrationSectionScrollPositions.get(key) ?? 0;
		this.firstFocusableElement ??= list.getHTMLElement();
		this.pageDisposables.add(list.onDidChangeSelection(event => {
			if (event.indexes.length > 0) {
				list.setSelection([]);
			}
		}));
		this.pageDisposables.add(list.onDidChangeFocus(event => {
			renderer.setFocusedIndex(event.indexes[0] ?? -1);
		}));
		this.pageDisposables.add(list.onDidFocus(() => {
			if (list.getFocus().length === 0 && items.length > 0) {
				list.setFocus([0]);
			}
		}));
		this.pageDisposables.add(DOM.addStandardDisposableListener(container, DOM.EventType.KEY_DOWN, event => {
			if (event.keyCode !== KeyCode.Tab) {
				return;
			}
			const target = event.target;
			if (!DOM.isHTMLElement(target)) {
				return;
			}
			const current = renderer.getControl(target);
			if (!current) {
				return;
			}
			const controls = renderer.getControls(current.index);
			const controlIndex = controls.findIndex(control => control === target || control.contains(target));
			const targetIndex = event.shiftKey ? current.index - 1 : current.index + 1;
			const crossesRowBoundary = event.shiftKey ? controlIndex === 0 : controlIndex === controls.length - 1;
			if (!crossesRowBoundary || targetIndex < 0 || targetIndex >= items.length) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();
			list.setFocus([targetIndex]);
			list.reveal(targetIndex);
			const targetControls = renderer.getControls(targetIndex);
			targetControls[event.shiftKey ? targetControls.length - 1 : 0]?.focus();
		}));
		const section = { list, renderer, container, items, key };
		this.migrationSectionLists.push(section);
		return section;
	}

	private showCandidateActions(candidate: T, anchor: HTMLElement): void {
		const actions = this.delegate.getCandidateActions?.(candidate) ?? [];
		if (actions.length === 0) {
			return;
		}

		const actionDisposables = new DisposableStore();
		this.candidateActionMenuDisposables.value = actionDisposables;
		const menuActions = actions.map(action => actionDisposables.add(new Action(
			action.id,
			action.label,
			action.icon ? ThemeIcon.asClassName(action.icon) : '',
			true,
			() => action.run(),
		)));
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => menuActions,
			onHide: () => {
				if (this.candidateActionMenuDisposables.value === actionDisposables) {
					this.candidateActionMenuDisposables.clear();
				} else {
					actionDisposables.dispose();
				}
			},
		});
	}

	private getSectionKey(groupKey: string): string {
		return `${this.category.id}:${groupKey}`;
	}

	private captureMigrationSectionScrollPositions(): void {
		for (const section of this.migrationSectionLists) {
			this.migrationSectionScrollPositions.set(section.key, section.list.scrollTop);
		}
	}

	private layoutMigrationSectionLists(): void {
		if (!this.visible || !this.listContainer) {
			return;
		}

		const heights = layoutVirtualizedSections(this.listContainer, this.migrationSectionLists.map(section => ({
			container: section.container,
			contentHeight: section.items.length * MIGRATION_ITEM_HEIGHT,
			minimumHeight: MIGRATION_ITEM_HEIGHT,
		})));
		for (let index = 0; index < this.migrationSectionLists.length; index++) {
			const section = this.migrationSectionLists[index];
			layoutVirtualizedSectionList(
				section.list,
				section.container,
				heights[index],
				section.container.clientWidth || undefined,
			);
		}
	}

	private scheduleMigrationSectionLayout(): void {
		if (!this.visible || !this.listContainer) {
			this.pendingMigrationLayout.clear();
			return;
		}

		this.pendingMigrationLayout.value = DOM.scheduleAtNextAnimationFrame(DOM.getWindow(this.listContainer), () => {
			this.layoutMigrationSectionLists();
			this.listScrollable?.scanDomNode();
			if (this.restoreFocusWhenAvailable) {
				this.restoreFocusWhenAvailable = !this.restoreMigrationFocus();
			}
		});
	}

	private captureFocusState(): boolean {
		if (!this.listContainer) {
			return false;
		}

		const activeElement = DOM.getWindow(this.listContainer).document.activeElement;
		if (!DOM.isHTMLElement(activeElement) || !this.listContainer.contains(activeElement)) {
			return false;
		}

		for (const section of this.migrationSectionLists) {
			const itemControl = section.renderer.getControl(activeElement);
			if (itemControl) {
				const candidate = section.items[itemControl.index];
				if (candidate !== undefined) {
					this.migrationFocusState = {
						type: 'item',
						sectionKey: section.key,
						candidateKey: this.delegate.getCandidateKey(candidate),
						control: itemControl.control,
					};
					return true;
				}
			}
			if (section.list.getHTMLElement() === activeElement) {
				const index = section.list.getFocus()[0] ?? 0;
				const candidate = section.items[index];
				if (candidate !== undefined) {
					this.migrationFocusState = {
						type: 'item',
						sectionKey: section.key,
						candidateKey: this.delegate.getCandidateKey(candidate),
						control: 'list',
					};
					return true;
				}
			}
		}

		for (const group of this.migrationGroupControls) {
			if (group.toggle === activeElement) {
				this.migrationFocusState = { type: 'group', sectionKey: group.key, control: 'toggle' };
				return true;
			}
			if (group.checkbox && (group.checkbox === activeElement || group.checkbox.contains(activeElement))) {
				this.migrationFocusState = { type: 'group', sectionKey: group.key, control: 'checkbox' };
				return true;
			}
		}
		return false;
	}

	private restoreMigrationFocus(): boolean {
		const focusState = this.migrationFocusState;
		if (!focusState) {
			return false;
		}

		if (focusState.type === 'group') {
			const group = this.migrationGroupControls.find(candidate => candidate.key === focusState.sectionKey);
			const target = focusState.control === 'toggle' ? group?.toggle : group?.checkbox;
			target?.focus();
			return !!target;
		}

		const section = this.migrationSectionLists.find(candidate => candidate.key === focusState.sectionKey);
		if (!section || section.container.hidden) {
			return false;
		}
		const index = section.items.findIndex(candidate => this.delegate.getCandidateKey(candidate) === focusState.candidateKey);
		if (index < 0) {
			return false;
		}
		section.list.setFocus([index]);
		section.list.reveal(index);
		if (focusState.control === 'list') {
			section.list.domFocus();
			return true;
		}
		return section.renderer.focusControl(index, focusState.control);
	}

	private renderState(title: string, description: string, retry?: () => void): void {
		const state = DOM.append(this.listContainer!, $('.plugin-inventory-empty.prompt-migration-state'));
		DOM.append(state, $('strong.prompt-migration-state-title')).textContent = title;
		DOM.append(state, $('span.prompt-migration-state-description')).textContent = description;
		if (retry) {
			const retryButton = this.pageDisposables.add(new Button(state, { ...defaultButtonStyles, secondary: true, ariaLabel: localize('retryCustomizationMigration', "Retry loading customizations") }));
			retryButton.label = localize('retry', "Retry");
			this.firstFocusableElement ??= retryButton.element;
			this.pageDisposables.add(retryButton.onDidClick(retry));
		}
		this.listScrollable?.scanDomNode();
	}

	private updatePageHeader(): void {
		if (this.titleElement) {
			this.titleElement.textContent = this.category.pageTitle;
		}

		const banner = this.state.candidates.length > 0
			? this.category.getBanner?.(
				this.state.candidates,
				this.delegate.getHarnessLabel(),
				this.delegate.getDestinationLabel(this.state.candidates),
			)
			: undefined;
		this.renderBanner(banner);
		if (this.descriptionElement) {
			const description = banner ? '' : this.category.getPageDescription(this.state.candidates, this.delegate.getHarnessLabel());
			if (this.descriptionTextElement) {
				this.descriptionTextElement.textContent = description;
			} else {
				this.descriptionElement.textContent = description;
			}
			this.descriptionElement.style.display = banner ? 'none' : '';
		}

		if (this.linkElement) {
			this.linkElement.textContent = this.category.pageLinkLabel;
			this.linkElement.href = this.category.pageLinkUrl;
		}
	}

	private renderBanner(banner: ICustomizationMigrationBanner | undefined): void {
		if (!this.bannerContainer) {
			return;
		}

		DOM.clearNode(this.bannerContainer);
		if (!banner) {
			if (this.linkElement && this.descriptionElement) {
				this.descriptionElement.appendChild(this.linkElement);
			}
			this.bannerContainer.style.display = 'none';
			return;
		}

		this.bannerContainer.style.display = '';
		const content = DOM.append(this.bannerContainer, $('.customization-migration-banner-content'));
		DOM.append(content, $('p.customization-migration-banner-message')).textContent = banner.message;
		if (banner.consequence) {
			DOM.append(content, $('p.customization-migration-banner-consequence')).textContent = banner.consequence;
		}
		if (this.linkElement) {
			content.appendChild(this.linkElement);
		}
	}

	private updateActionState(): void {
		if (!this.migrateButton) {
			return;
		}
		const selectedCount = this.selectedCandidates.length;
		this.migrateButton.enabled = !this.state.loading && !this.state.loadError && selectedCount > 0 && !this.migrationInProgress.get();
		if (this.selectedCountElement) {
			this.selectedCountElement.textContent = selectedCount === 1
				? localize('customizationMigrationOneSelected', "1 selected")
				: localize('customizationMigrationSelectedCount', "{0} selected", selectedCount);
		}
		this.migrateButton.label = this.category.getMigrateButtonLabel(selectedCount);
	}
}
