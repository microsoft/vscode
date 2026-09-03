/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Action } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
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
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { defaultButtonStyles, defaultCheckboxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';

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
	private readonly viewDisposables = this._register(new DisposableStore());
	private readonly pageDisposables = this._register(new DisposableStore());

	constructor(
		private readonly category: ICustomizationMigrationPageCategory<T>,
		private readonly migrationInProgress: IObservable<boolean>,
		private readonly delegate: ICustomizationMigrationPageDelegate<T>,
		@IOpenerService private readonly openerService: IOpenerService,
		@IHoverService private readonly hoverService: IHoverService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
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
			() => this.listScrollable?.scanDomNode(),
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
		this.pageDisposables.clear();
		this.viewDisposables.clear();
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
		this.state = state;
		this.render();
	}

	focus(): void {
		(this.firstFocusableElement ?? this.linkElement ?? this.migrateButton?.element)?.focus();
	}

	layout(): void {
		this.listScrollable?.scanDomNode();
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

		this.pageDisposables.clear();
		DOM.clearNode(this.listContainer);
		this.firstFocusableElement = undefined;
		this.updatePageHeader();

		if (this.state.loading) {
			this.renderState(
				localize('customizationMigrationLoading', "Loading customizations..."),
				localize('customizationMigrationLoadingDescription', "Checking the active harness and available destinations."),
			);
			this.migrateButton.enabled = false;
			return;
		}

		if (this.state.loadError) {
			this.renderState(
				localize('customizationMigrationLoadError', "Customizations could not be loaded"),
				localize('customizationMigrationLoadErrorDescription', "Check the active agent connection, then try again."),
				() => void this.delegate.retry(),
			);
			this.migrateButton.enabled = false;
			return;
		}

		if (this.state.candidates.length === 0) {
			DOM.append(this.listContainer, $('p.prompt-migration-empty')).textContent = this.category.pageEmptyMessage;
			this.migrateButton.enabled = false;
			this.listScrollable?.scanDomNode();
			return;
		}

		const groupedCandidateKeys = new Set<string>();
		for (const group of this.category.group(this.state.candidates)) {
			for (const candidate of group.customizations) {
				groupedCandidateKeys.add(this.delegate.getCandidateKey(candidate));
			}
			this.renderGroup(group);
		}

		for (const candidate of this.state.candidates) {
			if (!groupedCandidateKeys.has(this.delegate.getCandidateKey(candidate))) {
				this.renderItem(this.listContainer, candidate);
			}
		}

		this.updateActionState();
		this.listScrollable?.scanDomNode();
	}

	private renderGroup(group: ICustomizationMigrationPageGroup<T>): void {
		const groupContainer = DOM.append(this.listContainer!, $('.prompt-migration-group'));
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
		const itemCheckboxes: Checkbox[] = [];
		const setGroupSelection = (selected: boolean): void => {
			for (const candidate of group.customizations) {
				this.setSelected(candidate, selected);
			}
			for (const itemCheckbox of itemCheckboxes) {
				itemCheckbox.checked = selected;
			}
			this.updateActionState();
		};
		this.pageDisposables.add(groupCheckbox.onChange(() => setGroupSelection(groupCheckbox.checked === true)));
		this.pageDisposables.add(DOM.addDisposableListener(selectAllLabel, 'click', event => {
			DOM.EventHelper.stop(event, true);
			const selected = groupCheckbox.checked !== true;
			setGroupCheckboxState(selected);
			setGroupSelection(selected);
			groupCheckbox.focus();
		}));
		const updateGroupCheckboxState = (): void => {
			const selectedCount = group.customizations.filter(candidate => this.isSelected(candidate)).length;
			setGroupCheckboxState(selectedCount === group.customizations.length ? true : selectedCount === 0 ? false : 'mixed');
		};
		const groupItems = DOM.append(groupContainer, $('.prompt-migration-group-items'));
		groupItems.id = `prompt-migration-group-${this.category.id}-${group.key}-items`;

		for (const candidate of group.customizations) {
			itemCheckboxes.push(this.renderItem(groupItems, candidate, updateGroupCheckboxState));
		}
	}

	private renderItem(container: HTMLElement, candidate: T, onSelectionChange?: () => void): Checkbox {
		const row = DOM.append(container, $('div.ai-customization-list-item.prompt-migration-item'));
		const checkboxContainer = DOM.append(row, $('.item-sync-checkbox.prompt-migration-checkbox'));
		const presentation = this.delegate.getCandidatePresentation(candidate);
		const checkbox = this.pageDisposables.add(new Checkbox(presentation.selectionAriaLabel, this.isSelected(candidate), defaultCheckboxStyles));
		checkboxContainer.replaceChildren(checkbox.domNode);
		this.firstFocusableElement ??= checkbox.domNode;
		this.pageDisposables.add(checkbox.onChange(() => {
			this.setSelected(candidate, checkbox.checked);
			this.updateActionState();
			onSelectionChange?.();
		}));

		const itemLeft = DOM.append(row, $('span.item-left'));
		let itemText: HTMLElement;
		if (presentation.openAriaLabel && this.delegate.openCandidate) {
			const openButton = this.pageDisposables.add(new Button(itemLeft, { ariaLabel: presentation.openAriaLabel }));
			openButton.label = presentation.name;
			DOM.clearNode(openButton.element);
			openButton.element.classList.add('item-text', 'prompt-migration-open-button');
			this.pageDisposables.add(openButton.onDidClick(() => this.delegate.openCandidate!(candidate)));
			itemText = openButton.element;
		} else {
			itemText = DOM.append(itemLeft, $('span.item-text'));
		}
		const nameRow = DOM.append(itemText, $('span.item-name-row'));
		DOM.append(nameRow, $('span.item-name.prompt-migration-item-name')).textContent = presentation.name;
		DOM.append(itemText, $('span.item-description.is-filename.prompt-migration-item-path')).textContent = presentation.pathLabel;

		const actions = this.delegate.getCandidateActions?.(candidate) ?? [];
		if (actions.length > 0) {
			const itemRight = DOM.append(row, $('span.item-right'));
			const moreButton = DOM.append(itemRight, $('button.icon-button.prompt-migration-more-action', {
				type: 'button',
				'aria-label': localize('customizationMigrationMoreActions', "More actions for {0}", presentation.name),
			})) as HTMLButtonElement;
			moreButton.classList.add(...ThemeIcon.asClassNameArray(Codicon.ellipsis));
			this.pageDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), moreButton, localize('moreActions', "More Actions")));
			this.pageDisposables.add(DOM.addDisposableListener(moreButton, 'click', event => {
				event.stopPropagation();
				const actionDisposables = new DisposableStore();
				const menuActions = actions.map(action => actionDisposables.add(new Action(
					action.id,
					action.label,
					action.icon ? ThemeIcon.asClassName(action.icon) : '',
					true,
					() => action.run(),
				)));
				this.contextMenuService.showContextMenu({
					getAnchor: () => moreButton,
					getActions: () => menuActions,
					onHide: () => actionDisposables.dispose(),
				});
			}));
		}
		return checkbox;
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
