/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDataSource, IRenderer, ITree, ITreeConfiguration, ITreeOptions } from 'vs/base/parts/tree/browser/tree';
import { DefaultTreestyler } from 'vs/base/parts/tree/browser/treeDefaults';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IListService, WorkbenchTree, WorkbenchTreeController } from 'vs/platform/list/browser/listService';
import { editorBackground } from 'vs/platform/theme/common/colorRegistry';
import { attachStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { SettingsAccessibilityProvider, SettingsTreeFilter } from 'vs/workbench/parts/preferences/browser/settingsTree';
import { ISettingsEditorViewState, SearchResultModel, SettingsTreeElement, SettingsTreeGroupElement, SettingsTreeSettingElement } from 'vs/workbench/parts/preferences/browser/settingsTreeModels';
import { settingsHeaderForeground } from 'vs/workbench/parts/preferences/browser/settingsWidgets';

const $ = DOM.$;

export class TOCTreeModel {

	private _currentSearchModel: SearchResultModel;
	private _settingsTreeRoot: SettingsTreeGroupElement;

	constructor(private _viewState: ISettingsEditorViewState) {
	}

	public get settingsTreeRoot(): SettingsTreeGroupElement {
		return this._settingsTreeRoot;
	}

	public set settingsTreeRoot(value: SettingsTreeGroupElement) {
		this._settingsTreeRoot = value;
		this.update();
	}

	public set currentSearchModel(model: SearchResultModel) {
		this._currentSearchModel = model;
		this.update();
	}

	public get children(): SettingsTreeElement[] {
		return this._settingsTreeRoot.children;
	}

	public update(): void {
		if (this._settingsTreeRoot) {
			this.updateGroupCount(this._settingsTreeRoot);
		}
	}

	private updateGroupCount(group: SettingsTreeGroupElement): void {
		group.children.forEach(child => {
			if (child instanceof SettingsTreeGroupElement) {
				this.updateGroupCount(child);
			}
		});

		const childCount = group.children
			.filter(child => child instanceof SettingsTreeGroupElement)
			.reduce((acc, cur) => acc + (<SettingsTreeGroupElement>cur).count, 0);

		group.count = childCount + this.getGroupCount(group);
	}

	private getGroupCount(group: SettingsTreeGroupElement): number {
		return group.children.filter(child => {
			if (!(child instanceof SettingsTreeSettingElement)) {
				return false;
			}

			if (this._currentSearchModel && !this._currentSearchModel.root.containsSetting(child.setting.key)) {
				return false;
			}

			// Check everything that the SettingsFilter checks except whether it's filtered by a category
			return child.matchesScope(this._viewState.settingsTarget) && child.matchesAllTags(this._viewState.tagFilters);
		}).length;
	}
}

export type TOCTreeElement = SettingsTreeGroupElement | TOCTreeModel;

export class TOCDataSource implements IDataSource {
	constructor(private _treeFilter: SettingsTreeFilter) {
	}

	getId(tree: ITree, element: SettingsTreeGroupElement): string {
		return element.id;
	}

	hasChildren(tree: ITree, element: TOCTreeElement): boolean {
		if (element instanceof TOCTreeModel) {
			return true;
		}

		if (element instanceof SettingsTreeGroupElement) {
			// Should have child which won't be filtered out
			return element.children && element.children.some(child => child instanceof SettingsTreeGroupElement && this._treeFilter.isVisible(tree, child));
		}

		return false;
	}

	getChildren(tree: ITree, element: TOCTreeElement): TPromise<SettingsTreeElement[]> {
		return TPromise.as(this._getChildren(element));
	}

	private _getChildren(element: TOCTreeElement): SettingsTreeElement[] {
		return (<SettingsTreeElement[]>element.children)
			.filter(child => child instanceof SettingsTreeGroupElement);
	}

	getParent(tree: ITree, element: TOCTreeElement): TPromise<any> {
		return TPromise.wrap(element instanceof SettingsTreeGroupElement && element.parent);
	}
}

const TOC_ENTRY_TEMPLATE_ID = 'settings.toc.entry';

interface ITOCEntryTemplate {
	labelElement: HTMLElement;
	countElement: HTMLElement;
}

export class TOCRenderer implements IRenderer {
	getHeight(tree: ITree, element: SettingsTreeElement): number {
		return 22;
	}

	getTemplateId(tree: ITree, element: SettingsTreeElement): string {
		return TOC_ENTRY_TEMPLATE_ID;
	}

	renderTemplate(tree: ITree, templateId: string, container: HTMLElement): ITOCEntryTemplate {
		return {
			labelElement: DOM.append(container, $('.settings-toc-entry')),
			countElement: DOM.append(container, $('.settings-toc-count'))
		};
	}

	renderElement(tree: ITree, element: SettingsTreeGroupElement, templateId: string, template: ITOCEntryTemplate): void {
		const count = element.count;
		const label = element.label;

		DOM.toggleClass(template.labelElement, 'no-results', count === 0);
		template.labelElement.textContent = label;

		if (count) {
			template.countElement.textContent = ` (${count})`;
		} else {
			template.countElement.textContent = '';
		}
	}

	disposeTemplate(tree: ITree, templateId: string, templateData: any): void {
	}
}

export class TOCTree extends WorkbenchTree {
	constructor(
		container: HTMLElement,
		viewState: ISettingsEditorViewState,
		configuration: Partial<ITreeConfiguration>,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService listService: IListService,
		@IThemeService themeService: IThemeService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		const treeClass = 'settings-toc-tree';

		const filter = instantiationService.createInstance(SettingsTreeFilter, viewState);
		const fullConfiguration = <ITreeConfiguration>{
			controller: instantiationService.createInstance(WorkbenchTreeController, {}),
			filter,
			styler: new DefaultTreestyler(DOM.createStyleSheet(container), treeClass),
			dataSource: instantiationService.createInstance(TOCDataSource, filter),
			accessibilityProvider: instantiationService.createInstance(SettingsAccessibilityProvider),

			...configuration
		};

		const options: ITreeOptions = {
			showLoading: false,
			twistiePixels: 15,
			horizontalScrollMode: ScrollbarVisibility.Hidden
		};

		super(container,
			fullConfiguration,
			options,
			contextKeyService,
			listService,
			themeService,
			instantiationService,
			configurationService);

		this.getHTMLElement().classList.add(treeClass);

		this.disposables.push(attachStyler(themeService, {
			listActiveSelectionBackground: editorBackground,
			listActiveSelectionForeground: settingsHeaderForeground,
			listFocusAndSelectionBackground: editorBackground,
			listFocusAndSelectionForeground: settingsHeaderForeground,
			listFocusBackground: editorBackground,
			listFocusForeground: settingsHeaderForeground,
			listHoverForeground: settingsHeaderForeground,
			listHoverBackground: editorBackground,
			listInactiveSelectionBackground: editorBackground,
			listInactiveSelectionForeground: settingsHeaderForeground,
		}, colors => {
			this.style(colors);
		}));
	}
}
