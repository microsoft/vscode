/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as dom from 'vs/base/browser/dom';
import { IMouseEvent } from 'vs/base/browser/mouseEvent';
import { HighlightedLabel } from 'vs/base/browser/ui/highlightedlabel/highlightedLabel';
import { values } from 'vs/base/common/collections';
import { onUnexpectedError } from 'vs/base/common/errors';
import { createMatches } from 'vs/base/common/filters';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDataSource, IFilter, IRenderer, ISorter, ITree } from 'vs/base/parts/tree/browser/tree';
import 'vs/css!./media/symbol-icons';
import { Range } from 'vs/editor/common/core/range';
import { symbolKindToCssClass } from 'vs/editor/common/modes';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { OutlineElement, OutlineGroup, OutlineModel, TreeElement } from './outlineModel';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { localize } from 'vs/nls';
import { WorkbenchTreeController } from 'vs/platform/list/browser/listService';
import { MarkerSeverity } from 'vs/platform/markers/common/markers';
import { listErrorForeground, listWarningForeground } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { OutlineConfigKeys } from 'vs/workbench/parts/outline/electron-browser/outline';

export enum OutlineItemCompareType {
	ByPosition,
	ByName,
	ByKind
}

export class OutlineItemComparator implements ISorter {

	constructor(
		public type: OutlineItemCompareType = OutlineItemCompareType.ByPosition
	) { }

	compare(tree: ITree, a: OutlineGroup | OutlineElement, b: OutlineGroup | OutlineElement): number {

		if (a instanceof OutlineGroup && b instanceof OutlineGroup) {
			return a.providerIndex - b.providerIndex;
		}

		if (a instanceof OutlineElement && b instanceof OutlineElement) {
			switch (this.type) {
				case OutlineItemCompareType.ByKind:
					return a.symbol.kind - b.symbol.kind;
				case OutlineItemCompareType.ByName:
					return a.symbol.name.localeCompare(b.symbol.name);
				case OutlineItemCompareType.ByPosition:
				default:
					return Range.compareRangesUsingStarts(a.symbol.fullRange, b.symbol.fullRange);
			}
		}

		return 0;
	}
}

export class OutlineItemFilter implements IFilter {

	enabled: boolean = true;

	isVisible(tree: ITree, element: OutlineElement | any): boolean {
		if (!this.enabled) {
			return true;
		}
		return !(element instanceof OutlineElement) || Boolean(element.score);
	}
}

export class OutlineDataSource implements IDataSource {

	// this is a workaround for the tree showing twisties for items
	// with only filtered children
	filterOnScore: boolean = true;

	getId(tree: ITree, element: TreeElement): string {
		return element ? element.id : 'empty';
	}

	hasChildren(tree: ITree, element: OutlineModel | OutlineGroup | OutlineElement): boolean {
		if (!element) {
			return false;
		}
		if (element instanceof OutlineModel) {
			return true;
		}
		if (element instanceof OutlineElement && (this.filterOnScore && !element.score)) {
			return false;
		}
		for (const id in element.children) {
			if (!this.filterOnScore || element.children[id].score) {
				return true;
			}
		}
		return false;
	}

	async getChildren(tree: ITree, element: TreeElement): TPromise<TreeElement[]> {
		let res = values(element.children);
		// console.log(element.id + ' with children ' + res.length);
		return res;
	}

	async getParent(tree: ITree, element: TreeElement | any): TPromise<TreeElement> {
		return element && element.parent;
	}

	shouldAutoexpand(tree: ITree, element: TreeElement): boolean {
		return element && (element instanceof OutlineModel || element.parent instanceof OutlineModel || element instanceof OutlineGroup || element.parent instanceof OutlineGroup);
	}
}

export interface OutlineTemplate {
	labelContainer: HTMLElement;
	label: HighlightedLabel;
	icon?: HTMLElement;
	decoration?: HTMLElement;
}

export class OutlineRenderer implements IRenderer {

	constructor(
		@IExtensionService readonly _extensionService: IExtensionService,
		@IEnvironmentService readonly _environmentService: IEnvironmentService,
		@IWorkspaceContextService readonly _contextService: IWorkspaceContextService,
		@IThemeService readonly _themeService: IThemeService,
		@IConfigurationService readonly _configurationService: IConfigurationService
	) {
		//
	}

	getHeight(tree: ITree, element: any): number {
		return 22;
	}

	getTemplateId(tree: ITree, element: OutlineGroup | OutlineElement): string {
		return element instanceof OutlineGroup ? 'outline-group' : 'outline-element';
	}

	renderTemplate(tree: ITree, templateId: string, container: HTMLElement): OutlineTemplate {
		if (templateId === 'outline-element') {
			const icon = dom.$('.outline-element-icon symbol-icon');
			const labelContainer = dom.$('.outline-element-label');
			const decoration = dom.$('.outline-element-decoration');
			dom.addClass(container, 'outline-element');
			dom.append(container, icon, labelContainer, decoration);
			return { icon, labelContainer, label: new HighlightedLabel(labelContainer), decoration };
		}
		if (templateId === 'outline-group') {
			const labelContainer = dom.$('.outline-element-label');
			dom.addClass(container, 'outline-element');
			dom.append(container, labelContainer);
			return { labelContainer, label: new HighlightedLabel(labelContainer) };
		}

		throw new Error(templateId);
	}

	renderElement(tree: ITree, element: OutlineGroup | OutlineElement, templateId: string, template: OutlineTemplate): void {
		if (element instanceof OutlineElement) {
			template.icon.className = `outline-element-icon symbol-icon ${symbolKindToCssClass(element.symbol.kind)}`;
			template.label.set(element.symbol.name, element.score ? createMatches(element.score[1]) : undefined);
			this._renderMarkerInfo(element, template);

		}
		if (element instanceof OutlineGroup) {
			this._extensionService.getExtensions().then(all => {
				let found = false;
				for (let i = 0; !found && i < all.length; i++) {
					const extension = all[i];
					if (extension.id === element.provider.extensionId) {
						template.label.set(extension.displayName);
						break;
					}
				}
			}, _err => {
				template.label.set(element.provider.extensionId);
			});
		}
	}

	private _renderMarkerInfo(element: OutlineElement, template: OutlineTemplate): void {

		if (!element.marker) {
			dom.hide(template.decoration);
			template.labelContainer.style.removeProperty('--outline-element-color');
			return;
		}

		const { count, topSev } = element.marker;
		const color = this._themeService.getTheme().getColor(topSev === MarkerSeverity.Error ? listErrorForeground : listWarningForeground).toString();

		// color of the label
		if (this._configurationService.getValue(OutlineConfigKeys.problemsColors)) {
			template.labelContainer.style.setProperty('--outline-element-color', color);
		} else {
			template.labelContainer.style.removeProperty('--outline-element-color');
		}

		// badge with color/rollup
		if (!this._configurationService.getValue(OutlineConfigKeys.problemsBadges)) {
			dom.hide(template.decoration);

		} else if (count > 0) {
			dom.show(template.decoration);
			dom.removeClass(template.decoration, 'bubble');
			template.decoration.innerText = count < 10 ? count.toString() : '+9';
			template.decoration.title = count === 1 ? localize('1.problem', "1 problem in this element") : localize('N.problem', "{0} problems in this element", count);
			template.decoration.style.setProperty('--outline-element-color', color);

		} else {
			dom.show(template.decoration);
			dom.addClass(template.decoration, 'bubble');
			template.decoration.innerText = '\uf052';
			template.decoration.title = localize('deep.problem', "Contains elements with problems");
			template.decoration.style.setProperty('--outline-element-color', color);
		}
	}

	disposeTemplate(tree: ITree, templateId: string, template: OutlineTemplate): void {
		template.label.dispose();
	}

}

export class OutlineTreeState {

	readonly selected: string;
	readonly focused: string;
	readonly expanded: string[];

	static capture(tree: ITree): OutlineTreeState {
		// selection
		let selected: string;
		let element = tree.getSelection()[0];
		if (element instanceof TreeElement) {
			selected = element.id;
		}

		// focus
		let focused: string;
		element = tree.getFocus(true);
		if (element instanceof TreeElement) {
			focused = element.id;
		}

		// expansion
		let expanded = new Array<string>();
		let nav = tree.getNavigator();
		while (nav.next()) {
			let element = nav.current();
			if (element instanceof TreeElement) {
				if (tree.isExpanded(element)) {
					expanded.push(element.id);
				}
			}
		}
		return { selected, focused, expanded };
	}

	static async restore(tree: ITree, state: OutlineTreeState): TPromise<void> {
		let model = <OutlineModel>tree.getInput();
		if (!state || !(model instanceof OutlineModel)) {
			return TPromise.as(undefined);
		}

		// expansion
		let items: TreeElement[] = [];
		for (const id of state.expanded) {
			let item = model.getItemById(id);
			if (item) {
				items.push(item);
			}
		}
		await tree.collapseAll(undefined);
		await tree.expandAll(items);

		// selection & focus
		let selected = model.getItemById(state.selected);
		let focused = model.getItemById(state.focused);
		tree.setSelection([selected]);
		tree.setFocus(focused);
	}
}

export class OutlineController extends WorkbenchTreeController {

	protected onLeftClick(tree: ITree, element: any, event: IMouseEvent, origin: string = 'mouse'): boolean {

		const payload = { origin: origin, originalEvent: event };

		if (tree.getInput() === element) {
			tree.clearFocus(payload);
			tree.clearSelection(payload);
		} else {
			const isMouseDown = event && event.browserEvent && event.browserEvent.type === 'mousedown';
			if (!isMouseDown) {
				event.preventDefault(); // we cannot preventDefault onMouseDown because this would break DND otherwise
			}
			event.stopPropagation();

			tree.domFocus();
			tree.setSelection([element], payload);
			tree.setFocus(element, payload);

			const didClickElement = element instanceof OutlineElement && !this.isClickOnTwistie(event);

			if (!didClickElement) {
				if (tree.isExpanded(element)) {
					tree.collapse(element).then(null, onUnexpectedError);
				} else {
					tree.expand(element).then(null, onUnexpectedError);
				}
			}
		}
		return true;
	}
}
