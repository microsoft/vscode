/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, asCSSUrl, EventType, ModifierKeyEmitter, prepend, reset } from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { ActionViewItem, BaseActionViewItem, SelectActionViewItem } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { DropdownMenuActionViewItem, IDropdownMenuActionViewItemOptions } from 'vs/base/browser/ui/dropdown/dropdownActionViewItem';
import { ActionRunner, IAction, IRunEvent, Separator, SubmenuAction } from 'vs/base/common/actions';
import { Event } from 'vs/base/common/event';
import { UILabelProvider } from 'vs/base/common/keybindingLabels';
import { KeyCode } from 'vs/base/common/keyCodes';
import { combinedDisposable, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { isLinux, isWindows, OS } from 'vs/base/common/platform';
import 'vs/css!./menuEntryActionViewItem';
import { localize } from 'vs/nls';
import { IMenu, IMenuActionOptions, IMenuService, MenuItemAction, SubmenuItemAction } from 'vs/platform/actions/common/actions';
import { ICommandAction, isICommandActionToggleInfo } from 'vs/platform/action/common/action';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService, IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ThemeIcon } from 'vs/base/common/themables';
import { isDark } from 'vs/platform/theme/common/theme';
import { IHoverDelegate } from 'vs/base/browser/ui/iconLabel/iconHoverDelegate';
import { assertType } from 'vs/base/common/types';
import { asCssVariable, selectBorder } from 'vs/platform/theme/common/colorRegistry';
import { defaultSelectBoxStyles } from 'vs/platform/theme/browser/defaultStyles';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';

export function createAndFillInContextMenuActions(menu: IMenu, options: IMenuActionOptions | undefined, target: IAction[] | { primary: IAction[]; secondary: IAction[] }, primaryGroup?: string): void {
	const groups = menu.getActions(options);
	const modifierKeyEmitter = ModifierKeyEmitter.getInstance();
	const useAlternativeActions = modifierKeyEmitter.keyStatus.altKey || ((isWindows || isLinux) && modifierKeyEmitter.keyStatus.shiftKey);
	fillInActions(groups, target, useAlternativeActions, primaryGroup ? actionGroup => actionGroup === primaryGroup : actionGroup => actionGroup === 'navigation');
}

export function createAndFillInActionBarActions(menu: IMenu, options: IMenuActionOptions | undefined, target: IAction[] | { primary: IAction[]; secondary: IAction[] }, primaryGroup?: string | ((actionGroup: string) => boolean), shouldInlineSubmenu?: (action: SubmenuAction, group: string, groupSize: number) => boolean, useSeparatorsInPrimaryActions?: boolean): void {
	const groups = menu.getActions(options);
	const isPrimaryAction = typeof primaryGroup === 'string' ? (actionGroup: string) => actionGroup === primaryGroup : primaryGroup;

	// Action bars handle alternative actions on their own so the alternative actions should be ignored
	fillInActions(groups, target, false, isPrimaryAction, shouldInlineSubmenu, useSeparatorsInPrimaryActions);
}

function fillInActions(
	groups: ReadonlyArray<[string, ReadonlyArray<MenuItemAction | SubmenuItemAction>]>, target: IAction[] | { primary: IAction[]; secondary: IAction[] },
	useAlternativeActions: boolean,
	isPrimaryAction: (actionGroup: string) => boolean = actionGroup => actionGroup === 'navigation',
	shouldInlineSubmenu: (action: SubmenuAction, group: string, groupSize: number) => boolean = () => false,
	useSeparatorsInPrimaryActions: boolean = false
): void {

	let primaryBucket: IAction[];
	let secondaryBucket: IAction[];
	if (Array.isArray(target)) {
		primaryBucket = target;
		secondaryBucket = target;
	} else {
		primaryBucket = target.primary;
		secondaryBucket = target.secondary;
	}

	const submenuInfo = new Set<{ group: string; action: SubmenuAction; index: number }>();

	for (const [group, actions] of groups) {

		let target: IAction[];
		if (isPrimaryAction(group)) {
			target = primaryBucket;
			if (target.length > 0 && useSeparatorsInPrimaryActions) {
				target.push(new Separator());
			}
		} else {
			target = secondaryBucket;
			if (target.length > 0) {
				target.push(new Separator());
			}
		}

		for (let action of actions) {
			if (useAlternativeActions) {
				action = action instanceof MenuItemAction && action.alt ? action.alt : action;
			}
			const newLen = target.push(action);
			// keep submenu info for later inlining
			if (action instanceof SubmenuAction) {
				submenuInfo.add({ group, action, index: newLen - 1 });
			}
		}
	}

	// ask the outside if submenu should be inlined or not. only ask when
	// there would be enough space
	for (const { group, action, index } of submenuInfo) {
		const target = isPrimaryAction(group) ? primaryBucket : secondaryBucket;

		// inlining submenus with length 0 or 1 is easy,
		// larger submenus need to be checked with the overall limit
		const submenuActions = action.actions;
		if (submenuActions.length <= 1 && shouldInlineSubmenu(action, group, target.length)) {
			target.splice(index, 1, ...submenuActions);
		}
	}
}

export interface IMenuEntryActionViewItemOptions {
	draggable?: boolean;
	keybinding?: string;
	hoverDelegate?: IHoverDelegate;
}

export class MenuEntryActionViewItem extends ActionViewItem {

	private _wantsAltCommand: boolean = false;
	private readonly _itemClassDispose = this._register(new MutableDisposable());
	private readonly _altKey: ModifierKeyEmitter;

	constructor(
		action: MenuItemAction,
		options: IMenuEntryActionViewItemOptions | undefined,
		@IKeybindingService protected readonly _keybindingService: IKeybindingService,
		@INotificationService protected _notificationService: INotificationService,
		@IContextKeyService protected _contextKeyService: IContextKeyService,
		@IThemeService protected _themeService: IThemeService,
		@IContextMenuService protected _contextMenuService: IContextMenuService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService
	) {
		super(undefined, action, { icon: !!(action.class || action.item.icon), label: !action.class && !action.item.icon, draggable: options?.draggable, keybinding: options?.keybinding, hoverDelegate: options?.hoverDelegate });
		this._altKey = ModifierKeyEmitter.getInstance();
	}

	protected get _menuItemAction(): MenuItemAction {
		return <MenuItemAction>this._action;
	}

	protected get _commandAction(): MenuItemAction {
		return this._wantsAltCommand && this._menuItemAction.alt || this._menuItemAction;
	}

	override async onClick(event: MouseEvent): Promise<void> {
		event.preventDefault();
		event.stopPropagation();

		try {
			await this.actionRunner.run(this._commandAction, this._context);
		} catch (err) {
			this._notificationService.error(err);
		}
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('menu-entry');

		if (this.options.icon) {
			this._updateItemClass(this._menuItemAction.item);
		}

		if (this._menuItemAction.alt) {
			let isMouseOver = false;

			const updateAltState = () => {
				const wantsAltCommand = !!this._menuItemAction.alt?.enabled &&
					(!this._accessibilityService.isMotionReduced() || isMouseOver) && (
						this._altKey.keyStatus.altKey ||
						(this._altKey.keyStatus.shiftKey && isMouseOver)
					);

				if (wantsAltCommand !== this._wantsAltCommand) {
					this._wantsAltCommand = wantsAltCommand;
					this.updateLabel();
					this.updateTooltip();
					this.updateClass();
				}
			};

			this._register(this._altKey.event(updateAltState));

			this._register(addDisposableListener(container, 'mouseleave', _ => {
				isMouseOver = false;
				updateAltState();
			}));

			this._register(addDisposableListener(container, 'mouseenter', _ => {
				isMouseOver = true;
				updateAltState();
			}));

			updateAltState();
		}
	}

	protected override updateLabel(): void {
		if (this.options.label && this.label) {
			this.label.textContent = this._commandAction.label;
		}
	}

	protected override getTooltip() {
		const keybinding = this._keybindingService.lookupKeybinding(this._commandAction.id, this._contextKeyService);
		const keybindingLabel = keybinding && keybinding.getLabel();

		const tooltip = this._commandAction.tooltip || this._commandAction.label;
		let title = keybindingLabel
			? localize('titleAndKb', "{0} ({1})", tooltip, keybindingLabel)
			: tooltip;
		if (!this._wantsAltCommand && this._menuItemAction.alt?.enabled) {
			const altTooltip = this._menuItemAction.alt.tooltip || this._menuItemAction.alt.label;
			const altKeybinding = this._keybindingService.lookupKeybinding(this._menuItemAction.alt.id, this._contextKeyService);
			const altKeybindingLabel = altKeybinding && altKeybinding.getLabel();
			const altTitleSection = altKeybindingLabel
				? localize('titleAndKb', "{0} ({1})", altTooltip, altKeybindingLabel)
				: altTooltip;

			title = localize('titleAndKbAndAlt', "{0}\n[{1}] {2}", title, UILabelProvider.modifierLabels[OS].altKey, altTitleSection);
		}
		return title;
	}

	protected override updateClass(): void {
		if (this.options.icon) {
			if (this._commandAction !== this._menuItemAction) {
				if (this._menuItemAction.alt) {
					this._updateItemClass(this._menuItemAction.alt.item);
				}
			} else {
				this._updateItemClass(this._menuItemAction.item);
			}
		}
	}

	private _updateItemClass(item: ICommandAction): void {
		this._itemClassDispose.value = undefined;

		const { element, label } = this;
		if (!element || !label) {
			return;
		}

		const icon = this._commandAction.checked && isICommandActionToggleInfo(item.toggled) && item.toggled.icon ? item.toggled.icon : item.icon;

		if (!icon) {
			return;
		}

		if (ThemeIcon.isThemeIcon(icon)) {
			// theme icons
			const iconClasses = ThemeIcon.asClassNameArray(icon);
			label.classList.add(...iconClasses);
			this._itemClassDispose.value = toDisposable(() => {
				label.classList.remove(...iconClasses);
			});

		} else {
			// icon path/url - add special element with SVG-mask and icon color background
			const svgUrl = isDark(this._themeService.getColorTheme().type)
				? asCSSUrl(icon.dark)
				: asCSSUrl(icon.light);

			const svgIcon = $('span');
			svgIcon.style.webkitMask = svgIcon.style.mask = `${svgUrl} no-repeat 50% 50%`;
			svgIcon.style.background = 'var(--vscode-icon-foreground)';
			svgIcon.style.display = 'inline-block';
			svgIcon.style.width = '100%';
			svgIcon.style.height = '100%';

			label.appendChild(svgIcon);
			label.classList.add('icon');

			this._itemClassDispose.value = combinedDisposable(
				toDisposable(() => {
					label.classList.remove('icon');
					reset(label);
				}),
				this._themeService.onDidColorThemeChange(() => {
					// refresh when the theme changes in case we go between dark <-> light
					this.updateClass();
				})
			);
		}
	}
}

export class SubmenuEntryActionViewItem extends DropdownMenuActionViewItem {

	constructor(
		action: SubmenuItemAction,
		options: IDropdownMenuActionViewItemOptions | undefined,
		@IKeybindingService protected _keybindingService: IKeybindingService,
		@IContextMenuService protected _contextMenuService: IContextMenuService,
		@IThemeService protected _themeService: IThemeService
	) {
		const dropdownOptions: IDropdownMenuActionViewItemOptions = {
			...options,
			menuAsChild: options?.menuAsChild ?? false,
			classNames: options?.classNames ?? (ThemeIcon.isThemeIcon(action.item.icon) ? ThemeIcon.asClassName(action.item.icon) : undefined),
			keybindingProvider: options?.keybindingProvider ?? (action => _keybindingService.lookupKeybinding(action.id))
		};

		super(action, { getActions: () => action.actions }, _contextMenuService, dropdownOptions);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		assertType(this.element);

		container.classList.add('menu-entry');
		const action = <SubmenuItemAction>this._action;
		const { icon } = action.item;
		if (icon && !ThemeIcon.isThemeIcon(icon)) {
			this.element.classList.add('icon');
			const setBackgroundImage = () => {
				if (this.element) {
					this.element.style.backgroundImage = (
						isDark(this._themeService.getColorTheme().type)
							? asCSSUrl(icon.dark)
							: asCSSUrl(icon.light)
					);
				}
			};
			setBackgroundImage();
			this._register(this._themeService.onDidColorThemeChange(() => {
				// refresh when the theme changes in case we go between dark <-> light
				setBackgroundImage();
			}));
		}
	}
}

export interface IDropdownWithDefaultActionViewItemOptions extends IDropdownMenuActionViewItemOptions {
	renderKeybindingWithDefaultActionLabel?: boolean;
	persistLastActionId?: boolean;
}

export class DropdownWithDefaultActionViewItem extends BaseActionViewItem {
	private readonly _options: IDropdownWithDefaultActionViewItemOptions | undefined;
	private _defaultAction: ActionViewItem;
	private readonly _dropdown: DropdownMenuActionViewItem;
	private _container: HTMLElement | null = null;
	private readonly _storageKey: string;

	get onDidChangeDropdownVisibility(): Event<boolean> {
		return this._dropdown.onDidChangeVisibility;
	}

	constructor(
		submenuAction: SubmenuItemAction,
		options: IDropdownWithDefaultActionViewItemOptions | undefined,
		@IKeybindingService protected readonly _keybindingService: IKeybindingService,
		@INotificationService protected _notificationService: INotificationService,
		@IContextMenuService protected _contextMenuService: IContextMenuService,
		@IMenuService protected _menuService: IMenuService,
		@IInstantiationService protected _instaService: IInstantiationService,
		@IStorageService protected _storageService: IStorageService
	) {
		super(null, submenuAction);
		this._options = options;
		this._storageKey = `${submenuAction.item.submenu.id}_lastActionId`;

		// determine default action
		let defaultAction: IAction | undefined;
		const defaultActionId = options?.persistLastActionId ? _storageService.get(this._storageKey, StorageScope.WORKSPACE) : undefined;
		if (defaultActionId) {
			defaultAction = submenuAction.actions.find(a => defaultActionId === a.id);
		}
		if (!defaultAction) {
			defaultAction = submenuAction.actions[0];
		}

		this._defaultAction = this._instaService.createInstance(MenuEntryActionViewItem, <MenuItemAction>defaultAction, { keybinding: this._getDefaultActionKeybindingLabel(defaultAction) });

		const dropdownOptions: IDropdownMenuActionViewItemOptions = {
			keybindingProvider: action => this._keybindingService.lookupKeybinding(action.id),
			...options,
			menuAsChild: options?.menuAsChild ?? true,
			classNames: options?.classNames ?? ['codicon', 'codicon-chevron-down'],
			actionRunner: options?.actionRunner ?? new ActionRunner(),
		};

		this._dropdown = new DropdownMenuActionViewItem(submenuAction, submenuAction.actions, this._contextMenuService, dropdownOptions);
		this._dropdown.actionRunner.onDidRun((e: IRunEvent) => {
			if (e.action instanceof MenuItemAction) {
				this.update(e.action);
			}
		});
	}

	private update(lastAction: MenuItemAction): void {
		if (this._options?.persistLastActionId) {
			this._storageService.store(this._storageKey, lastAction.id, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}

		this._defaultAction.dispose();
		this._defaultAction = this._instaService.createInstance(MenuEntryActionViewItem, lastAction, { keybinding: this._getDefaultActionKeybindingLabel(lastAction) });
		this._defaultAction.actionRunner = new class extends ActionRunner {
			protected override async runAction(action: IAction, context?: unknown): Promise<void> {
				await action.run(undefined);
			}
		}();

		if (this._container) {
			this._defaultAction.render(prepend(this._container, $('.action-container')));
		}
	}

	private _getDefaultActionKeybindingLabel(defaultAction: IAction) {
		let defaultActionKeybinding: string | undefined;
		if (this._options?.renderKeybindingWithDefaultActionLabel) {
			const kb = this._keybindingService.lookupKeybinding(defaultAction.id);
			if (kb) {
				defaultActionKeybinding = `(${kb.getLabel()})`;
			}
		}
		return defaultActionKeybinding;
	}

	override setActionContext(newContext: unknown): void {
		super.setActionContext(newContext);
		this._defaultAction.setActionContext(newContext);
		this._dropdown.setActionContext(newContext);
	}

	override render(container: HTMLElement): void {
		this._container = container;
		super.render(this._container);

		this._container.classList.add('monaco-dropdown-with-default');

		const primaryContainer = $('.action-container');
		this._defaultAction.render(append(this._container, primaryContainer));
		this._register(addDisposableListener(primaryContainer, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.RightArrow)) {
				this._defaultAction.element!.tabIndex = -1;
				this._dropdown.focus();
				event.stopPropagation();
			}
		}));

		const dropdownContainer = $('.dropdown-action-container');
		this._dropdown.render(append(this._container, dropdownContainer));
		this._register(addDisposableListener(dropdownContainer, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.LeftArrow)) {
				this._defaultAction.element!.tabIndex = 0;
				this._dropdown.setFocusable(false);
				this._defaultAction.element?.focus();
				event.stopPropagation();
			}
		}));
	}

	override focus(fromRight?: boolean): void {
		if (fromRight) {
			this._dropdown.focus();
		} else {
			this._defaultAction.element!.tabIndex = 0;
			this._defaultAction.element!.focus();
		}
	}

	override blur(): void {
		this._defaultAction.element!.tabIndex = -1;
		this._dropdown.blur();
		this._container!.blur();
	}

	override setFocusable(focusable: boolean): void {
		if (focusable) {
			this._defaultAction.element!.tabIndex = 0;
		} else {
			this._defaultAction.element!.tabIndex = -1;
			this._dropdown.setFocusable(false);
		}
	}

	override dispose() {
		this._defaultAction.dispose();
		this._dropdown.dispose();
		super.dispose();
	}
}

class SubmenuEntrySelectActionViewItem extends SelectActionViewItem {

	constructor(
		action: SubmenuItemAction,
		@IContextViewService contextViewService: IContextViewService
	) {
		super(null, action, action.actions.map(a => ({
			text: a.id === Separator.ID ? '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500' : a.label,
			isDisabled: !a.enabled,
		})), 0, contextViewService, defaultSelectBoxStyles, { ariaLabel: action.tooltip, optionsAsChildren: true });
		this.select(Math.max(0, action.actions.findIndex(a => a.checked)));
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.style.borderColor = asCssVariable(selectBorder);
	}

	protected override runAction(option: string, index: number): void {
		const action = (this.action as SubmenuItemAction).actions[index];
		if (action) {
			this.actionRunner.run(action);
		}
	}

}

/**
 * Creates action view items for menu actions or submenu actions.
 */
export function createActionViewItem(instaService: IInstantiationService, action: IAction, options?: IDropdownMenuActionViewItemOptions | IMenuEntryActionViewItemOptions): undefined | MenuEntryActionViewItem | SubmenuEntryActionViewItem | BaseActionViewItem {
	if (action instanceof MenuItemAction) {
		return instaService.createInstance(MenuEntryActionViewItem, action, options);
	} else if (action instanceof SubmenuItemAction) {
		if (action.item.isSelection) {
			return instaService.createInstance(SubmenuEntrySelectActionViewItem, action);
		} else {
			if (action.item.rememberDefaultAction) {
				return instaService.createInstance(DropdownWithDefaultActionViewItem, action, { ...options, persistLastActionId: true });
			} else {
				return instaService.createInstance(SubmenuEntryActionViewItem, action, options);
			}
		}
	} else {
		return undefined;
	}
}
