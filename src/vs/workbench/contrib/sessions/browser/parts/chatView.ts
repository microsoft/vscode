/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, size } from '../../../../../base/browser/dom.js';
import { ISerializableView, IViewSize } from '../../../../../base/browser/ui/grid/grid.js';
import { ProgressBar } from '../../../../../base/browser/ui/progressbar/progressbar.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { IAction } from '../../../../../base/common/actions.js';
import { constObservable, IObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IEditorOptions } from '../../../../../editor/common/config/editorOptions.js';
import { IAgentsWindowDraft } from '../../../../../platform/window/common/window.js';
import { defaultProgressBarStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IProgressScope, ScopedProgressIndicator } from '../../../../services/progress/browser/progressIndicator.js';
import { IChat, ISession } from '../../../../services/sessions/common/session.js';
import { INewSessionDraftSlot } from '../../common/sessionsManagement.js';
import { IComposerInputSnapshot } from '../../common/newChatDraftState.js';
import { IChatRequestVariableEntry } from '../../../chat/common/attachments/chatVariableEntries.js';
import { ISelectNoWorkspaceOptions, ISelectWorkspaceOptions, WorkspaceSelectionResult } from '../../../../services/sessions/common/workspaceSelection.js';
import { ISessionPickerVisibility, noSessionPickerVisibility } from '../../common/sessionPickerVisibility.js';
import type { IChatSessionHistoryStatus } from '../../../../../platform/chat/common/chatSessionHistory.js';

/**
 * Discriminates between concrete {@link AbstractChatView} subclasses without
 * requiring core code (`sessions/browser/`) to import them from contrib.
 */
export type ChatViewKind = 'newSession' | 'newChatInSession' | 'chat';

export interface IChatViewRequestOutcome {
	readonly error?: string;
	readonly canceled?: boolean;
}

export interface IChatViewRequestSubmission {
	readonly sessionResource: URI;
	readonly completion: Promise<IChatViewRequestOutcome>;
}

/**
 * Options passed to a chat view when it is created.
 */
export interface IChatViewOptions {
	readonly inputEditorOptions?: Pick<IEditorOptions, 'fontSize' | 'lineHeight'>;
	readonly showEmptyStateIcon?: boolean;
	readonly renderNewSessionHeader?: (container: HTMLElement, before: HTMLElement) => IDisposable;
	/** Visibility of the owning session slot, preserved across composer/preparation/transcript handoffs. */
	readonly hostVisible?: IObservable<boolean>;
	/** Keep the custom view hosting this composer visible while preparing its draft. */
	readonly preserveCustomView?: boolean;
	/** Send new-session requests without navigating away from the hosting view. */
	readonly backgroundSend?: boolean;
	readonly renderChatPet?: boolean;
	readonly renderAquarium?: boolean;
	/** Host only the composer, without transcript content, input interactions, or transcript view-state persistence. */
	readonly inputOnly?: boolean;
	/** Options of the chat input of a chat view that hosts a session's chat. */
	readonly input?: IChatViewInputOptions;
	/** The session of the pane that hosts the view, such as the draft its new-session composer shows. */
	readonly session?: IObservable<ISession | undefined>;
	/** The chat the pane shows of {@link session}; its main chat while undefined. */
	readonly chat?: IObservable<IChat | undefined>;
	/**
	 * Hosts a new-session composer outside the main window's grid, such as in a chat window. Its drafts are held in the
	 * host's slot, so they never replace or take the main window composer's draft, and the grid is never changed.
	 */
	readonly newSessionDraft?: INewSessionDraftHost;
}

/**
 * The host of a new-session composer outside the main window's grid ({@link IChatViewOptions.newSessionDraft}).
 */
export interface INewSessionDraftHost {
	/** Holds the composer's drafts. */
	readonly slot: INewSessionDraftSlot;
	/** Keeps the composer's input, instead of the main composer's saved draft. */
	readonly input?: IComposerInputSnapshot;
	/**
	 * What the composer creates its drafts for, such as the defaults inherited from another chat, instead of the main
	 * composer's last workspace. The composer aims for it also when an agent becomes available only later.
	 */
	readonly requestedTarget?: IObservable<INewSessionTarget | undefined>;
	/**
	 * Replaces {@link requestedTarget}: the user changed the composer's workspace, agent, model or mode, or the composer
	 * starts its next draft from the selection of a background send.
	 */
	setRequestedTarget?(target: INewSessionTarget, reason: 'user' | 'background'): void;
	/** Opens a session the composer started in the background, in the composer's own window. */
	openStartedSession(session: ISession): Promise<void>;
	/**
	 * Called before the composer sends a request in the background. The host follows the request until it ends (see
	 * `trackNewSessionRequestEnd`), also after the composer is gone, and reports a failure and recovers the prompt: the
	 * management service does not notify failures of an independent slot. The composer disposes the result only when
	 * the send is rejected before it is dispatched.
	 */
	trackBackgroundSend(send: INewSessionBackgroundSend): IDisposable;
}

/** What a hosted composer creates its drafts for ({@link INewSessionDraftHost.requestedTarget}). */
export interface INewSessionTarget {
	/** The folder of the drafts; none for a workspace-less quick chat. */
	readonly folderUri?: URI;
	readonly providerId?: string;
	readonly sessionTypeId?: string;
	/** Applied when the session type offers it; otherwise the agent's default model. */
	readonly modelId?: string;
	/**
	 * The mode the chat shows (`IChat.mode`): for an Agent Host agent, its custom agent's URI, which is selected when the
	 * agent offers it. Not the session mode a creation takes. Undefined for the agent's default selection.
	 */
	readonly modeId?: string;
	/**
	 * Whether the drafts of {@link folderUri} run in a Dev Container, as the session they inherit from does, or as the user
	 * picked; a draft that cannot is not created elsewhere.
	 */
	readonly requireDevContainer?: boolean;
}

/** A background send of a composer ({@link INewSessionDraftHost.trackBackgroundSend}). */
export interface INewSessionBackgroundSend {
	/** The draft being sent; the request can replace it. */
	readonly session: ISession;
	/** The prompt as the user wrote it. */
	readonly query: string;
	readonly attachedContext: readonly IChatRequestVariableEntry[] | undefined;
	/** Whether it is still the composer's latest send; never once the composer is gone. */
	isLatest(): boolean;
}

/**
 * Options of the chat input of a chat view that hosts a session's chat.
 */
export interface IChatViewInputOptions {
	/** Shown in the empty input instead of the chat's own placeholder. */
	readonly placeholder?: string;
	/** The fewest lines the input shows; 2 by default. */
	readonly minLines?: number;
	/** Whether the status pills of the session show above the input; `true` by default. */
	readonly showPills?: boolean;
}

/**
 * How a session view shows its session, for a session view outside the Sessions part's grid, such as in a chat window.
 * By default, it shows its session as the Sessions part does.
 */
export interface ISessionViewHostOptions {
	/** Whether the session header shows above the chats; `true` by default. */
	readonly showHeader?: boolean;
	/** Whether the Session Activity Bar shows beside the chats; `true` by default. */
	readonly showActivityBar?: boolean;
	/** Options of the inputs of the chats. */
	readonly input?: IChatViewInputOptions;
}

/**
 * Base class for a view that lives inside the {@link SessionsPart} internal grid.
 * Each instance occupies a single grid leaf. Subclasses populate {@link element}
 * with their content and forward sizing to whatever widget they host by
 * overriding {@link doLayout}.
 *
 * Concrete implementations (e.g. `NewChatView`, `ChatView`) live in the
 * `sessions/contrib/chat/` layer where the chat widgets they host are defined.
 * Core code obtains instances via {@link IChatViewFactory}.
 */
export abstract class AbstractChatView extends Disposable implements ISerializableView {

	readonly element: HTMLElement = $('.chat-view');

	readonly minimumWidth = 200;
	readonly maximumWidth = Number.POSITIVE_INFINITY;
	readonly minimumHeight = 200;
	readonly maximumHeight = Number.POSITIVE_INFINITY;

	private readonly _onDidChange = this._register(new Emitter<IViewSize | undefined>());
	readonly onDidChange: Event<IViewSize | undefined> = this._onDidChange.event;

	/** A user request accepted for sending or queuing from this view, identified by its originating chat. */
	readonly onDidSubmitRequest: Event<IChatViewRequestSubmission> = Event.None;

	/**
	 * Lazily-created progress indicator scoped to this leaf. Mirrors how each
	 * editor group owns its own {@link ProgressBar} + `ScopedProgressIndicator`.
	 */
	private _progressIndicator: ScopedProgressIndicator | undefined;

	/**
	 * Discriminates the concrete subclass. Used by the session view host to
	 * decide whether the current concrete view can be reused or must be
	 * replaced when `openSession` is called.
	 */
	abstract readonly kind: ChatViewKind;

	readonly pickerVisibility: IObservable<ISessionPickerVisibility> = constObservable(noSessionPickerVisibility);

	get activityBarActions(): IObservable<readonly IAction[]> {
		return constObservable([]);
	}

	/** Retain the composer while it clears a draft as part of an in-place selection change. */
	get preserveOnSessionClear(): boolean {
		return false;
	}

	focusWorkspacePicker(): void {
		// no-op by default
	}

	focusHarnessPicker(): void {
		// no-op by default
	}

	focusEnvironmentPicker(): void {
		// no-op by default
	}

	focusBranchPicker(): void {
		// no-op by default
	}

	focusWorktreePicker(): void {
		// no-op by default
	}

	focusSyncAction(): void {
		// no-op by default
	}

	openModelComparison(): void { }

	/**
	 * Intrinsic composer content for input-only hosts to measure and observe.
	 * Includes new-session pickers where present; ownership stays with the view.
	 */
	get inputContentElement(): HTMLElement | undefined {
		return undefined;
	}

	/**
	 * Whether the view has a visible transcript turn to retain when a remote
	 * host disconnects. New and unbound views intentionally report no content.
	 */
	readonly hasVisibleTranscriptContent: IObservable<boolean> = constObservable(false);

	/**
	 * Whether this view is still resolving its chat model, during which
	 * {@link hasVisibleTranscriptContent} is not yet meaningful — it reads `false` for a transcript
	 * that simply has not arrived yet as well as for one that does not exist. Views that never load
	 * a model report `false`, since for them the answer is already final.
	 */
	readonly isLoadingTranscript: IObservable<boolean> = constObservable(false);

	/** Whether an input notification already explains a temporary sending restriction. */
	readonly isInputBlocked: IObservable<boolean> = constObservable(false);
	readonly historyStatus: IObservable<IChatSessionHistoryStatus | undefined> = constObservable(undefined);

	/**
	 * Show the given chat in this view. The default implementation is a
	 * no-op; subclasses that host a chat widget (e.g. `ChatView`) override
	 * this to load the chat model and feed it into the widget.
	 */
	setChat(_chat: IChat, _historyKey?: string, _session?: ISession, _onInput?: () => void): void {
		// no-op by default
	}

	/** Retry a failed load when the user explicitly opens the selected chat again. */
	reopenChat(_resource: URI): Promise<void> {
		return Promise.resolve();
	}

	/**
	 * Select a workspace folder, acknowledging application or preservation of an existing choice.
	 * Views without a ready workspace picker return notReady.
	 */
	selectWorkspace(_folderUri: URI, _options?: ISelectWorkspaceOptions): WorkspaceSelectionResult {
		return 'notReady';
	}

	applyDraft(_draft: IAgentsWindowDraft, _folderUri: URI | undefined, _options: ISelectWorkspaceOptions, _token: CancellationToken): Promise<WorkspaceSelectionResult> {
		return Promise.resolve('notReady');
	}

	/**
	 * Start without a workspace, acknowledging application or preservation of an existing choice.
	 * Views without a ready workspace picker return notReady.
	 */
	selectNoWorkspace(_options?: ISelectNoWorkspaceOptions): WorkspaceSelectionResult {
		return 'notReady';
	}

	/**
	 * Whether the view shows only its chat input, without the conversation. In that mode the view shows the
	 * chat's progress and its approvals above the input, and shows the conversation again when the chat needs
	 * input that can only be given there. Hosts size the view to {@link inputOnlyHeight} while it is set.
	 */
	readonly inputOnly: IObservable<boolean> = constObservable(false);

	/**
	 * The height the view needs to show only its input, whether or not it shows only the input now, once
	 * {@link enableInputOnly} was called.
	 */
	readonly inputOnlyHeight: IObservable<number> = constObservable(0);

	/** Whether the view can show only its input: not while the chat needs input that only the conversation shows. */
	readonly canShowInputOnly: IObservable<boolean> = constObservable(false);

	/**
	 * Lets the user switch between showing only the input and showing the conversation, and shows only the input unless
	 * `inputOnly` is `false`. The input, with what is shown above it, grows to at most `maxHeight`. Views without a
	 * conversation ignore this.
	 */
	enableInputOnly(_options: { readonly maxHeight: number; readonly inputOnly?: boolean }): void {
		// no-op by default
	}

	/** Shows only the input, or the conversation, once {@link enableInputOnly} was called. */
	setInputOnly(_inputOnly: boolean): void {
		// no-op by default
	}

	/** Shows the conversation, and no longer lets the user switch to showing only the input. */
	disableInputOnly(): void {
		// no-op by default
	}

	/**
	 * Saves what the view shows of its chat, such as where it is scrolled to, so that another view of the chat shows the
	 * same, such as after the chat moved. The default implementation is a no-op.
	 */
	saveViewState(): void {
		// no-op by default
	}

	/**
	 * Prefill the input with the given text. The default implementation is
	 * a no-op; subclasses that host an input widget (e.g. `NewChatView`)
	 * override this.
	 */
	prefillInput(_text: string): void {
		// no-op by default
	}

	/**
	 * Submit the given text as a chat query. The default implementation is
	 * a no-op; subclasses that host an input widget (e.g. `NewChatView`)
	 * override this.
	 */
	sendQuery(_text: string): void {
		// no-op by default
	}

	/** Submit the current composer input, returning whether it was sent. */
	submitInput(): Promise<boolean> {
		return Promise.resolve(false);
	}

	/**
	 * Attach the given resources as context to this view's chat input. The
	 * default implementation is a no-op; subclasses that host a chat widget
	 * (e.g. `ChatView`) override this to add the attachments to the widget.
	 */
	attach(_uris: URI[]): void {
		// no-op by default
	}

	/**
	 * Notifies the view whether it is the currently active session in the
	 * sessions grid. Subclasses may use this to adjust their visual styling
	 * (e.g. the chat list's background color). The default implementation
	 * is a no-op.
	 */
	setActive(_active: boolean): void {
		// no-op by default
	}

	/**
	 * Notifies the view whether it is currently shown. Unlike {@link setActive},
	 * inactive sessions displayed side by side are still visible.
	 */
	setVisible(_visible: boolean): void {
		// no-op by default
	}

	/**
	 * Notifies the view of its position and whether the chat grid is split.
	 * Session-scoped UI can use this to avoid repeating across split groups and adapt its layout.
	 */
	setPrimary(_primary: boolean, _split = false): void {
		// no-op by default
	}

	/**
	 * Shows an indeterminate progress bar at the top of this leaf while the
	 * given promise is pending, mirroring how each editor group surfaces
	 * progress on its own {@link ProgressBar} (see `EditorGroupView` /
	 * `ScopedProgressIndicator`). The bar is scoped to this view, so concurrent
	 * loads in other grid leaves are unaffected. Overlapping loads on this leaf
	 * are joined by the indicator so the bar only hides once all have settled.
	 * The optional `delay` avoids flashing the bar for fast (e.g. cached) loads.
	 */
	protected showProgressWhile(promise: Promise<unknown>, delay?: number): void {
		if (!this._progressIndicator) {
			// Created lazily and pinned to the top of the leaf via CSS.
			const progressBar = this._register(new ProgressBar(this.element, defaultProgressBarStyles));
			progressBar.hide();
			// A chat leaf is always the active surface within its own grid leaf,
			// so its progress scope is permanently active.
			const scope: IProgressScope = { isActive: true, onDidChangeActive: Event.None };
			this._progressIndicator = this._register(new ScopedProgressIndicator(progressBar, scope));
		}
		this._progressIndicator.showWhile(promise, delay);
	}

	/**
	 * Called by the workbench grid to size this leaf. Sizes {@link element}
	 * to the allocated dimensions and then delegates to {@link doLayout} so
	 * subclasses can forward sizing to their hosted widget.
	 */
	layout(width: number, height: number, top: number, left: number): void {
		size(this.element, width, height);
		this.doLayout(width, height, top, left);
	}

	protected abstract doLayout(width: number, height: number, top: number, left: number): void;

	abstract toJSON(): object;

	abstract focus(): void;
}
