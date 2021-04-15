/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IListService, WorkbenchObjectTree } from 'vs/platform/list/browser/listService';
import { ITreeNode, ITreeRenderer } from 'vs/base/browser/ui/tree/tree';
import { DefaultStyleController } from 'vs/base/browser/ui/list/listWidget';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IThemeService, ThemeIcon } from 'vs/platform/theme/common/themeService';
import { ITerminalInstance, ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { localize } from 'vs/nls';
import * as DOM from 'vs/base/browser/dom';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IconLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { MenuItemAction } from 'vs/platform/actions/common/actions';
import { MenuEntryActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { TERMINAL_COMMAND_ID } from 'vs/workbench/contrib/terminal/common/terminal';
import { Codicon } from 'vs/base/common/codicons';
import { Action } from 'vs/base/common/actions';
import { IHoverService } from 'vs/workbench/services/hover/browser/hover';
import { MarkdownString } from 'vs/base/common/htmlContent';

const $ = DOM.$;

export class TerminalTabsWidget extends WorkbenchObjectTree<ITerminalInstance>  {
	constructor(
		container: HTMLElement,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService listService: IListService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super('TerminalTabsTree', container,
			{
				getHeight: () => 22,
				getTemplateId: () => 'terminal.tabs'
			},
			[instantiationService.createInstance(TerminalTabsRenderer, container)],
			{
				horizontalScrolling: false,
				supportDynamicHeights: false,
				identityProvider: {
					getId: e => e.instanceId
				},
				accessibilityProvider: {
					getAriaLabel: e => e.title,
					getWidgetAriaLabel: () => localize('terminal.tabs', "Terminal tabs")
				},
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

		this._terminalService.onInstancesChanged(() => this._render());
		this._terminalService.onInstanceTitleChanged(() => this._render());
		this._terminalService.onActiveInstanceChanged(e => {
			if (e) {
				this.setSelection([e]);
				this.reveal(e);
			}
		});
		this.onDidOpen(async e => {
			const instance = e.element;
			if (!instance) {
				return;
			}
			this._terminalService.setActiveInstance(instance);
			if (!e.editorOptions.preserveFocus) {
				await instance.focusWhenReady();
			}
		});
	}

	private _render(): void {
		this.setChildren(null, this._terminalService.terminalInstances.map(instance => {
			return {
				element: instance,
				collapsed: true,
				collapsible: false
			};
		}));
	}
}

class TerminalTabsRenderer implements ITreeRenderer<ITerminalInstance, never, ITerminalTabEntryTemplate> {
	templateId = 'terminal.tabs';

	constructor(
		private readonly _container: HTMLElement,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IHoverService private readonly _hoverService: IHoverService,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
	}

	renderTemplate(container: HTMLElement): ITerminalTabEntryTemplate {
		(container.parentElement!.parentElement!.querySelector('.monaco-tl-twistie')! as HTMLElement).classList.add('force-no-twistie');

		const element = DOM.append(container, $('.terminal-tabs-entry'));

		const label = new IconLabel(element, {
			supportHighlights: true,
			supportDescriptionHighlights: true,
			supportIcons: true,
			hoverDelegate: {
				delay: this._configurationService.getValue<number>('workbench.hover.delay'),
				showHover: e => this._hoverService.showHover(e)
			}
		});
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

	renderElement(node: ITreeNode<ITerminalInstance>, index: number, template: ITerminalTabEntryTemplate): void {
		let instance = node.element;

		const tab = this._terminalService.getTabForInstance(instance);
		if (!tab) {
			throw new Error(`Could not find tab for instance "${instance.instanceId}"`);
		}

		const hasText = !this.shouldHideText();
		template.element.classList.toggle('has-text', hasText);

		let prefix: string = '';
		if (tab.terminalInstances.length > 1) {
			const terminalIndex = tab?.terminalInstances.indexOf(instance);
			if (terminalIndex === 0) {
				prefix = `┌ `;
			} else if (terminalIndex === tab!.terminalInstances.length - 1) {
				prefix = `└ `;
			} else {
				prefix = `├ `;
			}
		}

		let title = instance.title;
		const statuses = instance.statusList.statuses;
		if (statuses.length) {
			title += `\n\n---\n\nStatuses:`;
			title += statuses.map(e => `\n- ${e.id}`);
		}

		let label: string;
		if (!hasText) {
			template.actionBar.clear();
			label = `${prefix}$(${instance.icon.id})`;
		} else {
			this.fillActionBar(instance, template);
			label = `${prefix}$(${instance.icon.id}) ${instance.title}`;
		}

		template.label.setLabel(label, undefined, {
			title: {
				markdown: new MarkdownString(title),
				markdownNotSupportedFallback: undefined
			}
		});
	}

	disposeTemplate(templateData: ITerminalTabEntryTemplate): void {
	}

	fillActionBar(instance: ITerminalInstance, template: ITerminalTabEntryTemplate): void {
		const rename = new Action(TERMINAL_COMMAND_ID.RENAME, localize('terminal.rename', "Rename"), ThemeIcon.asClassName(Codicon.tag), true, () => instance.rename());
		const split = new Action(TERMINAL_COMMAND_ID.SPLIT, localize('terminal.split', "Split"), ThemeIcon.asClassName(Codicon.splitHorizontal), true, async () => this._terminalService.splitInstance(instance));
		const kill = new Action(TERMINAL_COMMAND_ID.KILL, localize('terminal.kill', "Kill"), ThemeIcon.asClassName(Codicon.trashcan), true, async () => instance.dispose(true));
		// TODO: Cache these in a way that will use the correct instance
		template.actionBar.clear();
		template.actionBar.push(rename, { icon: true, label: false });
		template.actionBar.push(split, { icon: true, label: false });
		template.actionBar.push(kill, { icon: true, label: false });
	}
}

interface ITerminalTabEntryTemplate {
	element: HTMLElement;
	label: IconLabel;
	actionBar: ActionBar;
}
