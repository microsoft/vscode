/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, EventHelper, EventLike, EventType } from '../../../base/browser/dom.js';
import { ActionBar, ActionsOrientation } from '../../../base/browser/ui/actionbar/actionbar.js';
import { BaseActionViewItem } from '../../../base/browser/ui/actionbar/actionViewItems.js';
import { KeybindingLabel } from '../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { ActionRunner, IAction, WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from '../../../base/common/actions.js';
import { Codicon } from '../../../base/common/codicons.js';
import { isCancellationError } from '../../../base/common/errors.js';
import { Event } from '../../../base/common/event.js';
import { KeyCode } from '../../../base/common/keyCodes.js';
import { ResolvedKeybinding } from '../../../base/common/keybindings.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { autorun, observableFromEvent } from '../../../base/common/observable.js';
import { OS } from '../../../base/common/platform.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { localize } from '../../../nls.js';
import { getFlatActionBarActions } from '../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId, MenuItemAction, SubmenuItemAction } from '../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../platform/notification/common/notification.js';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry.js';
import { defaultKeybindingLabelStyles } from '../../../platform/theme/browser/defaultStyles.js';
import { EditorAddTabControl } from '../../../workbench/browser/parts/editor/editorAddTabControl.js';
import { SubmenuFlyout } from './submenuFlyout.js';

/** The parts of an editor group that the empty-group Add Tab UI depends on. */
export interface IEmptyEditorGroup {
	readonly element: HTMLElement;
	readonly scopedContextKeyService: IContextKeyService;
	readonly isEmpty: boolean;
	readonly onDidModelChange: Event<unknown>;
}

/** Applied to the editor group while the Add Tab actions replace its watermark. */
const HAS_ADD_TAB_WATERMARK_CLASS = 'sessions-has-add-tab-watermark';

const TELEMETRY_SOURCE = 'emptyEditorGroupAddTab';

/**
 * Renders the Add Tab actions in an empty editor group: the `+` dropdown at the top
 * (where the hidden tab bar would show it) from `dropdownMenuId`, and the actions of
 * `listMenuId` as a centered list in place of the editor watermark. Nothing is
 * rendered while the group has editors.
 */
export class EmptyEditorGroupAddTab extends Disposable {

	private readonly content = this._register(new MutableDisposable());

	constructor(
		private readonly group: IEmptyEditorGroup,
		private readonly dropdownMenuId: MenuId,
		private readonly listMenuId: MenuId,
		@IMenuService private readonly menuService: IMenuService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@INotificationService private readonly notificationService: INotificationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		const isEmpty = observableFromEvent(this, group.onDidModelChange, () => group.isEmpty);
		this._register(autorun(reader => {
			this.content.value = isEmpty.read(reader) ? this.render() : undefined;
		}));
	}

	private render(): IDisposable {
		const store = new DisposableStore();
		const groupElement = this.group.element;
		const contextKeyService = this.group.scopedContextKeyService;

		const addTabContainer = append(groupElement, $('.sessions-empty-group-add-tab'));
		const watermarkContainer = append(groupElement, $('.sessions-empty-group-add-tab-watermark'));
		store.add(toDisposable(() => {
			addTabContainer.remove();
			watermarkContainer.remove();
			groupElement.classList.remove(HAS_ADD_TAB_WATERMARK_CLASS);
		}));

		// Clicking quickly must not trigger the empty group's double-click to open an untitled editor.
		for (const container of [addTabContainer, watermarkContainer]) {
			store.add(addDisposableListener(container, EventType.DBLCLICK, e => EventHelper.stop(e, true)));
		}

		store.add(this.instantiationService.createInstance(EditorAddTabControl, addTabContainer, this.dropdownMenuId, contextKeyService, undefined));

		const actionRunner = store.add(new ActionRunner());
		store.add(actionRunner.onWillRun(e => this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: e.action.id, from: TELEMETRY_SOURCE })));
		store.add(actionRunner.onDidRun(e => {
			if (e.error && !isCancellationError(e.error)) {
				this.notificationService.error(e.error);
			}
		}));

		const lookupKeybinding = (commandId: string) => this.keybindingService.lookupKeybinding(commandId, contextKeyService);
		const actionBar = store.add(new ActionBar(append(watermarkContainer, $('.sessions-add-tab-watermark-list')), {
			orientation: ActionsOrientation.VERTICAL,
			ariaLabel: localize('addTabWatermark', "Add Tab"),
			actionRunner,
			actionViewItemProvider: action => this.instantiationService.createInstance(AddTabWatermarkActionViewItem, action, lookupKeybinding),
		}));

		// Submenu entries such as Canvas render their items, so changes inside them must refresh the list too.
		const menu = store.add(this.menuService.createMenu(this.listMenuId, contextKeyService, { emitEventsForSubmenuChanges: true }));
		let renderedSignature: string | undefined;
		const update = (force: boolean) => {
			const actions = getFlatActionBarActions(menu.getActions({ shouldForwardArgs: true }));

			// Menus refresh on any relevant context key change. Re-rendering identical rows would
			// needlessly rebuild the DOM and close an open submenu, so only re-render real changes.
			const signature = getActionsSignature(actions);
			if (!force && signature === renderedSignature) {
				return;
			}
			renderedSignature = signature;

			actionBar.clear();
			actionBar.push(actions);
			groupElement.classList.toggle(HAS_ADD_TAB_WATERMARK_CLASS, actions.length > 0);
		};
		update(true);
		store.add(menu.onDidChange(() => update(false)));
		store.add(this.keybindingService.onDidUpdateKeybindings(() => update(true)));

		return store;
	}
}

function getActionsSignature(actions: readonly IAction[]): string {
	return JSON.stringify(actions.map(action => [
		action.id,
		action.label,
		action.enabled,
		action.checked,
		action instanceof MenuItemAction || action instanceof SubmenuItemAction ? ThemeIcon.isThemeIcon(action.item.icon) ? action.item.icon.id : undefined : undefined,
		action instanceof SubmenuItemAction ? getActionsSignature(action.actions) : undefined,
	]));
}

class AddTabWatermarkActionViewItem extends BaseActionViewItem {

	private submenuFlyout: SubmenuFlyout | undefined;

	constructor(
		action: IAction,
		private readonly lookupKeybinding: (commandId: string) => ResolvedKeybinding | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(undefined, action);
	}

	override render(container: HTMLElement): void {
		const row = append(container, $('a.action-label.sessions-add-tab-watermark-entry'));
		super.render(row);
		row.setAttribute('role', 'button');

		const icon = append(row, $('span.sessions-add-tab-watermark-icon'));
		const item = this._action instanceof MenuItemAction || this._action instanceof SubmenuItemAction ? this._action.item : undefined;
		if (item?.icon && ThemeIcon.isThemeIcon(item.icon)) {
			icon.classList.add(...ThemeIcon.asClassNameArray(item.icon));
		}

		append(row, $('span.sessions-add-tab-watermark-label')).textContent = this._action.label;

		const keybinding = this._action instanceof MenuItemAction ? this.lookupKeybinding(this._action.id) : undefined;
		// Rows end with their keybinding or submenu chevron, so both line up at the row's trailing edge.
		if (keybinding) {
			this._register(new KeybindingLabel(append(row, $('span.sessions-add-tab-watermark-keybinding')), OS, defaultKeybindingLabelStyles)).set(keybinding);
		}

		const keybindingAriaLabel = keybinding?.getAriaLabel();
		row.setAttribute('aria-label', keybindingAriaLabel
			? localize('addTabWatermarkEntryAriaLabel', "{0} ({1})", this._action.label, keybindingAriaLabel)
			: this._action.label);

		const action = this._action;
		if (action instanceof SubmenuItemAction) {
			append(row, $('span.sessions-add-tab-watermark-submenu-indicator')).classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronRight));
			// The action bar runs actions directly on Enter/Space, which is a no-op for submenus.
			this.submenuFlyout = this._register(this.instantiationService.createInstance(SubmenuFlyout, {
				anchor: row,
				getActions: () => action.actions,
				getActionRunner: () => this.actionRunner,
				lookupKeybinding: this.lookupKeybinding,
				openKeys: [KeyCode.Enter, KeyCode.Space, KeyCode.RightArrow],
				closeKeys: [KeyCode.LeftArrow],
			}));
		}

		this.updateEnabled();
	}

	override onClick(event: EventLike): void {
		if (this.submenuFlyout) {
			EventHelper.stop(event, true);
			this.submenuFlyout.show(true);
			return;
		}

		super.onClick(event);
	}

	protected override updateEnabled(): void {
		const enabled = this._action.enabled;
		this.element?.classList.toggle('disabled', !enabled);
		this.element?.setAttribute('aria-disabled', String(!enabled));
	}
}
