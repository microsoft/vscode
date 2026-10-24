/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../base/browser/ui/aria/aria.js';
import { Codicon } from '../../base/common/codicons.js';
import { DisposableStore, IDisposable } from '../../base/common/lifecycle.js';
import { ThemeIcon } from '../../base/common/themables.js';
import { localize, localize2 } from '../../nls.js';
import { ILocalizedString } from '../../platform/action/common/action.js';
import { Action2, MenuRegistry, registerAction2 } from '../../platform/actions/common/actions.js';
import { ContextKeyExpr, ContextKeyExpression } from '../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { SessionsCategories } from '../common/categories.js';
import { Menus, SessionActivityBarGroup } from './menus.js';
import { SessionLayoutMode, SessionLayoutModeContext } from '../common/sessionLayoutMode.js';

/** A {@link SessionLayoutMode} as offered to the user. */
export interface ISessionLayoutModeChoice {
	readonly mode: SessionLayoutMode;
	readonly title: ILocalizedString;
	/** Its title in the Layout submenu. */
	readonly shortTitle: string;
	/** The title of the Layout button while it is the current mode. */
	readonly buttonTitle: string;
	readonly icon: ThemeIcon;
}

// Icons of a window of two halves: the chat on the left of the editor, side by side.
/** The layout modes, in the order they are offered. */
export const sessionLayoutModeChoices: readonly ISessionLayoutModeChoice[] = [{
	mode: SessionLayoutMode.ChatOnly,
	title: localize2('sessionLayoutModeChatOnly', "Show Chat Only"),
	shortTitle: localize('sessionLayoutModeChatOnly.short', "Chat Only"),
	buttonTitle: localize('sessionLayoutModeChatOnly.button', "Layout: Chat Only"),
	icon: Codicon.layoutSidebarLeft,
}, {
	mode: SessionLayoutMode.EditorOnly,
	title: localize2('sessionLayoutModeEditorOnly', "Show Editor Only"),
	shortTitle: localize('sessionLayoutModeEditorOnly.short', "Editor Only"),
	buttonTitle: localize('sessionLayoutModeEditorOnly.button', "Layout: Editor Only"),
	icon: Codicon.layoutSidebarRight,
}, {
	mode: SessionLayoutMode.Stacked,
	title: localize2('sessionLayoutModeStacked', "Show Chat and Editor Stacked"),
	shortTitle: localize('sessionLayoutModeStacked.short', "Stacked"),
	buttonTitle: localize('sessionLayoutModeStacked.button', "Layout: Stacked"),
	icon: Codicon.splitVertical,
}, {
	mode: SessionLayoutMode.SideBySide,
	title: localize2('sessionLayoutModeSideBySide', "Show Chat and Editor Side by Side"),
	shortTitle: localize('sessionLayoutModeSideBySide.short', "Side by Side"),
	buttonTitle: localize('sessionLayoutModeSideBySide.button', "Layout: Side by Side"),
	icon: Codicon.splitHorizontal,
}];

/** Options of {@link registerSessionLayoutModeActions}: one family of the four actions, for one kind of window. */
export interface ISessionLayoutModeActionsOptions {
	/** The command identifier of each mode. */
	readonly ids: Readonly<Record<SessionLayoutMode, string>>;
	/** When the actions can run, which also scopes them to their kind of window. */
	readonly precondition: ContextKeyExpression;
	/** When a mode can be chosen, in addition to {@link precondition}. */
	readonly available?: (mode: SessionLayoutMode) => ContextKeyExpression | undefined;
	/** When the modes show in the Layout submenu of the Session Activity Bar, {@link Menus.SessionLayoutModes}. */
	readonly activityBarWhen?: ContextKeyExpression;
	/** Shows `mode` in the window the action runs in. */
	run(accessor: ServicesAccessor, mode: SessionLayoutMode): void | Promise<void>;
}

/**
 * Registers the four layout mode actions of a kind of window, checked while the window shows their mode, which is the
 * value of {@link SessionLayoutModeContext} in the window. Choosing a mode announces it to screen readers.
 */
export function registerSessionLayoutModeActions(options: ISessionLayoutModeActionsOptions): IDisposable {
	const store = new DisposableStore();
	for (const choice of sessionLayoutModeChoices) {
		store.add(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: options.ids[choice.mode],
					title: choice.title,
					category: SessionsCategories.Sessions,
					icon: choice.icon,
					f1: true,
					precondition: ContextKeyExpr.and(options.precondition, options.available?.(choice.mode)),
					toggled: SessionLayoutModeContext.isEqualTo(choice.mode),
				});
			}

			override async run(accessor: ServicesAccessor): Promise<void> {
				await options.run(accessor, choice.mode);
				status(localize('sessionLayoutModeChanged', "Layout: {0}", choice.title.value));
			}
		}));
		if (options.activityBarWhen) {
			store.add(MenuRegistry.appendMenuItem(Menus.SessionLayoutModes, {
				command: {
					id: options.ids[choice.mode],
					title: choice.shortTitle,
					icon: choice.icon,
					toggled: SessionLayoutModeContext.isEqualTo(choice.mode),
					precondition: ContextKeyExpr.and(options.precondition, options.available?.(choice.mode)),
				},
				group: 'navigation',
				order: sessionLayoutModeChoices.indexOf(choice),
				when: ContextKeyExpr.and(options.activityBarWhen, options.available?.(choice.mode)),
			}));
		}
	}
	return store;
}

/**
 * One Layout button leads the Session Activity Bar and opens {@link Menus.SessionLayoutModes}, the modes of its window,
 * which the main window and chat windows contribute. Its icon and title are those of the current mode: one submenu
 * entry per mode, shown while it is the current mode. It hides while the submenu is empty, such as while the strip does
 * not show its layout actions.
 */
for (const choice of sessionLayoutModeChoices) {
	MenuRegistry.appendMenuItem(Menus.SessionActivityBar, {
		submenu: Menus.SessionLayoutModes,
		title: choice.buttonTitle,
		icon: choice.icon,
		group: SessionActivityBarGroup.Layout,
		order: 0,
		when: SessionLayoutModeContext.isEqualTo(choice.mode),
	});
}
