/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { observableValue, derived, autorun, type ISettableObservable, type IReader } from '../../../../base/common/observable.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { URI } from '../../../../base/common/uri.js';
import { getWindow } from '../../../../base/browser/dom.js';
import { AGENTS_VOICE_WINDOW_DEFAULT_WIDTH, AGENTS_VOICE_WINDOW_DEFAULT_HEIGHT } from '../common/agentsVoice.js';
import { createHeader } from './components/headerComponent.js';
import { createStatusRows } from './components/statusRowsComponent.js';
import { createTranscript, updateTranscriptOverflowState } from './components/transcriptComponent.js';
import { createSessionList, type SessionRowData, type SessionGroupData } from './components/sessionListComponent.js';
import { createFeedbackDialog, type FeedbackDialogState } from './components/feedbackDialog.js';
import { createOnboarding } from './components/onboardingComponent.js';
import { FONT_SIZE } from './components/tokens.js';
import type { VoiceState, IPendingToolConfirmation, ITranscriptTurn } from '../../chat/browser/voiceClient/voiceSessionController.js';

export interface VoiceWidgetCallbacks {
	readonly copilotIconSrc: string;
	connect(): void;
	disconnect(): void;
	pttDown(): void;
	pttUp(): void;
	closeWindow(): void;
	stopPlayback(): void;
	openSession(resource: URI): void;
	stopSession(resource: URI): void;
	cancelSession(resource: URI): void;
	/** Select a session as the transcription target. */
	selectTargetSession(resource: URI | undefined): void;
	/** Create a new session and set it as transcription target. */
	newSessionAsTarget(): void;
	getAnalyserNode(): AnalyserNode | null;
	onResize(): void;
	openPttKeySettings(): void;
	/** Optional — when provided, header renders a "popout" button. */
	openPopout?(): void;
	/** Submit user feedback. Returns success/failure. */
	submitFeedback(feedbackText: string): Promise<{ ok: boolean; error?: string }>;
	/** Called when the user dismisses the onboarding card. */
	onOnboardingCompleted?(): void;
}

/**
 * Host-configuration for the widget. Defaults match the floating aux-window
 * (the original consumer); the chatViewPane voice bar overrides everything.
 */
export interface VoiceWidgetOptions {
	/** Fixed pixel width (legacy aux-window behavior) or `'auto'` to flow. */
	readonly width?: number | 'auto';
	/** Whether the header is a drag handle (aux window only). */
	readonly draggable?: boolean;
	/** Show the close X in the header. */
	readonly showClose?: boolean;
	/** Show the expand/collapse chevron + session list. */
	readonly showExpandChevron?: boolean;
	/** Show the centered "Tap to start / Listening / Speaking" status label. */
	readonly showStatusText?: boolean;
	/**
	 * Show the working/needs-input/done counter rows and the "No active sessions"
	 * placeholder. The speaking-session pill and tool confirmations remain
	 * visible regardless, since they are important interactive context.
	 */
	readonly showStatusCounters?: boolean;
	/** Show the copilot icon at the start of the header. */
	readonly showCopilotIcon?: boolean;
	/** Center the Connect button horizontally instead of pushing it to the right. */
	readonly centerConnectButton?: boolean;
	/** Optional title rendered above the header row (e.g. "VOICE CHAT"). */
	readonly title?: string;
	/** Optional subtitle rendered next to the title. */
	readonly subtitle?: string;
	/** Set tabIndex=0 on the widget root and wire Space-key PTT. */
	readonly focusable?: boolean;
	/** Whether to show the onboarding card (first-time experience). */
	readonly showOnboarding?: boolean;
	/**
	 * When true, the onboarding card re-appears every time the widget enters
	 * a fully-disconnected state (i.e. not connected, not connecting, and not
	 * auto-reconnecting). When false (default), onboarding follows the legacy
	 * first-time-only behavior gated by ``showOnboarding`` + manual dismiss.
	 */
	readonly reshowOnboardingOnDisconnect?: boolean;
	/**
	 * Initial expanded state of the widget — when true the session list and
	 * expanded session details are shown by default. Defaults to false
	 * (collapsed) to match the legacy floating aux-window behavior.
	 */
	readonly defaultExpanded?: boolean;
}

const DEFAULT_OPTIONS: Required<VoiceWidgetOptions> = {
	width: AGENTS_VOICE_WINDOW_DEFAULT_WIDTH,
	draggable: true,
	showClose: true,
	showExpandChevron: true,
	showStatusText: false,
	showStatusCounters: true,
	showCopilotIcon: false,
	centerConnectButton: false,
	title: '',
	subtitle: '',
	focusable: false,
	showOnboarding: false,
	reshowOnboardingOnDisconnect: false,
	defaultExpanded: false,
};

export class AgentsVoiceWidget extends Disposable {

	// --- Reactive state ---
	private readonly _isConnected: ISettableObservable<boolean> = observableValue(this, false);
	private readonly _isConnecting: ISettableObservable<boolean> = observableValue(this, false);
	private readonly _isReconnecting: ISettableObservable<boolean> = observableValue(this, false);
	private readonly _voiceState: ISettableObservable<VoiceState> = observableValue(this, 'idle');
	private readonly _expanded: ISettableObservable<boolean> = observableValue(this, false);
	private readonly _workingCount: ISettableObservable<number> = observableValue(this, 0);
	private readonly _needsInputCount: ISettableObservable<number> = observableValue(this, 0);
	private readonly _doneCount: ISettableObservable<number> = observableValue(this, 0);
	private readonly _pendingToolConfirmations: ISettableObservable<readonly IPendingToolConfirmation[]> = observableValue(this, []);
	private readonly _speakingSession: ISettableObservable<URI | undefined> = observableValue(this, undefined);
	private readonly _speakingSessionLabel: ISettableObservable<string | undefined> = observableValue(this, undefined);
	private readonly _sessions: ISettableObservable<readonly SessionRowData[]> = observableValue(this, []);
	private readonly _sessionGroups: ISettableObservable<readonly SessionGroupData[] | undefined> = observableValue(this, undefined);
	private readonly _selectedTargetSession: ISettableObservable<URI | undefined> = observableValue(this, undefined);
	private readonly _transcriptTurns: ISettableObservable<readonly ITranscriptTurn[]> = observableValue(this, []);
	private readonly _pttKeyLabel: ISettableObservable<string | undefined> = observableValue(this, undefined);
	private readonly _statusText: ISettableObservable<string> = observableValue(this, '');
	private readonly _popoutAvailable: ISettableObservable<boolean> = observableValue(this, true);
	private readonly _feedbackDialogState: ISettableObservable<FeedbackDialogState | null> = observableValue(this, null);
	private readonly _showOnboarding: ISettableObservable<boolean> = observableValue(this, false);
	private readonly _onboardingPendingConnect: ISettableObservable<boolean> = observableValue(this, false);

	// --- Derived state ---
	private readonly _shouldShowExpanded = derived(this, reader => this._expanded.read(reader));

	// --- DOM components ---
	private readonly _headerComponent = createHeader();
	private readonly _onboardingComponent = createOnboarding();
	private readonly _feedbackDialogComponent = createFeedbackDialog();
	private readonly _transcriptComponent = createTranscript();
	private readonly _statusRowsComponent = createStatusRows();
	private readonly _sessionListComponent = createSessionList();

	// --- Stable DOM elements ---
	private readonly _rootDiv: HTMLElement;
	private readonly _glowDiv: HTMLElement;
	private readonly _titleRow: HTMLElement;
	private readonly _contentDiv: HTMLElement;
	private readonly _statusTextDiv: HTMLElement;
	private readonly _sessionListWrapper: HTMLElement;
	private readonly _expandSpacer: HTMLElement;
	private readonly _chevronWrapper: HTMLElement;
	private readonly _chevronIcon: HTMLElement;

	private readonly _options: Required<VoiceWidgetOptions>;

	constructor(
		private readonly container: HTMLElement,
		private readonly callbacks: VoiceWidgetCallbacks,
		options: VoiceWidgetOptions = {},
	) {
		super();

		this._options = { ...DEFAULT_OPTIONS, ...options };
		this._showOnboarding.set(this._options.showOnboarding, undefined);
		this._expanded.set(this._options.defaultExpanded, undefined);

		// Build stable DOM structure
		const opts = this._options;
		const widthStyle = opts.width === 'auto'
			? 'width:100%;position:relative;'
			: `position:absolute;top:0;left:0;width:${opts.width}px;min-height:${AGENTS_VOICE_WINDOW_DEFAULT_HEIGHT}px;`;

		this._rootDiv = dom.$('div');
		this._rootDiv.style.cssText = `${widthStyle}display:flex;flex-direction:column;user-select:none;font-family:inherit;font-size:${FONT_SIZE.base};color:var(--vscode-foreground);box-sizing:border-box;margin:0;`;

		this._glowDiv = dom.$('div');
		this._glowDiv.style.cssText = 'position:absolute;top:0;left:0;right:0;height:50px;pointer-events:none;z-index:0;';

		this._titleRow = dom.$('div');
		this._titleRow.style.cssText = 'display:flex;align-items:baseline;gap:6px;padding:8px 14px 0;overflow:hidden;white-space:nowrap;position:relative;z-index:1;';
		if (opts.title) {
			const titleSpan = dom.$('span');
			titleSpan.style.cssText = `font-size:${FONT_SIZE.micro};font-weight:700;color:var(--vscode-sideBarSectionHeader-foreground, var(--vscode-foreground));text-transform:uppercase;letter-spacing:0.5px;flex-shrink:0;user-select:none;`;
			titleSpan.textContent = opts.title;
			this._titleRow.append(titleSpan);
			if (opts.subtitle) {
				const subtitleSpan = dom.$('span');
				subtitleSpan.style.cssText = `font-size:${FONT_SIZE.micro};font-weight:400;color:var(--vscode-descriptionForeground);overflow:hidden;text-overflow:ellipsis;`;
				subtitleSpan.textContent = opts.subtitle;
				this._titleRow.append(subtitleSpan);
			}
		}

		this._contentDiv = dom.$('div');
		this._contentDiv.style.cssText = 'display:flex;flex-direction:column;flex:1;padding:8px 14px 2px;position:relative;z-index:1;';

		this._statusTextDiv = dom.$('div');
		this._statusTextDiv.style.cssText = `text-align:center;font-size:${FONT_SIZE.body};font-weight:500;color:var(--vscode-foreground);padding:2px 0;`;

		this._sessionListWrapper = dom.$('div');
		this._sessionListWrapper.style.cssText = 'display:flex;flex-direction:column;';
		this._sessionListWrapper.append(this._sessionListComponent.element);

		this._expandSpacer = dom.$('div');
		this._expandSpacer.style.cssText = 'flex:1;';

		this._chevronWrapper = dom.$('div');
		this._chevronWrapper.role = 'button';
		this._chevronWrapper.tabIndex = 0;
		this._chevronWrapper.style.cssText = 'display:flex;justify-content:center;cursor:pointer;-webkit-app-region:no-drag;';
		this._chevronIcon = dom.$('span.codicon');
		this._chevronIcon.style.cssText = `font-size:${FONT_SIZE.iconSm};color:var(--vscode-descriptionForeground);`;
		this._chevronIcon.addEventListener('mouseenter', () => { this._chevronIcon.style.color = 'var(--vscode-foreground)'; });
		this._chevronIcon.addEventListener('mouseleave', () => { this._chevronIcon.style.color = 'var(--vscode-descriptionForeground)'; });
		this._chevronWrapper.append(this._chevronIcon);
		this._chevronWrapper.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this._expanded.set(!this._expanded.get(), undefined); });
		this._chevronWrapper.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._chevronWrapper.click(); }
		});

		// Assemble: all children are in the DOM; visibility is toggled via display
		this._contentDiv.append(
			this._onboardingComponent.element,
			this._headerComponent.element,
			this._feedbackDialogComponent.element,
			this._statusTextDiv,
			this._transcriptComponent.element,
			this._statusRowsComponent.element,
			this._sessionListWrapper,
			this._expandSpacer,
			this._chevronWrapper
		);

		this._rootDiv.append(this._glowDiv, this._titleRow, this._contentDiv);
		this.container.append(this._rootDiv);

		if (this._options.focusable) {
			this.container.tabIndex = 0;
			const win = getWindow(this.container);
			// Track which key triggered PTT so keyup releases correctly
			// even when the user rebinds pushToTalk to a different key.
			// We capture the last keydown code at the document level (capture
			// phase) before the VS Code keybinding handler fires pttDown.
			let pttKeyCode: string | undefined;
			let lastKeyDownCode: string | undefined;
			const onDocKeydown = (e: KeyboardEvent) => { lastKeyDownCode = e.code; };
			win.document.addEventListener('keydown', onDocKeydown, true);
			this._register(toDisposable(() => win.document.removeEventListener('keydown', onDocKeydown, true)));

			this.container.addEventListener('keydown', (e: KeyboardEvent) => {
				if (!_isTextInput(e.target) && pttKeyCode && e.code === pttKeyCode) {
					// Prevent repeat keydowns from activating focused child
					// buttons (role="button" elements fire click on Space).
					e.preventDefault();
				}
			});
			this.container.addEventListener('keyup', (e: KeyboardEvent) => {
				if (!_isTextInput(e.target) && pttKeyCode && e.code === pttKeyCode) {
					e.preventDefault();
					pttKeyCode = undefined;
					this.callbacks.pttUp();
				}
			});

			// Hook into pttDown to snapshot which key started PTT.
			const origPttDown = this.callbacks.pttDown;
			(this.callbacks as VoiceWidgetCallbacks).pttDown = () => {
				pttKeyCode = lastKeyDownCode;
				origPttDown.call(this.callbacks);
			};
			// Catch pointerup outside the container too (mirrors the chat view pane behavior)
			const onDocPointerUp = () => this.callbacks.pttUp();
			win.document.addEventListener('pointerup', onDocPointerUp);
			this._register(toDisposable(() => win.document.removeEventListener('pointerup', onDocPointerUp)));
		}

		// Set up PTT via BroadcastChannel
		const pttChannel = new BroadcastChannel('vscode-ptt');
		pttChannel.onmessage = (e) => {
			if (e.data === 'down') { this.callbacks.pttDown(); }
			if (e.data === 'up') { this.callbacks.pttUp(); }
		};
		this._register(toDisposable(() => pttChannel.close()));

		// Auto-render on observable changes (but NOT glow — that's in RAF)
		const renderDisposable = autorun(reader => {
			this._updateDOM(reader);
			getWindow(this.container).requestAnimationFrame(() => {
				updateTranscriptOverflowState(this.container);
				this.callbacks.onResize();
			});
		});
		this._register(renderDisposable);
		this._register(toDisposable(() => dom.clearNode(this.container)));

		// Handle the onboarding "Get Started → connect" flow: dismiss once
		// connection succeeds, reset only on actual failure.
		// Note: voiceSessionController sets isConnecting=false then isConnected=true
		// sequentially (not atomically), so we defer the failure check one
		// microtask to give isConnected=true a chance to follow.
		let sawConnecting = false;
		let failureCheckPending = false;
		let disposed = false;
		const onboardingConnectDisposable = autorun(reader => {
			if (!this._onboardingPendingConnect.read(reader)) {
				sawConnecting = false;
				return;
			}
			if (this._isConnected.read(reader)) {
				this._onboardingPendingConnect.set(false, undefined);
				sawConnecting = false;
				this._showOnboarding.set(false, undefined);
				this.callbacks.onOnboardingCompleted?.();
				return;
			}
			if (this._isConnecting.read(reader)) {
				sawConnecting = true;
				return;
			}
			if (sawConnecting && !failureCheckPending) {
				failureCheckPending = true;
				queueMicrotask(() => {
					failureCheckPending = false;
					if (disposed) { return; }
					if (this._onboardingPendingConnect.read(undefined) && !this._isConnected.read(undefined) && !this._isConnecting.read(undefined)) {
						this._onboardingPendingConnect.set(false, undefined);
						sawConnecting = false;
					}
				});
			}
		});
		this._register(toDisposable(() => { disposed = true; }));
		this._register(onboardingConnectDisposable);

		// Always-on-when-disconnected onboarding: when the host opts in via
		// ``reshowOnboardingOnDisconnect``, the onboarding card re-appears any
		// time the widget enters a fully-disconnected state. We treat
		// connecting and auto-reconnecting as transient (no reshow) so the UI
		// doesn't flicker mid-retry. The user can still dismiss the card via
		// the Get Started button; that dismissal is honored until the next
		// disconnect transition.
		if (this._options.reshowOnboardingOnDisconnect) {
			const reshowDisposable = autorun(reader => {
				const connected = this._isConnected.read(reader);
				const connecting = this._isConnecting.read(reader);
				const reconnecting = this._isReconnecting.read(reader);
				const pendingConnect = this._onboardingPendingConnect.read(reader);
				if (!connected && !connecting && !reconnecting && !pendingConnect) {
					if (!this._showOnboarding.read(reader)) {
						this._showOnboarding.set(true, undefined);
					}
				}
			});
			this._register(reshowDisposable);
		}

		// Start waveform animation
		this._startWaveformAnimation();
		this._register(toDisposable(() => this._stopWaveformAnimation()));
	}

	private _updateDOM(reader: IReader): void {
		const onboarding = this._showOnboarding.read(reader);
		const voiceState = this._voiceState.read(reader);
		const opts = this._options;
		const showExpanded = this._shouldShowExpanded.read(reader) && opts.showExpandChevron;

		// Title row: hidden during onboarding
		this._titleRow.style.display = (onboarding || !opts.title) ? 'none' : 'flex';

		// Onboarding vs main UI
		if (onboarding) {
			this._onboardingComponent.element.style.display = '';
			this._headerComponent.element.style.display = 'none';
			this._feedbackDialogComponent.element.style.display = 'none';
			this._statusTextDiv.style.display = 'none';
			this._transcriptComponent.element.style.display = 'none';
			this._statusRowsComponent.element.style.display = 'none';
			this._sessionListWrapper.style.display = 'none';
			this._expandSpacer.style.display = 'none';
			this._chevronWrapper.style.display = 'none';

			this._onboardingComponent.update({
				pttKeyLabel: this._pttKeyLabel.read(reader),
				isConnecting: this._onboardingPendingConnect.read(reader) || this._isConnecting.read(reader),
				onGetStarted: (e) => { e.preventDefault(); e.stopPropagation(); this._dismissOnboarding(true); },
				onOpenPttKeySettings: (e) => { e.preventDefault(); e.stopPropagation(); this.callbacks.openPttKeySettings(); },
				onOpenPopout: this.callbacks.openPopout ? (e) => { e.preventDefault(); e.stopPropagation(); this.callbacks.openPopout?.(); } : undefined,
			});
		} else {
			this._onboardingComponent.element.style.display = 'none';
			this._headerComponent.element.style.display = '';

			const feedbackState = this._feedbackDialogState.read(reader);

			this._headerComponent.update({
				copilotIconSrc: this.callbacks.copilotIconSrc,
				showCopilotIcon: opts.showCopilotIcon,
				isConnected: this._isConnected.read(reader),
				isConnecting: this._isConnecting.read(reader),
				isReconnecting: this._isReconnecting.read(reader),
				voiceState,
				draggable: opts.draggable,
				showClose: opts.showClose,
				showPopout: !!this.callbacks.openPopout && this._popoutAvailable.read(reader),
				centerConnectButton: opts.centerConnectButton,
				onMicDown: (e: MouseEvent) => { e.preventDefault(); this.callbacks.pttDown(); },
				onMicUp: () => { this.callbacks.pttUp(); },
				onConnectClick: (e: MouseEvent) => {
					e.preventDefault();
					e.stopPropagation();
					if (this._isConnecting.get()) { return; }
					if (this._isConnected.get()) {
						this.callbacks.disconnect();
					} else {
						this.callbacks.connect();
					}
				},
				onDisconnectClick: (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); this.callbacks.disconnect(); },
				onCloseClick: (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); this.callbacks.closeWindow(); },
				onToggleClick: (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); this._expanded.set(!this._expanded.get(), undefined); },
				onPttKeyClick: (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); this.callbacks.openPttKeySettings(); },
				onPopoutClick: (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); this.callbacks.openPopout?.(); },
				onFeedbackClick: (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); this._toggleFeedbackDialog(); },
				pttKeyLabel: this._pttKeyLabel.read(reader),
				expanded: showExpanded,
			});

			if (feedbackState) {
				this._feedbackDialogComponent.element.style.display = '';
				this._feedbackDialogComponent.update({
					onSubmit: (text) => this._submitFeedback(text),
					onCancel: () => { this._feedbackDialogState.set(null, undefined); },
				}, feedbackState);
				// Hide everything below when feedback dialog is open
				this._statusTextDiv.style.display = 'none';
				this._transcriptComponent.element.style.display = 'none';
				this._statusRowsComponent.element.style.display = 'none';
				this._sessionListWrapper.style.display = 'none';
				this._expandSpacer.style.display = 'none';
				this._chevronWrapper.style.display = 'none';
			} else {
				this._feedbackDialogComponent.element.style.display = 'none';

				// Status text
				const statusText = this._statusText.read(reader);
				if (opts.showStatusText && statusText) {
					this._statusTextDiv.style.display = '';
					this._statusTextDiv.textContent = statusText;
				} else {
					this._statusTextDiv.style.display = 'none';
				}

				// Transcript
				this._transcriptComponent.update({ turns: this._transcriptTurns.read(reader) });

				// Status rows (collapsed) or session list (expanded)
				if (!showExpanded) {
					this._statusRowsComponent.element.style.display = '';
					this._statusRowsComponent.update({
						workingCount: this._workingCount.read(reader),
						needsInputCount: this._needsInputCount.read(reader),
						doneCount: this._doneCount.read(reader),
						showCounters: opts.showStatusCounters,
						speakingSessionLabel: this._speakingSessionLabel.read(reader),
						speakingSessionResource: this._speakingSession.read(reader),
						pendingToolConfirmations: this._pendingToolConfirmations.read(reader),
						onOpenSession: (r) => this.callbacks.openSession(r),
					});
					this._sessionListWrapper.style.display = 'none';
				} else {
					this._statusRowsComponent.element.style.display = 'none';
					this._sessionListWrapper.style.display = '';
					this._sessionListComponent.update({
						sessions: this._sessions.read(reader),
						groups: this._sessionGroups.read(reader),
						selectedTarget: this._selectedTargetSession.read(reader),
						onOpenSession: (r) => this.callbacks.openSession(r),
						onStopSession: (r) => this.callbacks.stopSession(r),
						onCancelSession: (r) => this.callbacks.cancelSession(r),
						onSelectTarget: (r) => { this._selectedTargetSession.set(r, undefined); this.callbacks.selectTargetSession(r); },
						onNewSession: () => this.callbacks.newSessionAsTarget(),
					});
				}

				this._expandSpacer.style.display = '';
				this._chevronWrapper.style.display = opts.showExpandChevron ? 'flex' : 'none';
				this._chevronWrapper.title = showExpanded ? 'Collapse sessions' : 'Expand sessions';
				this._chevronIcon.className = `codicon codicon-${showExpanded ? 'chevron-up' : 'chevron-down'}`;
			}
		}
	}

	// --- Public state setters (called by the service) ---

	setConnected(connected: boolean): void {
		this._isConnected.set(connected, undefined);
	}

	setConnecting(connecting: boolean): void {
		this._isConnecting.set(connecting, undefined);
	}

	setReconnecting(reconnecting: boolean): void {
		this._isReconnecting.set(reconnecting, undefined);
	}

	setVoiceState(state: VoiceState): void {
		this._voiceState.set(state, undefined);
	}

	setStatusCounts(working: number, needsInput: number, done: number): void {
		this._workingCount.set(working, undefined);
		this._needsInputCount.set(needsInput, undefined);
		this._doneCount.set(done, undefined);
	}

	setPendingToolConfirmations(confirmations: readonly IPendingToolConfirmation[]): void {
		this._pendingToolConfirmations.set(confirmations, undefined);
	}

	setSpeakingSession(session: URI | undefined, label: string | undefined): void {
		this._speakingSession.set(session, undefined);
		this._speakingSessionLabel.set(label, undefined);
	}

	setSessions(sessions: readonly SessionRowData[]): void {
		this._sessions.set(sessions, undefined);
	}

	setSelectedTargetSession(resource: URI | undefined): void {
		this._selectedTargetSession.set(resource, undefined);
	}

	setSessionGroups(groups: readonly SessionGroupData[] | undefined): void {
		this._sessionGroups.set(groups, undefined);
	}

	setPttKeyLabel(label: string | undefined): void {
		this._pttKeyLabel.set(label, undefined);
	}

	setTranscriptTurns(turns: readonly ITranscriptTurn[]): void {
		this._transcriptTurns.set(turns, undefined);
	}

	setStatusText(text: string): void {
		this._statusText.set(text, undefined);
	}

	setPopoutAvailable(available: boolean): void {
		this._popoutAvailable.set(available, undefined);
	}

	// --- Feedback dialog ---

	private _toggleFeedbackDialog(): void {
		if (this._feedbackDialogState.get()) {
			this._feedbackDialogState.set(null, undefined);
		} else {
			this._showOnboarding.set(false, undefined);
			this._feedbackDialogState.set({ isSubmitting: false, submitted: false }, undefined);
		}
	}

	// --- Onboarding ---

	private _dismissOnboarding(connect: boolean = false): void {
		if (connect) {
			// Don't dismiss yet — kick off connection, wait for it to succeed
			// via the effect that watches isConnected/isConnecting.
			if (this._isConnected.get()) {
				// Already connected somehow — just dismiss.
				this._showOnboarding.set(false, undefined);
				this.callbacks.onOnboardingCompleted?.();
				return;
			}
			if (!this._isConnecting.get() && !this._onboardingPendingConnect.get()) {
				this._onboardingPendingConnect.set(true, undefined);
				this.callbacks.connect();
			}
		} else {
			this._showOnboarding.set(false, undefined);
			this.callbacks.onOnboardingCompleted?.();
		}
	}

	/**
	 * Externally trigger onboarding dismissal (e.g. when the user connects
	 * from the floating mini-view, the main panel should drop the onboarding).
	 * Also clears any in-flight pending-connect state so a later success
	 * doesn't re-trigger the completion callback.
	 */
	dismissOnboarding(): void {
		this._onboardingPendingConnect.set(false, undefined);
		if (this._showOnboarding.get()) {
			this._showOnboarding.set(false, undefined);
		}
	}

	private _submitFeedback(text: string): void {
		this._feedbackDialogState.set({ isSubmitting: true, submitted: false }, undefined);
		this.callbacks.submitFeedback(text).then(result => {
			if (result.ok) {
				this._feedbackDialogState.set({ isSubmitting: false, submitted: true }, undefined);
				setTimeout(() => { this._feedbackDialogState.set(null, undefined); }, 3000);
			} else {
				this._feedbackDialogState.set({ isSubmitting: false, submitted: false, error: result.error ?? localize('agentsVoice.feedbackError', "Failed to submit") }, undefined);
			}
		});
	}

	// --- Glow animation (decoupled from autorun — direct DOM updates) ---

	private _animationFrameId: number | undefined;

	private _startWaveformAnimation(): void {
		if (this._animationFrameId !== undefined) { return; }
		const animate = () => {
			this._animationFrameId = getWindow(this.container).requestAnimationFrame(animate);
			const onboarding = this._showOnboarding.get();
			const voiceState = this._voiceState.get();
			const glowActive = onboarding || voiceState === 'speaking' || voiceState === 'listening';

			if (!glowActive) {
				this._glowDiv.style.display = 'none';
				return;
			}
			this._glowDiv.style.display = '';

			const analyser = this.callbacks.getAnalyserNode();
			let intensity: number;
			if (onboarding) {
				intensity = 0.6;
			} else if (!analyser) {
				intensity = 0;
			} else {
				const dataArray = new Uint8Array(analyser.frequencyBinCount);
				analyser.getByteFrequencyData(dataArray);
				let sum = 0;
				for (let i = 0; i < dataArray.length; i++) {
					sum += dataArray[i];
				}
				intensity = Math.min(1, (sum / dataArray.length) / 80);
			}

			const baseOpacity = 0.15 + intensity * 0.4;
			const r = (onboarding || voiceState === 'speaking') ? '163,113,247' : '88,166,255';
			this._glowDiv.style.background = `radial-gradient(ellipse 40% 70% at 50% 0%, rgba(${r},${baseOpacity}) 0%, transparent 100%), radial-gradient(ellipse 70% 100% at 50% 0%, rgba(${r},${baseOpacity * 0.4}) 0%, transparent 100%)`;
		};
		this._animationFrameId = getWindow(this.container).requestAnimationFrame(animate);
	}

	private _stopWaveformAnimation(): void {
		if (this._animationFrameId !== undefined) {
			getWindow(this.container).cancelAnimationFrame(this._animationFrameId);
			this._animationFrameId = undefined;
		}
	}
}

function _isTextInput(target: EventTarget | null): boolean {
	if (!target || typeof (target as Element).tagName !== 'string') { return false; }
	const el = target as Element;
	const tag = el.tagName;
	if (tag === 'TEXTAREA' || tag === 'INPUT') { return true; }
	// HTMLElement.isContentEditable is realm-specific; check defensively.
	return (el as HTMLElement & { isContentEditable?: boolean }).isContentEditable === true;
}
