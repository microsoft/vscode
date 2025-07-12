/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cssJs from '../../../../base/browser/cssValue.js';
import * as dom from '../../../../base/browser/dom.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { AriaRole } from '../../../../base/browser/ui/aria/aria.js';
import type { IManagedHoverTooltipMarkdownString } from '../../../../base/browser/ui/hover/hover.js';
import { IHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegate.js';
import { IIconLabelValueOptions, IconLabel } from '../../../../base/browser/ui/iconLabel/iconLabel.js';
import { KeybindingLabel } from '../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { IListAccessibilityProvider } from '../../../../base/browser/ui/list/listWidget.js';
import { QuickTreeCheckbox, QuickTreeCheckboxManager, IQuickTreeCheckboxChangeEvent } from './quickTreeCheckbox.js';
import { ITreeNode, ITreeRenderer } from '../../../../base/browser/ui/tree/tree.js';
import { IValueWithChangeEvent } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { OS } from '../../../../base/common/platform.js';
import { escape } from '../../../../base/common/strings.js';
import { URI } from '../../../../base/common/uri.js';
import { isDark } from '../../../theme/common/theme.js';
import { IThemeService } from '../../../theme/common/themeService.js';
import { IQuickTreeItem, TreeItemCollapsibleState } from '../../common/quickInput.js';
import { quickInputButtonToAction } from '../quickInputUtils.js';

const $ = dom.$;

export interface IQuickTreeTemplateData {
	entry: HTMLElement;
	checkboxContainer: HTMLElement;
	checkbox?: QuickTreeCheckbox;
	icon: HTMLDivElement;
	outerLabel: HTMLElement;
	label: IconLabel;
	keybinding: KeybindingLabel;
	detail: IconLabel;
	actionBar: ActionBar;
	element: IQuickTreeItem;
	toDisposeElement: DisposableStore;
	toDisposeTemplate: DisposableStore;
}

export interface IQuickTreeRenderOptions {
	readonly indent: number;
	readonly hasCheckbox: boolean;
	readonly hoverDelegate?: IHoverDelegate;
}

/**
 * Renderer for QuickTree items that handles expansion controls, checkboxes, and item layout.
 */
export class QuickTreeRenderer<T extends IQuickTreeItem> extends Disposable implements ITreeRenderer<T, void, IQuickTreeTemplateData> {
	static readonly ID = 'quicktree-item';

	private readonly checkboxManager = this._register(new QuickTreeCheckboxManager());

	constructor(
		private readonly options: IQuickTreeRenderOptions,
		@IThemeService private readonly themeService: IThemeService,
	) {
		super();
		this._register(this.checkboxManager.onDidChangeCheckboxState(changes => {
			this.handleCheckboxChanges(changes);
		}));
	}

	get templateId(): string {
		return QuickTreeRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IQuickTreeTemplateData {
		const data: IQuickTreeTemplateData = Object.create(null);
		data.toDisposeElement = new DisposableStore();
		data.toDisposeTemplate = new DisposableStore();

		// Main entry container
		data.entry = dom.append(container, $('.quick-tree-entry'));

		// Checkbox container (dedicated)
		data.checkboxContainer = dom.append(data.entry, $('.quick-tree-checkbox-container'));

		// Label container
		const label = dom.append(data.entry, $('label.quick-tree-label'));
		data.outerLabel = label;

		// Handle row click for checkbox toggling (when enabled)
		data.toDisposeTemplate.add(dom.addStandardDisposableListener(data.entry, dom.EventType.CLICK, e => {
			// Only handle if this tree has checkboxes enabled
			if (this.options.hasCheckbox && data.checkbox && !e.defaultPrevented) {
				const target = e.target as HTMLElement;

				// Don't trigger if click is directly on checkbox (it handles itself)
				// Check for checkbox container, the toggle component, or any checkbox-related classes
				if (data.checkboxContainer.contains(target) ||
					target.classList.contains('monaco-checkbox') ||
					target.classList.contains('quick-tree-checkbox') ||
					target.closest('.monaco-checkbox') ||
					target.closest('.quick-tree-checkbox-container')) {
					return;
				}

				e.stopPropagation();
				e.preventDefault();

				// Toggle the element's checkbox state
				const element = data.element as T;
				if (element) {
					// Initialize checked property if it doesn't exist
					if (!('checked' in element)) {
						(element as any).checked = false;
					}
					const newState = element.checked === true ? false : true;
					this.handleCheckboxClick(element, newState);
				}
			}
		}));

		// Content rows
		const rows = dom.append(label, $('.quick-tree-rows'));
		const row1 = dom.append(rows, $('.quick-tree-row'));
		const row2 = dom.append(rows, $('.quick-tree-row'));

		// Icon and label
		data.icon = dom.prepend(row1, $('.quick-tree-icon'));
		data.label = new IconLabel(row1, {
			supportHighlights: true,
			supportDescriptionHighlights: true,
			supportIcons: true,
			hoverDelegate: this.options.hoverDelegate
		});
		data.toDisposeTemplate.add(data.label);

		// Keybinding
		const keybindingContainer = dom.append(row1, $('.quick-tree-keybinding'));
		data.keybinding = new KeybindingLabel(keybindingContainer, OS);
		data.toDisposeTemplate.add(data.keybinding);

		// Detail
		const detailContainer = dom.append(row2, $('.quick-tree-detail'));
		data.detail = new IconLabel(detailContainer, {
			supportHighlights: true,
			supportIcons: true,
			hoverDelegate: this.options.hoverDelegate
		});
		data.toDisposeTemplate.add(data.detail);

		// Actions
		data.actionBar = new ActionBar(data.entry, this.options.hoverDelegate ? { hoverDelegate: this.options.hoverDelegate } : undefined);
		data.actionBar.domNode.classList.add('quick-tree-action-bar');
		data.toDisposeTemplate.add(data.actionBar);

		return data;
	}

	renderElement(node: ITreeNode<T, void>, _index: number, templateData: IQuickTreeTemplateData): void {
		const element = node.element;
		templateData.element = element;

		// Render checkbox if enabled (do this first to determine layout)
		this.renderCheckbox(element, templateData);

		// Set indentation based on tree depth and checkbox presence
		const indent = node.depth * this.options.indent;
		templateData.entry.style.paddingLeft = `${indent}px`;

		// Render icon
		this.renderIcon(element, templateData);

		// Render label and description
		this.renderLabel(element, templateData);

		// Render keybinding
		templateData.keybinding.set(element.keybinding);

		// Render detail
		this.renderDetail(element, templateData);

		// Render actions
		this.renderActions(element, templateData);

		// Set accessibility attributes
		this.setAccessibilityAttributes(element, node, templateData);
	}


	private renderCheckbox(element: T, templateData: IQuickTreeTemplateData): void {
		if (!this.options.hasCheckbox) {
			// Clean up any existing checkbox
			if (templateData.checkbox) {
				templateData.checkbox.dispose();
				templateData.checkbox = undefined;
			}
			dom.clearNode(templateData.checkboxContainer);
			templateData.entry.classList.remove('has-checkbox');
			return;
		}

		// Always dispose existing checkbox first to prevent accumulation
		if (templateData.checkbox) {
			templateData.checkbox.dispose();
			templateData.checkbox = undefined;
		}

		// Clear container before creating new checkbox
		dom.clearNode(templateData.checkboxContainer);

		// Create new checkbox
		templateData.checkbox = new QuickTreeCheckbox(
			templateData.checkboxContainer,
			this.options.hoverDelegate
		);
		templateData.toDisposeElement.add(templateData.checkbox);

		// Handle direct checkbox clicks
		templateData.toDisposeElement.add(templateData.checkbox.onDidChange(event => {
			this.handleCheckboxClick(event.element as T, event.checked);
		}));

		// Render the checkbox for this element
		templateData.checkbox.render(element as IQuickTreeItem);

		// Add CSS class to indicate this entry has a checkbox
		templateData.entry.classList.add('has-checkbox');
	}

	private renderIcon(element: T, templateData: IQuickTreeTemplateData): void {
		if (element.iconPath) {
			const icon = isDark(this.themeService.getColorTheme().type) ? element.iconPath.dark : (element.iconPath.light ?? element.iconPath.dark);
			const iconUrl = URI.revive(icon);
			templateData.icon.className = 'quick-tree-icon';
			templateData.icon.style.backgroundImage = cssJs.asCSSUrl(iconUrl);
		} else {
			templateData.icon.style.backgroundImage = '';
			templateData.icon.className = element.iconClass ? `quick-tree-icon ${element.iconClass}` : '';
		}
	}

	private renderLabel(element: T, templateData: IQuickTreeTemplateData): void {
		const options: IIconLabelValueOptions = {
			matches: element.highlights?.label || [],
			descriptionMatches: element.highlights?.description || [],
			labelEscapeNewLines: true
		};

		options.extraClasses = element.iconClasses;
		options.italic = element.italic;
		options.strikethrough = element.strikethrough;

		templateData.label.setLabel(element.label, element.description, options);
	}

	private renderDetail(element: T, templateData: IQuickTreeTemplateData): void {
		if (element.detail) {
			let title: IManagedHoverTooltipMarkdownString | undefined;
			if (!element.tooltip) {
				title = {
					markdown: {
						value: escape(element.detail),
						supportThemeIcons: true
					},
					markdownNotSupportedFallback: element.detail
				};
			}
			templateData.detail.element.style.display = '';
			templateData.detail.setLabel(element.detail, undefined, {
				matches: element.highlights?.detail,
				title,
				labelEscapeNewLines: true
			});
		} else {
			templateData.detail.element.style.display = 'none';
		}
	}

	private renderActions(element: T, templateData: IQuickTreeTemplateData): void {
		const buttons = element.buttons;
		if (buttons && buttons.length) {
			templateData.actionBar.push(buttons.map((button, index) => quickInputButtonToAction(
				button,
				`tree-${index}`,
				() => this.onButtonClick(element, button)
			)), { icon: true, label: false });
			templateData.entry.classList.add('has-actions');
		} else {
			templateData.entry.classList.remove('has-actions');
		}
	}

	private setAccessibilityAttributes(element: T, node: ITreeNode<T, void>, templateData: IQuickTreeTemplateData): void {
		// Set ARIA attributes for tree navigation
		templateData.entry.setAttribute('role', this.options.hasCheckbox ? 'checkbox' : 'treeitem');
		templateData.entry.setAttribute('aria-level', String(node.depth + 1));

		if (element.collapsibleState !== TreeItemCollapsibleState.None) {
			templateData.entry.setAttribute('aria-expanded', String(!node.collapsed));
		}

		if (this.options.hasCheckbox) {
			const checked = element.checked === true ? 'true' : element.checked === 'partial' ? 'mixed' : 'false';
			templateData.entry.setAttribute('aria-checked', checked);
		}

		// Set label for screen readers
		const ariaLabel = element.ariaLabel || [
			element.label,
			element.description,
			element.detail
		].filter(s => !!s).join(', ');

		templateData.entry.setAttribute('aria-label', ariaLabel);
	}

	disposeElement(_element: ITreeNode<T, void>, _index: number, templateData: IQuickTreeTemplateData): void {
		templateData.toDisposeElement.clear();
		templateData.actionBar.clear();

		// Ensure checkbox is properly disposed
		if (templateData.checkbox) {
			templateData.checkbox.dispose();
			templateData.checkbox = undefined;
		}

		// Clear container to prevent accumulation
		dom.clearNode(templateData.checkboxContainer);
		templateData.entry.classList.remove('has-checkbox');
	}

	disposeTemplate(templateData: IQuickTreeTemplateData): void {
		templateData.toDisposeElement.dispose();
		templateData.toDisposeTemplate.dispose();
		templateData.checkbox?.dispose();
	}

	// Checkbox event handling

	private handleCheckboxClick(element: T, checked: boolean): void {
		// Use our checkbox manager to handle cascading logic
		this.checkboxManager.handleCheckboxChange(
			{ element: element as IQuickTreeItem, checked },
			() => this.getAllElements()
		);
	}

	private handleCheckboxChanges(changes: IQuickTreeCheckboxChangeEvent[]): void {
		// Notify the QuickTree about all checkbox changes
		changes.forEach(change => {
			this.onCheckboxChange(change.element as T, change.checked);
		});
	}

	// Override points for QuickTree integration

	protected getAllElements(): IQuickTreeItem[] {
		// Override in QuickTree to provide all tree elements for cascading logic
		return [];
	}

	// Event handlers (to be overridden by QuickTree)

	protected onCheckboxChange(element: T, checked: boolean): void {
		// Override in QuickTree to handle checkbox changes
		(element as any).checked = checked;
	}

	protected onButtonClick(_element: T, _button: any): void {
		// Override in QuickTree to handle button clicks
		// Parameters prefixed with _ to indicate they're intentionally unused
	}
}

/**
 * Accessibility provider for QuickTree.
 */
export class QuickTreeAccessibilityProvider<T extends IQuickTreeItem> implements IListAccessibilityProvider<T> {

	getWidgetAriaLabel(): string {
		return 'Quick Tree';
	}

	getAriaLabel(element: T): string {
		return element.ariaLabel || [
			element.label,
			element.description,
			element.detail
		].filter(s => !!s).join(', ');
	}

	getWidgetRole(): AriaRole {
		return 'tree';
	}

	getRole(element: T): AriaRole {
		return element.checked !== undefined ? 'checkbox' : 'treeitem';
	}

	isChecked(element: T): IValueWithChangeEvent<boolean> | undefined {
		if (element.checked === undefined) {
			return undefined;
		}

		return {
			get value() { return element.checked === true; },
			onDidChange: () => {
				// This would need to be connected to the actual element's change event
				return { dispose: () => { } };
			},
		};
	}
}
