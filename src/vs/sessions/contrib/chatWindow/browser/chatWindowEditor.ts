/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, debouncedObservable, derived, IObservable, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../../workbench/browser/parts/editor/editorPane.js';
import { EditorInputCapabilities, IEditorOpenContext } from '../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';
import { GroupDirection, GroupsArrangement, IEditorGroup, IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import type { AbstractChatView } from '../../../browser/parts/chatView.js';
import { SessionView } from '../../../browser/parts/sessionView.js';
import { ISessionsPartService } from '../../../services/sessions/browser/sessionsPartService.js';
import { IHostService } from '../../../../workbench/services/host/browser/host.js';
import { ChatWindowLayout } from '../../../services/chatWindow/browser/chatWindowService.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { ChatWindowSplitLayout, ChatWindowState } from './chatWindowState.js';
import './media/chatWindowEditor.css';

/** The most the chat input, with the progress and approvals above it, grows to. */
const CHAT_WINDOW_INPUT_MAX_HEIGHT = 400;

/** The least room the conversation gets above the input while it is shown below the editor. */
const CHAT_WINDOW_CONVERSATION_MIN_HEIGHT = 120;

/** The chat of a chat window: the session it shows, with the state of the chat window. */
export class ChatWindowChatInput extends EditorInput {

	static readonly ID = 'sessions.input.chatWindow';

	readonly resource: URI | undefined = undefined;

	constructor(readonly session: IObservable<IActiveSession | undefined>, readonly state: ChatWindowState) {
		super();
	}

	override get typeId(): string {
		return ChatWindowChatInput.ID;
	}

	override get capabilities(): EditorInputCapabilities {
		return super.capabilities | EditorInputCapabilities.Singleton | EditorInputCapabilities.CannotClose;
	}


	override getName(): string {
		return this.state.kind.title;
	}

	override getIcon(): ThemeIcon {
		return Codicon.commentDiscussion;
	}

	override async resolve(): Promise<null> {
		return null;
	}
}

/**
 * Hosts a session view, as in the Agents window, for the session of a chat window, and arranges the chat window's groups: this one,
 * and the editor's when it shows one.
 *
 * With the editor above it, this group sits below the editor in a split. Dragged all the way down, it stops where it
 * shows only the chat input, with the chat's latest message, progress and approvals above it; taller, it shows the
 * conversation. Only dragging the split switches between the two: resizing the window keeps what it shows, and keeps it
 * to the input while it shows only the input. Docked, it keeps to the input, and shows the conversation only while the
 * chat asks something that only the conversation can show. Side by side, this group shows the conversation, with the
 * editor to its right. Either the editor or the chat can show alone, and then fills the chat window; alone, the chat
 * shows its conversation.
 */
export class ChatWindowChatEditor extends EditorPane {

	static readonly ID = 'sessions.editor.chatWindow';

	private _container: HTMLElement | undefined;
	private _scopedInstantiationService: IInstantiationService | undefined;
	private _sessionView: SessionView | undefined;
	private _visible = false;
	private _dimension: dom.Dimension | undefined;
	private _state: ChatWindowState | undefined;
	/**
	 * The height the chat view needs to show only its input, once it settles: laid out while it opens, the input can
	 * briefly measure taller than it is.
	 */
	private _inputOnlyHeight: IObservable<number> = constObservable(0);
	/** The height of this group's own chrome, such as its title, above this editor. */
	private _chrome = 0;
	/** The height of the window's editor area when this editor was last laid out; see {@link layout}. */
	private _partHeight: number | undefined;
	/** The height of this group the user last chose while the conversation was shown below the editor. */
	private _conversationHeight: number | undefined;
	private _settledConversationHeight: number | undefined;
	private readonly _rememberConversationHeight = this._register(new RunOnceScheduler(() => this._conversationHeight = this._settledConversationHeight, 500));
	/** How the groups were last arranged: the editor above or beside this group. */
	private _arrangedSplitLayout: ChatWindowSplitLayout | undefined;
	/** Set while this editor is laid out, or while it sizes its group, so that sizes then do not switch what it shows. */
	private _sizing = false;
	private readonly _inputDisposables = this._register(new DisposableStore());
	private readonly _fitToInput = this._register(new RunOnceScheduler(() => {
		const view = this._view;
		if (view?.inputOnly.get() && this._minimumHeight !== undefined) {
			const part = this._editorGroupsService.getPart(this.group);
			const { width, height } = part.getSize(this.group);
			const collapsedHeight = this._inputOnlyHeight.get() + this._chrome;
			if (height !== collapsedHeight) {
				this._sizing = true;
				try {
					part.setSize(this.group, { width, height: collapsedHeight });
				} finally {
					this._sizing = false;
				}
			}
		}
	}, 0));

	private readonly _onDidChangeSizeConstraints = this._register(new Emitter<undefined>());
	override readonly onDidChangeSizeConstraints = this._onDidChangeSizeConstraints.event;

	/** The least height of this group: where dragging it down stops. Unset for the default. */
	private _minimumHeight: number | undefined;

	override get minimumHeight(): number {
		return this._minimumHeight ?? super.minimumHeight;
	}

	/** The most height of this group: docked, it is kept to the chat input. Unset for the default. */
	private _maximumHeight: number | undefined;

	override get maximumHeight(): number {
		return this._maximumHeight ?? super.maximumHeight;
	}

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@ISessionsPartService private readonly _sessionsPartService: ISessionsPartService,
		@IHostService private readonly _hostService: IHostService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
	) {
		super(ChatWindowChatEditor.ID, group, telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		// Styled as the Sessions part styles its session views.
		this._container = dom.append(parent, dom.$('.chat-window-editor.sessions-window-host'));
		const scopedContextKeyService = this._register(this._contextKeyService.createScoped(this._container));
		this._scopedInstantiationService = this._register(this._instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService])));
	}

	/** The chat view of the session view, while it shows the chat. */
	private get _view(): AbstractChatView | undefined {
		return this._sessionView?.primaryChatView.get();
	}

	/**
	 * The session view, created for the first chat window this editor shows: the chat windows of a group are of one
	 * kind. It is the session view of the session in the Sessions part's lookups while it shows it.
	 */
	private _getSessionView(state: ChatWindowState): SessionView | undefined {
		if (!this._sessionView && this._container && this._scopedInstantiationService) {
			const kind = state.kind;
			const view = this._sessionView = this._register(this._scopedInstantiationService.createInstance(SessionView, {
				showHeader: kind.showSessionHeader ?? true,
				// Its views, such as Changes, are the main window's.
				showActivityBar: false,
				input: { placeholder: kind.inputPlaceholder, minLines: kind.inputMinLines, showPills: kind.showPills ?? true },
			}));
			this._container.appendChild(view.element);
			// The one session view of its window: styled as the active one of the grid is.
			view.element.classList.add('is-active');
			view.setActive(true);
			view.setVisible(this._visible);
			this._register(this._sessionsPartService.registerWindowSessionView(view, {
				focus: () => {
					if (this._container) {
						this._hostService.focus(dom.getWindow(this._container));
					}
					view.focus();
				},
			}));
		}
		return this._sessionView;
	}

	override async setInput(input: ChatWindowChatInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		this._inputDisposables.clear();
		this._state = input.state;
		const sessionView = this._getSessionView(input.state);
		if (!sessionView) {
			return;
		}
		this._inputDisposables.add(autorun(reader => {
			const session = input.session.read(reader);
			if (session) {
				sessionView.openSession(session, {});
			}
		}));
		this._inputDisposables.add(autorun(reader => {
			const view = sessionView.primaryChatView.read(reader);
			if (view) {
				reader.store.add(this._arrangeGroups(view, sessionView, input.state));
			}
		}));
		if (this._dimension) {
			this.layout(this._dimension);
		}
	}

	/** Arranges the chat window's groups for its layout, and sizes this one to what the chat view shows. */
	private _arrangeGroups(view: AbstractChatView, sessionView: SessionView, state: ChatWindowState): IDisposable {
		const store = new DisposableStore();
		const part = this._editorGroupsService.getPart(this.group);
		const docked = state.docked;
		// Side by side, or with the editor hidden, the chat has room for its conversation.
		const conversationOnly = derived(this, reader => {
			const layout = state.layout.read(reader);
			return layout === ChatWindowLayout.SideBySide || layout === ChatWindowLayout.ChatOnly;
		});
		const partChanged = observableSignalFromEvent(this, Event.any<unknown>(part.onDidLayout, part.onDidAddGroup, part.onDidRemoveGroup));
		// Showing only the input, the chat shows no session header either.
		store.add(autorun(reader => sessionView.setHeaderHidden(view.inputOnly.read(reader))));
		store.add(toDisposable(() => sessionView.setHeaderHidden(false)));
		// The session header, and the bar of the chat's group, stay above the input.
		this._inputOnlyHeight = debouncedObservable(derived(this, reader => {
			const height = view.inputOnlyHeight.read(reader);
			return height ? height + sessionView.primaryChatViewTop.read(reader) : 0;
		}), 0);
		store.add(toDisposable(() => this._inputOnlyHeight = constObservable(0)));
		let arranged: ChatWindowLayout | undefined;
		let wasInputOnly: boolean | undefined;
		let wasConversationOnly: boolean | undefined;
		/** The group this editor maximized to hide the other one. */
		let maximized: IEditorGroup | undefined;

		store.add(autorun(reader => {
			const current = conversationOnly.read(reader);
			const previous = wasConversationOnly;
			wasConversationOnly = current;
			if (current) {
				view.disableInputOnly();
			} else if (previous !== false) {
				// Back to how the chat was last shown below the editor: with or without the conversation.
				view.enableInputOnly({ maxHeight: CHAT_WINDOW_INPUT_MAX_HEIGHT, inputOnly: state.inputOnly.read(undefined) });
			}
		}));

		// Toggling the conversation, the keyboard's way to drag the chat down to its input or back up.
		store.add(autorun(reader => {
			const inputOnly = state.inputOnly.read(reader);
			if (!docked && !conversationOnly.read(reader) && view.inputOnly.read(undefined) !== inputOnly) {
				view.setInputOnly(inputOnly);
			}
		}));

		// Shows both again when the hidden group is shown in another way, for example when it is activated.
		store.add(part.onDidChangeGroupMaximized(isMaximized => {
			if (!isMaximized && maximized && !this._sizing) {
				maximized = undefined;
				state.showBoth();
			}
		}));

		store.add(autorun(reader => {
			partChanged.read(reader);
			const layout = state.layout.read(reader);
			const splitLayout = state.splitLayout.read(reader);
			const inputOnly = view.inputOnly.read(reader);
			const inputOnlyHeight = this._inputOnlyHeight.read(reader);
			const collapsedHeight = inputOnlyHeight + this._chrome;
			const canCollapse = view.canShowInputOnly.read(reader);
			// Below the editor, the group is sized to the input, so not before the input is measured.
			if (part.count < 2 || (layout === ChatWindowLayout.EditorAboveChat && inputOnlyHeight === 0)) {
				return;
			}
			// Sized again when what shows changes.
			const previous = arranged;
			const previousInputOnly = wasInputOnly;
			arranged = layout;
			wasInputOnly = inputOnly;
			const sideBySide = splitLayout === ChatWindowLayout.SideBySide;
			if (layout === ChatWindowLayout.EditorAboveChat) {
				// Dragged to, or switched to by the chat: the chat window opens so next time.
				state.setInputOnly(inputOnly);
			}
			if (this._sizing) {
				// Laid out to a size the user dragged to, which already decided what it shows.
				return;
			}
			this._sizing = true;
			try {
				// Side by side, the chat leads and the editor follows it; otherwise the editor sits above the chat.
				const editor = part.groups.find(group => group !== this.group);
				if (editor) {
					const arrangedSplitLayout = this._arrangedSplitLayout;
					if (arrangedSplitLayout === undefined ? sideBySide : arrangedSplitLayout !== splitLayout) {
						if (maximized) {
							part.toggleMaximizeGroup();
							maximized = undefined;
						}
						part.moveGroup(editor, this.group, sideBySide ? GroupDirection.RIGHT : GroupDirection.UP);
					}
					this._arrangedSplitLayout = splitLayout;
				}

				// With one of the editor and the chat hidden, the other fills the chat window.
				const shown = layout === ChatWindowLayout.EditorOnly ? editor : layout === ChatWindowLayout.ChatOnly ? this.group : undefined;
				if (shown !== maximized) {
					if (maximized) {
						part.toggleMaximizeGroup();
					}
					maximized = shown;
					if (shown) {
						part.arrangeGroups(GroupsArrangement.MAXIMIZE, shown);
					}
				}
				if (shown) {
					this._setSizeConstraints(undefined, undefined);
					return;
				}

				// Dragged down, the group stops where it shows only the input; while the chat needs the conversation, above it.
				// A group at its minimum counts as minimized and is expanded when it is activated, so it is kept a pixel above.
				// Docked, it cannot be dragged up either: it shows the conversation only while the chat needs it.
				if (docked && canCollapse && !inputOnly) {
					view.setInputOnly(true);
					return;
				}
				this._setSizeConstraints(
					sideBySide ? undefined : canCollapse ? collapsedHeight - 1 : collapsedHeight + CHAT_WINDOW_CONVERSATION_MIN_HEIGHT,
					docked && canCollapse ? collapsedHeight : undefined,
				);
				const { width, height } = part.getSize(this.group);
				if (sideBySide) {
					if (previous !== layout) {
						part.arrangeGroups(GroupsArrangement.EVEN);
					}
				} else if (inputOnly) {
					if (height !== collapsedHeight) {
						part.setSize(this.group, { width, height: collapsedHeight });
					}
				} else if (previous !== layout || previousInputOnly) {
					// Shown, or switched to by the chat, rather than dragged to: sized as the user last left it.
					const conversationHeight = this._conversationHeight ?? Math.round(part.contentDimension.height / 2);
					part.setSize(this.group, { width, height: Math.max(conversationHeight, collapsedHeight + CHAT_WINDOW_CONVERSATION_MIN_HEIGHT) });
				}
			} finally {
				this._sizing = false;
			}
		}));
		return store;
	}

	private _setSizeConstraints(minimumHeight: number | undefined, maximumHeight: number | undefined): void {
		if (this._minimumHeight !== minimumHeight || this._maximumHeight !== maximumHeight) {
			this._minimumHeight = minimumHeight;
			this._maximumHeight = maximumHeight;
			this._onDidChangeSizeConstraints.fire(undefined);
		}
	}

	override clearInput(): void {
		this._inputDisposables.clear();
		this._state = undefined;
		super.clearInput();
	}

	protected override setEditorVisible(visible: boolean): void {
		this._visible = visible;
		this._sessionView?.setVisible(visible);
	}

	override layout(dimension: dom.Dimension): void {
		this._dimension = dimension;
		const sessionView = this._sessionView;
		if (!sessionView) {
			return;
		}
		sessionView.layout(dimension.width, dimension.height, 0, 0);
		const view = this._view;
		if (!view) {
			return;
		}
		const part = this._editorGroupsService.getPart(this.group);
		const groupHeight = part.getSize(this.group).height;
		this._chrome = Math.max(0, groupHeight - dimension.height);
		// The window was resized, rather than the split dragged: what this editor shows stays, and showing only the input,
		// it is sized back to the input once the editor area is laid out (see `_arrangeGroups`).
		const partHeight = part.contentDimension.height;
		const windowResized = this._partHeight !== undefined && partHeight !== this._partHeight;
		this._partHeight = partHeight;
		if (this._minimumHeight !== undefined && !this._sizing && !windowResized && !this._state?.docked) {
			// Below the editor: at the bottom, where dragging it down stops, it shows only the input; taller, the conversation.
			const collapsedHeight = this._inputOnlyHeight.get() + this._chrome;
			const inputOnly = groupHeight <= collapsedHeight;
			// Remembered once it settles, so that the sizes it passes through while dragged down to the input are not.
			if (!inputOnly && groupHeight >= collapsedHeight + CHAT_WINDOW_CONVERSATION_MIN_HEIGHT) {
				this._settledConversationHeight = groupHeight;
				this._rememberConversationHeight.schedule();
			} else {
				this._rememberConversationHeight.cancel();
			}
			if (inputOnly !== view.inputOnly.get()) {
				this._sizing = true;
				try {
					view.setInputOnly(inputOnly);
				} finally {
					this._sizing = false;
				}
			}
			if (view.inputOnly.get() && groupHeight !== collapsedHeight) {
				// Dragged to the very bottom: once the drag lets go, back up to where it shows the input.
				this._fitToInput.schedule();
			}
		}
	}

	override focus(): void {
		super.focus();
		this._sessionView?.focus();
	}
}
