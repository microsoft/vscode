/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ThemeIcon } from '../../../../base/common/themables.js';
import { ILocalizedString } from '../../../../nls.js';
import { Action2, MenuId } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, ContextKeyExpression } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { EditorTabsVisibleContext } from '../../../common/contextkeys.js';
import { isEditorCommandsContext } from '../../../common/editor.js';
import { IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';

export const NEW_TAB_BUTTON_SETTING = 'workbench.editor.experimental.newTabButton';

/**
 * False while the new tab button replaces the new tab buttons of individual editors, such as the `+` of a chat editor:
 * the setting is on and the tabs, which show the button, are visible.
 */
export const NewTabButtonHidden = ContextKeyExpr.or(ContextKeyExpr.notEquals(`config.${NEW_TAB_BUTTON_SETTING}`, true), EditorTabsVisibleContext.negate());

export interface INewTabButtonEntry {
	readonly id: string;
	readonly title: ILocalizedString;
	readonly icon: ThemeIcon;
	readonly order: number;
	/** Hides the entry while the feature it opens is not available. */
	readonly when?: ContextKeyExpression;
}

/**
 * An entry of the new tab (`+`) button at the end of the editor tab bar ({@link MenuId.EditorTabsBarAddTab}), shown
 * while {@link NEW_TAB_BUTTON_SETTING} is on. It opens its tab in the group of the button it was picked from.
 * The button logs `editorAddTabMenu` telemetry for opening its menu and picking an entry.
 */
export abstract class NewTabButtonEntryAction extends Action2 {

	constructor(entry: INewTabButtonEntry) {
		super({
			id: entry.id,
			title: entry.title,
			icon: entry.icon,
			f1: false,
			menu: {
				id: MenuId.EditorTabsBarAddTab,
				group: 'navigation',
				order: entry.order,
				when: ContextKeyExpr.and(ContextKeyExpr.equals(`config.${NEW_TAB_BUTTON_SETTING}`, true), entry.when)
			}
		});
	}

	override run(accessor: ServicesAccessor, ...args: unknown[]): Promise<unknown> {
		const editorGroupsService = accessor.get(IEditorGroupsService);
		const context = args.find(isEditorCommandsContext);
		const group = (context && editorGroupsService.getGroup(context.groupId)) ?? editorGroupsService.activeGroup;
		// Commands that open in the active group then open in the group of the button.
		editorGroupsService.activateGroup(group);

		return this.openTab(accessor, group);
	}

	/**
	 * Opens the new tab. The accessor is only valid until the first `await`.
	 */
	protected abstract openTab(accessor: ServicesAccessor, group: IEditorGroup): Promise<unknown>;
}
