/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction, Separator } from '../../../../../base/common/actions.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { derived, IObservable } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { observableContextKey } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { IChatRowActionsPhonePresenter, IChatRowActionsPhonePresenterImpl } from '../../../../../workbench/contrib/chat/browser/widget/chatRowActionsPhonePresenter.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { installLongPress } from '../../../../browser/parts/mobile/longPress.js';
import { IMobilePickerSheetItem, showMobilePickerSheet } from '../../../../browser/parts/mobile/mobilePickerSheet.js';

/**
 * Match the `codicon-<id>` token inside an `IAction.class` string (which
 * `MenuItemAction` builds via {@link ThemeIcon.asClassName}). Captures
 * the icon id and an optional `~modifier` suffix (`spin`, `disabled`)
 * so animated icons round-trip through the bottom sheet.
 */
const CODICON_CLASS_REGEX = /codicon-([\w-]+)(?:~([a-z]+))?/;

/**
 * Best-effort recovery of a {@link ThemeIcon} for an arbitrary
 * {@link IAction}. The chat-message menus mostly produce
 * {@link MenuItemAction}s, which carry the original `ThemeIcon` on
 * `item.icon`; for everything else we fall back to parsing the codicon
 * class name out of {@link IAction.class}. Returns `undefined` when no
 * icon can be recovered, in which case the sheet renders a row without
 * a leading glyph.
 */
function getIconForAction(action: IAction): ThemeIcon | undefined {
	if (action instanceof MenuItemAction && ThemeIcon.isThemeIcon(action.item.icon)) {
		return action.item.icon;
	}
	if (action.class) {
		const match = CODICON_CLASS_REGEX.exec(action.class);
		if (match) {
			const [, id, modifier] = match;
			return modifier ? ThemeIcon.fromId(`${id}~${modifier}`) : ThemeIcon.fromId(id);
		}
	}
	return undefined;
}

/**
 * Sessions-side implementation of {@link IChatRowActionsPhonePresenter}.
 *
 * On phone-layout viewports of the agents window, replaces the chat
 * row's hover-only toolbar with a long-press → bottom-sheet
 * presentation. The hover toolbar is hidden via CSS in
 * `mobileChatShell.css` (Phone Layout: Hide Chat Row Hover Toolbars),
 * and {@link MobileChatRowActionsPresenter.attachToRow} wires a
 * long-press handler on each row container that surfaces the same
 * actions through {@link showMobilePickerSheet}. Workbench code does
 * not depend on the sheet or long-press primitives — it only sees the
 * {@link IChatRowActionsPhonePresenter} decorator interface — so this
 * wiring stays out of the workbench layer.
 */
class MobileChatRowActionsPresenter extends Disposable implements IChatRowActionsPhonePresenterImpl {

	readonly enabled: IObservable<boolean>;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
	) {
		super();

		// Track the phone-layout context key (`sessionsIsPhoneLayout`)
		// so the chat list renderer's `enabled.get()` check flips the
		// moment we cross the phone breakpoint. This key is the source
		// of truth for "is this viewport phone-classified" — the layout
		// policy updates it through the workbench's main `layout()` pass.
		const isPhoneCtx = observableContextKey<boolean>('sessionsIsPhoneLayout', contextKeyService);
		this.enabled = derived(this, reader => isPhoneCtx.read(reader) === true);
	}

	attachToRow(rowElement: HTMLElement, getActions: () => readonly IAction[]): IDisposable {
		// `installLongPress` self-gates on phone layout via the
		// `layoutService` option, so the gesture is a no-op on
		// desktop/tablet — `enabled` only controls whether
		// `attachToRow` is even called by the workbench, but the
		// self-gate keeps things safe if the viewport flips between
		// the workbench's enabled check and a pending pointerdown.
		return installLongPress(
			rowElement,
			() => { this._openSheet(getActions); },
			{ layoutService: this._layoutService },
		);
	}

	private async _openSheet(getActions: () => readonly IAction[]): Promise<void> {
		// Re-query actions on every open so the sheet reflects the
		// row's current menu state (enablement, toggled state, dynamic
		// items). The desktop hover toolbar gets the same treatment
		// implicitly via its `MenuWorkbenchToolBar` listening to menu
		// change events.
		const actions = getActions();
		if (actions.length === 0) {
			return;
		}

		// Build the sheet item list. `Separator` actions are translated
		// into rows with `sectionTitle: ''`, which the picker renders
		// as a divider without a heading — the same convention used by
		// {@link MobileAccountMenu} in `mobileTitlebarPart.ts`.
		const sheetItems: IMobilePickerSheetItem[] = [];
		const idToAction = new Map<string, IAction>();
		let separatorPending = false;
		for (const action of actions) {
			if (action instanceof Separator) {
				// Only insert a divider before the next real row;
				// leading / consecutive separators are collapsed so
				// the sheet doesn't open with an empty divider on top.
				separatorPending = sheetItems.length > 0;
				continue;
			}
			// Use a synthetic row id so action ids containing `:` or
			// other separator-unsafe characters round-trip safely
			// through the sheet's string-id contract.
			const rowId = `chat-row-action-${idToAction.size}`;
			idToAction.set(rowId, action);
			sheetItems.push({
				id: rowId,
				label: action.label || action.tooltip || action.id,
				icon: getIconForAction(action),
				disabled: !action.enabled,
				sectionTitle: separatorPending ? '' : undefined,
			});
			separatorPending = false;
		}

		if (sheetItems.length === 0) {
			return;
		}

		const pickedId = await showMobilePickerSheet(
			this._layoutService.mainContainer,
			localize('chatRowActions.title', "Message Actions"),
			sheetItems,
		);
		if (pickedId === undefined) {
			return;
		}
		const picked = idToAction.get(pickedId);
		if (picked) {
			// Errors here are non-fatal: the desktop toolbar swallows
			// action-run rejections the same way, and we don't want a
			// busted action to take down the chat list.
			Promise.resolve(picked.run()).catch(() => { /* best-effort */ });
		}
	}
}

/**
 * Workbench contribution that mounts {@link MobileChatRowActionsPresenter}
 * as the phone-layout impl for the workbench-layer
 * {@link IChatRowActionsPhonePresenter}. The presenter's `enabled`
 * observable gates the actual long-press wiring on phone layout, so no
 * dynamic mount/unmount is needed here — the registration stays in
 * place for the lifetime of the agents window.
 */
class MobileChatRowActionsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'mobileChatRowActions';

	private readonly _registration = this._register(new MutableDisposable<IDisposable>());

	constructor(
		@IChatRowActionsPhonePresenter presenter: IChatRowActionsPhonePresenter,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		const impl = this._register(instantiationService.createInstance(MobileChatRowActionsPresenter));
		this._registration.value = presenter.setImpl(impl);
	}
}

registerWorkbenchContribution2(
	MobileChatRowActionsContribution.ID,
	MobileChatRowActionsContribution,
	WorkbenchPhase.BlockStartup,
);
