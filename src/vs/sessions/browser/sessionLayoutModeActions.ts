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
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService } from '../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { SessionsCategories } from '../common/categories.js';
import { Menus, SessionActivityBarGroup } from './menus.js';
import { DesktopLayoutContext, IsPhoneLayoutContext, SessionActivityBarLayoutActionsContext, SessionsWelcomeVisibleContext } from '../common/contextkeys.js';
import { IsAuxiliaryWindowContext } from '../../workbench/common/contextkeys.js';
import { SessionLayoutMode, SessionLayoutModeContext, SessionSplitLayout, SessionSplitLayoutContext } from '../common/sessionLayoutMode.js';

/** A {@link SessionLayoutMode} as offered to the user. */
export interface ISessionLayoutModeChoice {
	readonly mode: SessionLayoutMode;
	readonly title: ILocalizedString;
	/** Its title in the Layout submenu. */
	readonly shortTitle: string;
	readonly icon: ThemeIcon;
}

// Icons of a window of two halves: the chat on the left of the editor, side by side.
/** The layout modes, in the order they are offered. */
export const sessionLayoutModeChoices: readonly ISessionLayoutModeChoice[] = [{
	mode: SessionLayoutMode.ChatOnly,
	title: localize2('sessionLayoutModeChatOnly', "Show Chat Only"),
	shortTitle: localize('sessionLayoutModeChatOnly.short', "Chat Only"),
	icon: Codicon.layoutSidebarLeft,
}, {
	mode: SessionLayoutMode.EditorOnly,
	title: localize2('sessionLayoutModeEditorOnly', "Show Editor Only"),
	shortTitle: localize('sessionLayoutModeEditorOnly.short', "Editor Only"),
	icon: Codicon.layoutSidebarRight,
}, {
	mode: SessionLayoutMode.Stacked,
	title: localize2('sessionLayoutModeStacked', "Show Chat and Editor Stacked"),
	shortTitle: localize('sessionLayoutModeStacked.short', "Stacked"),
	icon: Codicon.splitVertical,
}, {
	mode: SessionLayoutMode.SideBySide,
	title: localize2('sessionLayoutModeSideBySide', "Show Chat and Editor Side by Side"),
	shortTitle: localize('sessionLayoutModeSideBySide.short', "Side by Side"),
	icon: Codicon.splitHorizontal,
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
	const choice = sessionLayoutModeChoices.find(candidate => candidate.mode === mode);
	if (choice) {
		status(localize('sessionLayoutModeChanged', "Layout: {0}", choice.title.value));
	}
}

/**
 * Registers the layout actions of a kind of window: the four layout modes, checked while the window shows their mode,
 * which is the value of {@link SessionLayoutModeContext} in the window, and the toggles of the Layout menu,
 * {@link Menus.SessionLayout}: Show Chat and Show Editor, of which the last one shown cannot be hidden, and Stacked,
 * which chooses how the two show together. Changing the layout announces it to screen readers.
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
			const choice = sessionLayoutModeChoices.find(candidate => candidate.mode === splitLayout);
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
	return store;
}

/** The label of a Layout button: "Layout: Stacked", after the mode its window shows, or "Layout" otherwise. */
export function getSessionLayoutButtonLabel(contextKeyService: IContextKeyService): string {
	const mode = contextKeyService.getContextKeyValue<SessionLayoutMode>(SessionLayoutModeContext.key);
	const choice = sessionLayoutModeChoices.find(candidate => candidate.mode === mode);
	return choice ? localize('sessionLayoutButtonMode', "Layout: {0}", choice.shortTitle) : localize('sessionLayout', "Layout");
}

/**
 * While the Session Activity Bar shows its layout actions, one Layout button leads it and opens the Layout menu,
 * {@link Menus.SessionLayout}, which the main window and chat windows contribute to. Its icon is the same whatever the
 * mode, that of the Layout menu of the title bar. It hides while the menu is empty.
 */
const layoutMenuItem = { submenu: Menus.SessionLayout, title: localize('sessionLayout', "Layout"), icon: Codicon.layout };

/**
 * Otherwise, the main window's title bar has the Layout button, after Toggle Side Panel: each window has one entry
 * point to its Layout menu. A chat window has its own in its title bar.
 */
MenuRegistry.appendMenuItem(Menus.TitleBarSessionMenu, {
	...layoutMenuItem,
	group: 'navigation',
	order: 12,
	when: ContextKeyExpr.and(DesktopLayoutContext, IsPhoneLayoutContext.negate(), IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated(), SessionActivityBarLayoutActionsContext.negate()),
});

MenuRegistry.appendMenuItem(Menus.SessionActivityBar, {
	...layoutMenuItem,
	group: SessionActivityBarGroup.Layout,
	order: 0,
	when: SessionActivityBarLayoutActionsContext,
});
