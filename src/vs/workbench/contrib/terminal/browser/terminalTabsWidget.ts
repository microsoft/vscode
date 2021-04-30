/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IListService, WorkbenchObjectTree } from 'vs/platform/list/browser/listService';
import { ITreeNode, ITreeRenderer } from 'vs/base/browser/ui/tree/tree';
import { DefaultStyleController } from 'vs/base/browser/ui/list/listWidget';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ITerminalInstance, ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { localize } from 'vs/nls';
import * as DOM from 'vs/base/browser/dom';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { IMenu, MenuItemAction } from 'vs/platform/actions/common/actions';
import { MenuEntryActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { KEYBINDING_CONTEXT_TERMINAL_TABS_SINGULAR_SELECTION, TERMINAL_COMMAND_ID } from 'vs/workbench/contrib/terminal/common/terminal';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { TerminalDecorationsProvider } from 'vs/workbench/contrib/terminal/browser/terminalDecorationsProvider';
import { DEFAULT_LABELS_CONTAINER, IResourceLabel, ResourceLabels } from 'vs/workbench/browser/labels';
import { IDecorationsService } from 'vs/workbench/services/decorations/browser/decorations';
import { IHoverAction, IHoverService } from 'vs/workbench/services/hover/browser/hover';
import Severity from 'vs/base/common/severity';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { Codicon } from 'vs/base/common/codicons';

const $ = DOM.$;
const TAB_HEIGHT = 22;
export const MIN_TABS_WIDGET_WIDTH = 46;
export const DEFAULT_TABS_WIDGET_WIDTH = 80;
export const MIDPOINT_WIDGET_WIDTH = (MIN_TABS_WIDGET_WIDTH + DEFAULT_TABS_WIDGET_WIDTH) / 2;

export class TerminalTabsWidget extends WorkbenchObjectTree<ITerminalInstance>  {
	private _decorationsProvider: TerminalDecorationsProvider | undefined;
	private _terminalTabsSingleSelectedContextKey: IContextKey<boolean>;

	constructor(
		container: HTMLElement,
		inlineMenu: IMenu,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService listService: IListService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IDecorationsService _decorationsService: IDecorationsService
	) {
		super('TerminalTabsTree', container,
			{
				getHeight: () => TAB_HEIGHT,
				getTemplateId: () => 'terminal.tabs'
			},
			[instantiationService.createInstance(TerminalTabsRenderer, container, inlineMenu, instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER))],
			{
				horizontalScrolling: false,
				supportDynamicHeights: false,
				identityProvider: {
					getId: e => e?.instanceId
				},
				accessibilityProvider: {
					getAriaLabel: e => e?.title,
					getWidgetAriaLabel: () => localize('terminal.tabs', "Terminal tabs")
				},
				styleController: id => new DefaultStyleController(DOM.createStyleSheet(container), id),
				filter: undefined,
				smoothScrolling: configurationService.getValue<boolean>('workbench.list.smoothScrolling'),
				multipleSelectionSupport: true,
				expandOnlyOnTwistieClick: true,
				selectionNavigation: true,
				additionalScrollHeight: TAB_HEIGHT
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

		this.onMouseDblClick(async () => {
			if (this.getFocus().length === 0) {
				const instance = this._terminalService.createTerminal();
				this._terminalService.setActiveInstance(instance);
				await instance.focusWhenReady();
			}
		});

		this.onMouseClick(e => {
			// If focus mode is single click focus the element unless a multi-select in happening
			const focusMode = configurationService.getValue<'singleClick' | 'doubleClick'>('terminal.integrated.tabs.focusMode');
			if (focusMode === 'singleClick') {
				if (this.getSelection().length <= 1) {
					e.element?.focus(true);
				}
			}
		});

		// Set the selection to whatever is right clicked if it is not inside the selection
		this.onContextMenu(e => {
			if (!e.element) {
				this.setSelection([null]);
				return;
			}
			const selection = this.getSelection();
			if (!selection || !selection.find(s => e.element === s)) {
				this.setSelection([e.element]);
			}
		});

		this._terminalTabsSingleSelectedContextKey = KEYBINDING_CONTEXT_TERMINAL_TABS_SINGULAR_SELECTION.bindTo(contextKeyService);

		this.onDidChangeSelection(e => {
			this._terminalTabsSingleSelectedContextKey.set(e.elements.length === 1);
			if (this._terminalTabsSingleSelectedContextKey) {
				const instance = e.elements[0];
				if (!instance) {
					return;
				}
				this._terminalService.setActiveInstance(instance);
			}
		});

		this.onDidChangeFocus(e => {
			this._terminalTabsSingleSelectedContextKey.set(e.elements.length === 1);
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
		if (!this._decorationsProvider) {
			this._decorationsProvider = instantiationService.createInstance(TerminalDecorationsProvider);
			_decorationsService.registerDecorationsProvider(this._decorationsProvider);
		}
		this._terminalService.onInstancePrimaryStatusChanged(() => this._render());
		this._render();
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
		private readonly _inlineMenu: IMenu,
		private readonly _labels: ResourceLabels,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IHoverService private readonly _hoverService: IHoverService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService
	) {
	}

	renderTemplate(container: HTMLElement): ITerminalTabEntryTemplate {
		(container.parentElement!.parentElement!.querySelector('.monaco-tl-twistie')! as HTMLElement).classList.add('force-no-twistie');

		const element = DOM.append(container, $('.terminal-tabs-entry'));
		const context: { hoverActions?: IHoverAction[] } = {};
		const label = this._labels.create(element, {
			supportHighlights: true,
			supportDescriptionHighlights: true,
			supportIcons: true,
			hoverDelegate: {
				delay: this._configurationService.getValue<number>('workbench.hover.delay'),
				showHover: options => {
					return this._hoverService.showHover({
						...options,
						actions: context.hoverActions,
						hideOnHover: true
					});
				}
			}
		});

		const actionsContainer = DOM.append(label.element, $('.actions'));

		const actionBar = new ActionBar(actionsContainer, {
			actionViewItemProvider: action =>
				action instanceof MenuItemAction
					? this._instantiationService.createInstance(MenuEntryActionViewItem, action)
					: undefined
		});

		return {
			element,
			label,
			actionBar,
			context
		};
	}

	shouldHideText(): boolean {
		return this._container ? this._container.clientWidth < MIDPOINT_WIDGET_WIDTH : false;
	}

	renderElement(node: ITreeNode<ITerminalInstance>, index: number, template: ITerminalTabEntryTemplate): void {
		let instance = node.element;

		const tab = this._terminalService.getTabForInstance(instance);
		if (!tab) {
			throw new Error(`Could not find tab for instance "${instance.instanceId}"`);
		}

		const hasText = !this.shouldHideText();
		template.element.classList.toggle('has-text', hasText);

		let ariaLabel: string = '';
		let prefix: string = '';
		if (tab.terminalInstances.length > 1) {
			const terminalIndex = tab.terminalInstances.indexOf(instance);
			ariaLabel = localize({
				key: 'splitTerminalAriaLabel',
				comment: [
					`The terminal's ID`,
					`The terminal's title`,
					`The terminal's split number`,
					`The terminal group's total split number`
				]
			}, "Terminal {0} {1}, split {2} of {3}", instance.instanceId, instance.title, terminalIndex + 1, tab.terminalInstances.length);
			if (terminalIndex === 0) {
				prefix = `┌ `;
			} else if (terminalIndex === tab!.terminalInstances.length - 1) {
				prefix = `└ `;
			} else {
				prefix = `├ `;
			}
		} else {
			ariaLabel = localize({
				key: 'terminalAriaLabel',
				comment: [
					`The terminal's ID`,
					`The terminal's title`
				]
			}, "Terminal {0} {1}", instance.instanceId, instance.title);
		}

		let title = instance.title;
		const statuses = instance.statusList.statuses;
		template.context.hoverActions = [];
		for (const status of statuses) {
			title += `\n\n---\n\n${status.tooltip || status.id}`;
			if (status.hoverActions) {
				template.context.hoverActions.push(...status.hoverActions);
			}
		}

		let label: string;
		if (!hasText) {
			template.actionBar.clear();
			const primaryStatus = instance.statusList.primary;
			if (primaryStatus && primaryStatus.severity >= Severity.Warning) {
				label = `${prefix}$(${primaryStatus.icon?.id || instance.icon?.id})`;
				ariaLabel = '';
			} else {
				label = `${prefix}$(${instance.icon?.id})`;
			}
		} else {
			this.fillActionBar(instance, template);
			label = `${prefix}$(${instance.icon?.id})`;
			// Only add the title if the icon is set, this prevents the title jumping around for
			// example when launching with a ShellLaunchConfig.name and no icon
			if (instance.icon) {
				label += ` ${instance.title}`;
			}
		}

		if (!template.elementDispoables) {
			template.elementDispoables = new DisposableStore();
		}

		// Kill terminal on middle click
		template.elementDispoables.add(DOM.addDisposableListener(template.element, DOM.EventType.AUXCLICK, e => {
			if (e.button === 1/*middle*/) {
				instance.dispose();
			}
		}));

		// Set aria lable to expose split information to screen reader
		template.label.element.querySelector('.label-name')?.setAttribute('aria-label', ariaLabel);

		template.label.setResource({
			resource: instance.resource,
			name: label,
			description: hasText ? instance.shellLaunchConfig.description : undefined
		}, {
			fileDecorations: {
				colors: true,
				badges: hasText
			},
			title: {
				markdown: new MarkdownString(title),
				markdownNotSupportedFallback: undefined
			}
		});
	}

	disposeElement(element: ITreeNode<ITerminalInstance, any>, index: number, templateData: ITerminalTabEntryTemplate): void {
		templateData.elementDispoables?.dispose();
		templateData.elementDispoables = undefined;
	}

	disposeTemplate(templateData: ITerminalTabEntryTemplate): void {
	}

	fillActionBar(instance: ITerminalInstance, template: ITerminalTabEntryTemplate): void {
		// If the instance is within the selection, split all selected
		const actions = this._inlineMenu.getActions();
		// TODO: Cache these in a way that will use the correct instance
		template.actionBar.clear();
		for (const [, action] of actions) {
			for (const a of action) {
				a.item.icon = a.id === TERMINAL_COMMAND_ID.KILL_INSTANCE ? Codicon.trashcan : Codicon.splitHorizontal;
				if ('item' in a) {
					template.actionBar.push(a, { icon: true, label: false, keybinding: this._keybindingService.lookupKeybinding(a.id)?.getLabel() });
				}
			}
		}
	}
}

interface ITerminalTabEntryTemplate {
	element: HTMLElement;
	label: IResourceLabel;
	actionBar: ActionBar;
	context: {
		hoverActions?: IHoverAction[];
	};
	elementDispoables?: DisposableStore;
}
