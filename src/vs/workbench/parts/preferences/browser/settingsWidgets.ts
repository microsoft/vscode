/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { Button } from 'vs/base/browser/ui/button/button';
import { Checkbox } from 'vs/base/browser/ui/checkbox/checkbox';
import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { IRenderer, IVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { Action } from 'vs/base/common/actions';
import { Disposable, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import 'vs/css!./media/settingsWidgets';
import { localize } from 'vs/nls';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { attachButtonStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';

const $ = DOM.$;

enum AddItemMode {
	None,
	Pattern,
	PatternWithSibling
}

export class ExcludeSettingListModel {
	private _dataItems: IExcludeItem[];
	private _newItem: AddItemMode;

	get items(): IExcludeItem[] {
		const items = [
			...this._dataItems
		];
		if (this._newItem === AddItemMode.Pattern) {
			items.push(<INewExcludeItem>{
				id: 'newItem',
				withSibling: false
			});
		}

		return items;
	}

	setValue(excludeValue: any): void {
		this._dataItems = this.excludeValueToItems(excludeValue);
	}

	private excludeValueToItems(excludeValue: any): IExcludeItem[] {
		return Object.keys(excludeValue).map(key => {
			const value = excludeValue[key];
			const enabled = !!value;
			const sibling = typeof value === 'boolean' ? undefined : value.when;

			return {
				id: key,
				enabled,
				pattern: key,
				sibling
			};
		});
	}
}

export class ExcludeSettingWidget extends Disposable {
	private list: WorkbenchList<IExcludeItem>;

	private model = new ExcludeSettingListModel();

	constructor(
		container: HTMLElement,
		@IThemeService private themeService: IThemeService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super();

		const dataRenderer = new ExcludeDataItemRenderer();
		const newItemRenderer = this.instantiationService.createInstance(NewExcludeRenderer);
		const delegate = new ExcludeSettingListDelegate();
		this.list = this.instantiationService.createInstance(WorkbenchList, container, delegate, [newItemRenderer, dataRenderer], {
			identityProvider: element => element.id,
			multipleSelectionSupport: false
		}) as WorkbenchList<IExcludeItem>;
		this._register(this.list);

		const addPatternButton = this._register(new Button(container));
		addPatternButton.label = localize('addPattern', "Add Pattern");
		addPatternButton.element.classList.add('setting-exclude-addPattern', 'setting-exclude-addButton');
		this._register(attachButtonStyler(addPatternButton, this.themeService));

		const addSiblingPatternButton = this._register(new Button(container));
		addSiblingPatternButton.label = localize('addSiblingPattern', "Add Sibling Pattern");
		addSiblingPatternButton.element.classList.add('setting-exclude-addButton');
		this._register(attachButtonStyler(addSiblingPatternButton, this.themeService));
		this._register(addSiblingPatternButton.onDidClick(() => {
		}));
	}

	setValue(excludeValue: any): void {
		this.model.setValue(excludeValue);
		this.list.splice(0, this.list.length, this.model.items);

		const listHeight = 22 * this.model.items.length;
		this.list.layout(listHeight);
		this.list.getHTMLElement().style.height = listHeight + 'px';
	}
}

interface IExcludeDataItem {
	id: string;
	enabled: boolean;
	pattern: string;
	sibling?: string;
}

interface INewExcludeItem {
	id: string;
	withSibling: boolean;
}

type IExcludeItem = IExcludeDataItem | INewExcludeItem;

function isExcludeDataItem(excludeItem: IExcludeItem): excludeItem is IExcludeDataItem {
	return !!(<IExcludeDataItem>excludeItem).pattern;
}

interface IExcludeDataItemTemplate {
	container: HTMLElement;

	checkbox: Checkbox;
	actionBar: ActionBar;
	patternElement: HTMLElement;
	siblingElement: HTMLElement;
	toDispose: IDisposable[];
}

class ExcludeDataItemRenderer implements IRenderer<IExcludeDataItem, IExcludeDataItemTemplate> {
	static readonly templateId: string = 'excludeDataItem';

	get templateId(): string {
		return ExcludeDataItemRenderer.templateId;
	}

	renderTemplate(container: HTMLElement): IExcludeDataItemTemplate {
		const toDispose = [];

		const checkbox = new Checkbox({ actionClassName: 'setting-exclude-checkbox', isChecked: true, title: '', inputActiveOptionBorder: null });
		container.appendChild(checkbox.domNode);
		toDispose.push(checkbox);
		toDispose.push(checkbox.onChange(() => {
			// if (template.onChange) {
			// 	template.onChange(checkbox.checked);
			// }
		}));

		const actionBar = new ActionBar(container);
		toDispose.push(actionBar);

		const editAction = new EditExcludeItemAction();
		const removeAction = new RemoveExcludeItemAction();
		toDispose.push(editAction, removeAction);
		actionBar.push([
			editAction, removeAction
		], { icon: true, label: false });

		return {
			container,
			checkbox,
			patternElement: DOM.append(container, $('.setting-exclude-pattern')),
			siblingElement: DOM.append(container, $('.setting-exclude-sibling')),
			toDispose,
			actionBar
		};
	}

	renderElement(element: IExcludeDataItem, index: number, templateData: IExcludeDataItemTemplate): void {
		templateData.patternElement.textContent = element.pattern;
		templateData.siblingElement.textContent = element.sibling;
	}

	disposeElement(element: IExcludeDataItem, index: number, templateData: IExcludeDataItemTemplate): void {
	}

	disposeTemplate(templateData: IExcludeDataItemTemplate): void {
		dispose(templateData.toDispose);
	}
}

interface INewExcludeItemTemplate {
	container: HTMLElement;

	patternInput: InputBox;
	toDispose: IDisposable[];
}

class NewExcludeRenderer implements IRenderer<INewExcludeItem, INewExcludeItemTemplate> {
	static readonly templateId: string = 'newExcludeItem';

	constructor(
		@IContextViewService private contextViewService: IContextViewService
	) {
	}

	get templateId(): string {
		return ExcludeDataItemRenderer.templateId;
	}

	renderTemplate(container: HTMLElement): INewExcludeItemTemplate {
		const toDispose = [];

		const patternInput = new InputBox(container, this.contextViewService);
		toDispose.push(patternInput);

		return {
			container,
			patternInput,
			toDispose
		};
	}

	renderElement(element: INewExcludeItem, index: number, templateData: INewExcludeItemTemplate): void {
	}

	disposeElement(element: INewExcludeItem, index: number, templateData: INewExcludeItemTemplate): void {
	}

	disposeTemplate(templateData: INewExcludeItemTemplate): void {
		dispose(templateData.toDispose);
	}
}

class ExcludeSettingListDelegate implements IVirtualDelegate<IExcludeItem> {
	getHeight(element: IExcludeItem): number {
		return 22;
	}

	getTemplateId(element: IExcludeItem): string {
		if (isExcludeDataItem(element)) {
			return ExcludeDataItemRenderer.templateId;
		} else {
			return NewExcludeRenderer.templateId;
		}
	}
}

class EditExcludeItemAction extends Action {

	static readonly ID = 'workbench.action.editExcludeItem';
	static readonly LABEL = localize('editExcludeItem', "Edit Exclude Item");

	constructor() {
		super(EditExcludeItemAction.ID, EditExcludeItemAction.LABEL);

		this.class = 'setting-excludeAction-edit';
	}

	run(item: IExcludeItem): TPromise<boolean> {
		return TPromise.wrap(true);
	}
}

class RemoveExcludeItemAction extends Action {

	static readonly ID = 'workbench.action.removeExcludeItem';
	static readonly LABEL = localize('removeExcludeItem', "Remove Exclude Item");

	constructor() {
		super(RemoveExcludeItemAction.ID, RemoveExcludeItemAction.LABEL);

		this.class = 'setting-excludeAction-remove';
	}

	run(item: IExcludeItem): TPromise<boolean> {
		return TPromise.wrap(true);
	}
}
