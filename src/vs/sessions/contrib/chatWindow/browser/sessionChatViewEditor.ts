/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, IReader } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ViewEditorInput } from '../../../../workbench/browser/parts/editor/viewEditorInput.js';
import { ActiveEditorContext } from '../../../../workbench/common/contextkeys.js';
import { IViewEditorRegistry, IViewEditorView, ViewEditorExtensions } from '../../../../workbench/browser/parts/editor/viewEditorRegistry.js';
import { IChatWindow } from '../../../../workbench/contrib/chatWindow/browser/chatWindow.js';
import { ChatWindowLayoutMode } from '../../../../workbench/contrib/chatWindow/common/chatWindowLayout.js';
import { AbstractChatView, ISessionViewHostOptions } from '../../../browser/parts/chatView.js';
import { SessionView } from '../../../browser/parts/sessionView.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';

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

/** What a session chat view shows, and the window it shows in, as whoever opens its editor gives it. */
export interface ISessionChatViewHost {
	/** The session the view shows: the session of its window. */
	readonly session: IObservable<IActiveSession | undefined>;
	/** The chat window the view shows in, once it shows. */
	readonly window: IObservable<IChatWindow | undefined>;
	/** Where the session header shows, outside of the view; in the view while undefined. */
	readonly header: IObservable<ISessionChatViewHeaderHost | undefined>;
	/** Called with the session view of the editor once it is created, until the returned disposable is disposed. */
	attach(view: SessionView): IDisposable;
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

/** The session view of a session chat view, as far as its input-only state needs it. */
export interface IInputOnlySessionView {
	readonly primaryChatView: IObservable<Pick<AbstractChatView, 'inputOnly' | 'inputOnlyHeight' | 'canShowInputOnly' | 'enableInputOnly' | 'disableInputOnly' | 'setInputOnly'> | undefined>;
	readonly primaryChatViewTop: IObservable<number>;
}

/**
 * Lets the chat of a chat window show only its input below the main part (Stacked), as its window's state says: the chat
 * view collapses to its input, and the chat reports its input's height as its most height, which its part and the window
 * respect. What the chat shows is what its view shows, which shows the conversation when it needs it, such as for a
 * confirmation its input cannot show; what the user chose in the chat is kept for its window.
 */
export class SessionChatViewInputOnly extends Disposable {

	/** Whether the chat shows only its input, below the main part. */
	readonly shownInputOnly: IObservable<boolean>;

	/** The height of the chat when it shows only its input, or 0 while that is not known. */
	readonly collapsedHeight: IObservable<number>;

	/** The most height of the chat: its collapsed height while it shows only its input. */
	readonly maximumHeight: IObservable<number>;

	/** The least height of the chat: down to its input, never below, while it is below the main part. */
	readonly minimumHeight: IObservable<number>;

	constructor(
		sessionView: IInputOnlySessionView,
		window: IObservable<Pick<IChatWindow, 'layoutMode' | 'inputOnly' | 'toggleConversation'> | undefined>,
	) {
		super();

		const stacked = derived(this, reader => window.read(reader)?.layoutMode.read(reader) === ChatWindowLayoutMode.Stacked);
		const view = sessionView.primaryChatView;
		this.shownInputOnly = derived(this, reader => stacked.read(reader) && !!view.read(reader)?.inputOnly.read(reader));
		this.collapsedHeight = derived(this, reader => {
			const inputHeight = view.read(reader)?.inputOnlyHeight.read(reader) ?? 0;
			return inputHeight ? sessionView.primaryChatViewTop.read(reader) + inputHeight : 0;
		});
		this.maximumHeight = derived(this, reader => {
			const collapsed = this.collapsedHeight.read(reader);
			return this.shownInputOnly.read(reader) && collapsed ? collapsed : Number.POSITIVE_INFINITY;
		});
		this.minimumHeight = derived(this, reader => {
			const collapsed = this.collapsedHeight.read(reader);
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
	}
}

/**
 * The chat of a session as an editor: a session view that shows the session of its window, as the chat part of a chat
 * window shows it. It brings its own title, the session header, which shows in the title row of its window when the
 * window has one, so its group shows no tabs.
 */
export class SessionChatViewEditorView extends Disposable implements IViewEditorView {

	readonly element: HTMLElement;
	readonly sessionView: SessionView;
	readonly providesTitle = true;

	private readonly _onDidChange = this._register(new Emitter<{ width: number; height: number } | undefined>());
	readonly onDidChange: Event<{ width: number; height: number } | undefined> = this._onDidChange.event;

	private readonly _inputOnly: SessionChatViewInputOnly;

	readonly minimumWidth = SESSION_CHAT_VIEW_MINIMUM_WIDTH;
	readonly maximumWidth = Number.POSITIVE_INFINITY;
	get minimumHeight(): number { return this._inputOnly.minimumHeight.get(); }
	get maximumHeight(): number { return this._inputOnly.maximumHeight.get(); }

	constructor(
		host: ISessionChatViewHost | undefined,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		this.element = $('.session-chat-view-editor');
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
		const sessionView = this.sessionView = this._register(scopedInstantiationService.createInstance(SessionView, SESSION_CHAT_VIEW_HOST_OPTIONS));
		this.element.appendChild(sessionView.element);
		// The one session view of its window: styled as the active one of the grid is.
		sessionView.element.classList.add('is-active');
		sessionView.setActive(true);

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
		this._register(autorun(reader => {
			const session = host.session.read(reader);
			if (session) {
				sessionView.openSession(session, {});
			}
		}));
		// Without the chat, such as while its window shows only its main part, its view is hidden.
		this._register(autorun(reader => {
			const mode = host.window.read(reader)?.layoutMode.read(reader);
			sessionView.setPartVisible(mode !== ChatWindowLayoutMode.EditorOnly);
		}));
		// The session header is the top row of the window in every layout, also while the chat shows only its input.
		const headerShown = this._register(new MutableDisposable());
		this._register(autorun(reader => {
			const header = host.header.read(reader);
			sessionView.setHeaderHost(header?.element, header?.actionsElement);
			headerShown.value = header ? autorun(innerReader => header.setShown(sessionView.headerShown.read(innerReader))) : undefined;
		}));
	}

	layout(width: number, height: number, top: number, left: number): void {
		this.sessionView.layout(width, height, top, left);
	}

	focus(): void {
		this.sessionView.focus();
	}

	/** Saves what the chat shows, such as where it is scrolled to, before its editor moves: the view where it moves to shows the same. */
	saveViewState(): void {
		this.sessionView.primaryChatView.get()?.saveViewState();
	}
}

Registry.as<IViewEditorRegistry>(ViewEditorExtensions.ViewEditors).register({
	viewType: SESSION_CHAT_VIEW_TYPE,
	name: localize('sessionChatViewEditor', "Chat"),
	createView: (instantiationService, input) => instantiationService.createInstance(SessionChatViewEditorView, hosts.get(input)),
});
