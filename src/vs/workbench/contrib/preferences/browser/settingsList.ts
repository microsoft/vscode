/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { IThemeService, registerThemingParticipant, IColorTheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ISettingsEditorViewState, SettingsTreeElement, SettingsTreeGroupElement, SettingsTreeNewExtensionsElement, SettingsTreeSettingElement } from 'vs/workbench/contrib/preferences/browser/settingsTreeModels';
import { isDefined, isUndefinedOrNull } from 'vs/base/common/types';
import { SettingsTreeDelegate, ISettingItemTemplate, SettingsTreeFilter } from 'vs/workbench/contrib/preferences/browser/settingsTree';
import { focusBorder, foreground, errorForeground, inputValidationErrorBackground, inputValidationErrorForeground, inputValidationErrorBorder, scrollbarSliderHoverBackground, scrollbarSliderActiveBackground, scrollbarSliderBackground, editorBackground, editorForeground } from 'vs/platform/theme/common/colorRegistry';
import { RGBA, Color } from 'vs/base/common/color';
import { settingsHeaderForeground } from 'vs/workbench/contrib/preferences/browser/settingsWidgets';
import 'vs/css!./media/settingsListScrollbar';
import { localize } from 'vs/nls';
import { Button } from 'vs/base/browser/ui/button/button';
import { attachButtonStyler } from 'vs/platform/theme/common/styler';

const $ = DOM.$;

type SettingLeafElement = SettingsTreeSettingElement | SettingsTreeNewExtensionsElement;

class SettingsListPaginator {
	readonly PAGE_SIZE = 20;

	private settings: SettingLeafElement[] = [];
	private page = 1;

	get currentPage(): number {
		return this.page;
	}

	get totalPages(): number {
		return Math.ceil(this.settings.length / this.PAGE_SIZE);
	}

	get settingsOnPage(): SettingLeafElement[] {
		return this.settings.slice(
			(this.page - 1) * this.PAGE_SIZE,
			this.page * this.PAGE_SIZE,
		);
	}

	constructor(private onPageChange: (shouldScroll: boolean) => void) { }

	setSettings(settings: SettingLeafElement[], scrollToPage?: number): void {
		this.settings = settings;
		this.setPage(scrollToPage ?? this.page);
	}

	nextPage(): void {
		const nextStartIdx = this.page * this.PAGE_SIZE;

		if (this.settings.length > nextStartIdx) {
			this.setPage(this.page + 1, true);
		}
	}

	previousPage(): void {
		if (this.page > 1) {
			this.setPage(this.page - 1, true);
		}
	}

	setPage(page: number, shouldScroll = true): void {
		if (1 <= page && page <= this.totalPages) {
			this.page = page;
			this.onPageChange(shouldScroll);
		}
	}
}

interface ISettingsListView {
	group: SettingsTreeGroupElement;
	settings: SettingLeafElement[];
	focusedSetting?: SettingLeafElement;
}

interface ISettingsListCacheItem {
	container: HTMLElement;
	template: ISettingItemTemplate;
}

interface ISettingListRenderer {
	templateId: string;
	renderTemplate(container: HTMLElement): ISettingItemTemplate;
	renderElement(element: { element: SettingsTreeElement }, index: number, templateData: ISettingItemTemplate, height: number | undefined): void;
	disposeElement?(element: { element: SettingsTreeElement }, index: number, templateData: ISettingItemTemplate, height: number | undefined): void;
	disposeTemplate(templateData: ISettingItemTemplate): void;
}

export class SettingsList extends Disposable {
	private searchFilter: (element: SettingsTreeElement) => boolean;
	private settingsTreeDelegate = new SettingsTreeDelegate();
	private paginator = new SettingsListPaginator(this.renderPage.bind(this));
	private templateToRenderer = new Map<string, ISettingListRenderer>();
	private freePool = new Map<string, ISettingsListCacheItem[]>();
	private usedPool = new Map<string, ISettingsListCacheItem[]>();
	private pageDisposables = new DisposableStore();
	private currentView?: ISettingsListView;

	get renderedGroup(): SettingsTreeGroupElement | undefined {
		return this.currentView?.group;
	}

	dispose() {
		[...this.usedPool.entries(), ...this.freePool.entries()].forEach(([templateId, templates]) => {
			const renderer = this.templateToRenderer.get(templateId);

			templates.forEach(({ template }) => {
				renderer?.disposeTemplate(template);
				renderer?.disposeElement?.(null as any, 0, template, undefined);
			});
		});

		this.usedPool.clear();
		this.freePool.clear();
		this.pageDisposables.dispose();

		super.dispose();
	}

	constructor(
		private container: HTMLElement,
		viewState: ISettingsEditorViewState,
		renderers: ISettingListRenderer[],
		@IThemeService private themeService: IThemeService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		container.setAttribute('tabindex', '-1');
		container.setAttribute('role', 'form');
		container.setAttribute('aria-label', localize('settings', "Settings"));
		container.classList.add('settings-editor-tree');

		renderers.forEach(renderer => this.templateToRenderer.set(renderer.templateId, renderer));

		this.searchFilter = element => instantiationService.createInstance(SettingsTreeFilter, viewState).filter(element, null as any);

		this._register(registerThemingParticipant(themingParticipant));
	}

	getHTMLElement(): HTMLElement {
		return this.container;
	}

	refresh(rootGroup: SettingsTreeGroupElement): void {
		let scrollToPage: number | undefined = 1;

		if (isDefined(this.currentView)) {
			const refreshedGroup = findGroup(rootGroup, this.currentView.group.id);

			if (isDefined(refreshedGroup)) {
				this.currentView = this.getSettingsFromGroup(refreshedGroup);
				scrollToPage = undefined;
			} else {
				this.currentView = undefined;
			}
		}

		this.currentView = this.currentView ?? this.getSettingsFromGroup(rootGroup);
		this.paginator.setSettings(this.currentView.settings, scrollToPage);
	}

	render(group: SettingsTreeGroupElement): void {
		this.currentView = this.getSettingsFromGroup(group);
		this.paginator.setSettings(this.currentView.settings, 1);
	}

	jumpToSetting(element: SettingsTreeSettingElement): void {
		if (isUndefinedOrNull(element.parent)) {
			return;
		}

		this.currentView = this.getSettingsFromGroup(element.parent);
		this.currentView.focusedSetting = element;

		const idxInView = this.currentView.settings.findIndex(setting => setting.id === element.id);
		if (idxInView < 0) {
			return;
		}

		// idxInView + 1: if idx is 0, then ceil is 0. But page numbers start at 1.
		const scrollToPage = Math.ceil((idxInView + 1) / this.paginator.PAGE_SIZE);
		this.paginator.setSettings(this.currentView.settings, scrollToPage);
	}

	private renderPage(shouldScroll: boolean): void {
		DOM.clearNode(this.container);
		this.pageDisposables.clear();

		this.recycleTemplates();

		if (this.currentView?.group.label) {
			const headingContainer = DOM.append(this.container, $('.setting-group-heading'));
			const groupElement = this.currentView!.group;
			const groupRenderer = this.templateToRenderer.get(this.settingsTreeDelegate.getTemplateId(groupElement))!;
			groupRenderer.renderElement({ element: groupElement } as any, 0, groupRenderer.renderTemplate(headingContainer), undefined);
		}

		let elementToFocus: HTMLElement | undefined;

		this.container.append(...this.paginator.settingsOnPage.map(setting => {
			const renderedSetting = this.renderSetting(setting);

			if (setting.id === this.currentView?.focusedSetting?.id) {
				elementToFocus = renderedSetting;
			}

			return renderedSetting;
		}));

		if (this.paginator.totalPages > 1) {
			this.renderPaginatorControls();
		}

		if (isDefined(elementToFocus)) {
			elementToFocus.scrollIntoView();
		} else if (shouldScroll) {
			this.container.scrollTop = 0;
		}
	}

	private renderPaginatorControls(): void {
		const paginatorContainer = DOM.append(this.container, $('.settings-paginator', {
			'role': 'navigation',
			'aria-label': localize('settingsPage', "Settings Page")
		}));

		const previousButtonContainer = DOM.append(paginatorContainer, $('.settings-paginator-control-button'));
		const previousButton = this.pageDisposables.add(new Button(previousButtonContainer, {
			title: localize('previousPageTitle', "Previous page")
		}));

		const { currentPage, totalPages } = this.paginator;

		previousButton.label = localize('previousPageLabel', "Previous");
		previousButton.enabled = currentPage !== 1;
		this.pageDisposables.add(previousButton.onDidClick(() => this.paginator.previousPage()));
		this.pageDisposables.add(attachButtonStyler(previousButton, this.themeService));

		const pagesToRender =
			[...new Set([
				1, 2, 3,
				currentPage - 1, currentPage, currentPage + 1,
				totalPages - 2, totalPages - 1, totalPages,
			])]
				.filter(pageNumber => 1 <= pageNumber && pageNumber <= totalPages)
				.sort((a, b) => a - b)
				.reduce((pagesSoFar, currentPage) => {
					if (pagesSoFar.length === 0) {
						return [currentPage];
					}

					const previousPage = pagesSoFar[pagesSoFar.length - 1];

					// If there's only one page between the previous page and current page:
					//  We should not add '...', but add the page itself.
					return previousPage === currentPage - 2
						? [...pagesSoFar, previousPage + 1, currentPage]
						: [...pagesSoFar, currentPage];
				}, [] as number[]);

		pagesToRender.forEach((pageNumber, idx) => {
			if (idx !== 0 && pagesToRender[idx - 1] !== pageNumber - 1) {
				const ellipsis = DOM.append(paginatorContainer, $('.settings-paginator-ellipsis'));
				ellipsis.textContent = '...';
			}

			const goToPageButtonContainer = DOM.append(paginatorContainer, $('.settings-paginator-go-to-page-button'));
			const goToPageButton = this.pageDisposables.add(new Button(goToPageButtonContainer, {
				title: pageNumber === currentPage
					? localize('currentPage', "Current page, {0}", pageNumber)
					: localize('goToPage', "Go to page {0}", pageNumber),
			}));

			goToPageButton.label = pageNumber.toString();

			if (pageNumber === currentPage) {
				goToPageButtonContainer.classList.add('settings-current-page-button');
			}

			this.pageDisposables.add(goToPageButton.onDidClick(() => this.paginator.setPage(pageNumber)));
			this.pageDisposables.add(attachButtonStyler(goToPageButton, this.themeService, pageNumber === currentPage
				? {}
				: {
					buttonBackground: editorBackground,
					buttonHoverBackground: editorBackground,
					buttonForeground: editorForeground,
				},
			));
		});

		const nextButtonContainer = DOM.append(paginatorContainer, $('.settings-paginator-control-button'));
		const nextButton = this.pageDisposables.add(new Button(nextButtonContainer, {
			title: localize('nextPageTitle', "Next page")
		}));

		nextButton.label = localize('nextPageLabel', "Next");
		nextButton.enabled = currentPage !== totalPages;
		this.pageDisposables.add(nextButton.onDidClick(() => this.paginator.nextPage()));
		this.pageDisposables.add(attachButtonStyler(nextButton, this.themeService));
	}

	private getSettingsFromGroup(group: SettingsTreeGroupElement): ISettingsListView {
		if (!this.searchFilter(group)) {
			return { group, settings: [] };
		}

		const settings = group.children.filter(isLeafSetting).filter(this.searchFilter);

		if (settings.length > 0) {
			return { group, settings };
		}

		const groups = group.children.filter(isGroupElement).filter(this.searchFilter);

		for (const child of groups) {
			const childResult = this.getSettingsFromGroup(child);

			if (childResult.settings.length > 0) {
				return childResult;
			}
		}

		return { group, settings };
	}

	private renderSetting(element: SettingLeafElement): HTMLElement {
		const templateId = this.settingsTreeDelegate.getTemplateId(element);
		const renderer = this.templateToRenderer.get(templateId)!;
		const freeItems = this.freePool.get(templateId);

		let container: HTMLElement;
		let template: ISettingItemTemplate;

		if (isDefined(freeItems) && freeItems.length > 0) {
			container = freeItems[0].container;
			template = freeItems[0].template;
			this.freePool.set(templateId, freeItems.slice(1));
		} else {
			container = $('div');
			template = renderer.renderTemplate(container);
		}

		this.usedPool.set(templateId, [
			...(this.usedPool.get(templateId) ?? []),
			{ container, template }
		]);

		renderer.renderElement({ element }, 0, template, undefined);

		return container;
	}

	private recycleTemplates(): void {
		for (const [templateId, usedItems] of this.usedPool.entries()) {
			const freeItems = this.freePool.get(templateId) ?? [];
			const renderer = this.templateToRenderer.get(templateId);
			usedItems.forEach(item => renderer?.disposeElement?.(null as any, 0, item.template, undefined));
			this.freePool.set(templateId, [...usedItems, ...freeItems]);
		}

		this.usedPool.clear();
	}
}

function isGroupElement(element: SettingsTreeElement): element is SettingsTreeGroupElement {
	return element instanceof SettingsTreeGroupElement;
}

function isLeafSetting(element: SettingsTreeElement): element is SettingLeafElement {
	return element instanceof SettingsTreeSettingElement || element instanceof SettingsTreeNewExtensionsElement;
}

function findGroup(rootGroup: SettingsTreeGroupElement, id: string): SettingsTreeGroupElement | undefined {
	if (rootGroup.id === id) {
		return rootGroup;
	}

	for (const child of rootGroup.children) {
		if (child instanceof SettingsTreeGroupElement) {
			const result = findGroup(child, id);

			if (isDefined(result)) {
				return result;
			}
		}
	}

	return;
}

function themingParticipant(theme: IColorTheme, collector: ICssStyleCollector) {
	const activeBorderColor = theme.getColor(focusBorder);
	if (activeBorderColor) {
		// TODO@rob - why isn't this applied when added to the stylesheet from tocTree.ts? Seems like a chromium glitch.
		collector.addRule(`.settings-editor > .settings-body > .settings-toc-container .monaco-list:focus .monaco-list-row.focused {outline: solid 1px ${activeBorderColor}; outline-offset: -1px;  }`);
	}

	const foregroundColor = theme.getColor(foreground);
	if (foregroundColor) {
		// Links appear inside other elements in markdown. CSS opacity acts like a mask. So we have to dynamically compute the description color to avoid
		// applying an opacity to the link color.
		const fgWithOpacity = new Color(new RGBA(foregroundColor.rgba.r, foregroundColor.rgba.g, foregroundColor.rgba.b, 0.9));
		collector.addRule(`.settings-editor > .settings-body > .settings-list-container .setting-item-contents .setting-item-description { color: ${fgWithOpacity}; }`);

		collector.addRule(`.settings-editor > .settings-body .settings-toc-container .monaco-list-row:not(.selected) { color: ${fgWithOpacity}; }`);
	}

	const editorBackgroundColor = theme.getColor(editorBackground);
	if (editorBackgroundColor) {
		// -webkit-background-clip makes the heading clip the background color
		collector.addRule(`.settings-editor > .settings-body > .settings-list-container > * { background-color: ${editorBackgroundColor}; }`);
	}

	const errorColor = theme.getColor(errorForeground);
	if (errorColor) {
		collector.addRule(`.settings-editor > .settings-body > .settings-list-container .setting-item-contents .setting-item-deprecation-message { color: ${errorColor}; }`);
	}

	const invalidInputBackground = theme.getColor(inputValidationErrorBackground);
	if (invalidInputBackground) {
		collector.addRule(`.settings-editor > .settings-body > .settings-list-container .setting-item-contents .setting-item-validation-message { background-color: ${invalidInputBackground}; }`);
	}

	const invalidInputForeground = theme.getColor(inputValidationErrorForeground);
	if (invalidInputForeground) {
		collector.addRule(`.settings-editor > .settings-body > .settings-list-container .setting-item-contents .setting-item-validation-message { color: ${invalidInputForeground}; }`);
	}

	const invalidInputBorder = theme.getColor(inputValidationErrorBorder);
	if (invalidInputBorder) {
		collector.addRule(`.settings-editor > .settings-body > .settings-list-container .setting-item-contents .setting-item-validation-message { border-style:solid; border-width: 1px; border-color: ${invalidInputBorder}; }`);
		collector.addRule(`.settings-editor > .settings-body > .settings-list-container .setting-item.invalid-input .setting-item-control .monaco-inputbox.idle { outline-width: 0; border-style:solid; border-width: 1px; border-color: ${invalidInputBorder}; }`);
	}

	const headerForegroundColor = theme.getColor(settingsHeaderForeground);
	if (headerForegroundColor) {
		collector.addRule(`.settings-editor > .settings-body > .settings-list-container .settings-group-title-label { color: ${headerForegroundColor}; }`);
		collector.addRule(`.settings-editor > .settings-body > .settings-list-container .setting-item-label { color: ${headerForegroundColor}; }`);
	}

	const focusBorderColor = theme.getColor(focusBorder);
	if (focusBorderColor) {
		collector.addRule(`.settings-editor > .settings-body > .settings-list-container .setting-item-contents .setting-item-markdown a:focus { outline-color: ${focusBorderColor} }`);
	}

	// Scrollbar
	const scrollbarSliderBackgroundColor = theme.getColor(scrollbarSliderBackground);
	if (scrollbarSliderBackgroundColor) {
		collector.addRule(`.settings-editor > .settings-body .settings-list-container:hover { background-color: ${scrollbarSliderBackgroundColor}; }`);
	}

	const scrollbarSliderHoverBackgroundColor = theme.getColor(scrollbarSliderHoverBackground);
	if (scrollbarSliderHoverBackgroundColor) {
		collector.addRule(`.settings-editor > .settings-body .settings-list-container::-webkit-scrollbar-thumb:hover { background-color: ${scrollbarSliderHoverBackgroundColor}; }`);
	}

	const scrollbarSliderActiveBackgroundColor = theme.getColor(scrollbarSliderActiveBackground);
	if (scrollbarSliderActiveBackgroundColor) {
		collector.addRule(`.settings-editor > .settings-body .settings-list-container::-webkit-scrollbar-thumb:active { background-color: ${scrollbarSliderActiveBackgroundColor}; }`);
	}
}
