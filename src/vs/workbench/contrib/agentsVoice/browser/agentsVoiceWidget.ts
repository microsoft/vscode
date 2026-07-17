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
import { createTranscript } from './components/transcriptComponent.js';
import { createSessionList, type SessionRowData, type SessionGroupData } from './components/sessionListComponent.js';
import { createFeedbackDialog, type FeedbackDialogState } from './components/feedbackDialog.js';
import { createOnboarding } from './components/onboardingComponent.js';
import { createVoiceBar } from './components/voiceBarComponent.js';
import { FONT_SIZE, addKeyboardActivation } from './components/tokens.js';
import type { VoiceState, IPendingToolConfirmation, ITranscriptTurn } from '../../chat/browser/voiceClient/voiceSessionController.js';
import { computeVoiceGlowStyle, readIdleVoiceGlowIntensity, IDLE_VOICE_GLOW_COLOR } from '../../chat/browser/voiceClient/voiceGlow.js';

export interface VoiceWidgetCallbacks {
	readonly copilotIconSrc: string;
	readonly hideDisconnect: boolean;
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
	/** Reduced-motion state (honors OS + `workbench.reduceMotion`). */
	isMotionReduced(): boolean;
	onResize(): void;
	openPttKeySettings(): void;
	/** Optional — when provided, header renders a "popout" button. */
	openPopout?(): void;
	/** Submit user feedback. Returns success/failure. */
	submitFeedback(feedbackText: string): Promise<{ ok: boolean; error?: string }>;
	/** Called when the user dismisses the onboarding card. */
	onOnboardingCompleted?(): void;
	/**
	 * Optional — when provided, the expand chevron opens this picker instead of
	 * the inline session list. Used by the floating window to show the agent
	 * sessions quickpick with a "set as voice target" action.
	 */
	showSessionsPicker?(): void;
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
	/**
	 * When true, renders the widget in a chat-input-box style layout:
	 * a rounded bordered container for transcript/placeholder text with a
	 * toolbar row below for action icons. Matches the chat panel input box
	 * appearance.
	 */
	readonly inputBoxLayout?: boolean;
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
	inputBoxLayout: false,
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
	private readonly _voiceBarComponent = createVoiceBar();
	private readonly _transcriptComponent = this._register(createTranscript());
	private readonly _inputBoxTranscriptComponent = this._register(createTranscript());
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

	// --- Input box layout elements (created only when inputBoxLayout=true) ---
	private readonly _inputBoxContainer: HTMLElement | undefined;
	private readonly _inputBoxPlaceholder: HTMLElement | undefined;
	private readonly _inputBoxToolbar: HTMLElement | undefined;
	private readonly _inputBoxMicBtn: HTMLElement | undefined;
	private readonly _inputBoxGearBtn: HTMLElement | undefined;
	private readonly _inputBoxConnIndicator: HTMLElement | undefined;
	private readonly _inputBoxFeedbackBtn: HTMLElement | undefined;
	private readonly _inputBoxSessionsBtn: HTMLElement | undefined;
	private readonly _inputBoxCloseBtn: HTMLElement | undefined;

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
			: `position:absolute;top:0;left:0;width:${opts.width}px;${opts.inputBoxLayout ? '' : `min-height:${AGENTS_VOICE_WINDOW_DEFAULT_HEIGHT}px;`}`;

		this._rootDiv = dom.$('div');
		this._rootDiv.style.cssText = `${widthStyle}display:flex;flex-direction:column;user-select:none;font-family:inherit;font-size:${FONT_SIZE.base};color:var(--vscode-foreground);box-sizing:border-box;margin:0;${opts.inputBoxLayout && opts.draggable ? '-webkit-app-region:drag;' : ''}`;

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
		this._sessionListWrapper.style.cssText = 'display:flex;flex-direction:column;-webkit-app-region:no-drag;overflow:hidden;';
		this._sessionListWrapper.append(this._sessionListComponent.element);

		this._expandSpacer = dom.$('div');
		this._expandSpacer.style.cssText = 'flex:1;';

		this._chevronWrapper = dom.$('div');
		this._chevronWrapper.role = 'button';
		this._chevronWrapper.tabIndex = 0;
		this._chevronWrapper.style.cssText = 'display:flex;justify-content:center;cursor:pointer;-webkit-app-region:no-drag;';
		this._chevronIcon = dom.$('span.codicon');
		this._chevronIcon.style.cssText = `font-size:${FONT_SIZE.iconSm};color:var(--vscode-descriptionForeground);`;
		this._register(dom.addDisposableListener(this._chevronIcon, 'mouseenter', () => { this._chevronIcon.style.color = 'var(--vscode-foreground)'; }));
		this._register(dom.addDisposableListener(this._chevronIcon, 'mouseleave', () => { this._chevronIcon.style.color = 'var(--vscode-descriptionForeground)'; }));
		this._chevronWrapper.append(this._chevronIcon);
		this._register(dom.addDisposableListener(this._chevronWrapper, 'click', (e) => {
			e.preventDefault(); e.stopPropagation();
			if (this.callbacks.showSessionsPicker) {
				this.callbacks.showSessionsPicker();
			} else {
				this._expanded.set(!this._expanded.get(), undefined);
			}
		}));
		this._register(dom.addDisposableListener(this._chevronWrapper, 'keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._chevronWrapper.click(); }
		}));

		// --- Input box layout elements ---
		if (opts.inputBoxLayout) {
			// Inject processing animation CSS into the document head
			// (@property must be at document level to work)
			const styleEl = dom.$('style');
			styleEl.textContent = `
				@property --voice-processing-angle { syntax: '<angle>'; inherits: false; initial-value: 135deg; }
				@keyframes voice-processing-spin { from { --voice-processing-angle: 135deg; } to { --voice-processing-angle: 495deg; } }
				@keyframes agents-voice-input-icon-pulse {
					0%, 100% { box-shadow: 0 0 4px rgba(var(--agents-voice-input-icon-rgb, 88,166,255), 0.45); }
					50% { box-shadow: 0 0 10px rgba(var(--agents-voice-input-icon-rgb, 88,166,255), 0.75); }
				}
				.monaco-workbench.monaco-enable-motion .agents-voice-mode-button.agents-voice-mode-active {
					animation: agents-voice-input-icon-pulse 1.4s ease-in-out infinite;
				}
				.processing { overflow: visible !important; }
				.processing::before {
					content: ''; position: absolute; inset: -1px; border-radius: inherit; padding: 1px;
					background: conic-gradient(from var(--voice-processing-angle),
						transparent 0deg, rgba(88,166,255,0.9) 20deg, rgba(88,166,255,1) 30deg,
						rgba(88,166,255,0.6) 50deg, transparent 90deg, transparent 360deg);
					-webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
					mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
					-webkit-mask-composite: xor; mask-composite: exclude;
					animation: voice-processing-spin 3s linear infinite;
					pointer-events: none; z-index: 2;
				}
				.processing::after {
					content: ''; position: absolute; inset: -1px; border-radius: inherit; padding: 2px;
					background: conic-gradient(from var(--voice-processing-angle),
						transparent 0deg, rgba(88,166,255,0.5) 25deg, rgba(88,166,255,0.3) 50deg, transparent 90deg, transparent 360deg);
					-webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
					mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
					-webkit-mask-composite: xor; mask-composite: exclude;
					filter: blur(1.5px); animation: voice-processing-spin 3s linear infinite;
					pointer-events: none; z-index: 1;
				}
			`;
			getWindow(this.container).document.head.append(styleEl);

			// Rounded bordered container for transcript/placeholder (matches chat-input-container)
			this._inputBoxContainer = dom.$('div');
			this._inputBoxContainer.style.cssText = 'box-sizing:border-box;background-color:var(--vscode-input-background);border:1px solid var(--vscode-input-border, transparent);border-radius:var(--vscode-cornerRadius-large, 8px);padding:10px 12px;width:100%;position:relative;min-height:32px;display:flex;align-items:center;-webkit-app-region:no-drag;';

			this._inputBoxPlaceholder = dom.$('span');
			this._inputBoxPlaceholder.style.cssText = `font-size:${FONT_SIZE.body};color:var(--vscode-input-placeholderForeground, var(--vscode-descriptionForeground));user-select:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;`;
			this._inputBoxTranscriptComponent.element.style.width = '100%';
			this._inputBoxTranscriptComponent.element.style.display = 'none';
			this._inputBoxContainer.append(this._inputBoxPlaceholder, this._inputBoxTranscriptComponent.element);

			// Toolbar row below the input box
			this._inputBoxToolbar = dom.$('div');
			this._inputBoxToolbar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 4px 2px;-webkit-app-region:no-drag;';

			const toolbarBtn = (className: string, ariaLabel: string, title: string): HTMLElement => {
				const el = dom.$(`span.codicon.${className}`);
				el.role = 'button';
				el.tabIndex = 0;
				el.ariaLabel = ariaLabel;
				el.title = title;
				el.style.cssText = `font-size:${FONT_SIZE.iconSm};color:var(--vscode-descriptionForeground);cursor:pointer;-webkit-app-region:no-drag;padding:2px;`;
				this._register(dom.addDisposableListener(el, 'mouseenter', () => { el.style.color = 'var(--vscode-foreground)'; }));
				this._register(dom.addDisposableListener(el, 'mouseleave', () => { el.style.color = 'var(--vscode-descriptionForeground)'; }));
				addKeyboardActivation(el);
				return el;
			};

			// Mic button
			this._inputBoxMicBtn = dom.$('span.codicon.codicon-voice-mode.agents-voice-mode-button');
			this._inputBoxMicBtn.role = 'button';
			this._inputBoxMicBtn.tabIndex = 0;
			this._inputBoxMicBtn.ariaLabel = localize('agentsVoice.pushToTalkSpace', "Push to talk (Space)");
			this._inputBoxMicBtn.title = localize('agentsVoice.pushToTalkSpace', "Push to talk (Space)");
			this._inputBoxMicBtn.style.cssText = `font-size:${FONT_SIZE.iconMd};cursor:pointer;-webkit-app-region:no-drag;border-radius:4px;padding:2px;`;

			// Connection indicator
			this._inputBoxConnIndicator = toolbarBtn('codicon-debug-connected',
				localize('agentsVoice.disconnect', "Disconnect"),
				localize('agentsVoice.disconnect', "Disconnect"));

			// Gear button
			this._inputBoxGearBtn = toolbarBtn('codicon-gear',
				localize('agentsVoice.configureKeybinding', "Configure keybinding"),
				localize('agentsVoice.configureKeybinding', "Configure keybinding"));

			// Feedback button
			this._inputBoxFeedbackBtn = toolbarBtn('codicon-feedback',
				localize('agentsVoice.sendFeedback', "Send feedback"),
				localize('agentsVoice.sendFeedback', "Send feedback"));

			// Sessions dropdown button
			this._inputBoxSessionsBtn = toolbarBtn('codicon-list-tree',
				localize('agentsVoice.sessions', "Sessions"),
				localize('agentsVoice.sessions', "Sessions"));
			this._register(dom.addDisposableListener(this._inputBoxSessionsBtn, 'click', (e) => {
				e.preventDefault(); e.stopPropagation();
				this._expanded.set(!this._expanded.get(), undefined);
			}));

			// Close button
			this._inputBoxCloseBtn = toolbarBtn('codicon-chrome-minimize',
				localize('agentsVoice.minimize', "Minimize"),
				localize('agentsVoice.minimize', "Minimize"));

			const toolbarSpacer = dom.$('span');
			toolbarSpacer.style.flex = '1';

			this._inputBoxToolbar.append(
				this._inputBoxMicBtn,
				this._inputBoxConnIndicator,
				this._inputBoxGearBtn,
				toolbarSpacer,
				this._inputBoxFeedbackBtn,
				this._inputBoxSessionsBtn,
				this._inputBoxCloseBtn
			);
		}

		// Assemble: all children are in the DOM; visibility is toggled via display
		if (opts.inputBoxLayout) {
			this._contentDiv.append(
				this._onboardingComponent.element,
				this._feedbackDialogComponent.element,
				this._inputBoxToolbar!,
				this._transcriptComponent.element,
				this._sessionListWrapper,
				this._statusRowsComponent.element,
				this._inputBoxContainer!,
			);
		} else {
			this._contentDiv.append(
				this._onboardingComponent.element,
				this._headerComponent.element,
				this._voiceBarComponent.element,
				this._feedbackDialogComponent.element,
				this._statusTextDiv,
				this._transcriptComponent.element,
				this._statusRowsComponent.element,
				this._sessionListWrapper,
				this._expandSpacer,
				this._chevronWrapper
			);
		}

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

			this._register(dom.addDisposableListener(this.container, 'keydown', (e: KeyboardEvent) => {
				if (!_isTextInput(e.target) && pttKeyCode && e.code === pttKeyCode) {
					// Prevent repeat keydowns from activating focused child
					// buttons (role="button" elements fire click on Space).
					e.preventDefault();
				}
			}));
			this._register(dom.addDisposableListener(this.container, 'keyup', (e: KeyboardEvent) => {
				if (!_isTextInput(e.target) && pttKeyCode && e.code === pttKeyCode) {
					e.preventDefault();
					pttKeyCode = undefined;
					this.callbacks.pttUp();
				}
			}));

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
		if (this._options.inputBoxLayout) {
			this._updateDOMInputBoxLayout(reader);
		} else {
			this._updateDOMClassicLayout(reader);
		}
	}

	private _updateDOMInputBoxLayout(reader: IReader): void {
		const onboarding = this._showOnboarding.read(reader);
		const voiceState = this._voiceState.read(reader);
		const isConnected = this._isConnected.read(reader);
		const isConnecting = this._isConnecting.read(reader);
		const isReconnecting = this._isReconnecting.read(reader);
		const showConnected = isConnected || isReconnecting;
		const opts = this._options;
		const showExpanded = this._shouldShowExpanded.read(reader) && opts.showExpandChevron;

		// Adjust root width when sessions are expanded
		const baseWidth = typeof opts.width === 'number' ? opts.width : AGENTS_VOICE_WINDOW_DEFAULT_WIDTH;
		this._rootDiv.style.width = `${baseWidth}px`;

		// Title row: hidden during onboarding
		this._titleRow.style.display = (onboarding || !opts.title) ? 'none' : 'flex';

		if (onboarding) {
			this._onboardingComponent.element.style.display = '';
			this._feedbackDialogComponent.element.style.display = 'none';
			this._inputBoxContainer!.style.display = 'none';
			this._transcriptComponent.element.style.display = 'none';
			this._statusRowsComponent.element.style.display = 'none';
			this._sessionListWrapper.style.display = 'none';
			this._inputBoxToolbar!.style.display = 'none';

			this._onboardingComponent.update({
				pttKeyLabel: this._pttKeyLabel.read(reader),
				isConnecting: this._onboardingPendingConnect.read(reader) || isConnecting,
				onGetStarted: (e) => { e.preventDefault(); e.stopPropagation(); this._dismissOnboarding(true); },
				onOpenPttKeySettings: (e) => { e.preventDefault(); e.stopPropagation(); this.callbacks.openPttKeySettings(); },
				onOpenPopout: this.callbacks.openPopout ? (e) => { e.preventDefault(); e.stopPropagation(); this.callbacks.openPopout?.(); } : undefined,
			});
			return;
		}

		this._onboardingComponent.element.style.display = 'none';

		const feedbackState = this._feedbackDialogState.read(reader);
		if (feedbackState) {
			this._feedbackDialogComponent.element.style.display = '';
			this._feedbackDialogComponent.update({
				onSubmit: (text) => this._submitFeedback(text),
				onCancel: () => { this._feedbackDialogState.set(null, undefined); },
			}, feedbackState);
			this._inputBoxContainer!.style.display = 'none';
			this._transcriptComponent.element.style.display = 'none';
			this._statusRowsComponent.element.style.display = 'none';
			this._sessionListWrapper.style.display = 'none';
			this._inputBoxToolbar!.style.display = 'none';
			return;
		}

		this._feedbackDialogComponent.element.style.display = 'none';

		// Input box container — show transcript inside or placeholder
		this._inputBoxContainer!.style.display = 'flex';
		const transcriptTurns = this._transcriptTurns.read(reader);
		const hasTranscript = transcriptTurns.some(t => t.text.length > 0 || (t.speaker === 'user' && t.isPartial));

		// Toggle voice-active glow on the input container (base state; wave animation overrides dynamically)
		const shouldShowInputGlow = (isConnected && voiceState === 'idle') || (showConnected && (voiceState === 'listening' || voiceState === 'speaking'));
		if (!shouldShowInputGlow) {
			this._inputBoxContainer!.style.borderColor = 'var(--vscode-input-border, transparent)';
			this._inputBoxContainer!.style.boxShadow = 'none';
		}

		// Toggle processing comet animation when agent is thinking
		this._inputBoxContainer!.classList.toggle('processing', voiceState === 'processing');

		if (hasTranscript) {
			if (showExpanded) {
				// When expanded, show full transcript component with chat-like styling
				this._transcriptComponent.element.style.display = '';
				this._transcriptComponent.element.style.padding = '8px 12px';
				this._transcriptComponent.element.style.borderBottom = '1px solid var(--vscode-widget-border, var(--vscode-input-border, transparent))';
				this._transcriptComponent.update({ turns: transcriptTurns, chatStyle: true });
				this._inputBoxPlaceholder!.style.display = 'none';
				this._inputBoxTranscriptComponent.element.style.display = 'none';
			} else {
				this._inputBoxPlaceholder!.style.display = 'none';
				this._transcriptComponent.element.style.display = 'none';
				this._transcriptComponent.element.style.padding = '';
				this._transcriptComponent.element.style.borderBottom = '';
				this._inputBoxTranscriptComponent.element.style.display = '';
				this._inputBoxTranscriptComponent.update({ turns: transcriptTurns, chatStyle: true, scrollToTop: true });
			}
		} else {
			// Show placeholder
			this._inputBoxPlaceholder!.style.display = '';
			this._inputBoxTranscriptComponent.element.style.display = 'none';
			this._transcriptComponent.element.style.display = 'none';
			const keyLabel = this._pttKeyLabel.read(reader);
			if (isReconnecting) {
				this._inputBoxPlaceholder!.textContent = localize('agentsVoice.reconnecting', "Reconnecting...");
			} else if (isConnecting) {
				this._inputBoxPlaceholder!.textContent = localize('agentsVoice.connecting', "Connecting...");
			} else if (isConnected && voiceState === 'listening') {
				this._inputBoxPlaceholder!.textContent = localize('agentsVoice.listening', "Listening");
			} else if (isConnected && voiceState === 'speaking') {
				this._inputBoxPlaceholder!.textContent = keyLabel
					? localize('agentsVoice.pressToBargeIn', "Press {0} to barge in", keyLabel)
					: localize('agentsVoice.speakToBargeIn', "Speak to barge in");
			} else if (isConnected) {
				this._inputBoxPlaceholder!.textContent = keyLabel
					? localize('agentsVoice.holdToTalkOrBargeIn', "Hold {0} to talk or barge in", keyLabel)
					: localize('agentsVoice.holdMicToTalkOrBargeIn', "Hold the mic to talk or barge in");
			} else if (keyLabel) {
				this._inputBoxPlaceholder!.textContent = localize('agentsVoice.holdToTalk', "Hold {0} to talk", keyLabel);
			} else {
				this._inputBoxPlaceholder!.textContent = localize('agentsVoice.clickMicToTalk', "Click voice mode to talk");
			}
		}

		// Status rows — hide in inputBoxLayout (no "No active sessions" text needed)
		if (!showExpanded) {
			this._statusRowsComponent.element.style.display = 'none';
			this._sessionListWrapper.style.display = 'none';
		} else {
			this._statusRowsComponent.element.style.display = 'none';
			this._sessionListWrapper.style.display = '';
			// Constrain session list height so toolbar and transcript always remain visible
			this._sessionListWrapper.style.maxHeight = '200px';
			this._sessionListWrapper.style.overflowY = 'auto';
			this._sessionListWrapper.style.scrollbarWidth = 'none';
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

		// Toolbar — always visible
		this._inputBoxToolbar!.style.display = 'flex';

		// Mic button — always visible (primary action)
		this._inputBoxMicBtn!.style.display = '';
		const keyLabel = this._pttKeyLabel.read(reader);
		const micTooltip = keyLabel
			? localize('agentsVoice.pushToTalkKey', "Push to talk ({0})", keyLabel)
			: localize('agentsVoice.pushToTalk', "Push to talk");
		this._inputBoxMicBtn!.title = micTooltip;
		this._inputBoxMicBtn!.ariaLabel = micTooltip;
		const micColor = voiceState === 'error' ? 'var(--vscode-editorError-foreground)'
			: voiceState === 'listening' ? 'var(--vscode-editorInfo-foreground)'
				: voiceState === 'speaking' ? 'var(--vscode-agentsVoice-speakingForeground)'
					: 'var(--vscode-descriptionForeground)';
		this._inputBoxMicBtn!.style.color = micColor;
		const micIsActive = voiceState === 'listening' || voiceState === 'speaking';
		this._inputBoxMicBtn!.classList.toggle('agents-voice-mode-active', micIsActive);
		this._inputBoxMicBtn!.style.setProperty('--agents-voice-input-icon-rgb', voiceState === 'speaking' ? '163,113,247' : '88,166,255');
		this._inputBoxMicBtn!.style.borderRadius = '50%';
		if (!micIsActive) {
			this._inputBoxMicBtn!.style.boxShadow = 'none';
		}
		this._inputBoxMicBtn!.onmousedown = (e: MouseEvent) => { e.preventDefault(); this.callbacks.pttDown(); };
		this._inputBoxMicBtn!.onmouseup = () => { this.callbacks.pttUp(); };

		// Connection indicator — visible when connected
		this._inputBoxConnIndicator!.style.display = showConnected ? '' : 'none';
		this._inputBoxConnIndicator!.onclick = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); this.callbacks.disconnect(); };

		// Gear button — always visible
		this._inputBoxGearBtn!.style.display = '';
		this._inputBoxGearBtn!.onclick = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); this.callbacks.openPttKeySettings(); };

		// Feedback button — always visible
		this._inputBoxFeedbackBtn!.onclick = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); this._toggleFeedbackDialog(); };

		// Sessions button — always visible, icon toggles with expanded state
		this._inputBoxSessionsBtn!.style.display = '';
		this._inputBoxSessionsBtn!.className = `codicon codicon-${showExpanded ? 'chevron-up' : 'list-tree'}`;
		this._inputBoxSessionsBtn!.title = showExpanded
			? localize('agentsVoice.collapseSessions', "Collapse sessions")
			: localize('agentsVoice.sessions', "Sessions");

		// Close button
		this._inputBoxCloseBtn!.style.display = opts.showClose ? '' : 'none';
		this._inputBoxCloseBtn!.onclick = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); this.callbacks.closeWindow(); };
	}

	private _updateDOMClassicLayout(reader: IReader): void {
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
			this._voiceBarComponent.element.style.display = 'none';
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
				hideDisconnect: this.callbacks.hideDisconnect,
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
				this._voiceBarComponent.element.style.display = 'none';
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

				// Voice bar (listening/speaking indicator with stop button)
				this._voiceBarComponent.update({
					voiceState,
					speakingSessionLabel: this._speakingSessionLabel.read(reader),
					speakingSession: this._speakingSession.read(reader),
					onStopSpeech: () => this.callbacks.stopPlayback(),
				});

				// Status text — always show when in error state (e.g. mic denied)
				const statusText = this._statusText.read(reader);
				const isError = voiceState === 'error';
				if ((opts.showStatusText || isError) && statusText) {
					this._statusTextDiv.style.display = '';
					this._statusTextDiv.textContent = statusText;
					this._statusTextDiv.style.color = isError ? 'var(--vscode-editorError-foreground)' : 'var(--vscode-foreground)';
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
			const connected = this._isConnected.get();
			const voiceState = this._voiceState.get();
			const connectedIdle = connected && voiceState === 'idle';
			const glowActive = onboarding || connectedIdle || voiceState === 'speaking' || voiceState === 'listening';

			if (!glowActive) {
				this._glowDiv.style.display = 'none';
				if (this._inputBoxContainer) {
					this._inputBoxContainer.style.borderColor = 'var(--vscode-input-border, transparent)';
					this._inputBoxContainer.style.boxShadow = 'none';
				}
				if (this._inputBoxMicBtn) {
					this._inputBoxMicBtn.style.boxShadow = 'none';
				}
				return;
			}

			const analyser = this.callbacks.getAnalyserNode();
			let intensity: number;
			if (onboarding) {
				intensity = 0.6;
			} else if (connectedIdle) {
				intensity = readIdleVoiceGlowIntensity(getWindow(this.container).performance.now(), this.callbacks.isMotionReduced());
			} else if (!analyser) {
				intensity = 0.3;
			} else {
				const dataArray = new Uint8Array(analyser.frequencyBinCount);
				analyser.getByteFrequencyData(dataArray);
				let sum = 0;
				for (let i = 0; i < dataArray.length; i++) {
					sum += dataArray[i];
				}
				intensity = Math.min(1, (sum / dataArray.length) / 80);
			}

			// Animate input box container border/shadow (inputBoxLayout)
			if (this._inputBoxContainer) {
				const inputGlowState = connectedIdle ? 'idle' : voiceState;
				if (inputGlowState === 'idle' || inputGlowState === 'listening' || inputGlowState === 'speaking') {
					const { borderColor, boxShadow } = computeVoiceGlowStyle(inputGlowState, intensity, false);
					this._inputBoxContainer.style.borderColor = borderColor;
					this._inputBoxContainer.style.boxShadow = boxShadow;
				}
			}

			if (this._inputBoxMicBtn) {
				const iconGlowActive = connectedIdle || voiceState === 'listening' || voiceState === 'speaking';
				if (iconGlowActive) {
					const shadowSpread = connectedIdle ? 2 + intensity * 8 : 3 + intensity * 8;
					const shadowAlpha = connectedIdle ? 0.08 + intensity * 0.18 : 0.2 + intensity * 0.45;
					// Themed idle color stays visible on light input backgrounds; saturated blue/purple for listening/speaking.
					const glowColor = connectedIdle
						? `color-mix(in srgb, ${IDLE_VOICE_GLOW_COLOR} ${+(shadowAlpha * 100).toFixed(2)}%, transparent)`
						: `rgba(${voiceState === 'speaking' ? '163,113,247' : '88,166,255'},${shadowAlpha})`;
					this._inputBoxMicBtn.style.boxShadow = `0 0 ${shadowSpread}px ${glowColor}`;
				} else {
					this._inputBoxMicBtn.style.boxShadow = 'none';
				}
			}

			// Classic layout glow div
			this._glowDiv.style.display = '';
			const baseOpacity = connectedIdle ? 0.06 + intensity * 0.18 : 0.15 + intensity * 0.4;
			if (connectedIdle) {
				// Themed idle color so the gradient stays visible on light (white) input backgrounds.
				const c = (a: number) => `color-mix(in srgb, ${IDLE_VOICE_GLOW_COLOR} ${+(a * 100).toFixed(2)}%, transparent)`;
				this._glowDiv.style.background = `radial-gradient(ellipse 40% 70% at 50% 0%, ${c(baseOpacity)} 0%, transparent 100%), radial-gradient(ellipse 70% 100% at 50% 0%, ${c(baseOpacity * 0.4)} 0%, transparent 100%)`;
			} else {
				const r = (onboarding || voiceState === 'speaking') ? '163,113,247' : '88,166,255';
				this._glowDiv.style.background = `radial-gradient(ellipse 40% 70% at 50% 0%, rgba(${r},${baseOpacity}) 0%, transparent 100%), radial-gradient(ellipse 70% 100% at 50% 0%, rgba(${r},${baseOpacity * 0.4}) 0%, transparent 100%)`;
			}
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
