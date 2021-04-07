/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IListService, WorkbenchObjectTree } from 'vs/platform/list/browser/listService';
import { ITreeElement, ITreeNode, ITreeRenderer } from 'vs/base/browser/ui/tree/tree';
import { DefaultStyleController, IListAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IIdentityProvider } from 'vs/base/browser/ui/list/list';
import { ITerminalInstance, ITerminalService, ITerminalTab } from 'vs/workbench/contrib/terminal/browser/terminal';
import { localize } from 'vs/nls';
import * as DOM from 'vs/base/browser/dom';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Codicon } from 'vs/base/common/codicons';

const $ = DOM.$;

export class TerminalTabsWidget extends WorkbenchObjectTree<TabTreeNode>  {
	private _terminalService: ITerminalService;
	constructor(
		container: HTMLElement,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService listService: IListService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@ITerminalService terminalService: ITerminalService,
		@IInstantiationService _instantiationService: IInstantiationService
	) {
		super('TerminalTabsTree', container,
			{
				getHeight: () => 24,
				getTemplateId: () => 'terminal.tabs'
			},
			[new TerminalTabsRenderer()],
			{
				horizontalScrolling: false,
				supportDynamicHeights: true,
				identityProvider: new TerminalTabsIdentityProvider(),
				accessibilityProvider: new TerminalTabsAccessibilityProvider(),
				styleController: id => new DefaultStyleController(DOM.createStyleSheet(container), id),
				filter: undefined,
				smoothScrolling: configurationService.getValue<boolean>('workbench.list.smoothScrolling'),
				multipleSelectionSupport: false,
				// TODO: Add indent guides?
				expandOnlyOnTwistieClick: true
			},
			contextKeyService,
			listService,
			themeService,
			configurationService,
			keybindingService,
			accessibilityService,
		);
		this.onDidChangeSelection(e => {
			if (e.elements && e.elements[0]) {
				if ('tab' in e.elements[0]) {
					terminalService.setActiveTabByIndex(terminalService.terminalTabs.indexOf(e.elements[0].tab));
				} else {
					e.elements[0].focus(true);
				}
			}
		});
		this._terminalService = terminalService;

		terminalService.onInstancesChanged(() => this._render());
		terminalService.onInstanceTitleChanged(() => this._render());

		this._render();
	}

	private _render(): void {
		// TODO: We don't want to be setting children to undefined - a terminal being killed should not remove focus in the tab view
		this.setChildren(null, createTerminalTabsIterator(this._terminalService.terminalTabs));
	}
}

class TerminalTabsIdentityProvider implements IIdentityProvider<TabTreeNode> {
	constructor() {
	}
	getId(element: TabTreeNode): { toString(): string; } {
		if ('tab' in element) {
			return element.tab.title;
		} else {
			return element.instanceId;
		}
	}

}
class TerminalTabsAccessibilityProvider implements IListAccessibilityProvider<TabTreeNode> {
	getAriaLabel(element: TabTreeNode) {
		if ('tab' in element) {
			return element.tab ? element.tab.terminalInstances.length > 1 ? `Terminals (${element.tab.terminalInstances.length})` : element.tab.terminalInstances[0].title : '';
		} else {
			return element.title;
		}
	}

	getWidgetAriaLabel() {
		return localize('terminal.tabs', "TerminalTabs");
	}
}

class TerminalTabsRenderer implements ITreeRenderer<TabTreeNode, never, ITerminalTabEntryTemplate> {

	templateId = 'terminal.tabs';

	renderTemplate(container: HTMLElement): ITerminalTabEntryTemplate {
		return {
			labelElement: DOM.append(container, $('.terminal-tabs-entry')),
		};
	}

	renderElement(node: ITreeNode<TabTreeNode>, index: number, template: ITerminalTabEntryTemplate): void {
		let label = '';
		let icon;
		let item = node.element;
		if ('children' in item) {
			label = item
				? item.children.length === 0
					? 'Starting...'
					: item?.children.length > 1
						? `Terminals (${item.children.length})`
						: item.children[0].title
				: '';
		} else {
			label = item.title;
		}
		template.labelElement.textContent = label;
		template.labelElement.title = label;
		template.icon = icon;
	}

	disposeTemplate(templateData: ITerminalTabEntryTemplate): void {
	}
}

interface ITerminalTabEntryTemplate {
	labelElement: HTMLElement;
	icon?: Codicon;
}

type TabTreeNode = TabTreeElement | ITerminalInstance;

// TODO: Remove in favor of ITerminalTab
class TabTreeElement {
	private _tab: ITerminalTab;
	private _children: ITerminalInstance[];
	constructor(tab: ITerminalTab) {
		this._tab = tab;
		this._children = this._tab.terminalInstances;
	}
	get tab(): ITerminalTab {
		return this._tab;
	}
	get children(): ITerminalInstance[] {
		return this._children;
	}
	set children(newChildren: ITerminalInstance[]) {
		this._children = newChildren;
	}
}

function createTerminalTabsIterator(tabs: ITerminalTab[]): Iterable<ITreeElement<TabTreeNode>> {
	const result = tabs.map(tab => {
		const hasChildren = tab.terminalInstances.length > 1;
		const elt = new TabTreeElement(tab);
		return {
			element: elt,
			collapsed: false,
			collapsible: hasChildren,
			children: getChildren(elt)
		};
	});
	return result;
}

function getChildren(elt: TabTreeElement): Iterable<ITreeElement<ITerminalInstance>> | undefined {
	if (elt.children.length > 1) {
		return elt.children.map(child => {
			return {
				element: child,
				collapsed: true,
				collapsible: false,
			};
		});
	}
	return undefined;
}
