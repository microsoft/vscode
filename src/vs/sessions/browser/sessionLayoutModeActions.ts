/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../base/browser/ui/aria/aria.js';
import { DisposableStore, IDisposable } from '../../base/common/lifecycle.js';
import { localize, localize2 } from '../../nls.js';
import { ILocalizedString } from '../../platform/action/common/action.js';
import { Action2, MenuRegistry, registerAction2 } from '../../platform/actions/common/actions.js';
import { ContextKeyExpr, ContextKeyExpression } from '../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { SessionsCategories } from '../common/categories.js';
import { Menus } from './menus.js';
import { ISessionLayoutButtonsMenu, registerLayoutButtons, SessionLayoutButton } from './sessionLayoutButtons.js';
import { SessionLayoutMode, SessionLayoutModeContext, SessionSplitLayout, SessionSplitLayoutContext } from '../common/sessionLayoutMode.js';

/**
 * The titles of a {@link SessionLayoutMode}: of its command, and in the Layout menu's entry. The icons of the layout
 * actions are those of their buttons, `sessionLayoutButtonIcons`.
 */
interface ISessionLayoutModeTitles {
	readonly mode: SessionLayoutMode;
	readonly title: ILocalizedString;
	/** Its title in the Layout menu's entry: "Layout: Stacked". */
	readonly shortTitle: string;
}

/** The layout modes, in the order they are offered. */
const sessionLayoutModeTitles: readonly ISessionLayoutModeTitles[] = [{
	mode: SessionLayoutMode.ChatOnly,
	title: localize2('sessionLayoutModeChatOnly', "Show Chat Only"),
	shortTitle: localize('sessionLayoutModeChatOnly.short', "Chat Only"),
}, {
	mode: SessionLayoutMode.EditorOnly,
	title: localize2('sessionLayoutModeEditorOnly', "Show Editor Only"),
	shortTitle: localize('sessionLayoutModeEditorOnly.short', "Editor Only"),
}, {
	mode: SessionLayoutMode.Stacked,
	title: localize2('sessionLayoutModeStacked', "Show Chat and Editor Stacked"),
	shortTitle: localize('sessionLayoutModeStacked.short', "Stacked"),
}, {
	mode: SessionLayoutMode.SideBySide,
	title: localize2('sessionLayoutModeSideBySide', "Show Chat and Editor Side by Side"),
	shortTitle: localize('sessionLayoutModeSideBySide.short', "Side by Side"),
}];

/** The groups of {@link Menus.SessionLayout}. */
export const SessionLayoutMenuGroup = {
	/** Show Chat and Show Editor. */
	panes: '1_panes',
	/** Stacked, checked while the chat and the editor show stacked rather than side by side. */
	arrangement: '2_arrangement',
	/** Where a chat window shows. */
	window: '3_window',
} as const;

/** What a window shows: its {@link SessionLayoutMode}, and how it shows the chat and the editor together. */
export interface ISessionLayoutState {
	readonly mode: SessionLayoutMode;
	readonly splitLayout: SessionSplitLayout;
}

/** Options of {@link registerSessionLayoutModeActions}: one family of the layout actions, for one kind of window. */
export interface ISessionLayoutModeActionsOptions {
	/** The command identifier of each mode. */
	readonly ids: Readonly<Record<SessionLayoutMode, string>>;
	/** The command identifiers of the toggles of the Layout menu: Show Chat, Show Editor, and Stacked. */
	readonly toggleIds: { readonly chat: string; readonly editor: string; readonly stacked: string };
	/** When the actions can run, which also scopes them to their kind of window. */
	readonly precondition: ContextKeyExpression;
	/** When a mode can be chosen, in addition to {@link precondition}. Without side by side, there is no Stacked toggle. */
	readonly available?: (mode: SessionLayoutMode) => ContextKeyExpression | undefined;
	/** When the toggles show in the Layout menu, {@link Menus.SessionLayout}, which scopes them to their kind of window. */
	readonly menuWhen: ContextKeyExpression;
	/** Where the Layout menu's entry and the buttons of its promoted actions show, such as the title bar. */
	readonly buttonMenus: readonly ISessionLayoutButtonsMenu[];
	/** What the window the action runs in shows. */
	current(accessor: ServicesAccessor): ISessionLayoutState | undefined;
	/** Shows `mode` in the window the action runs in. */
	run(accessor: ServicesAccessor, mode: SessionLayoutMode): void | Promise<void>;
	/**
	 * While the window shows one of the chat and the editor, arranges them as `splitLayout` the next time both show,
	 * without showing the other: what the window remembers, and Show Chat or Show Editor uses.
	 */
	setSplitLayout(accessor: ServicesAccessor, splitLayout: SessionSplitLayout): void;
}

/** A pane that the Layout menu shows or hides: the chat, or the editor. One of them always shows. */
interface ISessionLayoutPaneToggle {
	readonly id: (options: ISessionLayoutModeActionsOptions) => string;
	readonly title: ILocalizedString;
	/** The mode that shows only this pane: it cannot be hidden there. */
	readonly aloneMode: SessionLayoutMode;
	/** The mode that hides this pane. */
	readonly hiddenMode: SessionLayoutMode;
}

const paneToggles: readonly ISessionLayoutPaneToggle[] = [{
	id: options => options.toggleIds.chat,
	title: localize2('sessionLayoutShowChat', "Show Chat"),
	aloneMode: SessionLayoutMode.ChatOnly,
	hiddenMode: SessionLayoutMode.EditorOnly,
}, {
	id: options => options.toggleIds.editor,
	title: localize2('sessionLayoutShowEditor', "Show Editor"),
	aloneMode: SessionLayoutMode.EditorOnly,
	hiddenMode: SessionLayoutMode.ChatOnly,
}];

async function showLayoutMode(accessor: ServicesAccessor, options: ISessionLayoutModeActionsOptions, mode: SessionLayoutMode): Promise<void> {
	await options.run(accessor, mode);
	const choice = sessionLayoutModeTitles.find(candidate => candidate.mode === mode);
	if (choice) {
		status(localize('sessionLayoutModeChanged', "Layout: {0}", choice.title.value));
	}
}

/**
 * Registers the layout actions of a kind of window: the four layout modes, commands of their own, and the toggles of the
 * Layout menu, {@link Menus.SessionLayout}: Show Chat and Show Editor, of which the last one shown cannot be hidden, and
 * Stacked, which chooses how the two show together. The Layout menu's entry and the buttons of the toggles that the user
 * promoted show in {@link ISessionLayoutModeActionsOptions.buttonMenus}, with the chat windows' promotion state
 * (`sessionLayoutButtons.ts`). Changing the layout announces it to screen readers.
 */
export function registerSessionLayoutModeActions(options: ISessionLayoutModeActionsOptions): IDisposable {
	const store = new DisposableStore();
	for (const choice of sessionLayoutModeTitles) {
		store.add(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: options.ids[choice.mode],
					title: choice.title,
					category: SessionsCategories.Sessions,
					f1: true,
					precondition: ContextKeyExpr.and(options.precondition, options.available?.(choice.mode)),
				});
			}

			override run(accessor: ServicesAccessor): Promise<void> {
				return showLayoutMode(accessor, options, choice.mode);
			}
		}));
	}

	paneToggles.forEach((toggle, index) => {
		store.add(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: toggle.id(options),
					title: toggle.title,
					category: SessionsCategories.Sessions,
					f1: true,
					toggled: SessionLayoutModeContext.notEqualsTo(toggle.hiddenMode),
					// Shown alone, it cannot be hidden: show the other pane instead.
					precondition: ContextKeyExpr.and(options.precondition, SessionLayoutModeContext.notEqualsTo(toggle.aloneMode)),
					menu: { id: Menus.SessionLayout, group: SessionLayoutMenuGroup.panes, order: index, when: options.menuWhen },
				});
			}

			override async run(accessor: ServicesAccessor): Promise<void> {
				const current = options.current(accessor);
				if (current) {
					// Shown again, both show as they last showed together.
					await showLayoutMode(accessor, options, current.mode === toggle.hiddenMode ? current.splitLayout : toggle.hiddenMode);
				}
			}
		}));
	});

	// Checked while the two show stacked, or are to show stacked as they next show together, unchecked side by side.
	// While only one shows, it only chooses how the two show next.
	const sideBySideAvailable = options.available?.(SessionLayoutMode.SideBySide);
	const stacked = SessionSplitLayoutContext.isEqualTo(SessionLayoutMode.Stacked);
	const stackedPrecondition = ContextKeyExpr.and(options.precondition, sideBySideAvailable);
	store.add(registerAction2(class extends Action2 {
		constructor() {
			super({
				id: options.toggleIds.stacked,
				title: localize2('sessionLayoutToggleStacked', "Toggle Stacked or Side by Side"),
				category: SessionsCategories.Sessions,
				f1: true,
				toggled: stacked,
				precondition: stackedPrecondition,
			});
		}

		override async run(accessor: ServicesAccessor): Promise<void> {
			const current = options.current(accessor);
			if (!current) {
				return;
			}
			const splitLayout = current.splitLayout === SessionLayoutMode.Stacked ? SessionLayoutMode.SideBySide : SessionLayoutMode.Stacked;
			if (current.mode === SessionLayoutMode.Stacked || current.mode === SessionLayoutMode.SideBySide) {
				await showLayoutMode(accessor, options, splitLayout);
				return;
			}
			options.setSplitLayout(accessor, splitLayout);
			const choice = sessionLayoutModeTitles.find(candidate => candidate.mode === splitLayout);
			if (choice) {
				status(localize('sessionLayoutSplitLayoutChanged', "Layout when both show: {0}", choice.shortTitle));
			}
		}
	}));
	store.add(MenuRegistry.appendMenuItem(Menus.SessionLayout, {
		command: { id: options.toggleIds.stacked, title: localize('sessionLayoutStacked', "Stacked"), toggled: stacked, precondition: stackedPrecondition },
		group: SessionLayoutMenuGroup.arrangement,
		order: 0,
		when: ContextKeyExpr.and(options.menuWhen, sideBySideAvailable),
	}));
	// The Layout menu's entry, named after the mode the window shows, and the buttons of its promoted toggles.
	store.add(registerLayoutButtons({
		layoutMenu: Menus.SessionLayout,
		layoutMenuTitles: sessionLayoutModeTitles.map(choice => ({ title: localize('sessionLayoutMenu', "Layout: {0}", choice.shortTitle), when: SessionLayoutModeContext.isEqualTo(choice.mode) })),
		buttonMenus: options.buttonMenus,
		when: options.menuWhen,
		commandIds: {
			[SessionLayoutButton.Chat]: options.toggleIds.chat,
			[SessionLayoutButton.Editor]: options.toggleIds.editor,
			[SessionLayoutButton.Arrangement]: options.toggleIds.stacked,
		},
		state: {
			chatShown: SessionLayoutModeContext.notEqualsTo(SessionLayoutMode.EditorOnly),
			editorShown: SessionLayoutModeContext.notEqualsTo(SessionLayoutMode.ChatOnly),
			stacked,
		},
	}));
	return store;
}
