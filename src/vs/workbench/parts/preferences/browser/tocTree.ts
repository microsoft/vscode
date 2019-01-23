/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IObjectTreeOptions, ObjectTree } from 'vs/base/browser/ui/tree/objectTree';
import { ITreeElement, ITreeNode, ITreeRenderer } from 'vs/base/browser/ui/tree/tree';
import { Iterator } from 'vs/base/common/iterator';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { editorBackground } from 'vs/platform/theme/common/colorRegistry';
import { attachStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { SettingsTreeFilter } from 'vs/workbench/parts/preferences/browser/settingsTree';
import { ISettingsEditorViewState, SearchResultModel, SettingsTreeElement, SettingsTreeGroupElement, SettingsTreeSettingElement } from 'vs/workbench/parts/preferences/browser/settingsTreeModels';
import { settingsHeaderForeground } from 'vs/workbench/parts/preferences/browser/settingsWidgets';

const $ = DOM.$;

export class TOCTreeModel {

	private _currentSearchModel: SearchResultModel;
	private _settingsTreeRoot: SettingsTreeGroupElement;

	constructor(private _viewState: ISettingsEditorViewState) {
	}

	get settingsTreeRoot(): SettingsTreeGroupElement {
		return this._settingsTreeRoot;
	}

	set settingsTreeRoot(value: SettingsTreeGroupElement) {
		this._settingsTreeRoot = value;
		this.update();
	}

	set currentSearchModel(model: SearchResultModel) {
		this._currentSearchModel = model;
		this.update();
	}

	get children(): SettingsTreeElement[] {
		return this._settingsTreeRoot.children;
	}

	update(): void {
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

const TOC_ENTRY_TEMPLATE_ID = 'settings.toc.entry';

interface ITOCEntryTemplate {
	labelElement: HTMLElement;
	countElement: HTMLElement;
}

export class TOCRenderer implements ITreeRenderer<SettingsTreeGroupElement, never, ITOCEntryTemplate> {

	templateId = TOC_ENTRY_TEMPLATE_ID;

	renderTemplate(container: HTMLElement): ITOCEntryTemplate {
		return {
			labelElement: DOM.append(container, $('.settings-toc-entry')),
			countElement: DOM.append(container, $('.settings-toc-count'))
		};
	}

	renderElement(node: ITreeNode<SettingsTreeGroupElement>, index: number, template: ITOCEntryTemplate): void {
		const element = node.element;
		const count = element.count;
		const label = element.label;

		template.labelElement.textContent = label;

		if (count) {
			template.countElement.textContent = ` (${count})`;
		} else {
			template.countElement.textContent = '';
		}
	}

	disposeTemplate(templateData: ITOCEntryTemplate): void {
	}
}

class TOCTreeDelegate implements IListVirtualDelegate<SettingsTreeElement> {
	getTemplateId(element: SettingsTreeElement): string {
		return TOC_ENTRY_TEMPLATE_ID;
	}

	getHeight(element: SettingsTreeElement): number {
		return 22;
	}
}

export function createTOCIterator(model: TOCTreeModel | SettingsTreeGroupElement): Iterator<ITreeElement<SettingsTreeGroupElement>> {
	const groupChildren = <SettingsTreeGroupElement[]>model.children.filter(c => c instanceof SettingsTreeGroupElement);
	const groupsIt = Iterator.fromArray(groupChildren);

	return Iterator.map(groupsIt, g => {
		return {
			element: g,
			children: g instanceof SettingsTreeGroupElement ?
				createTOCIterator(g) :
				undefined
		};
	});
}

export class TOCTree extends ObjectTree<SettingsTreeGroupElement> {
	constructor(
		container: HTMLElement,
		viewState: ISettingsEditorViewState,
		@IThemeService themeService: IThemeService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		// test open mode

		const filter = instantiationService.createInstance(SettingsTreeFilter, viewState);
		const options: IObjectTreeOptions<SettingsTreeGroupElement> = {
			filter,
			identityProvider: {
				getId(e) {
					return e.id;
				}
			}
		};

		super(container,
			new TOCTreeDelegate(),
			[new TOCRenderer()],
			options);

		const treeClass = 'settings-toc-tree';
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
