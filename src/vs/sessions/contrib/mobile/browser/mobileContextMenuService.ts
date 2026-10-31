/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IContextMenuDelegate } from '../../../../base/browser/contextmenu.js';
import { IAction, Separator, SubmenuAction } from '../../../../base/common/actions.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
// eslint-disable-next-line local/code-translation-remind -- Experimental entry is excluded from production translation resources.
import { localize } from '../../../../nls.js';
import { ContextMenuMenuDelegate } from '../../../../platform/contextview/browser/contextMenuService.js';
import { IContextMenuMenuDelegate, IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IMenuService, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { IMobilePickerSheetItem, showMobilePickerSheet } from '../../../browser/parts/mobile/mobilePickerSheet.js';

/**
 * Phone presentation of {@link IContextMenuService}: every context menu — from
 * long-pressed session rows to chat toolbars and editor gutters — is shown as a
 * bottom action sheet instead of an anchored desktop menu widget.
 *
 * Callers do not change: `showContextMenu` accepts the same plain and menu-ID
 * delegates as the desktop service and resolves them through the shared
 * {@link ContextMenuMenuDelegate.transform}, so the actions, enablement, and
 * action runner are identical to desktop; only the presentation differs.
 * Submenus are flattened into titled sections because a sheet has no hover
 * cascade.
 */
export class MobileContextMenuService extends Disposable implements IContextMenuService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidShowContextMenu = this._register(new Emitter<void>());
	readonly onDidShowContextMenu = this._onDidShowContextMenu.event;

	private readonly _onDidHideContextMenu = this._register(new Emitter<void>());
	readonly onDidHideContextMenu = this._onDidHideContextMenu.event;

	private _showing = false;

	constructor(
		@ILayoutService private readonly layoutService: ILayoutService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();
	}

	showContextMenu(delegate: IContextMenuDelegate | IContextMenuMenuDelegate): void {
		if (this._showing) {
			return;
		}

		const resolved = ContextMenuMenuDelegate.transform(delegate, this.menuService, this.contextKeyService);
		const actions = new Map<string, IAction>();
		const items = this.toSheetItems(resolved.getActions(), actions);
		if (items.length === 0) {
			return;
		}

		this._showing = true;
		this._onDidShowContextMenu.fire();

		showMobilePickerSheet(this.layoutService.mainContainer, localize('mobileContextMenu.title', "Actions"), items, {
			doneLabel: localize('mobileContextMenu.cancel', "Cancel"),
		}).then(pickedId => {
			this._showing = false;
			const action = pickedId ? actions.get(pickedId) : undefined;
			resolved.onHide?.(!action);
			this._onDidHideContextMenu.fire();

			if (action) {
				const context = resolved.getActionsContext?.();
				const run = resolved.actionRunner
					? resolved.actionRunner.run(action, context)
					: action.run(context);
				Promise.resolve(run).catch(onUnexpectedError);
			}
		}, error => {
			this._showing = false;
			this._onDidHideContextMenu.fire();
			onUnexpectedError(error);
		});
	}

	private toSheetItems(actions: readonly IAction[], byId: Map<string, IAction>, sectionTitle?: string): IMobilePickerSheetItem[] {
		const items: IMobilePickerSheetItem[] = [];
		let pendingSectionTitle: string | undefined = sectionTitle;

		for (const action of actions) {
			if (action.id === 'sessionsViewPane.openToTheSide') {
				continue;
			}
			if (action instanceof Separator) {
				pendingSectionTitle = '';
				continue;
			}

			if (action instanceof SubmenuAction) {
				items.push(...this.toSheetItems(action.actions, byId, action.label));
				pendingSectionTitle = '';
				continue;
			}

			// Ids can repeat across sections (e.g. the same command contributed
			// twice), so key rows by position to keep the mapping unambiguous.
			const id = `${items.length}:${action.id}`;
			byId.set(id, action);
			const icon = action instanceof MenuItemAction && ThemeIcon.isThemeIcon(action.item.icon) ? action.item.icon : undefined;
			items.push({
				id,
				label: action.label,
				description: action.tooltip && action.tooltip !== action.label ? action.tooltip : undefined,
				icon,
				checked: action.checked || undefined,
				disabled: !action.enabled,
				sectionTitle: pendingSectionTitle,
			});
			pendingSectionTitle = undefined;
		}

		return items;
	}
}
