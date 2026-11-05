/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerContentDropTarget } from '../../../../workbench/browser/dnd.js';
import { $ } from '../../../../base/browser/dom.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, IReader, observableValue } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ViewEditorInput } from '../../../../workbench/browser/parts/editor/viewEditorInput.js';
import { ActiveEditorContext } from '../../../../workbench/common/contextkeys.js';
import { IViewEditorRegistry, IViewEditorView, ViewEditorExtensions } from '../../../../workbench/browser/parts/editor/viewEditorRegistry.js';
import { IEditorPart } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { decideStackedChatInputOnlyWhileDragging } from '../../../../workbench/contrib/chatWindow/common/chatWindowInputOnly.js';
import { ChatWindowLayoutMode } from '../../../../workbench/contrib/chatWindow/common/chatWindowLayout.js';
import { AbstractChatView, ISessionViewHostOptions } from '../../../browser/parts/chatView.js';
import { ChatEditorContent } from './chatEditorContent.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { URI } from '../../../../base/common/uri.js';
import { EditorInputCapabilities } from '../../../../workbench/common/editor.js';

/** The view type of the chat of a session, shown as an editor: the chat part of a chat window shows it. */
export const SESSION_CHAT_VIEW_TYPE = 'sessions.chat';

/** The least size of the chat of a chat window. */
export const SESSION_CHAT_VIEW_MINIMUM_WIDTH = 280;
export const SESSION_CHAT_VIEW_MINIMUM_HEIGHT = 120;

/** The most height the chat input, with what shows above it, grows to while the chat shows only its input. */
export const SESSION_CHAT_VIEW_INPUT_ONLY_MAX_HEIGHT = 320;

/** How the chat of a chat window shows its session: as the Sessions part does, with its pills and its Session Activity Bar. */
export const SESSION_CHAT_VIEW_HOST_OPTIONS: ISessionViewHostOptions = {
	showHeader: true,
	showActivityBar: true,
	input: { showPills: true },
};

/** Where the session header of a session chat view shows outside of it, such as in the title row of its window. */
export interface ISessionChatViewHeaderHost {
	readonly element: HTMLElement;
	/** Where the header's actions show, such as with the other actions of that title row. */
	readonly actionsElement: HTMLElement | undefined;
	/** Shows the header in place of what the host shows otherwise, while the header shows. */
	setShown(shown: boolean): void;
}

/** The view's own title row, at the top of its card. */
export interface ISessionChatViewTitle extends IDisposable {
	readonly element: HTMLElement;
	/** Its height. */
	readonly size: IObservable<number>;
	layout(width: number, height: number): void;
}

/** What a chat editor needs of the window it shows in: how the window lays out its chat, and its main part. */
export interface IChatEditorWindow {
	readonly layoutMode: IObservable<ChatWindowLayoutMode>;
	readonly inputOnly: IObservable<boolean>;
	readonly resizing: IObservable<boolean>;
	/** Its main part, whose active editor the chat reads, such as for the checked entries of its Session Activity Bar. */
	readonly mainPart: IEditorPart;
	toggleConversation(): void;
}

/** What a chat editor shows, and the window it shows in, as whoever opens its editor gives it. */
export interface ISessionChatViewHost {
	/** The chat it shows, as a session of its own scoped to that chat (its active chat), once the chat is known. */
	readonly session: IObservable<IActiveSession | undefined>;
	/** The window the view shows in, once it shows. */
	readonly window: IObservable<IChatEditorWindow | undefined>;
	/** Where the session header shows: in the title row that shows, the view's own or its window's; in the view while undefined. */
	readonly header: IObservable<ISessionChatViewHeaderHost | undefined>;
	/** Whether the view shows its own title row (see {@link createTitle}); the title row of its window does not meanwhile. */
	readonly showsTitle: IObservable<boolean>;
	/** Whether its chat is the active one of its window: only that one shows the Session Activity Bar, also beside its window's chat. */
	readonly active: IObservable<boolean>;
	/** Creates the view's own title row into `container`, once the view shows in its window; none without title rows. */
	createTitle(container: HTMLElement, instantiationService: IInstantiationService): ISessionChatViewTitle | undefined;
	/** Called with what the editor shows once it is created, until the returned disposable is disposed. */
	attach(view: ChatEditorContent): IDisposable;
	/**
	 * What shows the chat: the last attached of those attached, such as the view where the chat moves to while the one it
	 * moves from is still there. Only it shows the session header in the {@link header} host.
	 */
	readonly view: IObservable<ChatEditorContent | undefined>;
}

const hosts = new Map<ViewEditorInput, ISessionChatViewHost>();

/** Gives the session chat view of `input` what it shows; for as long as the returned disposable is not disposed. */
export function registerSessionChatViewHost(input: ViewEditorInput, host: ISessionChatViewHost): IDisposable {
	hosts.set(input, host);
	return toDisposable(() => {
		if (hosts.get(input) === host) {
			hosts.delete(input);
		}
	});
}

/** What a chat editor shows, as far as its input-only state needs it. */
export interface IInputOnlySessionView {
	readonly primaryChatView: IObservable<Pick<AbstractChatView, 'inputOnly' | 'inputOnlyHeight' | 'canShowInputOnly' | 'enableInputOnly' | 'disableInputOnly' | 'setInputOnly'> | undefined>;
	readonly primaryChatViewTop: IObservable<number>;
}

/**
 * Lets the chat of a chat window show only its input below the main part (Stacked), as its window's state says: the chat
 * view collapses to its input, and the chat reports its input's height as its least and, but a pixel, its most height,
 * which its part and the window respect. Dragged taller by the sash above it, it shows its conversation, and dragged
 * back down to its input, only its input again. What the chat shows is what its view shows, which shows the conversation
 * when it needs it, such as for a confirmation its input cannot show; what the user chose in the chat is kept for its window.
 */
export class SessionChatViewInputOnly extends Disposable {

	/** Whether the chat shows only its input, below the main part. */
	readonly shownInputOnly: IObservable<boolean>;

	/** The height of the chat when it shows only its input, or 0 while that is not known. */
	readonly collapsedHeight: IObservable<number>;

	/**
	 * The most height of the chat: about its collapsed height while it shows only its input, a pixel more so that the sash
	 * above it can be dragged, which then lets it grow, to show its conversation (see {@link layout}).
	 */
	readonly maximumHeight: IObservable<number>;

	/** The least height of the chat: its input while it shows only its input; down to its input while it is below the main part. */
	readonly minimumHeight: IObservable<number>;

	private readonly _window: IObservable<Pick<IChatEditorWindow, 'layoutMode' | 'inputOnly' | 'toggleConversation' | 'resizing'> | undefined>;
	private _resizedHeight = 0;
	private readonly _resizeScheduler = this._register(new RunOnceScheduler(() => this._showWhatResizeShows(), 0));

	constructor(
		sessionView: IInputOnlySessionView,
		window: IObservable<Pick<IChatEditorWindow, 'layoutMode' | 'inputOnly' | 'toggleConversation' | 'resizing'> | undefined>,
	) {
		super();
		this._window = window;

		const stacked = derived(this, reader => window.read(reader)?.layoutMode.read(reader) === ChatWindowLayoutMode.Stacked);
		const view = sessionView.primaryChatView;
		this.shownInputOnly = derived(this, reader => stacked.read(reader) && !!view.read(reader)?.inputOnly.read(reader));
		this.collapsedHeight = derived(this, reader => {
			const inputHeight = view.read(reader)?.inputOnlyHeight.read(reader) ?? 0;
			return inputHeight ? sessionView.primaryChatViewTop.read(reader) + inputHeight : 0;
		});
		this.maximumHeight = derived(this, reader => {
			const collapsed = this.collapsedHeight.read(reader);
			if (!this.shownInputOnly.read(reader) || !collapsed || window.read(reader)?.resizing.read(reader)) {
				return Number.POSITIVE_INFINITY;
			}
			return collapsed + 1;
		});
		this.minimumHeight = derived(this, reader => {
			const collapsed = this.collapsedHeight.read(reader);
			if (this.shownInputOnly.read(reader) && collapsed) {
				return collapsed;
			}
			return stacked.read(reader) && collapsed ? Math.min(collapsed, SESSION_CHAT_VIEW_MINIMUM_HEIGHT) : SESSION_CHAT_VIEW_MINIMUM_HEIGHT;
		});

		const windowInputOnly = (reader: IReader | undefined) => !!window.read(reader)?.inputOnly.read(reader);
		this._register(autorun(reader => {
			const chatView = view.read(reader);
			if (!chatView) {
				return;
			}
			if (stacked.read(reader)) {
				chatView.enableInputOnly({ maxHeight: SESSION_CHAT_VIEW_INPUT_ONLY_MAX_HEIGHT, inputOnly: windowInputOnly(undefined) });
			} else {
				chatView.disableInputOnly();
			}
		}));
		this._register(autorun(reader => {
			const inputOnly = windowInputOnly(reader);
			if (stacked.read(reader)) {
				view.read(reader)?.setInputOnly(inputOnly);
			}
		}));
		// What the user chose in the chat, such as showing its conversation from it, is what its window shows next time;
		// not the conversation the view shows while its input cannot show what it needs.
		this._register(autorun(reader => {
			const chatView = view.read(reader);
			const chatWindow = window.read(reader);
			if (!stacked.read(reader) || !chatView?.canShowInputOnly.read(reader) || !chatWindow) {
				return;
			}
			if (chatView.inputOnly.read(reader) !== windowInputOnly(undefined)) {
				chatWindow.toggleConversation();
			}
		}));
		// What a resize showed is announced once it lets go, not at each snap while it drags
		let inputOnlyBeforeResize: boolean | undefined;
		this._register(autorun(reader => {
			const chatWindow = window.read(reader);
			const resizing = !!chatWindow?.resizing.read(reader);
			if (resizing) {
				inputOnlyBeforeResize ??= windowInputOnly(undefined);
				return;
			}
			const before = inputOnlyBeforeResize;
			inputOnlyBeforeResize = undefined;
			const inputOnly = windowInputOnly(undefined);
			if (before !== undefined && before !== inputOnly && stacked.read(undefined)) {
				status(inputOnly ? localize('chatConversationHidden', "Chat conversation hidden") : localize('chatConversationShown', "Chat conversation shown"));
			}
		}));
	}

	/**
	 * The chat is laid out at `height`. While the user drags the sash beside it, it shows its conversation once dragged up
	 * past its input, and only its input once dragged back down to it: a snap, with a little room between the two so
	 * that a height at either does not flicker. What shows changes once the layout is done.
	 */
	layout(height: number): void {
		this._resizedHeight = height;
		const window = this._window.get();
		if (window?.layoutMode.get() === ChatWindowLayoutMode.Stacked && this.collapsedHeight.get() && window.resizing.get()) {
			this._resizeScheduler.schedule();
		}
	}

	private _showWhatResizeShows(): void {
		const window = this._window.get();
		const collapsedHeight = this.collapsedHeight.get();
		if (!window?.resizing.get() || !collapsedHeight || window.layoutMode.get() !== ChatWindowLayoutMode.Stacked) {
			return;
		}
		const inputOnly = window.inputOnly.get();
		if (decideStackedChatInputOnlyWhileDragging({ groupHeight: this._resizedHeight, collapsedHeight, inputOnly }) !== inputOnly) {
			window.toggleConversation();
		}
	}
}

/**
 * A chat as an editor: one chat, with the header of its session, as the chat part of a chat window shows its chats. It
 * brings its own title, the session header, which shows in the title row of its window when the window has one.
 */
export class ChatEditorView extends Disposable implements IViewEditorView {

	readonly element: HTMLElement;
	readonly sessionView: ChatEditorContent;
	readonly providesTitle = true;

	/** Whether the view shows: not while another editor of its group, as a tab, shows. */
	private readonly _visible = observableValue(this, true);

	/** The title of the session header drags the chat, also while the header shows in the title row of its window. */
	get dragHandle(): HTMLElement { return this.sessionView.headerTitleElement; }

	private readonly _onDidChange = this._register(new Emitter<{ width: number; height: number } | undefined>());
	readonly onDidChange: Event<{ width: number; height: number } | undefined> = this._onDidChange.event;

	private readonly _inputOnly: SessionChatViewInputOnly;
	/** The view's own title row while it shows. */
	private _title: ISessionChatViewTitle | undefined;
	private _dimension: { width: number; height: number; top: number; left: number } | undefined;

	readonly minimumWidth = SESSION_CHAT_VIEW_MINIMUM_WIDTH;
	readonly maximumWidth = Number.POSITIVE_INFINITY;
	get minimumHeight(): number { return this._inputOnly.minimumHeight.get() + this._titleHeight; }
	get maximumHeight(): number { return this._inputOnly.maximumHeight.get() + this._titleHeight; }
	private get _titleHeight(): number { return this._title?.size.get() ?? 0; }

	constructor(
		host: ISessionChatViewHost | undefined,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		// First, so that it is set before anything of the view disposes: what the view shows changing as it disposes, such
		// as its window as it closes, must not create anything with the services it disposed.
		let disposing = false;
		this._register(toDisposable(() => disposing = true));

		// Styled as the session views of the Agents window are, which show in its sessions part or in a window of their own.
		this.element = $('.session-chat-view-editor.sessions-window-host');
		// The chat takes what is dropped on it, such as files to attach; editors dropped on the edges of its part split it.
		this._register(registerContentDropTarget(this.element));
		// The active editor, for what the chat shows, such as the checked entries of its Session Activity Bar, is the one of
		// its window's main part, as the main window's chat reads the one of its editor area.
		const scopedContextKeyService = this._register(contextKeyService.createScoped(this.element));
		const activeEditor = ActiveEditorContext.bindTo(scopedContextKeyService);
		this._register(autorun(reader => {
			const mainPart = host?.window.read(reader)?.mainPart;
			if (!mainPart) {
				activeEditor.reset();
				return;
			}
			const groupListener = reader.store.add(new MutableDisposable());
			const trackActiveGroup = () => {
				const update = () => activeEditor.set(mainPart.activeGroup.activeEditorPane?.getId() ?? null);
				groupListener.value = mainPart.activeGroup.onDidActiveEditorChange(update);
				update();
			};
			reader.store.add(mainPart.onDidChangeActiveGroup(trackActiveGroup));
			trackActiveGroup();
		}));
		const scopedInstantiationService = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService])));
		// The session header leaves the host it shows in, such as the title row of its window, with this view: a view that
		// shows the chat again after it moved has its own.
		this._register(toDisposable(() => this.sessionView.setHeaderHost(undefined)));
		const sessionView = this.sessionView = this._register(scopedInstantiationService.createInstance(ChatEditorContent, SESSION_CHAT_VIEW_HOST_OPTIONS));
		this.element.appendChild(sessionView.element);
		// Styled as the active session of the grid is.
		sessionView.element.classList.add('is-active');

		const window = derived(this, reader => host?.window.read(reader));
		this._inputOnly = this._register(new SessionChatViewInputOnly(sessionView, window));
		this._register(autorun(reader => {
			this._inputOnly.minimumHeight.read(reader);
			this._inputOnly.maximumHeight.read(reader);
			this._onDidChange.fire(undefined);
		}));

		if (!host) {
			return;
		}
		this._register(host.attach(sessionView));
		this._register(autorun(reader => sessionView.setSession(host.session.read(reader))));
		// Without the chat, such as while its window shows only its main part, or while another editor beside it, as a tab,
		// shows, its view is hidden; as with what hosts it hidden, its Session Activity Bar can still show outside of it.
		this._register(autorun(reader => {
			const mode = host.window.read(reader)?.layoutMode.read(reader);
			const visible = mode !== ChatWindowLayoutMode.EditorOnly && this._visible.read(reader);
			sessionView.setVisible(visible, visible);
		}));
		this._register(autorun(reader => sessionView.setActive(host.active.read(reader))));
		// Its own title row, at the top of its card, while it shows; the title row of its window otherwise.
		const title = derived(this, reader => {
			if (!host.window.read(reader) || disposing) {
				return undefined;
			}
			const created = host.createTitle(this.element, scopedInstantiationService);
			if (created) {
				reader.store.add(created);
			}
			return created;
		});
		this._register(autorun(reader => {
			const ownTitle = title.read(reader);
			const shown = !!ownTitle && host.showsTitle.read(reader);
			ownTitle?.size.read(reader);
			if (ownTitle) {
				ownTitle.element.style.display = shown ? '' : 'none';
			}
			this.element.classList.toggle('shows-title', shown);
			this._title = shown ? ownTitle : undefined;
			if (this._dimension) {
				this.layout(this._dimension.width, this._dimension.height, this._dimension.top, this._dimension.left);
			}
			this._onDidChange.fire(undefined);
		}));
		// The session header is the top row of the window in every layout, also while the chat shows only its input.
		const headerShown = this._register(new MutableDisposable());
		this._register(autorun(reader => {
			const header = host.view.read(reader) === sessionView ? host.header.read(reader) : undefined;
			sessionView.setHeaderHost(header?.element, header?.actionsElement);
			headerShown.value = header ? autorun(innerReader => header.setShown(sessionView.headerShown.read(innerReader))) : undefined;
		}));
	}

	layout(width: number, height: number, top: number, left: number): void {
		this._dimension = { width, height, top, left };
		const titleHeight = Math.min(this._titleHeight, height);
		this._title?.layout(width, titleHeight);
		this.sessionView.layout(width, height - titleHeight, top + titleHeight, left);
		this._inputOnly.layout(height - titleHeight);
	}

	focus(): void {
		this.sessionView.focus();
	}

	/** Hides the chat while another editor of its group, as a tab, shows, and shows it again. */
	setVisible(visible: boolean): void {
		this._visible.set(visible, undefined);
	}

	/** Saves what the chat shows, such as where it is scrolled to, before its editor moves: the view where it moves to shows the same. */
	saveViewState(): void {
		this.sessionView.primaryChatView.get()?.saveViewState();
	}
}

Registry.as<IViewEditorRegistry>(ViewEditorExtensions.ViewEditors).register({
	viewType: SESSION_CHAT_VIEW_TYPE,
	name: localize('sessionChatViewEditor', "Chat"),
	providesTitle: true,
	createView: (instantiationService, input) => instantiationService.createInstance(ChatEditorView, hosts.get(input)),
});

/**
 * The editor of a chat, keyed by the chat's resource: one per chat, in the chat part of a chat window. Its tab shows the
 * title of the chat.
 */
export class ChatEditorInput extends ViewEditorInput {

	private _name = '';
	private _cannotClose = false;

	constructor(readonly chatResource: URI) {
		super(SESSION_CHAT_VIEW_TYPE, chatResource);
	}

	setName(name: string): void {
		if (this._name !== name) {
			this._name = name;
			this._onDidChangeLabel.fire();
		}
	}

	setCannotClose(cannotClose: boolean): void {
		if (this._cannotClose !== cannotClose) {
			this._cannotClose = cannotClose;
			this._onDidChangeCapabilities.fire();
		}
	}

	override getName(): string {
		return this._name || super.getName();
	}

	override getIcon(): ThemeIcon {
		return Codicon.commentDiscussion;
	}

	override get capabilities(): EditorInputCapabilities {
		return super.capabilities | (this._cannotClose ? EditorInputCapabilities.CannotClose : 0);
	}
}
