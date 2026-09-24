/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { ActionBar, ActionsOrientation } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { ActionViewItem, IActionViewItemOptions } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IListRenderer } from '../../../../../base/browser/ui/list/list.js';
import { ITreeNode, ITreeRenderer } from '../../../../../base/browser/ui/tree/tree.js';
import { Action, IAction } from '../../../../../base/common/actions.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ChatConfiguration } from '../../common/constants.js';

const $ = DOM.$;

export const enum CustomizationListLayout {
	Tabs = 'tabs',
	Tree = 'tree',
}

export interface ICustomizationTreeGroup<T> {
	readonly id: string;
	readonly label: string;
	readonly description: string;
	readonly count: number;
	readonly element: T;
	readonly children: readonly T[];
}

export function getCustomizationListLayout(configurationService: IConfigurationService): CustomizationListLayout {
	return configurationService.getValue<CustomizationListLayout>(ChatConfiguration.ChatCustomizationsListLayout) ?? CustomizationListLayout.Tabs;
}

export function asTreeRenderer<T, TTemplateData>(renderer: IListRenderer<T, TTemplateData>): ITreeRenderer<T, void, TTemplateData> {
	return {
		templateId: renderer.templateId,
		renderTemplate: container => renderer.renderTemplate(container),
		renderElement: (node, index, templateData) => renderer.renderElement(node.element, index, templateData),
		disposeElement: renderer.disposeElement
			? (node, index, templateData) => renderer.disposeElement!(node.element, index, templateData)
			: undefined,
		disposeTemplate: templateData => renderer.disposeTemplate(templateData),
	};
}

export function getTreeNodeElement<T>(node: ITreeNode<T>): T {
	return node.element;
}

class CustomizationTabActionViewItem extends ActionViewItem {

	constructor(
		action: IAction,
		options: IActionViewItemOptions,
		private readonly count: number,
		private readonly description: string,
	) {
		super(undefined, action, options);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		if (!this.label) {
			return;
		}
		this.label.classList.add('customization-tree-tab');
		this.label.setAttribute('role', 'tab');
		this.label.setAttribute('aria-selected', String(this.action.checked === true));
		this.label.setAttribute('aria-description', this.description);
		const count = DOM.append(this.label, $('span.customization-tab-count.monaco-count-badge'));
		count.textContent = String(this.count);
	}

	protected override updateChecked(): void {
		super.updateChecked();
		this.label?.setAttribute('aria-selected', String(this.action.checked === true));
	}

	protected override updateAriaLabel(): void {
		this.label?.setAttribute(
			'aria-label',
			localize('customizationTabAriaLabel', "{0}, {1} items. {2}", this.action.label, this.count, this.description),
		);
	}
}

export class CustomizationTreeTabs extends Disposable {

	readonly element: HTMLElement;
	readonly actionsElement: HTMLElement;

	private readonly actionBar: ActionBar;
	private readonly tabDisposables = this._register(new DisposableStore());
	private readonly tabMetadata = new Map<string, { readonly count: number; readonly description: string }>();
	private readonly _onDidSelect = this._register(new Emitter<string>());
	readonly onDidSelect: Event<string> = this._onDidSelect.event;

	constructor(parent: HTMLElement, ariaLabel: string) {
		super();
		this.element = DOM.append(parent, $('.customization-tree-tabs'));
		const tabs = DOM.append(this.element, $('.customization-tree-tabs-list'));
		this.actionsElement = DOM.append(this.element, $('.customization-tree-tab-actions'));
		this.actionBar = this._register(new ActionBar(tabs, {
			orientation: ActionsOrientation.HORIZONTAL,
			focusOnlyEnabledItems: true,
			ariaLabel,
			ariaRole: 'tablist',
			actionViewItemProvider: (action, options) => {
				const metadata = this.tabMetadata.get(action.id);
				return metadata ? new CustomizationTabActionViewItem(action, options, metadata.count, metadata.description) : undefined;
			},
		}));
	}

	setGroups<T>(groups: readonly ICustomizationTreeGroup<T>[], selectedGroupId: string): void {
		this.actionBar.clear();
		this.tabDisposables.clear();
		this.tabMetadata.clear();
		const actions = groups.map(group => {
			const action = this.tabDisposables.add(new Action(
				`customization.group.${group.id}`,
				group.label,
				'customization-tree-tab',
				true,
				() => this._onDidSelect.fire(group.id),
			));
			action.checked = group.id === selectedGroupId;
			action.tooltip = group.description;
			this.tabMetadata.set(action.id, { count: group.count, description: group.description });
			return action;
		});
		this.actionBar.push(actions, { icon: false, label: true });
	}

	clearActions(): void {
		DOM.clearNode(this.actionsElement);
	}
}

export function getSelectedCustomizationGroup<T>(groups: readonly ICustomizationTreeGroup<T>[], selectedGroupId: string | undefined): ICustomizationTreeGroup<T> | undefined {
	return groups.find(group => group.id === selectedGroupId) ?? groups[0];
}

export function getCustomizationTreeAriaLabel(label: string, count: number, collapsed: boolean): string {
	return localize(
		'customizationTreeGroupAriaLabel',
		"{0}, {1} items, {2}",
		label,
		count,
		collapsed ? localize('collapsed', "collapsed") : localize('expanded', "expanded"),
	);
}
