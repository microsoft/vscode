/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventHelper, getWindow, isHTMLElement } from '../../base/browser/dom.js';
import { StandardMouseEvent } from '../../base/browser/mouseEvent.js';
import { ToolBar } from '../../base/browser/ui/toolbar/toolbar.js';
import { IAction, Separator, toAction } from '../../base/common/actions.js';
import { Codicon } from '../../base/common/codicons.js';
import { Disposable, DisposableStore, IDisposable } from '../../base/common/lifecycle.js';
import './media/sessionLayoutButtons.css';
import { autorun, IObservable, observableValue } from '../../base/common/observable.js';
import { ThemeIcon } from '../../base/common/themables.js';
import { localize, localize2 } from '../../nls.js';
import { ILocalizedString } from '../../platform/action/common/action.js';
import { MenuId, MenuItemAction, MenuRegistry, SubmenuItemAction } from '../../platform/actions/common/actions.js';
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService, RawContextKey } from '../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../platform/contextview/browser/contextView.js';
import { InstantiationType, registerSingleton } from '../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../platform/storage/common/storage.js';
import { registerIcon } from '../../platform/theme/common/iconRegistry.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../workbench/common/contributions.js';
import { SessionLayoutMode } from '../common/sessionGridLayout/sessionGridLayout.js';

/**
 * The actions of a Layout menu that can be shown as buttons of their own beside it ("promoted"): the chat and the editor
 * as toggles, and how both show together. The same three in every window of the Agents window, main and chat windows.
 */
export const enum SessionLayoutButton {
	Chat = 'chat',
	Editor = 'editor',
	Arrangement = 'arrangement',
}

export const sessionLayoutButtons: readonly SessionLayoutButton[] = [SessionLayoutButton.Chat, SessionLayoutButton.Editor, SessionLayoutButton.Arrangement];

const sessionLayoutButtonTitles: Readonly<Record<SessionLayoutButton, ILocalizedString>> = {
	[SessionLayoutButton.Chat]: localize2('sessionLayoutButton.chat', "Show Chat"),
	[SessionLayoutButton.Editor]: localize2('sessionLayoutButton.editor', "Show Editor"),
	[SessionLayoutButton.Arrangement]: localize2('sessionLayoutButton.arrangement', "Stacked"),
};

/** The title of the arrangement button while stacked: what it does then, as its icon shows. */
const sessionLayoutArrangementSideBySideTitle = localize2('sessionLayoutButton.arrangement.sideBySide', "Side by Side");

/** The title of `button`, as the Layout menu and the context menu of its button name it. */
export function getSessionLayoutButtonTitle(button: SessionLayoutButton): ILocalizedString {
	return sessionLayoutButtonTitles[button];
}

/** The titles of a layout mode: of the action that shows it, and the short one that the Layout menu's title shows. */
export interface ISessionLayoutModeTitles {
	readonly title: ILocalizedString;
	readonly shortTitle: string;
}

/** The titles of the layout modes, the same in every window. */
export const sessionLayoutModeTitles: Readonly<Record<SessionLayoutMode, ISessionLayoutModeTitles>> = {
	[SessionLayoutMode.ChatOnly]: {
		title: localize2('chatWindowLayoutChatOnly', "Show Chat Only"),
		shortTitle: localize('chatWindowLayoutChatOnly.short', "Chat Only"),
	},
	[SessionLayoutMode.EditorOnly]: {
		title: localize2('chatWindowLayoutEditorOnly', "Show Editor Only"),
		shortTitle: localize('chatWindowLayoutEditorOnly.short', "Editor Only"),
	},
	[SessionLayoutMode.Stacked]: {
		title: localize2('chatWindowLayoutStacked', "Show Chat and Editor Stacked"),
		shortTitle: localize('chatWindowLayoutStacked.short', "Stacked"),
	},
	[SessionLayoutMode.SideBySide]: {
		title: localize2('chatWindowLayoutSideBySide', "Show Chat and Editor Side by Side"),
		shortTitle: localize('chatWindowLayoutSideBySide.short', "Side by Side"),
	},
};

/** The editor above the chat (stacked): the panel icons, upside down (see `sessionLayoutButtons.css`). */
const editorAboveIcon = registerIcon('session-layout-editor-above', Codicon.layoutPanel, localize('sessionLayoutEditorAboveIcon', "Icon of the editor shown above the chat."));
const editorAboveOffIcon = registerIcon('session-layout-editor-above-off', Codicon.layoutPanelOff, localize('sessionLayoutEditorAboveOffIcon', "Icon of the editor hidden above the chat."));
/**
 * The chat hidden below the editor (stacked): there is no off variant of the status bar icon, so it is drawn with its band
 * ghosted (see `sessionLayoutButtons.css`), not as the panel icons, which the main window's Toggle Panel shows.
 */
const chatBelowOffIcon = registerIcon('session-layout-chat-below-off', Codicon.layoutStatusbar, localize('sessionLayoutChatBelowOffIcon', "Icon of the chat hidden below the editor."));

/** How the chat and the editor show together, which decides the icons: side by side, or stacked. */
export const enum SessionLayoutArrangement {
	SideBySide = 'sideBySide',
	Stacked = 'stacked',
}

/**
 * The icon of each button by the arrangement and its state: the state shows by the icon, not by a toggled highlight. The
 * chat and the editor are shown (`on`) or hidden (`off`). The arrangement button shows what it does, the other
 * arrangement: stacked while side by side, side by side while stacked.
 */
export const sessionLayoutButtonIcons: Readonly<Record<SessionLayoutButton, Readonly<Record<SessionLayoutArrangement, { readonly on: ThemeIcon; readonly off: ThemeIcon }>>>> = {
	[SessionLayoutButton.Chat]: {
		[SessionLayoutArrangement.SideBySide]: { on: Codicon.layoutSidebarLeft, off: Codicon.layoutSidebarLeftOff },
		[SessionLayoutArrangement.Stacked]: { on: Codicon.layoutStatusbar, off: chatBelowOffIcon },
	},
	[SessionLayoutButton.Editor]: {
		[SessionLayoutArrangement.SideBySide]: { on: Codicon.layoutSidebarRight, off: Codicon.layoutSidebarRightOff },
		[SessionLayoutArrangement.Stacked]: { on: editorAboveIcon, off: editorAboveOffIcon },
	},
	[SessionLayoutButton.Arrangement]: {
		[SessionLayoutArrangement.SideBySide]: { on: Codicon.splitVertical, off: Codicon.splitVertical },
		[SessionLayoutArrangement.Stacked]: { on: Codicon.splitHorizontal, off: Codicon.splitHorizontal },
	},
};

const sessionLayoutButtonPromotedContexts: Readonly<Record<SessionLayoutButton, RawContextKey<boolean>>> = {
	[SessionLayoutButton.Chat]: new RawContextKey<boolean>('sessionLayoutButtonPromoted.chat', false, localize('sessionLayoutButtonPromoted.chat', "Whether Show Chat shows as a button of its own beside the Layout menu.")),
	[SessionLayoutButton.Editor]: new RawContextKey<boolean>('sessionLayoutButtonPromoted.editor', false, localize('sessionLayoutButtonPromoted.editor', "Whether Show Editor shows as a button of its own beside the Layout menu.")),
	[SessionLayoutButton.Arrangement]: new RawContextKey<boolean>('sessionLayoutButtonPromoted.arrangement', false, localize('sessionLayoutButtonPromoted.arrangement', "Whether Stacked shows as a button of its own beside the Layout menu.")),
};

/** Whether `button` is promoted, in every window. */
export function sessionLayoutButtonPromotedContext(button: SessionLayoutButton): RawContextKey<boolean> {
	return sessionLayoutButtonPromotedContexts[button];
}

/** Whether every action of the Layout menu is promoted, in every window: the Layout menu itself then hides. */
export const SessionLayoutButtonsAllPromotedContext = new RawContextKey<boolean>('sessionLayoutButtonsAllPromoted', false, localize('sessionLayoutButtonsAllPromoted', "Whether every action of the Layout menu shows as a button of its own."));

export const ISessionLayoutButtonsService = createDecorator<ISessionLayoutButtonsService>('sessionLayoutButtonsService');

/**
 * Which actions of the Layout menu are promoted: ONE state for all windows (the main window and every chat window), kept
 * in the profile's storage. Promoting or hiding a button in any window applies in all of them. Until one is promoted or
 * hidden, Show Editor is promoted, in place of the title bar's toggle of the side panel that it replaces.
 */
export interface ISessionLayoutButtonsService {
	readonly _serviceBrand: undefined;
	readonly promoted: IObservable<ReadonlySet<SessionLayoutButton>>;
	setPromoted(button: SessionLayoutButton, promoted: boolean): void;
}

export class SessionLayoutButtonsService implements ISessionLayoutButtonsService {

	declare readonly _serviceBrand: undefined;

	static readonly STORAGE_KEY = 'sessions.layoutButtons.promoted';

	static readonly DEFAULT_PROMOTED: readonly SessionLayoutButton[] = [SessionLayoutButton.Editor];

	private readonly _promoted = observableValue<ReadonlySet<SessionLayoutButton>>(this, new Set());
	readonly promoted: IObservable<ReadonlySet<SessionLayoutButton>> = this._promoted;

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
	) {
		this._promoted.set(this._read(), undefined);
	}

	private _read(): ReadonlySet<SessionLayoutButton> {
		const raw = this._storageService.get(SessionLayoutButtonsService.STORAGE_KEY, StorageScope.PROFILE);
		if (raw === undefined) {
			return new Set(SessionLayoutButtonsService.DEFAULT_PROMOTED);
		}
		try {
			const stored: unknown = JSON.parse(raw);
			return new Set(Array.isArray(stored) ? sessionLayoutButtons.filter(button => stored.includes(button)) : []);
		} catch {
			return new Set();
		}
	}

	setPromoted(button: SessionLayoutButton, promoted: boolean): void {
		const current = this._promoted.get();
		if (current.has(button) === promoted) {
			return;
		}
		const next = new Set(current);
		if (promoted) {
			next.add(button);
		} else {
			next.delete(button);
		}
		this._promoted.set(next, undefined);
		this._storageService.store(SessionLayoutButtonsService.STORAGE_KEY, JSON.stringify(sessionLayoutButtons.filter(candidate => next.has(candidate))), StorageScope.PROFILE, StorageTarget.USER);
	}
}

registerSingleton(ISessionLayoutButtonsService, SessionLayoutButtonsService, InstantiationType.Delayed);

/** Binds which actions are promoted on `contextKeyService`, such as the global one that every window's inherits. */
export function bindSessionLayoutButtonsContext(service: ISessionLayoutButtonsService, contextKeyService: IContextKeyService): IDisposable {
	const keys = sessionLayoutButtons.map(button => [button, sessionLayoutButtonPromotedContext(button).bindTo(contextKeyService)] as const);
	const allPromoted = SessionLayoutButtonsAllPromotedContext.bindTo(contextKeyService);
	return autorun(reader => {
		const promoted = service.promoted.read(reader);
		contextKeyService.bufferChangeEvents(() => {
			for (const [button, key] of keys) {
				key.set(promoted.has(button));
			}
			allPromoted.set(sessionLayoutButtons.every(button => promoted.has(button)));
		});
	});
}

class SessionLayoutButtonsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessions.layoutButtons';

	constructor(
		@ISessionLayoutButtonsService service: ISessionLayoutButtonsService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		this._register(bindSessionLayoutButtonsContext(service, contextKeyService));
	}
}

registerWorkbenchContribution2(SessionLayoutButtonsContribution.ID, SessionLayoutButtonsContribution, WorkbenchPhase.BlockStartup);

/** The Layout menus and commands of every window kind, by which the context menu of a toolbar finds its layout actions. */
const registeredLayoutButtons = new Set<Pick<ISessionLayoutButtonsOptions, 'layoutMenu' | 'commandIds'>>();

/** A menu that shows the Layout menu of a window and the buttons of its promoted actions, such as its title bar. */
export interface ISessionLayoutButtonsMenu {
	readonly menu: MenuId;
	readonly group: string;
	/** The order of the first button; the buttons follow it, then the Layout menu. */
	readonly order: number;
	/** Where the menu shows them, such as in a title bar rather than in the Session Activity Bar. */
	readonly when: ContextKeyExpression;
}

export interface ISessionLayoutButtonsOptions {
	/** The Layout menu, whose entry shows in each of {@link buttonMenus} until all its actions are promoted. */
	readonly layoutMenu: MenuId;
	/** The titles of the Layout menu's entry, each where it applies, such as "Layout: Side by Side" in that mode. */
	readonly layoutMenuTitles: readonly { readonly title: string; readonly when: ContextKeyExpression }[];
	readonly buttonMenus: readonly ISessionLayoutButtonsMenu[];
	/** The window kind the actions apply in, such as a chat window with an editor area. */
	readonly when: ContextKeyExpression;
	/** The commands of the window kind for each action. */
	readonly commandIds: Readonly<Record<SessionLayoutButton, string>>;
	/** The state of the window that decides the icons: the chat shows, the editor shows, both show stacked. */
	readonly state: { readonly chatShown: ContextKeyExpression; readonly editorShown: ContextKeyExpression; readonly stacked: ContextKeyExpression };
}

/**
 * Registers the Layout menu entry and the buttons of its promoted actions in each of the menus that show them, for one
 * window kind. Every window kind shares the promotion state ({@link ISessionLayoutButtonsService}): a button shows in each
 * window once promoted in any of them, and the Layout menu entry hides while all three are promoted.
 *
 * The main window and the chat windows call this with their own commands, menus and `when`; nothing else is per window.
 */
export function registerLayoutButtons(options: ISessionLayoutButtonsOptions): IDisposable {
	const store = new DisposableStore();
	registeredLayoutButtons.add(options);
	store.add({ dispose: () => registeredLayoutButtons.delete(options) });
	const arrangements = [
		{ arrangement: SessionLayoutArrangement.SideBySide, when: options.state.stacked.negate() },
		{ arrangement: SessionLayoutArrangement.Stacked, when: options.state.stacked },
	];
	const states: Readonly<Record<SessionLayoutButton, ContextKeyExpression | undefined>> = {
		[SessionLayoutButton.Chat]: options.state.chatShown,
		[SessionLayoutButton.Editor]: options.state.editorShown,
		// The arrangement's state is the arrangement itself.
		[SessionLayoutButton.Arrangement]: undefined,
	};
	for (const target of options.buttonMenus) {
		const shownIn = ContextKeyExpr.and(options.when, target.when);
		sessionLayoutButtons.forEach((button, index) => {
			const promoted = sessionLayoutButtonPromotedContext(button);
			for (const { arrangement, when: arrangementWhen } of arrangements) {
				const icons = sessionLayoutButtonIcons[button][arrangement];
				const state = states[button];
				for (const on of state ? [true, false] : [true]) {
					store.add(MenuRegistry.appendMenuItem(target.menu, {
						// No `toggled`: the state shows by the icon, never by a highlight.
						command: { id: options.commandIds[button], title: button === SessionLayoutButton.Arrangement && arrangement === SessionLayoutArrangement.Stacked ? sessionLayoutArrangementSideBySideTitle : getSessionLayoutButtonTitle(button), icon: on ? icons.on : icons.off },
						group: target.group,
						order: target.order + index,
						when: ContextKeyExpr.and(shownIn, promoted, arrangementWhen, state ? (on ? state : state.negate()) : undefined),
					}));
				}
			}
		});
		for (const entry of options.layoutMenuTitles) {
			store.add(MenuRegistry.appendMenuItem(target.menu, {
				submenu: options.layoutMenu,
				title: entry.title,
				icon: Codicon.layout,
				group: target.group,
				order: target.order + sessionLayoutButtons.length,
				when: ContextKeyExpr.and(shownIn, entry.when, SessionLayoutButtonsAllPromotedContext.negate()),
			}));
		}
	}
	return store;
}

/**
 * The context menu of the Layout menu entry and of the promoted buttons of a toolbar that shows them: a promoted button
 * can be hidden ("Hide"), and each action can be promoted or hidden. Replaces the toolbar's own context menu there.
 */
export function registerSessionLayoutButtonsContextMenu(toolBar: ToolBar, service: ISessionLayoutButtonsService, contextMenuService: IContextMenuService): IDisposable {
	const element = toolBar.getElement();
	return addDisposableListener(element, 'contextmenu', (e: MouseEvent) => {
		const target = e.target;
		if (!isHTMLElement(target)) {
			return;
		}
		const action = toolBar.getItemAction(target);
		const registrations = [...registeredLayoutButtons];
		const button = action instanceof MenuItemAction ? sessionLayoutButtons.find(candidate => registrations.some(options => options.commandIds[candidate] === action.id)) : undefined;
		const isLayoutMenu = action instanceof SubmenuItemAction && registrations.some(options => action.item.submenu === options.layoutMenu);
		if (!button && !isLayoutMenu) {
			return;
		}
		EventHelper.stop(e, true);
		const actions = getSessionLayoutButtonsContextMenuActions(service, button);
		const event = new StandardMouseEvent(getWindow(element), e);
		contextMenuService.showContextMenu({ getAnchor: () => event, getActions: () => actions });
	}, true);
}

/** The actions of the context menu of a promoted `button`, or of the Layout menu entry without one. */
export function getSessionLayoutButtonsContextMenuActions(service: ISessionLayoutButtonsService, button: SessionLayoutButton | undefined): IAction[] {
	const promoted = service.promoted.get();
	const toggles = sessionLayoutButtons.map(candidate => toAction({
		id: `sessionLayoutButtons.toggle.${candidate}`,
		label: getSessionLayoutButtonTitle(candidate).value,
		checked: promoted.has(candidate),
		run: () => service.setPromoted(candidate, !promoted.has(candidate)),
	}));
	if (!button) {
		return toggles;
	}
	const hide = toAction({
		id: `sessionLayoutButtons.hide.${button}`,
		label: localize('sessionLayoutButtons.hide', "Hide '{0}'", getSessionLayoutButtonTitle(button).value),
		run: () => service.setPromoted(button, false),
	});
	return [hide, new Separator(), ...toggles];
}
