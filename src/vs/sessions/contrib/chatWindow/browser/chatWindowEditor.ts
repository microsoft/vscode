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
import { DEFAULT_EDITOR_MIN_DIMENSIONS } from '../../../../workbench/browser/parts/editor/editor.js';
import { EditorPane } from '../../../../workbench/browser/parts/editor/editorPane.js';
import { EditorInputCapabilities, IEditorOpenContext } from '../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';
import { GroupDirection, GroupLayoutPriority, GroupsArrangement, IEditorGroup, IEditorGroupsService, IEditorPart } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import type { AbstractChatView } from '../../../browser/parts/chatView.js';
import { SessionView } from '../../../browser/parts/sessionView.js';
import { ISessionsPartService } from '../../../services/sessions/browser/sessionsPartService.js';
import { IHostService } from '../../../../workbench/services/host/browser/host.js';
import { ChatWindowTerminalPosition } from '../../../services/chatWindow/browser/chatWindowService.js';
import { SessionLayoutMode, SessionSplitLayout } from '../../../common/sessionLayoutMode.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { stackedChatConversationFits, stackedChatForcedByWindow, stackedChatPersistedInputOnly, clampStackedChatOnResize, decideStackedChatInputOnly, shouldDecideStackedChatInputOnly, shouldRestoreStackedChatConversation } from '../../../browser/parts/stackedChatInputOnly.js';
import { ChatWindowState } from './chatWindowState.js';
import './media/chatWindowEditor.css';

/** The most the chat input, with the progress and approvals above it, grows to. */
const CHAT_WINDOW_INPUT_MAX_HEIGHT = 400;

/** The least room the conversation gets above the input while it is shown below the editor. */
const CHAT_WINDOW_CONVERSATION_MIN_HEIGHT = 120;

/** The share of the height of a chat window that its terminal row takes when it shows, and the least it takes. */
const CHAT_WINDOW_TERMINAL_HEIGHT_RATIO = 0.3;
const CHAT_WINDOW_TERMINAL_MIN_HEIGHT = 120;

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
	/** The height of this group's own chrome, such as its title, above this editor; not its layout insets. */
	private _chrome = 0;
	/** The height of the insets around this group, such as the gap between cards, which its minimum and maximum height add. */
	private _insets = 0;
	/** What limits the height of this group: set when it is arranged, and measured against its chrome and insets. */
	private _constraintMode: { readonly minimum: 'input' | 'conversation' | undefined; readonly maximumInput: boolean } | undefined;
	private _measuredMargin: string | undefined;
	private _measuredInsets: number | undefined;
	/** Whether a pointer is down, such as on the sash dragging this group's height. */
	private _pointerDown = false;
	/** Set when the window was resized, until the sash is pressed or the groups are arranged again; see {@link layout}. */
	private _afterWindowResize = false;
	/** Set when this editor was laid out while it sized its group, and what it shows is then decided again. */
	private _decisionPending = false;
	/** The height of the window's editor area when this editor was last laid out; see {@link layout}. */
	private _partHeight: number | undefined;
	/** The height of this group the user last chose while the conversation was shown below the editor. */
	private _conversationHeight: number | undefined;
	private _settledConversationHeight: number | undefined;
	private readonly _rememberConversationHeight = this._register(new RunOnceScheduler(() => this._conversationHeight = this._settledConversationHeight, 500));
	/** Shows the conversation again once the layout that asked for it is done: arranging groups inside it would leave the split view's offsets stale. */
	private readonly _restoreConversationScheduler = this._register(new RunOnceScheduler(() => this._view?.setInputOnly(false), 0));
	private readonly _recoverTerminalScheduler = this._register(new RunOnceScheduler(() => this._recoverTerminal(), 0));
	/** How the groups were last arranged: the editor above or beside this group. */
	private _arrangedSplitLayout: SessionSplitLayout | undefined;
	/** Set while this editor is laid out, or while it sizes its group, so that sizes then do not switch what it shows. */
	private _sizing = false;
	private readonly _inputDisposables = this._register(new DisposableStore());
	/** Once a drag lets go, settles the group on the input, or on the conversation, rather than between. */
	private readonly _settle = this._register(new RunOnceScheduler(() => {
		const byUser = this._settleByUser;
		this._settleByUser = false;
		this._decide(false, byUser);
	}, 0));
	/** The height of the terminal row the user last chose, or that it opened with: what it is given back when the window grows. */
	private _terminalHeight: number | undefined;
	/** Whether the settle that is scheduled follows the user letting go of the sash. */
	private _settleByUser = false;
	/** Set while the chat shows only its input because the window is too short, see {@link stackedChatForcedByWindow}. */
	private _forcedByWindow = false;

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
		const targetWindow = dom.getWindow(parent);
		// The sash drags with the mouse: what its drag shows is settled when it lets go.
		this._register(dom.addDisposableListener(targetWindow, dom.EventType.POINTER_DOWN, e => {
			// Only a press on a sash of this window's editor area can drag the split.
			this._pointerDown = dom.isHTMLElement(e.target) && !!e.target.closest('.monaco-sash');
			if (this._pointerDown) {
				this._afterWindowResize = false;
			}
		}, true));
		const release = () => {
			if (this._pointerDown) {
				this._pointerDown = false;
				this._rememberTerminalHeight();
				this._settleByUser = true;
				this._settle.schedule();
			}
		};
		// A pointer that is lost (such as when the window loses focus) must not leave the press stuck.
		for (const type of [dom.EventType.POINTER_UP, 'pointercancel', dom.EventType.DRAG_END]) {
			this._register(dom.addDisposableListener(targetWindow, type, release, true));
		}
		this._register(dom.addDisposableListener(targetWindow, dom.EventType.BLUR, release));
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
				// With an editor area, its entries open their tabs there; see chatWindowActivityBar.ts.
				showActivityBar: kind.showActivityBar ?? false,
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
			return layout === SessionLayoutMode.SideBySide || layout === SessionLayoutMode.ChatOnly;
		});
		const partChanged = observableSignalFromEvent(this, Event.any<unknown>(part.onDidLayout, part.onDidAddGroup, part.onDidRemoveGroup));
		// Showing only the input, the chat shows no session header either.
		store.add(autorun(reader => sessionView.setHeaderHidden(view.inputOnly.read(reader))));
		store.add(toDisposable(() => sessionView.setHeaderHidden(false)));
		// The session header, and the bar of the chat's group, stay above the input.
		// Measured while it shows only the input: with the conversation, the session header is shown above the input as well,
		// which would move the height the chat snaps to as it is dragged across it.
		let measuredInputOnlyHeight = 0;
		this._inputOnlyHeight = debouncedObservable(derived(this, reader => {
			const height = view.inputOnlyHeight.read(reader);
			const inputOnly = view.inputOnly.read(reader);
			if (inputOnly || !measuredInputOnlyHeight) {
				measuredInputOnlyHeight = height ? height + sessionView.primaryChatViewTop.read(reader) : 0;
			}
			return measuredInputOnlyHeight;
		}), 0);
		store.add(toDisposable(() => this._inputOnlyHeight = constObservable(0)));
		let arranged: SessionLayoutMode | undefined;
		let wasInputOnly: boolean | undefined;
		let wasConversationOnly: boolean | undefined;
		/** The group this editor maximized to hide the other one. */
		let maximized: IEditorGroup | undefined;
		/** The terminal row that showed beside the group this editor maximized. */
		let maximizedBeside: IEditorGroup | undefined;
		/** The terminal row as last arranged, across the bottom of the window. */
		let arrangedTerminal: IEditorGroup | undefined;
		/** Where the terminal row was last arranged. */
		let arrangedTerminalPosition: ChatWindowTerminalPosition | undefined;
		/** The editor group that gives way first when the window is resized, or when the terminal row is added. */
		let prioritizedEditor: IEditorGroup | undefined;
		/** The terminal row, which gives way last. */
		let prioritizedTerminal: IEditorGroup | undefined;
		const clearPriority = () => {
			for (const group of [prioritizedEditor, prioritizedTerminal]) {
				if (group && part.groups.includes(group)) {
					part.setGroupLayoutPriority(group, undefined);
				}
			}
			prioritizedEditor = undefined;
			prioritizedTerminal = undefined;
		};
		store.add(toDisposable(clearPriority));

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
				// Toggled by the user.
				this._forcedByWindow = false;
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
			const terminal = state.terminalGroup.read(reader);
			const terminalPosition = state.terminalPosition.read(reader);
			const layout = state.layout.read(reader);
			const splitLayout = state.splitLayout.read(reader);
			const inputOnly = view.inputOnly.read(reader);
			const inputOnlyHeight = this._inputOnlyHeight.read(reader);
			const collapsedHeight = inputOnlyHeight + this._chrome + this._insets;
			const canCollapse = view.canShowInputOnly.read(reader);
			// Below the editor, the group is sized to the input, so not before the input is measured.
			if (part.count < 2 || (layout === SessionLayoutMode.Stacked && inputOnlyHeight === 0)) {
				return;
			}
			// Sized again when what shows changes.
			const previous = arranged;
			const previousInputOnly = wasInputOnly;
			arranged = layout;
			wasInputOnly = inputOnly;
			const sideBySide = splitLayout === SessionLayoutMode.SideBySide;
			if (layout === SessionLayoutMode.Stacked) {
				// Dragged to, or switched to by the chat: the chat window opens so next time, unless the window forced it.
				state.setInputOnly(stackedChatPersistedInputOnly({ inputOnly, forcedByWindow: this._forcedByWindow, lastUserChoice: state.inputOnly.read(undefined) }));
			}
			if (this._sizing) {
				// Laid out to a size the user dragged to, which already decided what it shows.
				return;
			}
			const decisionPending = () => {
				if (this._decisionPending) {
					this._decisionPending = false;
					this._decide(this._pointerDown);
				}
			};
			this._afterWindowResize = false;
			this._sizing = true;
			try {
				// Side by side, the chat leads and the editor follows it; otherwise the editor sits above the chat. The terminal
				// row spans the bottom of the window below both by default: below the chat first, then the editor beside or
				// above the chat. Below only one of them, it is placed after the editor, below the chat or the editor.
				const editor = part.groups.find(group => group !== this.group && group !== terminal);
				const terminalAdded = !!terminal && (terminal !== arrangedTerminal || terminalPosition !== arrangedTerminalPosition);
				arrangedTerminal = terminal;
				arrangedTerminalPosition = terminalPosition;
				if (editor) {
					const arrangedSplitLayout = this._arrangedSplitLayout;
					if (terminalAdded || (arrangedSplitLayout === undefined ? sideBySide : arrangedSplitLayout !== splitLayout)) {
						if (maximized) {
							part.toggleMaximizeGroup();
							maximized = undefined;
						}
						// Stacked, the chat is the bottom of the window: below it is across the bottom, as full width.
						const underEditor = terminalPosition === ChatWindowTerminalPosition.UnderEditor;
						const underChatOnly = sideBySide && terminalPosition === ChatWindowTerminalPosition.UnderChat;
						if (terminal && !underEditor && !underChatOnly) {
							part.moveGroup(terminal, this.group, GroupDirection.DOWN);
						}
						part.moveGroup(editor, this.group, sideBySide ? GroupDirection.RIGHT : GroupDirection.UP);
						if (terminal && underEditor) {
							part.moveGroup(terminal, editor, GroupDirection.DOWN);
						} else if (terminal && underChatOnly) {
							part.moveGroup(terminal, this.group, GroupDirection.DOWN);
						}
						if (terminal) {
							this._sizeTerminalRow(part, terminal);
						}
					}
					this._arrangedSplitLayout = splitLayout;
				}
				// The editor gives way to the window and to the terminal row, so that the chat and the terminal keep their
				// heights. Docked, the chat has the part's height to itself.
				// It is applied on every arrange: restoring the editor part's state drops it.
				if (!docked) {
					if (editor !== prioritizedEditor || terminal !== prioritizedTerminal) {
						clearPriority();
					}
					if (editor) {
						part.setGroupLayoutPriority(editor, GroupLayoutPriority.High);
						prioritizedEditor = editor;
					}
					if (terminal) {
						part.setGroupLayoutPriority(terminal, GroupLayoutPriority.Low);
						prioritizedTerminal = terminal;
					}
				}

				// With one of the editor and the chat hidden, the other fills the chat window, above the terminal row.
				const shown = layout === SessionLayoutMode.EditorOnly ? editor : layout === SessionLayoutMode.ChatOnly ? this.group : undefined;
				if (shown !== maximized || (shown && terminal !== maximizedBeside)) {
					if (maximized) {
						part.toggleMaximizeGroup();
					}
					maximized = shown;
					maximizedBeside = shown ? terminal : undefined;
					if (shown && terminal) {
						// Sized before, as resizing a group shows the hidden ones again.
						part.maximizeGroup(shown, [terminal]);
					} else if (shown) {
						part.arrangeGroups(GroupsArrangement.MAXIMIZE, shown);
					}
				}
				if (shown) {
					this._constraintMode = undefined;
					this._applyConstraints();
					return;
				}

				// Dragged down, the group stops where it shows only the input; while the chat needs the conversation, above it.
				// A group at its minimum counts as minimized and is expanded when it is activated, so it is kept a pixel above.
				// Docked, it cannot be dragged up either: it shows the conversation only while the chat needs it.
				if (docked && canCollapse && !inputOnly) {
					view.setInputOnly(true);
					return;
				}
				this._constraintMode = { minimum: sideBySide ? undefined : canCollapse ? 'input' : 'conversation', maximumInput: docked && canCollapse };
				this._applyConstraints();
				const { width, height } = part.getSize(this.group);
				if (sideBySide) {
					if (previous !== layout) {
						part.arrangeGroups(GroupsArrangement.EVEN);
						if (terminal) {
							this._sizeTerminalRow(part, terminal);
						}
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
				decisionPending();
			}
		}));
		return store;
	}

	/** Sizes the terminal row across the bottom of the window as the panel of the main window opens. */
	private _sizeTerminalRow(part: IEditorPart, terminal: IEditorGroup): void {
		const { width } = part.getSize(terminal);
		const height = Math.max(CHAT_WINDOW_TERMINAL_MIN_HEIGHT, Math.round(part.contentDimension.height * CHAT_WINDOW_TERMINAL_HEIGHT_RATIO));
		part.setSize(terminal, { width, height });
		this._terminalHeight = height;
	}

	private _applyConstraints(): void {
		const mode = this._constraintMode;
		const input = this._inputOnlyHeight.get() + this._chrome;
		this._setSizeConstraints(
			mode?.minimum === undefined ? undefined : mode.minimum === 'input' ? input - 1 : input + CHAT_WINDOW_CONVERSATION_MIN_HEIGHT,
			mode?.maximumInput ? input : undefined,
		);
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
		// A later input arranges against its own sizes, not these.
		this._arrangedSplitLayout = undefined;
		this._conversationHeight = undefined;
		this._partHeight = undefined;
		this._constraintMode = undefined;
		this._restoreConversationScheduler.cancel();
		this._recoverTerminalScheduler.cancel();
		this._forcedByWindow = false;
		this._afterWindowResize = false;
		this._terminalHeight = undefined;
		this._settleByUser = false;
		this._applyConstraints();
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
		const insets = this._measureInsets();
		const chrome = Math.max(0, groupHeight - insets - dimension.height);
		const constraintsChanged = chrome !== this._chrome || insets !== this._insets;
		this._chrome = chrome;
		this._insets = insets;
		if (constraintsChanged && this._constraintMode) {
			this._applyConstraints();
		}
		// The window was resized, rather than the split dragged: what this editor shows stays, and showing only the input,
		// it is sized back to the input once the editor area is laid out (see `_arrangeGroups`).
		const partHeight = part.contentDimension.height;
		const windowResized = this._partHeight !== undefined && partHeight !== this._partHeight;
		this._partHeight = partHeight;
		if (this._sizing) {
			this._decisionPending = true;
		} else if (!windowResized) {
			if (shouldDecideStackedChatInputOnly({ afterWindowResize: this._afterWindowResize, pointerDown: this._pointerDown })) {
				this._decide(this._pointerDown);
			}
		} else {
			this._afterWindowResize = true;
			if (!this._restoreConversation()) {
				this._clampOnResize();
			}
			if (this._terminalNeedsRecovery()) {
				this._recoverTerminalScheduler.schedule();
			}
		}
	}

	private _terminalNeedsRecovery(): boolean {
		const terminal = this._state?.terminalGroup.get();
		if (this._terminalHeight === undefined || !terminal || this._state?.docked) {
			return false;
		}
		const part = this._editorGroupsService.getPart(this.group);
		return part.groups.includes(terminal) && part.getSize(terminal).height < this._terminalHeight;
	}

	private _rememberTerminalHeight(): void {
		const terminal = this._state?.terminalGroup.get();
		if (terminal && !this._state?.docked) {
			const part = this._editorGroupsService.getPart(this.group);
			if (part.groups.includes(terminal) && !part.hasMaximizedGroup()) {
				this._terminalHeight = part.getSize(terminal).height;
			}
		}
	}

	/**
	 * The window grew after it squeezed the terminal row: the editor, which takes the growth first, gives the row back
	 * the height it was left at, down to its own minimum height.
	 */
	private _recoverTerminal(): void {
		const terminal = this._state?.terminalGroup.get();
		const chosen = this._terminalHeight;
		if (!terminal || chosen === undefined || this._state?.docked) {
			return;
		}
		const part = this._editorGroupsService.getPart(this.group);
		const editor = part.groups.find(group => group !== this.group && group !== terminal);
		if (!editor || !part.groups.includes(terminal) || part.hasMaximizedGroup()) {
			return;
		}
		const { width, height } = part.getSize(terminal);
		const slack = part.getSize(editor).height - DEFAULT_EDITOR_MIN_DIMENSIONS.height;
		const give = Math.min(chosen - height, slack);
		if (give > 0) {
			this._sizing = true;
			try {
				part.setSize(terminal, { width, height: height + give });
			} finally {
				this._sizing = false;
			}
		}
	}

	/** The height of the layout insets around this group, such as the gap between cards, which it adds to its sizes. */
	private _measureInsets(): number {
		const group = this._container?.closest<HTMLElement>('.editor-group-container');
		if (!group) {
			return 0;
		}
		// The insets are set as the group's margin: they are measured again only when it changes.
		const margin = group.style.margin;
		if (this._measuredMargin !== margin || this._measuredInsets === undefined) {
			const style = dom.getWindow(group).getComputedStyle(group);
			this._measuredMargin = margin;
			this._measuredInsets = (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0);
		}
		return this._measuredInsets;
	}

	/** The window grew: a chat that showed only its input because it was too short shows the conversation again. */
	private _restoreConversation(): boolean {
		const view = this._view;
		if (!view || !this._forcedByWindow || !view.inputOnly.get() || this._minimumHeight === undefined || this._constraintMode?.minimum !== 'input' || this._state?.docked) {
			return false;
		}
		const part = this._editorGroupsService.getPart(this.group);
		const editor = part.groups.find(group => group !== this.group && group !== this._state?.terminalGroup.get());
		if (!editor || part.hasMaximizedGroup()) {
			return false;
		}
		const restore = shouldRestoreStackedChatConversation({
			forcedByWindow: true,
			groupHeight: part.getSize(this.group).height,
			collapsedHeight: this._inputOnlyHeight.get() + this._chrome + this._insets,
			conversationMinHeight: CHAT_WINDOW_CONVERSATION_MIN_HEIGHT,
			editorHeight: part.getSize(editor).height,
			editorMinimumHeight: DEFAULT_EDITOR_MIN_DIMENSIONS.height,
		});
		if (restore) {
			this._forcedByWindow = false;
			// The groups are arranged again for it, the chat at the height the user last left it.
			this._restoreConversationScheduler.schedule();
		}
		return restore;
	}

	/** The window was resized, with this group below the editor: showing the conversation, it keeps its least height. */
	private _clampOnResize(): void {
		const view = this._view;
		if (!view || this._minimumHeight === undefined || this._constraintMode?.minimum !== 'input' || this._state?.docked) {
			return;
		}
		const part = this._editorGroupsService.getPart(this.group);
		if (part.hasMaximizedGroup()) {
			return;
		}
		const { width, height: groupHeight } = part.getSize(this.group);
		const collapsedHeight = this._inputOnlyHeight.get() + this._chrome + this._insets;
		const height = view.inputOnly.get() ? undefined : clampStackedChatOnResize({ groupHeight, collapsedHeight, conversationMinHeight: CHAT_WINDOW_CONVERSATION_MIN_HEIGHT, inputOnly: false });
		if (height === undefined) {
			return;
		}
		const editor = part.groups.find(group => group !== this.group && group !== this._state?.terminalGroup.get());
		this._sizing = true;
		try {
			if (editor && !stackedChatConversationFits({ groupHeight, collapsedHeight, conversationMinHeight: CHAT_WINDOW_CONVERSATION_MIN_HEIGHT, editorHeight: part.getSize(editor).height, editorMinimumHeight: DEFAULT_EDITOR_MIN_DIMENSIONS.height })) {
				// The editor gives way first; the terminal row keeps its height, so the chat shows only its input.
				this._forcedByWindow = true;
				view.setInputOnly(true);
			} else {
				part.setSize(this.group, { width, height });
			}
		} finally {
			this._sizing = false;
		}
	}

	/**
	 * Below the editor: at the bottom, where dragging it down stops, it shows only the input; taller, the conversation.
	 * Dragging snaps between the two, and where the drag lets go, the group is sized to one of them.
	 */
	private _decide(dragging: boolean, byUser = dragging): void {
		const view = this._view;
		if (!view || this._minimumHeight === undefined || this._sizing || this._state?.docked) {
			return;
		}
		const part = this._editorGroupsService.getPart(this.group);
		const { width, height: groupHeight } = part.getSize(this.group);
		const collapsedHeight = this._inputOnlyHeight.get() + this._chrome + this._insets;
		const { inputOnly, settleHeight } = decideStackedChatInputOnly({ groupHeight, collapsedHeight, conversationMinHeight: CHAT_WINDOW_CONVERSATION_MIN_HEIGHT, dragging });
		// Remembered once it settles, so that the sizes it passes through while dragged down to the input are not.
		if (!inputOnly && groupHeight >= collapsedHeight + CHAT_WINDOW_CONVERSATION_MIN_HEIGHT) {
			this._settledConversationHeight = groupHeight;
			this._rememberConversationHeight.schedule();
		} else {
			this._rememberConversationHeight.cancel();
		}
		const wasInputOnly = view.inputOnly.get();
		this._forcedByWindow = stackedChatForcedByWindow({ wasForced: this._forcedByWindow, wasInputOnly, inputOnly, byUser });
		this._sizing = true;
		try {
			if (inputOnly !== wasInputOnly) {
				view.setInputOnly(inputOnly);
			}
			if (settleHeight !== undefined) {
				part.setSize(this.group, { width, height: settleHeight });
			}
		} finally {
			this._sizing = false;
		}
		if (dragging) {
			this._decisionPending = false;
		} else if (this._decisionPending) {
			this._decisionPending = false;
			this._settle.schedule();
		}
	}

	override focus(): void {
		super.focus();
		this._sessionView?.focus();
	}
}
