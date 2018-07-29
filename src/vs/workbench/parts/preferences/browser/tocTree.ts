/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDataSource, IRenderer, ITree, ITreeConfiguration } from 'vs/base/parts/tree/browser/tree';
import { DefaultTreestyler, OpenMode } from 'vs/base/parts/tree/browser/treeDefaults';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IListService, WorkbenchTree, WorkbenchTreeController } from 'vs/platform/list/browser/listService';
import { editorBackground, focusBorder, foreground } from 'vs/platform/theme/common/colorRegistry';
import { attachStyler } from 'vs/platform/theme/common/styler';
import { ICssStyleCollector, ITheme, IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { ISettingsEditorViewState, SearchResultModel, SettingsAccessibilityProvider, SettingsTreeElement, SettingsTreeFilter, SettingsTreeGroupElement, SettingsTreeSettingElement } from 'vs/workbench/parts/preferences/browser/settingsTree';
import { settingsHeaderForeground } from 'vs/workbench/parts/preferences/browser/settingsWidgets';
import { ISetting } from 'vs/workbench/services/preferences/common/preferences';

const $ = DOM.$;

export class TOCTreeModel {

	private _currentSearchModel: SearchResultModel;
	private _settingsTreeRoot: SettingsTreeGroupElement;

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
		this.updateGroupCount(this._settingsTreeRoot);
	}

	private updateGroupCount(group: SettingsTreeGroupElement): void {
		(<any>group).count = this._currentSearchModel ?
			this.getSearchResultChildrenCount(group) :
			undefined;

		group.children.forEach(child => {
			if (child instanceof SettingsTreeGroupElement) {
				this.updateGroupCount(child);
			}
		});
	}

	private getSearchResultChildrenCount(group: SettingsTreeGroupElement): number {
		return this._currentSearchModel.getChildren().filter(child => {
			return child instanceof SettingsTreeSettingElement && this.groupContainsSetting(group, child.setting);
		}).length;
	}

	private groupContainsSetting(group: SettingsTreeGroupElement, setting: ISetting): boolean {
		return group.children.some(child => {
			if (child instanceof SettingsTreeSettingElement) {
				return child.setting.key === setting.key;
			} else if (child instanceof SettingsTreeGroupElement) {
				return this.groupContainsSetting(child, setting);
			} else {
				return false;
			}
		});
	}
}

export type TOCTreeElement = SettingsTreeGroupElement | TOCTreeModel;

export class TOCDataSource implements IDataSource {
	constructor(
		@IConfigurationService private configService: IConfigurationService
	) {
	}

	getId(tree: ITree, element: SettingsTreeGroupElement): string {
		return element.id;
	}

	hasChildren(tree: ITree, element: TOCTreeElement): boolean {
		return element instanceof TOCTreeModel ||
			(element instanceof SettingsTreeGroupElement && element.children && element.children.every(child => child instanceof SettingsTreeGroupElement));
	}

	getChildren(tree: ITree, element: TOCTreeElement): TPromise<SettingsTreeElement[], any> {
		return TPromise.as(this._getChildren(element));
	}

	private _getChildren(element: TOCTreeElement): SettingsTreeElement[] {
		// TODO@roblou hack. Clean up or remove this option
		if (this.configService.getValue('workbench.settings.settingsSearchTocBehavior') === 'filter') {
			const children = element.children as SettingsTreeElement[]; // TS????
			return children.filter(group => {
				return (<any>group).count !== 0;
			});
		}

		return element.children;
	}

	getParent(tree: ITree, element: TOCTreeElement): TPromise<any, any> {
		return TPromise.wrap(element instanceof SettingsTreeGroupElement && element.parent);
	}
}

const TOC_ENTRY_TEMPLATE_ID = 'settings.toc.entry';

interface ITOCEntryTemplate {
	element: HTMLElement;
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
			element: DOM.append(container, $('.settings-toc-entry'))
		};
	}

	renderElement(tree: ITree, element: SettingsTreeGroupElement, templateId: string, template: ITOCEntryTemplate): void {
		const label = (<any>element).count ?
			`${element.label} (${(<any>element).count})` :
			element.label;

		DOM.toggleClass(template.element, 'no-results', (<any>element).count === 0);
		template.element.textContent = label;
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

		const fullConfiguration = <ITreeConfiguration>{
			controller: instantiationService.createInstance(WorkbenchTreeController, { openMode: OpenMode.DOUBLE_CLICK }),
			filter: instantiationService.createInstance(SettingsTreeFilter, viewState),
			styler: new DefaultTreestyler(DOM.createStyleSheet(), treeClass),
			dataSource: instantiationService.createInstance(TOCDataSource),
			accessibilityProvider: instantiationService.createInstance(SettingsAccessibilityProvider),

			...configuration
		};

		const options = {
			showLoading: false,
			twistiePixels: 15
		};

		super(container,
			fullConfiguration,
			options,
			contextKeyService,
			listService,
			themeService,
			instantiationService,
			configurationService);

		this.disposables.push(registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {
			const activeBorderColor = theme.getColor(focusBorder);
			if (activeBorderColor) {
				collector.addRule(`.settings-editor > .settings-body > .settings-toc-container .monaco-tree:focus .monaco-tree-row.focused { outline-color: ${activeBorderColor}; }`);
			}
		}));

		this.getHTMLElement().classList.add(treeClass);

		this.disposables.push(attachStyler(themeService, {
			listActiveSelectionBackground: editorBackground,
			listActiveSelectionForeground: settingsHeaderForeground,
			listFocusAndSelectionBackground: editorBackground,
			listFocusAndSelectionForeground: settingsHeaderForeground,
			listFocusBackground: editorBackground,
			listFocusForeground: settingsHeaderForeground,
			listHoverForeground: foreground,
			listHoverBackground: editorBackground,
			listInactiveSelectionBackground: editorBackground,
			listInactiveSelectionForeground: settingsHeaderForeground,
		}, colors => {
			this.style(colors);
		}));
	}
}
