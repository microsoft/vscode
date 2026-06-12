/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { html, render, nothing } from '../../../../base/common/lit-html/lit-html.js';
import { signal, effect, computed } from '../../../../base/common/signals-core/signals-core.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { getWindow } from '../../../../base/browser/dom.js';
import { AGENTS_VOICE_WINDOW_DEFAULT_WIDTH, AGENTS_VOICE_WINDOW_DEFAULT_HEIGHT } from '../common/agentsVoice.js';
import { renderHeader } from './components/headerComponent.js';
import { renderStatusRows } from './components/statusRowsComponent.js';
import { renderTranscript, updateTranscriptOverflowState } from './components/transcriptComponent.js';
import { renderSessionList, type SessionRowData, type SessionGroupData } from './components/sessionListComponent.js';
import { renderFeedbackDialog, type FeedbackDialogState } from './components/feedbackDialog.js';
import { renderOnboarding } from './components/onboardingComponent.js';
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
	private readonly _isConnected = signal(false);
	private readonly _isConnecting = signal(false);
	private readonly _isReconnecting = signal(false);
	private readonly _voiceState = signal<VoiceState>('idle');
	private readonly _expanded = signal(false);
	private readonly _workingCount = signal(0);
	private readonly _needsInputCount = signal(0);
	private readonly _doneCount = signal(0);
	private readonly _pendingToolConfirmations = signal<readonly IPendingToolConfirmation[]>([]);
	private readonly _speakingSession = signal<URI | undefined>(undefined);
	private readonly _speakingSessionLabel = signal<string | undefined>(undefined);
	private readonly _sessions = signal<readonly SessionRowData[]>([]);
	private readonly _sessionGroups = signal<readonly SessionGroupData[] | undefined>(undefined);
	private readonly _selectedTargetSession = signal<URI | undefined>(undefined);
	private readonly _glowIntensity = signal(0);
	private readonly _glowPhase = signal(0);
	private readonly _transcriptTurns = signal<readonly ITranscriptTurn[]>([]);
	private readonly _pttKeyLabel = signal<string | undefined>(undefined);
	private readonly _statusText = signal('');
	private readonly _popoutAvailable = signal(true);
	private readonly _feedbackDialogState = signal<FeedbackDialogState | null>(null);
	private readonly _showOnboarding = signal(false);
	private readonly _onboardingPendingConnect = signal(false);

	// --- Derived state ---
	private readonly _shouldShowExpanded = computed(() => this._expanded.value);

	// --- Animation ---
	private _animationFrameId: number | undefined;

	private readonly _options: Required<VoiceWidgetOptions>;

	constructor(
		private readonly container: HTMLElement,
		private readonly callbacks: VoiceWidgetCallbacks,
		options: VoiceWidgetOptions = {},
	) {
		super();

		this._options = { ...DEFAULT_OPTIONS, ...options };
		this._showOnboarding.value = this._options.showOnboarding;
		this._expanded.value = this._options.defaultExpanded;

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

		// Auto-render on signal changes
		const disposeRender = effect(() => {
			render(this._view(), this.container);
			// Schedule resize + overflow detection after render
			getWindow(this.container).requestAnimationFrame(() => {
				updateTranscriptOverflowState(this.container);
				this.callbacks.onResize();
			});
		});
		this._register(toDisposable(disposeRender));
		this._register(toDisposable(() => render(nothing, this.container)));

		// Handle the onboarding "Get Started → connect" flow: dismiss once
		// connection succeeds, reset only on actual failure.
		// Note: voiceSessionController sets isConnecting=false then isConnected=true
		// sequentially (not atomically), so we defer the failure check one
		// microtask to give isConnected=true a chance to follow.
		let sawConnecting = false;
		let failureCheckPending = false;
		let disposed = false;
		const disposeOnboardingConnect = effect(() => {
			if (!this._onboardingPendingConnect.value) {
				sawConnecting = false;
				return;
			}
			if (this._isConnected.value) {
				this._onboardingPendingConnect.value = false;
				sawConnecting = false;
				this._showOnboarding.value = false;
				this.callbacks.onOnboardingCompleted?.();
				return;
			}
			if (this._isConnecting.value) {
				sawConnecting = true;
				return;
			}
			if (sawConnecting && !failureCheckPending) {
				failureCheckPending = true;
				queueMicrotask(() => {
					failureCheckPending = false;
					if (disposed) { return; }
					if (this._onboardingPendingConnect.value && !this._isConnected.value && !this._isConnecting.value) {
						this._onboardingPendingConnect.value = false;
						sawConnecting = false;
					}
				});
			}
		});
		this._register(toDisposable(() => {
			disposed = true;
			disposeOnboardingConnect();
		}));

		// Always-on-when-disconnected onboarding: when the host opts in via
		// ``reshowOnboardingOnDisconnect``, the onboarding card re-appears any
		// time the widget enters a fully-disconnected state. We treat
		// connecting and auto-reconnecting as transient (no reshow) so the UI
		// doesn't flicker mid-retry. The user can still dismiss the card via
		// the Get Started button; that dismissal is honored until the next
		// disconnect transition.
		if (this._options.reshowOnboardingOnDisconnect) {
			const disposeReshow = effect(() => {
				const connected = this._isConnected.value;
				const connecting = this._isConnecting.value;
				const reconnecting = this._isReconnecting.value;
				const pendingConnect = this._onboardingPendingConnect.value;
				if (!connected && !connecting && !reconnecting && !pendingConnect) {
					if (!this._showOnboarding.value) {
						this._showOnboarding.value = true;
					}
				}
			});
			this._register(toDisposable(disposeReshow));
		}

		// Start waveform animation
		this._startWaveformAnimation();
		this._register(toDisposable(() => this._stopWaveformAnimation()));
	}

	private _view() {
		const onboarding = this._showOnboarding.value;
		const glowActive = onboarding || this._voiceState.value === 'speaking' || this._voiceState.value === 'listening';
		const intensity = onboarding ? 0.6 : this._glowIntensity.value;
		const baseOpacity = 0.15 + intensity * 0.4;
		const r = (onboarding || this._voiceState.value === 'speaking') ? '163,113,247' : '88,166,255';
		const opts = this._options;

		const widthStyle = opts.width === 'auto'
			? 'width:100%;position:relative;'
			: `position:absolute;top:0;left:0;width:${opts.width}px;min-height:${AGENTS_VOICE_WINDOW_DEFAULT_HEIGHT}px;`;

		const showExpanded = this._shouldShowExpanded.value && opts.showExpandChevron;
		const hasTitle = !!opts.title;

		const titleRow = hasTitle ? html`
			<div style="display:flex;align-items:baseline;gap:6px;padding:8px 14px 0;overflow:hidden;white-space:nowrap;position:relative;z-index:1;">
				<span style="font-size:${FONT_SIZE.micro};font-weight:700;color:var(--vscode-sideBarSectionHeader-foreground, var(--vscode-foreground));text-transform:uppercase;letter-spacing:0.5px;flex-shrink:0;user-select:none;">${opts.title}</span>
				${opts.subtitle ? html`<span style="font-size:${FONT_SIZE.micro};font-weight:400;color:var(--vscode-descriptionForeground);overflow:hidden;text-overflow:ellipsis;">${opts.subtitle}</span>` : nothing}
			</div>
		` : nothing;

		return html`
			<div style="${widthStyle}display:flex;flex-direction:column;user-select:none;font-family:inherit;font-size:${FONT_SIZE.base};color:var(--vscode-foreground);box-sizing:border-box;margin:0;">
				${glowActive ? html`<div style="position:absolute;top:0;left:0;right:0;height:50px;pointer-events:none;background:radial-gradient(ellipse 40% 70% at 50% 0%, rgba(${r},${baseOpacity}) 0%, transparent 100%), radial-gradient(ellipse 70% 100% at 50% 0%, rgba(${r},${baseOpacity * 0.4}) 0%, transparent 100%);z-index:0;"></div>` : nothing}
				${onboarding ? nothing : titleRow}
				<div style="display:flex;flex-direction:column;flex:1;padding:8px 14px 2px;position:relative;z-index:1;">
					${this._showOnboarding.value ? renderOnboarding({
			pttKeyLabel: this._pttKeyLabel.value,
			isConnecting: this._onboardingPendingConnect.value || this._isConnecting.value,
			onGetStarted: (e) => { e.preventDefault(); e.stopPropagation(); this._dismissOnboarding(true); },
			onOpenPttKeySettings: (e) => { e.preventDefault(); e.stopPropagation(); this.callbacks.openPttKeySettings(); },
			onOpenPopout: this.callbacks.openPopout ? (e) => { e.preventDefault(); e.stopPropagation(); this.callbacks.openPopout?.(); } : undefined,
		}) : html`
					${renderHeader({
			copilotIconSrc: this.callbacks.copilotIconSrc,
			showCopilotIcon: opts.showCopilotIcon,
			isConnected: this._isConnected.value,
			isConnecting: this._isConnecting.value,
			isReconnecting: this._isReconnecting.value,
			voiceState: this._voiceState.value,
			draggable: opts.draggable,
			showClose: opts.showClose,
			showPopout: !!this.callbacks.openPopout && this._popoutAvailable.value,
			centerConnectButton: opts.centerConnectButton,
			onMicDown: (e: MouseEvent) => { e.preventDefault(); this.callbacks.pttDown(); },
			onMicUp: () => { this.callbacks.pttUp(); },
			onConnectClick: (e: MouseEvent) => {
				e.preventDefault();
				e.stopPropagation();
				if (this._isConnecting.value) { return; }
				if (this._isConnected.value) {
					this.callbacks.disconnect();
				} else {
					this.callbacks.connect();
				}
			},
			onDisconnectClick: (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); this.callbacks.disconnect(); },
			onCloseClick: (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); this.callbacks.closeWindow(); },
			onToggleClick: (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); this._expanded.value = !this._expanded.value; },
			onPttKeyClick: (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); this.callbacks.openPttKeySettings(); },
			onPopoutClick: (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); this.callbacks.openPopout?.(); },
			onFeedbackClick: (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); this._toggleFeedbackDialog(); },
			pttKeyLabel: this._pttKeyLabel.value,
			expanded: showExpanded,
		})}
					${this._feedbackDialogState.value ? renderFeedbackDialog({
			onSubmit: (text) => this._submitFeedback(text),
			onCancel: () => { this._feedbackDialogState.value = null; },
		}, this._feedbackDialogState.value) : html`
					${opts.showStatusText && this._statusText.value
				? html`<div style="text-align:center;font-size:${FONT_SIZE.body};font-weight:500;color:var(--vscode-foreground);padding:2px 0;">${this._statusText.value}</div>`
				: nothing}
					${renderTranscript({ turns: this._transcriptTurns.value })}
					${!showExpanded ? renderStatusRows({
					workingCount: this._workingCount.value,
					needsInputCount: this._needsInputCount.value,
					doneCount: this._doneCount.value,
					showCounters: opts.showStatusCounters,
					speakingSessionLabel: this._speakingSessionLabel.value,
					pendingToolConfirmations: this._pendingToolConfirmations.value,
					onOpenSession: (r) => this.callbacks.openSession(r),
				}) : nothing}
					${showExpanded ? html`
						<div style="display:flex;flex-direction:column;">
							${renderSessionList({
					sessions: this._sessions.value,
					groups: this._sessionGroups.value,
					selectedTarget: this._selectedTargetSession.value,
					onOpenSession: (r) => this.callbacks.openSession(r),
					onStopSession: (r) => this.callbacks.stopSession(r),
					onCancelSession: (r) => this.callbacks.cancelSession(r),
					onSelectTarget: (r) => { this._selectedTargetSession.value = r; this.callbacks.selectTargetSession(r); },
					onNewSession: () => this.callbacks.newSessionAsTarget(),
				})}
						</div>
					` : nothing}
					<div style="flex:1;"></div>
					${opts.showExpandChevron ? html`<div style="display:flex;justify-content:center;cursor:pointer;-webkit-app-region:no-drag;"
						title="${showExpanded ? 'Collapse sessions' : 'Expand sessions'}"
						@click=${(e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); this._expanded.value = !this._expanded.value; }}>
						<span
							class="codicon codicon-${showExpanded ? 'chevron-up' : 'chevron-down'}"
							style="font-size:${FONT_SIZE.iconSm};color:var(--vscode-descriptionForeground);"
							@mouseenter=${(e: MouseEvent) => { (e.target as HTMLElement).style.color = 'var(--vscode-foreground)'; }}
							@mouseleave=${(e: MouseEvent) => { (e.target as HTMLElement).style.color = 'var(--vscode-descriptionForeground)'; }}></span>
					</div>` : nothing}
					`}`}
				</div>
			</div>
		`;
	}

	// --- Public state setters (called by the service) ---

	setConnected(connected: boolean): void {
		this._isConnected.value = connected;
	}

	setConnecting(connecting: boolean): void {
		this._isConnecting.value = connecting;
	}

	setReconnecting(reconnecting: boolean): void {
		this._isReconnecting.value = reconnecting;
	}

	setVoiceState(state: VoiceState): void {
		this._voiceState.value = state;
	}

	setStatusCounts(working: number, needsInput: number, done: number): void {
		this._workingCount.value = working;
		this._needsInputCount.value = needsInput;
		this._doneCount.value = done;
	}

	setPendingToolConfirmations(confirmations: readonly IPendingToolConfirmation[]): void {
		this._pendingToolConfirmations.value = confirmations;
	}

	setSpeakingSession(session: URI | undefined, label: string | undefined): void {
		this._speakingSession.value = session;
		this._speakingSessionLabel.value = label;
	}

	setSessions(sessions: readonly SessionRowData[]): void {
		this._sessions.value = sessions;
	}

	setSelectedTargetSession(resource: URI | undefined): void {
		this._selectedTargetSession.value = resource;
	}

	setSessionGroups(groups: readonly SessionGroupData[] | undefined): void {
		this._sessionGroups.value = groups;
	}

	setPttKeyLabel(label: string | undefined): void {
		this._pttKeyLabel.value = label;
	}

	setTranscriptTurns(turns: readonly ITranscriptTurn[]): void {
		this._transcriptTurns.value = turns;
	}

	setStatusText(text: string): void {
		this._statusText.value = text;
	}

	setPopoutAvailable(available: boolean): void {
		this._popoutAvailable.value = available;
	}

	// --- Feedback dialog ---

	private _toggleFeedbackDialog(): void {
		if (this._feedbackDialogState.value) {
			this._feedbackDialogState.value = null;
		} else {
			this._showOnboarding.value = false;
			this._feedbackDialogState.value = { isSubmitting: false, submitted: false };
		}
	}

	// --- Onboarding ---

	private _dismissOnboarding(connect: boolean = false): void {
		if (connect) {
			// Don't dismiss yet — kick off connection, wait for it to succeed
			// via the effect that watches isConnected/isConnecting.
			if (this._isConnected.value) {
				// Already connected somehow — just dismiss.
				this._showOnboarding.value = false;
				this.callbacks.onOnboardingCompleted?.();
				return;
			}
			if (!this._isConnecting.value && !this._onboardingPendingConnect.value) {
				this._onboardingPendingConnect.value = true;
				this.callbacks.connect();
			}
		} else {
			this._showOnboarding.value = false;
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
		this._onboardingPendingConnect.value = false;
		if (this._showOnboarding.value) {
			this._showOnboarding.value = false;
		}
	}

	private _submitFeedback(text: string): void {
		this._feedbackDialogState.value = { isSubmitting: true, submitted: false };
		this.callbacks.submitFeedback(text).then(result => {
			if (result.ok) {
				this._feedbackDialogState.value = { isSubmitting: false, submitted: true };
				setTimeout(() => { this._feedbackDialogState.value = null; }, 3000);
			} else {
				this._feedbackDialogState.value = { isSubmitting: false, submitted: false, error: result.error ?? 'Failed to submit' };
			}
		});
	}

	// --- Glow animation ---

	private _startWaveformAnimation(): void {
		if (this._animationFrameId !== undefined) { return; }
		const animate = () => {
			this._animationFrameId = getWindow(this.container).requestAnimationFrame(animate);
			const analyser = this.callbacks.getAnalyserNode();
			if (!analyser) {
				this._glowIntensity.value = 0;
				return;
			}
			const dataArray = new Uint8Array(analyser.frequencyBinCount);
			analyser.getByteFrequencyData(dataArray);
			let sum = 0;
			for (let i = 0; i < dataArray.length; i++) {
				sum += dataArray[i];
			}
			const avg = sum / dataArray.length;
			this._glowIntensity.value = Math.min(1, avg / 80);
			this._glowPhase.value += 0.02;
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
