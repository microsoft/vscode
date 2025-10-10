/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cssJs from '../../../../base/browser/cssValue.js';
import * as dom from '../../../../base/browser/dom.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { IManagedHoverTooltipMarkdownString } from '../../../../base/browser/ui/hover/hover.js';
import { IHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegate.js';
import { IconLabel } from '../../../../base/browser/ui/iconLabel/iconLabel.js';
import { TriStateCheckbox } from '../../../../base/browser/ui/toggle/toggle.js';
import { ITreeElementRenderDetails, ITreeNode, ITreeRenderer } from '../../../../base/browser/ui/tree/tree.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { defaultCheckboxStyles } from '../../../theme/browser/defaultStyles.js';
import { isDark } from '../../../theme/common/theme.js';
import { escape } from '../../../../base/common/strings.js';
import { IThemeService } from '../../../theme/common/themeService.js';
import { IQuickTreeCheckboxEvent, IQuickTreeItem, IQuickTreeItemButtonEvent } from '../../common/quickInput.js';
import { quickInputButtonToAction } from '../quickInputUtils.js';
import { IQuickTreeFilterData } from './quickInputTree.js';

const $ = dom.$;

export interface IQuickTreeTemplateData {
	entry: HTMLElement;
	checkbox: TriStateCheckbox;
	icon: HTMLElement;
	label: IconLabel;
	actionBar: ActionBar;
	toDisposeElement: DisposableStore;
	toDisposeTemplate: DisposableStore;
}

export class QuickInputTreeRenderer<T extends IQuickTreeItem> extends Disposable implements ITreeRenderer<T, IQuickTreeFilterData, IQuickTreeTemplateData> {
	static readonly ID = 'quickInputTreeElement';
	templateId = QuickInputTreeRenderer.ID;

	constructor(
		private readonly _hoverDelegate: IHoverDelegate | undefined,
		private readonly _buttonTriggeredEmitter: Emitter<IQuickTreeItemButtonEvent<T>>,
		private readonly onCheckedEvent: Event<IQuickTreeCheckboxEvent<T>>,
		@IThemeService private readonly _themeService: IThemeService,
	) {
		super();
	}

	renderTemplate(container: HTMLElement): IQuickTreeTemplateData {
		const store = new DisposableStore();

		// Main entry container
		const entry = dom.append(container, $('.quick-input-tree-entry'));

		const checkbox = store.add(new TriStateCheckbox('', false, { ...defaultCheckboxStyles, size: 15 }));
		entry.appendChild(checkbox.domNode);

		const checkboxLabel = dom.append(entry, $('label.quick-input-tree-label'));
		const rows = dom.append(checkboxLabel, $('.quick-input-tree-rows'));
		const row1 = dom.append(rows, $('.quick-input-tree-row'));
		const icon = dom.prepend(row1, $('.quick-input-tree-icon'));
		const label = store.add(new IconLabel(row1, {
			supportHighlights: true,
			supportDescriptionHighlights: true,
			supportIcons: true,
			hoverDelegate: this._hoverDelegate
		}));
		const actionBar = store.add(new ActionBar(entry, this._hoverDelegate ? { hoverDelegate: this._hoverDelegate } : undefined));
		actionBar.domNode.classList.add('quick-input-tree-entry-action-bar');
		return {
			toDisposeTemplate: store,
			entry,
			checkbox,
			icon,
			label,
			actionBar,
			toDisposeElement: new DisposableStore(),
		};
	}
	renderElement(node: ITreeNode<T, IQuickTreeFilterData>, index: number, templateData: IQuickTreeTemplateData, _details?: ITreeElementRenderDetails): void {
		const store = templateData.toDisposeElement;
		const quickTreeItem = node.element;

		// Checkbox
		if (quickTreeItem.pickable === false) {
			// Hide checkbox for non-pickable items
			templateData.checkbox.domNode.style.display = 'none';
		} else {
			templateData.checkbox.domNode.style.display = '';
			templateData.checkbox.checked = quickTreeItem.checked ?? false;
			store.add(Event.filter(this.onCheckedEvent, e => e.item === quickTreeItem)(e => templateData.checkbox.checked = e.checked));
			if (quickTreeItem.disabled) {
				templateData.checkbox.disable();
			}
		}

		// Icon
		if (quickTreeItem.iconPath) {
			const icon = isDark(this._themeService.getColorTheme().type) ? quickTreeItem.iconPath.dark : (quickTreeItem.iconPath.light ?? quickTreeItem.iconPath.dark);
			const iconUrl = URI.revive(icon);
			templateData.icon.className = 'quick-input-tree-icon';
			templateData.icon.style.backgroundImage = cssJs.asCSSUrl(iconUrl);
		} else {
			templateData.icon.style.backgroundImage = '';
			templateData.icon.className = quickTreeItem.iconClass ? `quick-input-tree-icon ${quickTreeItem.iconClass}` : '';
		}

		const { labelHighlights: matches, descriptionHighlights: descriptionMatches } = node.filterData || {};

		// Label and Description
		let descriptionTitle: IManagedHoverTooltipMarkdownString | undefined;
		// NOTE: If we bring back quick tool tips, we need to check that here like we do in the QuickInputListRenderer
		if (quickTreeItem.description) {
			descriptionTitle = {
				markdown: {
					value: escape(quickTreeItem.description),
					supportThemeIcons: true
				},
				markdownNotSupportedFallback: quickTreeItem.description
			};
		}
		templateData.label.setLabel(
			quickTreeItem.label,
			quickTreeItem.description,
			{
				matches,
				descriptionMatches,
				extraClasses: quickTreeItem.iconClasses,
				italic: quickTreeItem.italic,
				strikethrough: quickTreeItem.strikethrough,
				labelEscapeNewLines: true,
				descriptionTitle
			}
		);

		// Action Bar
		const buttons = quickTreeItem.buttons;
		if (buttons && buttons.length) {
			templateData.actionBar.push(buttons.map((button, index) => quickInputButtonToAction(
				button,
				`tree-${index}`,
				() => this._buttonTriggeredEmitter.fire({ item: quickTreeItem, button })
			)), { icon: true, label: false });
			templateData.entry.classList.add('has-actions');
		} else {
			templateData.entry.classList.remove('has-actions');
		}
	}
	disposeElement(_element: ITreeNode<T, IQuickTreeFilterData>, _index: number, templateData: IQuickTreeTemplateData, _details?: ITreeElementRenderDetails): void {
		templateData.toDisposeElement.clear();
		templateData.actionBar.clear();
	}
	disposeTemplate(templateData: IQuickTreeTemplateData): void {
		templateData.toDisposeElement.dispose();
		templateData.toDisposeTemplate.dispose();
	}
}
