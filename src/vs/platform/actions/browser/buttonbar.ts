/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../base/browser/dom.js';
import { ButtonBar, ButtonWithDropdown, IButton } from '../../../base/browser/ui/button/button.js';
import { createPixelSpinner } from '../../../base/browser/ui/pixelSpinner/pixelSpinner.js';
import './buttonbar.css';
import { createInstantHoverDelegate } from '../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { ActionRunner, IAction, IActionRunner, IRunEvent, SubmenuAction, WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from '../../../base/common/actions.js';
import { Codicon } from '../../../base/common/codicons.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { IMarkdownString } from '../../../base/common/htmlContent.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../base/common/observable.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { localize } from '../../../nls.js';
import { getActionBarActions } from './menuEntryActionViewItem.js';
import { IToolBarRenderOptions } from './toolbar.js';
import { MenuId, IMenuService, MenuItemAction, IMenuActionOptions } from '../common/actions.js';
import { IContextKeyService } from '../../contextkey/common/contextkey.js';
import { IContextMenuService } from '../../contextview/browser/contextView.js';
import { IHoverService } from '../../hover/browser/hover.js';
import { IKeybindingService } from '../../keybinding/common/keybinding.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { renderAsPlaintext } from '../../../base/browser/markdownRenderer.js';
import { stripIcons } from '../../../base/common/iconLabels.js';

export interface IButtonConfig {
	showIcon?: boolean;
	showLabel?: boolean;
	isSecondary?: boolean;
	customLabel?: string | IMarkdownString;
	customLabelObs?: IObservable<string | IMarkdownString | undefined>;
	customClass?: string;
	/**
	 * Renders an animated spinner ahead of the label, for a button whose work
	 * is currently in flight rather than waiting to be started.
	 *
	 * The spinner occupies the button's leading slot. Where the button renders
	 * an icon at rest — `showIcon` with an action that carries one — the spinner
	 * takes that icon's place rather than adding to it, so the button keeps its
	 * width while its work runs. A button with nothing in that slot at rest
	 * grows by the width of the spinner instead.
	 */
	showSpinner?: boolean;
}

export type IButtonConfigProvider = (action: IAction, index: number) => IButtonConfig | undefined;

export interface IWorkbenchButtonBarOptions {
	telemetrySource?: string;
	buttonConfigProvider?: IButtonConfigProvider;
	small?: boolean;
	disableWhileRunning?: boolean;
	renderSecondaryActions?: boolean;
}

export class WorkbenchButtonBar extends ButtonBar {

	protected readonly _store = new DisposableStore();
	protected readonly _updateStore = new DisposableStore();

	private readonly _actionRunner: IActionRunner;
	private readonly _onDidChange = new Emitter<this>();
	readonly onDidChange: Event<this> = this._onDidChange.event;

	get onWillRun(): Event<IRunEvent> { return this._actionRunner.onWillRun; }
	get onDidRun(): Event<IRunEvent> { return this._actionRunner.onDidRun; }

	constructor(
		container: HTMLElement,
		private readonly _options: IWorkbenchButtonBarOptions | undefined,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IHoverService private readonly _hoverService: IHoverService,
	) {
		super(container);

		this._actionRunner = this._store.add(new ActionRunner());
		if (_options?.telemetrySource) {
			this._actionRunner.onDidRun(e => {
				telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>(
					'workbenchActionExecuted',
					{ id: e.action.id, from: _options.telemetrySource! }
				);
			}, undefined, this._store);
		}
	}

	override dispose() {
		this._onDidChange.dispose();
		this._updateStore.dispose();
		this._store.dispose();
		super.dispose();
	}

	update(actions: IAction[], secondary: IAction[]): void {

		const configProvider: IButtonConfigProvider = this._options?.buttonConfigProvider ?? (() => ({ showLabel: true }));

		this._updateStore.clear();
		this.clear();

		// Support instant hover between buttons
		const hoverDelegate = this._updateStore.add(createInstantHoverDelegate());

		const actionCount = this._options?.renderSecondaryActions === false
			? Math.min(actions.length, 1)
			: actions.length;
		for (let i = 0; i < actionCount; i++) {

			const secondary = i > 0;
			const actionOrSubmenu = actions[i];
			let action: IAction;
			let btn: IButton;
			let tooltip: string;

			if (actionOrSubmenu instanceof SubmenuAction && actionOrSubmenu.actions.length > 1) {
				const [first, ...rest] = actionOrSubmenu.actions;
				action = <MenuItemAction>first;

				tooltip = action.tooltip || action.label;
				tooltip = this._keybindingService.appendKeybinding(tooltip, action.id);

				btn = this.addButtonWithDropdown({
					addPrimaryActionToDropdown: false,
					secondary: configProvider(action, i)?.isSecondary ?? secondary,
					actionRunner: this._actionRunner,
					actions: rest,
					contextMenuProvider: this._contextMenuService,
					ariaLabel: tooltip,
					supportIcons: true,
					small: this._options?.small,
				});
			} else {
				action = actionOrSubmenu instanceof SubmenuAction && actionOrSubmenu.actions.length === 1
					? actionOrSubmenu.actions[0]
					: actionOrSubmenu;

				tooltip = action.tooltip || action.label;
				tooltip = this._keybindingService.appendKeybinding(tooltip, action.id);

				btn = this.addButton({
					secondary: configProvider(action, i)?.isSecondary ?? secondary,
					ariaLabel: tooltip,
					supportIcons: true,
					small: this._options?.small,
				});
			}

			btn.enabled = action.enabled;
			btn.checked = action.checked ?? false;
			btn.element.classList.add('default-colors');

			const config = configProvider(action, i);
			const showLabel = config?.showLabel ?? true;
			const showIcon = config?.showIcon;
			const customClass = config?.customClass;
			const customLabel = config?.customLabel;
			const customLabelObs = config?.customLabelObs;

			if (customClass) {
				btn.element.classList.add(customClass);
			}

			// The icon a button shows always comes from the action, which carries
			// it as a CSS class. `MenuItemAction` derives that class from the
			// icon its command declares — including the toggled icon while it is
			// checked, which reading `item.icon` directly would miss.
			const renderActionIcon = (): HTMLElement | undefined => {
				if (!action.class) {
					return undefined;
				}
				const element = $('span');
				element.classList.add(...action.class.split(' '));
				return element;
			};

			// The button's leading slot holds either its icon or — while its work
			// is in flight — the spinner, never both. Both are sized identically
			// (see buttonbar.css), so swapping one for the other leaves the
			// button's width untouched.
			const showSpinner = config?.showSpinner;
			const leading = showSpinner
				? this._updateStore.add(createPixelSpinner()).element
				: showIcon && showLabel ? renderActionIcon() : undefined;
			if (leading) {
				leading.classList.add('monaco-button-leading-icon');
				if (!showLabel) {
					// Nothing follows it, so it carries no gap to a label.
					leading.classList.add('monaco-button-leading-icon-only');
				}
			}

			// Setting the label resets the button's children, so the leading slot
			// is (re-)attached after every label write rather than once up front.
			const applyLeading = () => {
				if (leading) {
					(btn instanceof ButtonWithDropdown ? btn.primaryButton.element : btn.element).prepend(leading);
				}
			};

			const applyLabel = (labelValue: string | IMarkdownString) => {
				if (showLabel) {
					btn.label = labelValue;
				}

				const labelStringValue = stripIcons(renderAsPlaintext(labelValue));
				const ariaLabelWithKeybinding = this._keybindingService.appendKeybinding(labelStringValue, action.id);

				btn.setTitle(ariaLabelWithKeybinding);
				btn.setAriaLabel(ariaLabelWithKeybinding);
				applyLeading();
			};

			if (showLabel) {
				btn.label = customLabel ?? action.label;
			} else {
				btn.element.classList.add('monaco-text-button');
			}
			applyLeading();

			// An icon-only button wears its icon as a codicon class on the button
			// itself, so it is left off while the spinner stands in for it.
			if (showIcon && !showLabel && !showSpinner) {
				if (action instanceof MenuItemAction && ThemeIcon.isThemeIcon(action.item.icon)) {
					btn.icon = action.item.icon;
				} else if (action.class) {
					btn.element.classList.add(...action.class.split(' '));
				}
			}

			if (customLabelObs) {
				this._updateStore.add(autorun(reader => {
					const v = customLabelObs.read(reader);
					applyLabel(v ?? customLabel ?? action.label);
				}));
			}

			this._updateStore.add(this._hoverService.setupManagedHover(hoverDelegate, btn.element, tooltip));
			this._updateStore.add(btn.onDidClick(async () => {
				if (this._options?.disableWhileRunning) {
					btn.enabled = false;
					try {
						await this._actionRunner.run(action);
					} finally {
						btn.enabled = action.enabled;
					}
				} else {
					this._actionRunner.run(action);
				}
			}));
		}

		if (this._options?.renderSecondaryActions !== false && secondary.length > 0) {

			const btn = this.addButton({
				secondary: true,
				ariaLabel: localize('moreActions', "More Actions"),
				small: this._options?.small,
			});

			btn.icon = Codicon.dropDownButton;
			btn.element.classList.add('default-colors', 'monaco-text-button');

			btn.enabled = true;
			this._updateStore.add(this._hoverService.setupManagedHover(hoverDelegate, btn.element, localize('moreActions', "More Actions")));
			this._updateStore.add(btn.onDidClick(async () => {
				this._contextMenuService.showContextMenu({
					getAnchor: () => btn.element,
					getActions: () => secondary,
					actionRunner: this._actionRunner,
					onHide: () => btn.element.setAttribute('aria-expanded', 'false')
				});
				btn.element.setAttribute('aria-expanded', 'true');

			}));
		}
		this._onDidChange.fire(this);
	}
}

export interface IMenuWorkbenchButtonBarOptions extends IWorkbenchButtonBarOptions {
	menuOptions?: IMenuActionOptions;

	toolbarOptions?: IToolBarRenderOptions;
}

export class MenuWorkbenchButtonBar extends WorkbenchButtonBar {

	constructor(
		container: HTMLElement,
		menuId: MenuId,
		options: IMenuWorkbenchButtonBarOptions | undefined,
		@IMenuService menuService: IMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IHoverService hoverService: IHoverService,
	) {
		super(container, options, contextMenuService, keybindingService, telemetryService, hoverService);

		const menu = menuService.createMenu(menuId, contextKeyService);
		this._store.add(menu);

		const update = () => {

			this.clear();

			const actions = getActionBarActions(
				menu.getActions(options?.menuOptions),
				options?.toolbarOptions?.primaryGroup
			);

			super.update(actions.primary, actions.secondary);
		};
		this._store.add(menu.onDidChange(update));
		update();
	}

	override dispose() {
		super.dispose();
	}

	override update(_actions: IAction[]): void {
		throw new Error('Use Menu or WorkbenchButtonBar');
	}
}
