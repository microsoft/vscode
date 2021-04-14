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
import { IconLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { MenuItemAction } from 'vs/platform/actions/common/actions';
import { MenuEntryActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { TERMINAL_COMMAND_ID } from 'vs/workbench/contrib/terminal/common/terminal';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { Codicon } from 'vs/base/common/codicons';

const $ = DOM.$;

export class TerminalTabsWidget extends WorkbenchObjectTree<ITabTreeNode>  {
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
		@IInstantiationService _instantiationService: IInstantiationService,
		@ICommandService _commandService: ICommandService,
		@IContextKeyService _contextKeyService: IContextKeyService
	) {

		super('TerminalTabsTree', container,
			{
				getHeight: () => 22,
				getTemplateId: () => 'terminal.tabs'
			},
			[_instantiationService.createInstance(TerminalTabsRenderer, container)],
			{
				horizontalScrolling: false,
				supportDynamicHeights: false,
				identityProvider: new TerminalTabsIdentityProvider(),
				accessibilityProvider: new TerminalTabsAccessibilityProvider(),
				styleController: id => new DefaultStyleController(DOM.createStyleSheet(container), id),
				filter: undefined,
				smoothScrolling: configurationService.getValue<boolean>('workbench.list.smoothScrolling'),
				multipleSelectionSupport: false,
				expandOnlyOnTwistieClick: true,
				selectionNavigation: true
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
				if ('terminalInstances' in e.elements[0]) {
					terminalService.setActiveTabByIndex(terminalService.terminalTabs.indexOf(e.elements[0]));
				} else {
					e.elements[0].focus(true);
				}
			}
		});

		this._terminalService = terminalService;

		terminalService.onInstancesChanged(() => this._render());
		terminalService.onInstanceTitleChanged(() => this._render());
		terminalService.onActiveTabChanged(() => {
			const selection = this.getSelection();
			const selectedTab = selection[0];
			const activeTab = terminalService.getActiveTab();
			if (!activeTab ||
				!selectedTab ||
				!('terminalInstances' in selectedTab) ||
				terminalService.terminalTabs.indexOf(selectedTab) === terminalService.activeTabIndex) {
				return;
			}
			this.setFocus([activeTab]);
			this.setSelection([activeTab]);
		});

		this.onDidChangeSelection(selection => {
			const instance = selection.elements[0];
			if (!instance ||
				!('instanceId' in instance)) {
				return;
			}
			const selectedTab = terminalService.getTabForInstance(instance);
			if (!selectedTab ||
				terminalService.terminalTabs.indexOf(selectedTab) === terminalService.activeTabIndex) {
				return;
			}
			this.setFocus([selectedTab]);
			this.setSelection([selectedTab]);
		});
	}

	private _render(): void {
		this.setChildren(null, createTerminalTabsIterator(this._terminalService.terminalTabs));
	}
}

class TerminalTabsIdentityProvider implements IIdentityProvider<ITabTreeNode> {
	constructor() {
	}
	getId(element: ITabTreeNode): { toString(): string; } {
		if ('terminalInstances' in element) {
			return element.title;
		} else {
			return element.instanceId;
		}
	}

}
class TerminalTabsAccessibilityProvider implements IListAccessibilityProvider<ITabTreeNode> {
	getAriaLabel(node: ITabTreeNode) {
		let label = '';
		if ('terminalInstances' in node) {
			if (node.terminalInstances.length === 1) {
				label = node.terminalInstances[0].title;
			} else if (node.terminalInstances.length > 1) {
				label = `Terminals (${node.terminalInstances.length})`;
			}
		} else {
			label = node.title;
		}
		return label;
	}

	getWidgetAriaLabel() {
		return localize('terminal.tabs', "TerminalTabs");
	}
}

class TerminalTabsRenderer implements ITreeRenderer<ITabTreeNode, never, ITerminalTabEntryTemplate> {
	templateId = 'terminal.tabs';
	constructor(
		private readonly _container: HTMLElement,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ICommandService private readonly _commandService: ICommandService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@ITerminalService private readonly _terminalService: ITerminalService
	) {
	}

	renderTemplate(container: HTMLElement): ITerminalTabEntryTemplate {
		(container.parentElement!.parentElement!.querySelector('.monaco-tl-twistie')! as HTMLElement).classList.add('force-no-twistie');

		const element = DOM.append(container, $('.terminal-tabs-entry'));

		const label = new IconLabel(element, { supportHighlights: true, supportDescriptionHighlights: true, supportIcons: true });
		const actionsContainer = DOM.append(label.element, $('.actions'));

		const actionBar = new ActionBar(actionsContainer, {
			actionViewItemProvider: action =>
				action instanceof MenuItemAction
					? this._instantiationService.createInstance(MenuEntryActionViewItem, action)
					: undefined
		});

		return { element, label, actionBar };
	}

	shouldHideText(): boolean {
		return this._container ? this._container.clientWidth < 124 : false;
	}

	renderElement(node: ITreeNode<ITabTreeNode>, index: number, template: ITerminalTabEntryTemplate): void {
		let label = '';
		let item = node.element;
		const hasText = !this.shouldHideText();
		template.element.classList.toggle('has-text', hasText);
		if (!hasText) {
			if ('terminalInstances' in item) {
				if (item.terminalInstances.length === 1) {
					const instance = item.terminalInstances[0];
					label = `$(${instance.icon.id})`;
				} else if (item.terminalInstances.length > 1) {
					label = `Tab (${item.terminalInstances.length})`;
				}
			} else {
				const tab = this._terminalService.getTabForInstance(item);
				const terminalIndex = tab?.terminalInstances.indexOf(item);
				if (terminalIndex === 0) {
					label = `┌ $(${item.icon.id})`;
				} else if (terminalIndex === tab!.terminalInstances.length - 1) {
					label = `└ $(${item.icon.id})`;
				} else {
					label = `├ $(${item.icon.id})`;
				}
			}
			template.actionBar.clear();
			template.label.setLabel(label);
			return;
		}
		if ('terminalInstances' in item) {
			if (item.terminalInstances.length === 1) {
				const instance = item.terminalInstances[0];
				label = `$(${instance.icon.id}) ${instance.title}`;
				this.fillActionBar(template);
			} else if (item.terminalInstances.length > 1) {
				label = `Tab (${item.terminalInstances.length})`;
				template.actionBar.clear();
			}
		} else {
			const tab = this._terminalService.getTabForInstance(item);
			const terminalIndex = tab?.terminalInstances.indexOf(item);
			if (terminalIndex === 0) {
				label = `┌ $(${item.icon.id}) ${item.title}`;
			} else if (terminalIndex === tab!.terminalInstances.length - 1) {
				label = `└ $(${item.icon.id}) ${item.title}`;
			} else {
				label = `├ $(${item.icon.id}) ${item.title}`;
			}
			this.fillActionBar(template);
		}
		template.label.setLabel(label);
	}

	disposeTemplate(templateData: ITerminalTabEntryTemplate): void {
	}

	fillActionBar(template: ITerminalTabEntryTemplate): void {
		const rename = new MenuItemAction({ id: TERMINAL_COMMAND_ID.RENAME, title: localize('terminal.rename', "Rename"), icon: Codicon.tag }, undefined, undefined, this._contextKeyService, this._commandService);
		const split = new MenuItemAction({ id: TERMINAL_COMMAND_ID.SPLIT, title: localize('terminal.split', "Split"), icon: Codicon.splitHorizontal }, undefined, undefined, this._contextKeyService, this._commandService);
		const kill = new MenuItemAction({ id: TERMINAL_COMMAND_ID.KILL, title: localize('terminal.kill', "Kill"), icon: Codicon.trashcan }, undefined, undefined, this._contextKeyService, this._commandService);
		if (template.actionBar.viewItems.length === 0) {
			template.actionBar.push(rename, { icon: true, label: false });
			template.actionBar.push(split, { icon: true, label: false });
			template.actionBar.push(kill, { icon: true, label: false });
		}
	}
}

interface ITerminalTabEntryTemplate {
	element: HTMLElement;
	label: IconLabel;
	actionBar: ActionBar;
}

type ITabTreeNode = ITerminalTab | ITerminalInstance;

function createTerminalTabsIterator(tabs: ITerminalTab[]): Iterable<ITreeElement<ITabTreeNode>> {
	const result = tabs.map(tab => {
		const hasChildren = tab.terminalInstances.length > 1;
		return {
			element: tab,
			collapsed: false,
			collapsible: hasChildren,
			children: getChildren(tab)
		};
	});
	return result;
}

function getChildren(tab: ITerminalTab): Iterable<ITreeElement<ITerminalInstance>> | undefined {
	if (tab.terminalInstances.length > 1) {
		return tab.terminalInstances.map(instance => {
			return {
				element: instance,
				collapsed: true,
				collapsible: false
			};
		});
	}
	return undefined;
}
