/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { localize } from '../../../../nls.js';
import { ContextKeyExpr, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const NAMED_LAYOUTS_ENABLED_SETTING = 'workbench.namedLayouts.enabled';

export const NamedLayoutsEnabledContext = ContextKeyExpr.equals(`config.${NAMED_LAYOUTS_ENABLED_SETTING}`, true);

/**
 * The identifier of the default layout: the layout of the window when no named layout is active.
 */
export const DEFAULT_NAMED_LAYOUT_ID = 'default';

export const ActiveNamedLayoutContext = new RawContextKey<string>('activeNamedLayout', DEFAULT_NAMED_LAYOUT_ID, localize('activeNamedLayout', "The identifier of the active layout."));
export const HasNamedLayoutsContext = new RawContextKey<boolean>('hasNamedLayouts', false, localize('hasNamedLayouts', "Whether there are named layouts besides the default layout."));

export interface INamedLayout {
	readonly id: string;
	readonly name: string;
}

export const INamedLayoutsService = createDecorator<INamedLayoutsService>('namedLayoutsService');

/**
 * Named layouts are arrangements of the side bars, the panel and the editor groups of the main window
 * that a window can switch between. Changes made while a named layout is active belong to that layout:
 * they are saved into it when the window switches to another layout, when it closes, and on
 * {@link saveLayout}. A window that starts with a named layout active applies the layout as it is
 * stored, as other windows can have changed it. The default layout is the window's own layout while
 * no named layout is active.
 */
export interface INamedLayoutsService {

	readonly _serviceBrand: undefined;

	/**
	 * Fires when named layouts were created, renamed or deleted, in this or in another window.
	 */
	readonly onDidChangeLayouts: Event<void>;

	/**
	 * Fires when another layout became active in this window.
	 */
	readonly onDidChangeActiveLayout: Event<INamedLayout>;

	/**
	 * The default layout followed by the named layouts sorted by name.
	 */
	readonly layouts: readonly INamedLayout[];

	/**
	 * The layout that is active in this window.
	 */
	readonly activeLayout: INamedLayout;

	/**
	 * Creates a named layout from the current layout of this window and makes it the active layout. The layout
	 * that was active keeps what it saved last; the default layout keeps the current layout of the window.
	 */
	createLayout(name: string): Promise<INamedLayout>;

	/**
	 * Saves the active layout and applies the given layout to this window. Zen mode ends first.
	 * @returns whether the layout is active, which it is not when another window deleted it.
	 */
	switchLayout(layout: INamedLayout): Promise<boolean>;

	/**
	 * Saves the changes of the active named layout.
	 */
	saveLayout(): Promise<void>;

	/**
	 * @returns whether the layout was renamed, which it is not when another window deleted it.
	 */
	renameLayout(layout: INamedLayout, name: string): Promise<boolean>;

	/**
	 * Deletes a named layout. When it is active, the default layout is applied first.
	 */
	deleteLayout(layout: INamedLayout): Promise<void>;
}
