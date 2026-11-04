/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { constObservable, derived, IObservable, IReader } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { GroupIdentifier } from '../../../../workbench/common/editor.js';
import { IEditorGroup } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IChat } from '../common/session.js';
import { IActiveSession } from '../common/sessionsManagement.js';

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

/** The session as a host sees it: without a chat selected for every place that shows it. */
export type IHostSession = Omit<IActiveSession, 'activeChat' | 'scopedChatResource'>;

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
 * The place UI lives in: a window, or a pane, composer or dialog nested in one. A host shows at most one chat at a time,
 * which it owns as its selection, independently of focus. Its session derives from that chat.
 *
 * UI injects the host it is created in: a host provides itself to what it creates through a child instantiation
 * service, and DI resolves the nearest one. Never compute which host UI is in.
 */
export interface ISessionHost {
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

/** The window host a host is in: itself for a window host. */
export function getWindowHost(host: ISessionHost): ISessionHost {
	let current = host;
	while (current.parent) {
		current = current.parent;
	}
	return current;
}

/** The menu options of the toolbars and button bars a host creates, so their commands act on the host. */
export function createHostMenuOptions(host: ISessionHost): { readonly arg: ISessionHostCommandContext; readonly shouldForwardArgs: true } {
	return { arg: host.commandContext, shouldForwardArgs: true };
}

/**
 * Whether `host` is backed by an {@link IActiveSession}, as the grid and chat windows show sessions until hosts own their
 * chat. Hosts registered as services are proxies until first used, so this checks the prototype, not the properties.
 *
 * @internal Transitional, removed with {@link ActiveSessionHost}. Only the legacy aliases and resolvers use it.
 */
export function hasActiveSessionSource(host: ISessionHost): host is ActiveSessionHost {
	return host instanceof ActiveSessionHost;
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
	readonly activeSession: IObservable<IActiveSession | undefined>;
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
		this.activeSession = options.session;
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
