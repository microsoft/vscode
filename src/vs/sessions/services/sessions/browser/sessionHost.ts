/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { constObservable, derived, IObservable, IReader } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { GroupIdentifier } from '../../../../workbench/common/editor.js';
import { IEditorGroup } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IChat } from '../common/session.js';
import { IActiveSession, IHostSession, IShownChat } from '../common/sessionsManagement.js';

export const enum SessionHostKind {
	/** The main window of the Agents window. */
	MainWindow = 'mainWindow',
	/** A window of its own that shows a chat. */
	ChatWindow = 'chatWindow',
	/** A session view: a slot of the sessions grid, or the view of a chat window. */
	Pane = 'pane',
	/** A chat input composer outside a session view. */
	Composer = 'composer',
	/** The automation dialog. */
	AutomationDialog = 'automationDialog',
}

/** What a host shows. */
export type SessionHostContent =
	| { readonly kind: 'chat'; readonly session: IHostSession; readonly chat: IChat }
	/** The new-session composer, with its draft once the provider created it. */
	| { readonly kind: 'newSession'; readonly draft: IHostSession | undefined }
	/** A chat whose session is not known yet, such as a restored chat window. */
	| { readonly kind: 'loading'; readonly chatResource: URI }
	/** Nothing, or a custom view. */
	| { readonly kind: 'empty' };

/** The argument that menus and toolbars created in a host pass to their commands; see `resolveSessionCommandTarget`. */
export interface ISessionHostCommandContext {
	readonly sessionHostId: string;
}

export function isSessionHostCommandContext(value: unknown): value is ISessionHostCommandContext {
	return !!value && typeof value === 'object' && typeof (value as Partial<ISessionHostCommandContext>).sessionHostId === 'string';
}

/**
 * A session and the chat of it that UI acts on: a host, or a session and chat that a host passes down, such as a composer
 * that binds to another chat than its host shows.
 */
export interface ISessionChatSource {
	readonly session: IObservable<IHostSession | undefined>;
	readonly chat: IObservable<IChat | undefined>;
}

/** A source of the selected chat of `session`, for UI given an {@link IActiveSession} rather than a host. */
export function sessionChatSourceOf(session: IObservable<IActiveSession | undefined>): ISessionChatSource {
	return { session, chat: derived(reader => session.read(reader)?.activeChat.read(reader)) };
}

/**
 * The place UI lives in: a window, or a pane, composer or dialog nested in one. A host shows at most one chat at a time,
 * which it owns as its selection, independently of focus. Its session derives from that chat.
 *
 * UI injects the host it is created in: a host provides itself to what it creates through a child instantiation
 * service, and DI resolves the nearest one. Never compute which host UI is in.
 */
export interface ISessionHost extends ISessionChatSource {
	readonly _serviceBrand: undefined;

	/** Stable for the life of the host; what its menus pass to commands. */
	readonly id: string;
	readonly kind: SessionHostKind;
	/** The host it is nested in: a pane's window host. `undefined` for window hosts. */
	readonly parent: ISessionHost | undefined;
	/** The window the host is in, once it has one. */
	readonly windowId: IObservable<number | undefined>;

	readonly content: IObservable<SessionHostContent>;
	/** The chat the host shows. */
	readonly chatResource: IObservable<URI | undefined>;
	readonly chat: IObservable<IChat | undefined>;
	/** The session of {@link chat}, or the draft of the new-session composer. */
	readonly session: IObservable<IHostSession | undefined>;

	/** Where the keys of the host's session are bound. */
	readonly contextKeyService: IContextKeyService;
	readonly commandContext: ISessionHostCommandContext;
}

export const ISessionHost = createDecorator<ISessionHost>('sessionHost');

/** Lookups across hosts. It has no selection, so UI can use it safely. */
export interface ISessionHostService {
	readonly _serviceBrand: undefined;

	readonly hosts: IObservable<readonly ISessionHost[]>;

	getHost(id: string): ISessionHost | undefined;
	/** The window host of a window: floating editor windows belong to the main window. */
	getHostOfWindow(windowId: number, reader?: IReader): ISessionHost | undefined;
	/** The window host of the window of an editor group. */
	getHostOfGroup(group: IEditorGroup | GroupIdentifier, reader?: IReader): ISessionHost | undefined;
	/** The innermost window or pane host that shows a chat; composers and dialogs do not own what they draft. */
	getHostOfChat(chatResource: URI, reader?: IReader): ISessionHost | undefined;
	/** The innermost window or pane hosts that show a session; composers and dialogs do not own what they draft. */
	getHostsOfSession(sessionResource: URI, reader?: IReader): readonly ISessionHost[];
	/** Whether a host shows the session or chat. */
	isShown(resource: URI, reader?: IReader): boolean;

	/** For hosts only. */
	registerHost(host: ISessionHost): IDisposable;
}

export const ISessionHostService = createDecorator<ISessionHostService>('sessionHostService');

/** The window host that has focus. Only window-independent consumers inject it. */
export interface IFocusedSessionHostService {
	readonly _serviceBrand: undefined;

	/** The window host of the window with focus, or of the last one that had it while the app is in the background. */
	readonly focusedHost: IObservable<ISessionHost>;
	/** {@link focusedHost} from DOM focus now, for commands. */
	getFocusedHost(): ISessionHost;
}

export const IFocusedSessionHostService = createDecorator<IFocusedSessionHostService>('focusedSessionHostService');

/** The session and chat of the focused host, for window-independent consumers that follow focus. */
export function getFocusedSessionChatSource(focusedSessionHostService: IFocusedSessionHostService): ISessionChatSource {
	return {
		session: derived(reader => focusedSessionHostService.focusedHost.read(reader).session.read(reader)),
		chat: derived(reader => focusedSessionHostService.focusedHost.read(reader).chat.read(reader)),
	};
}

/**
 * What only the main window's grid knows of its panes, which hosts do not show. A pane is named by its own session: the
 * session of its pane host, a view of the session with the pane's own state, such as the chats its tab strip shows.
 */
export interface ISessionGridPanes {
	/** Whether `pane` is the grid's active pane. */
	isActivePane(pane: IHostSession | undefined): boolean;
	/** Whether `pane` is a pane of the grid that shows one chat of its session apart from the session's own slot. */
	isDetachedPane(pane: IHostSession | undefined): boolean;
	/** Whether `pane` is a pane of the grid, a slot or a detached pane, rather than of another surface, such as a chat editor. */
	isGridPane(pane: IHostSession | undefined): boolean;
}

/**
 * The host that shows a session: the one host that does, else, when several do, such as the main window and a chat window
 * showing other chats of it, the one in `preferredWindowHost`. When several in that window do, such as a slot of its grid
 * and a detached pane of another chat of the session, the window's active pane (the grid's, or the one that shows the
 * window's chat), else the one that is not a detached pane. `undefined` when none does, or none of these settles it.
 */
export function getHostOfSession(sessionHostService: ISessionHostService, gridPanes: ISessionGridPanes, sessionResource: URI, preferredWindowHost: ISessionHost | undefined): ISessionHost | undefined {
	const hosts = sessionHostService.getHostsOfSession(sessionResource);
	if (hosts.length <= 1) {
		return hosts[0];
	}
	const inWindow = hosts.filter(host => getWindowHost(host) === preferredWindowHost);
	if (inWindow.length <= 1) {
		return inWindow[0];
	}
	const isActive = (host: ISessionHost) => preferredWindowHost?.kind === SessionHostKind.MainWindow
		? gridPanes.isActivePane(host.session.get())
		: isEqual(host.chatResource.get(), preferredWindowHost?.chatResource.get());
	const active = inWindow.filter(isActive);
	if (active.length === 1) {
		return active[0];
	}
	const ofGrid = inWindow.filter(host => !gridPanes.isDetachedPane(host.session.get()));
	return ofGrid.length === 1 ? ofGrid[0] : undefined;
}

/** The window host a host is in: itself for a window host. */
export function getWindowHost(host: ISessionHost): ISessionHost {
	let current = host;
	while (current.parent) {
		current = current.parent;
	}
	return current;
}

/**
 * The host of the main window, for services created at root that serve the main window, such as its terminal panel.
 * UI injects the host it is in instead.
 */
export function getMainWindowHost(sessionHostService: ISessionHostService): ISessionHost {
	const host = sessionHostService.getHostOfWindow(mainWindow.vscodeWindowId);
	if (!host) {
		throw new Error('The main window has no session host');
	}
	return host;
}

/**
 * The host the main window's UI injects as {@link ISessionHost}, through {@link createMainWindowInstantiationService}: the
 * grid's host, the instance the sessions service owns, not another one. Its constructor returns that instance; it has no
 * state of its own. The grid host is not disposable, so disposing the services disposes nothing twice.
 */
export interface MainWindowSessionHost extends ISessionHost { }
export class MainWindowSessionHost {
	constructor(@ISessionHostService sessionHostService: ISessionHostService) {
		return getMainWindowHost(sessionHostService);
	}
}

/**
 * A child of `instantiationService` for the main window's parts, whose UI injects the main window's host as
 * {@link ISessionHost}. The root has none, so a root singleton cannot inject it. The caller disposes it.
 */
export function createMainWindowInstantiationService(instantiationService: IInstantiationService): IInstantiationService {
	// Not delayed: a delayed service is a proxy, not the grid host itself. Resolved on first use, after the sessions service.
	return instantiationService.createChild(new ServiceCollection([ISessionHost, new SyncDescriptor(MainWindowSessionHost, [], false)]));
}

/** The chat `host` shows, with its session, once it shows both. */
export function shownChatOf(host: ISessionHost, reader?: IReader): IShownChat | undefined {
	const session = reader ? host.session.read(reader) : host.session.get();
	const chat = reader ? host.chat.read(reader) : host.chat.get();
	return session && chat ? { session, chat } : undefined;
}

/** The menu options of the toolbars and button bars a host creates, so their commands act on the host. */
export function createHostMenuOptions(host: ISessionHost): { readonly arg: ISessionHostCommandContext; readonly shouldForwardArgs: true } {
	return { arg: host.commandContext, shouldForwardArgs: true };
}

/**
 * Whether a context is that of a session host's scope, whose services provide {@link ISessionHost}. Items of workbench-wide
 * menus, such as the chat input's, that act on the host show only there, and not in chat inputs outside session hosts,
 * such as Quick Chat's.
 */
export const InSessionHostScopeContext = new RawContextKey<boolean>('inSessionHostScope', false, localize('inSessionHostScope', "Whether the context is that of a session host's scope."));

/**
 * The services of the scope of `host`, with `contextKeyService` as its context: binds {@link InSessionHostScopeContext}
 * on it, so the context has the key only where its scope provides the host.
 */
export function createSessionHostServices(contextKeyService: IContextKeyService, host: ISessionHost): ServiceCollection {
	InSessionHostScopeContext.bindTo(contextKeyService).set(true);
	return new ServiceCollection([IContextKeyService, contextKeyService], [ISessionHost, host]);
}

/**
 * Binds {@link InSessionHostScopeContext} on the context of `instantiationService`, a session host's scope whose services
 * were collected elsewhere, such as a chat window's. Throws when the scope provides no host.
 */
export function bindSessionHostScopeContext(instantiationService: IInstantiationService): void {
	instantiationService.invokeFunction(accessor => {
		accessor.get(ISessionHost);
		InSessionHostScopeContext.bindTo(accessor.get(IContextKeyService)).set(true);
	});
}

let hostIds = 0;

export interface ISessionHostOptions {
	readonly kind: SessionHostKind;
	readonly parent: ISessionHost | undefined;
	readonly session: IObservable<IActiveSession | undefined>;
	readonly contextKeyService: IContextKeyService | (() => IContextKeyService);
	/** A window host's window; nested hosts take their parent's. */
	readonly windowId?: IObservable<number | undefined>;
	/** The chat a host shows before its session is known; see {@link SessionHostContent}. */
	readonly loadingChat?: IObservable<URI | undefined>;
	/** The chat the host shows of its session, when not the session's active chat. */
	readonly chat?: IObservable<IChat | undefined>;
}

/**
 * A host that shows the selected chat of an {@link IActiveSession}.
 *
 * @internal Transitional: hosts own their chat once the chat-window session copy is gone, which removes this class.
 */
export class ActiveSessionHost implements ISessionHost {
	declare readonly _serviceBrand: undefined;

	readonly id: string;
	readonly kind: SessionHostKind;
	readonly parent: ISessionHost | undefined;
	readonly windowId: IObservable<number | undefined>;
	/** @internal Transitional: the session with its selected chat, for the legacy aliases and resolvers only. */
	readonly content: IObservable<SessionHostContent>;
	readonly chatResource: IObservable<URI | undefined>;
	readonly chat: IObservable<IChat | undefined>;
	readonly session: IObservable<IHostSession | undefined>;
	readonly commandContext: ISessionHostCommandContext;
	private readonly _contextKeyService: IContextKeyService | (() => IContextKeyService);

	constructor(options: ISessionHostOptions) {
		this.id = `${options.kind}.${++hostIds}`;
		this.kind = options.kind;
		this.parent = options.parent;
		this.windowId = options.windowId ?? options.parent?.windowId ?? constObservable(undefined);
		this._contextKeyService = options.contextKeyService;
		this.commandContext = { sessionHostId: this.id };
		const loadingChat = options.loadingChat;
		this.content = derived(this, reader => {
			const session = options.session.read(reader);
			if (!session) {
				const chatResource = loadingChat?.read(reader);
				if (chatResource) {
					return { kind: 'loading', chatResource };
				}
				// A composer shows the new-session composer before its draft exists; other hosts show nothing.
				return options.kind === SessionHostKind.Composer ? { kind: 'newSession', draft: undefined } : { kind: 'empty' };
			}
			if (!session.isCreated.read(reader)) {
				return { kind: 'newSession', draft: session };
			}
			return { kind: 'chat', session, chat: options.chat?.read(reader) ?? session.activeChat.read(reader) };
		});
		this.chat = derived(this, reader => {
			const content = this.content.read(reader);
			switch (content.kind) {
				case 'chat': return content.chat;
				case 'newSession': return content.draft?.mainChat.read(reader);
				default: return undefined;
			}
		});
		this.chatResource = derived(this, reader => {
			const content = this.content.read(reader);
			return content.kind === 'loading' ? content.chatResource : this.chat.read(reader)?.resource;
		});
		this.session = derived(this, reader => {
			const content = this.content.read(reader);
			switch (content.kind) {
				case 'chat': return content.session;
				case 'newSession': return content.draft;
				default: return undefined;
			}
		});
	}

	get contextKeyService(): IContextKeyService {
		return typeof this._contextKeyService === 'function' ? this._contextKeyService() : this._contextKeyService;
	}
}

/** Whether `host` shows `resource`, as its session or its chat. */
export function hostShows(host: ISessionHost, resource: URI, reader: IReader | undefined): boolean {
	return isEqual(host.chatResource.read(reader), resource) || isEqual(host.session.read(reader)?.resource, resource);
}
