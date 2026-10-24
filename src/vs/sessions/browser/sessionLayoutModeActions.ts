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
import { Action2, registerAction2 } from '../../platform/actions/common/actions.js';
import { ContextKeyExpr, ContextKeyExpression } from '../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { SessionsCategories } from '../common/categories.js';
import { SessionLayoutMode, SessionLayoutModeContext } from '../common/sessionLayoutMode.js';

/** A {@link SessionLayoutMode} as offered to the user. */
export interface ISessionLayoutModeChoice {
	readonly mode: SessionLayoutMode;
	readonly title: ILocalizedString;
	readonly icon: ThemeIcon;
}

// Icons of a window of two halves: the chat on the left of the editor, side by side.
/** The layout modes, in the order they are offered. */
export const sessionLayoutModeChoices: readonly ISessionLayoutModeChoice[] = [{
	mode: SessionLayoutMode.ChatOnly,
	title: localize2('sessionLayoutModeChatOnly', "Show Chat Only"),
	icon: Codicon.layoutSidebarLeft,
}, {
	mode: SessionLayoutMode.EditorOnly,
	title: localize2('sessionLayoutModeEditorOnly', "Show Editor Only"),
	icon: Codicon.layoutSidebarRight,
}, {
	mode: SessionLayoutMode.Stacked,
	title: localize2('sessionLayoutModeStacked', "Show Chat and Editor Stacked"),
	icon: Codicon.splitVertical,
}, {
	mode: SessionLayoutMode.SideBySide,
	title: localize2('sessionLayoutModeSideBySide', "Show Chat and Editor Side by Side"),
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
	}
	return store;
}
