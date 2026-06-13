/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import {
	IVoiceClientService,
	IVoicePriorTimelineEntry,
	IVoiceSessionContext,
	IVoiceTranscription,
	IVoiceAudioResponse,
	IVoiceToolCall,
	IVoiceSpeechStarted,
	IVoiceSessionInit,
	IVoiceFeedbackPayload,
} from '../../common/voiceClient/voiceClientService.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';

const PING_INTERVAL_MS = 25_000;
const PONG_TIMEOUT_MS = 10_000;
const FAST_RETRY_COUNT = 3;
const FAST_RETRY_DELAY_MS = 2_000;
const SLOW_RETRY_DELAY_MS = 30_000;
const MAX_RECONNECT_DURATION_MS = 30 * 60 * 1_000;

export class VoiceClientService extends Disposable implements IVoiceClientService {
	declare readonly _serviceBrand: undefined;

	private _ws: WebSocket | undefined;
	private _reconnectAttempts = 0;
	private _reconnectStartedAt: number | undefined;
	private _reconnectTimer: ReturnType<typeof setTimeout> | undefined;
	private _isConnected = false;
	private _isResuming = false;
	private _window: (Window & typeof globalThis) | undefined;
	private _lastSessionId: string | undefined;

	// --- Keep-alive ping/pong ---
	private _pingTimer: ReturnType<Window['setInterval']> | undefined;
	private _pongTimer: ReturnType<typeof setTimeout> | undefined;

	// --- Debounced context sending with per-session delta tracking ---
	private _contextSendTimer: ReturnType<typeof setTimeout> | undefined;
	// Latest context handed to ``sendSessionContext`` while a debounce is in
	// flight. Held so ``flushSessionContext`` can ship it synchronously if a
	// state-change event needs to fire before the timer expires.
	private _pendingContext: IVoiceSessionContext | undefined;
	private _lastSentById = new Map<string, Record<string, unknown>>(); // session id → last-sent field values
	private _lastSentActive = '';

	// --- Events ---
	private readonly _onTranscription = this._register(new Emitter<IVoiceTranscription>());
	readonly onTranscription: Event<IVoiceTranscription> = this._onTranscription.event;

	private readonly _onAudioResponse = this._register(new Emitter<IVoiceAudioResponse>());
	readonly onAudioResponse: Event<IVoiceAudioResponse> = this._onAudioResponse.event;

	private readonly _onToolCall = this._register(new Emitter<IVoiceToolCall>());
	readonly onToolCall: Event<IVoiceToolCall> = this._onToolCall.event;

	private readonly _onSpeechStarted = this._register(new Emitter<IVoiceSpeechStarted>());
	readonly onSpeechStarted: Event<IVoiceSpeechStarted> = this._onSpeechStarted.event;

	private readonly _onSessionInit = this._register(new Emitter<IVoiceSessionInit>());
	readonly onSessionInit: Event<IVoiceSessionInit> = this._onSessionInit.event;

	private readonly _onError = this._register(new Emitter<string>());
	readonly onError: Event<string> = this._onError.event;

	private readonly _onDidChangeConnectionState = this._register(new Emitter<boolean>());
	readonly onDidChangeConnectionState: Event<boolean> = this._onDidChangeConnectionState.event;

	get isConnected(): boolean {
		return this._isConnected;
	}

	get isResuming(): boolean {
		return this._isResuming;
	}

	get currentSessionId(): string | undefined {
		return this._lastSessionId;
	}

	private _authToken: string | undefined;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
		@IProductService private readonly _productService: IProductService,
	) {
		super();
	}

	private _getWsUrl(): string {
		const configured = this._configurationService.getValue<string>('agents.voice.backendUrl');
		const url = typeof configured === 'string' ? configured.trim() : '';
		return url || this._productService.voiceWsUrl || '';
	}

	async connect(window: Window & typeof globalThis, authToken?: string): Promise<void> {
		this._window = window;
		this._authToken = authToken;
		this._reconnectAttempts = 0;
		this._connectWebSocket();
	}

	private _connectWebSocket(): void {
		const win = this._window;
		if (!win) {
			return;
		}

		const baseUrl = this._getWsUrl();
		if (!baseUrl) {
			this._logService.error('[voice] No voice WebSocket URL configured (set voiceWsUrl in product.json or agents.voice.backendUrl in settings)');
			return;
		}
		const url = this._authToken
			? `${baseUrl}?token=${encodeURIComponent(this._authToken)}`
			: baseUrl;
		const ws = new win.WebSocket(url);
		this._ws = ws;

		ws.onopen = () => {
			this._reconnectAttempts = 0;
			this._reconnectStartedAt = undefined;
			this._isResuming = !!this._lastSessionId;
			this._setConnected(true);
			this._startPing();

			if (this._lastSessionId) {
				// Reconnecting — resume_session with context is sent by sendResumeSession()
			}
		};

		ws.onmessage = (evt: MessageEvent) => {
			let msg: {
				type: string;
				session_id?: string;
				text?: string;
				audio?: string;
				is_first_chunk?: boolean;
				is_final?: boolean;
				coding_session_id?: string;
				transcript?: string;
				detail?: string;
				name?: string;
				call_id?: string;
				args?: Record<string, string>;
				status?: string;
				committed?: string;
			};
			try {
				msg = JSON.parse(evt.data as string);
			} catch {
				return;
			}

			switch (msg.type) {
				case 'pong':
					this._clearPongTimeout();
					break;
				case 'session_init':
					if (!this._isResuming) {
						this._lastSessionId = msg.session_id;
					}
					this._onSessionInit.fire({ sessionId: msg.session_id ?? '' });
					break;
				case 'session_resumed':
					this._lastSessionId = msg.session_id;
					this._onSessionInit.fire({ sessionId: msg.session_id ?? '' });
					break;
				case 'speech_started':
					this._onSpeechStarted.fire({});
					break;
				case 'transcription':
					this._onTranscription.fire({ text: msg.text ?? '', status: (msg.status as 'partial' | 'final') ?? 'final', committed: msg.committed as string ?? '' });
					break;
				case 'audio_response':
					// Old pre-streaming server (pre PR #44076) doesn't send
					// `is_first_chunk` at all. Treat missing field as TRUE so
					// suppression-clearing in _enqueueAudio still works; new
					// streaming server always emits true/false explicitly.
					this._onAudioResponse.fire({
						audio: msg.audio ?? '',
						isFirstChunk: msg.is_first_chunk === undefined ? true : Boolean(msg.is_first_chunk),
						isFinal: msg.is_final ?? false,
						codingSessionId: msg.coding_session_id,
						transcript: msg.transcript,
					});
					break;
				case 'tool_call':
					this._onToolCall.fire({
						callId: msg.call_id ?? '',
						name: msg.name ?? '',
						args: msg.args ?? {},
					});
					break;
				case 'error':
					this._onError.fire(msg.detail ?? 'Unknown error');
					break;
			}
		};

		ws.onerror = () => {
			this._onError.fire('WebSocket error');
		};

		ws.onclose = (evt: CloseEvent) => {
			this._logService.warn('[voice] ws.onclose', { code: evt.code, reason: evt.reason, wasClean: evt.wasClean });
			if (this._ws === ws) {
				if (evt.code === 1000 || evt.code === 1001) {
					this._cleanup();
					return;
				}

				// Fatal errors that should NOT trigger reconnection
				if (evt.code === 4001 || evt.code === 4008 || evt.code === 4029) {
					this._logService.warn(`[voice] fatal close code ${evt.code}: ${evt.reason}, not reconnecting`);
					this._onError.fire(evt.reason || `Connection rejected (code ${evt.code})`);
					this._cleanup();
					return;
				}

				if (!this._reconnectStartedAt) {
					this._reconnectStartedAt = Date.now();
				}

				const elapsed = Date.now() - this._reconnectStartedAt;
				if (elapsed >= MAX_RECONNECT_DURATION_MS) {
					this._logService.warn('[voice] reconnect timeout after 30 minutes, giving up');
					this._cleanup();
					return;
				}

				this._reconnectAttempts++;
				this._setConnected(false);
				this._stopPing();
				this._ws = undefined;

				const delay = this._reconnectAttempts <= FAST_RETRY_COUNT
					? FAST_RETRY_DELAY_MS
					: SLOW_RETRY_DELAY_MS;
				this._logService.warn(`[voice] reconnecting in ${delay}ms (attempt ${this._reconnectAttempts})`);
				this._reconnectTimer = setTimeout(() => this._connectWebSocket(), delay);
			}
		};
	}

	disconnect(): void {
		this._logService.warn('[voice] disconnect() called', new Error('disconnect trace').stack);
		if (this._ws && this._ws.readyState < WebSocket.CLOSING) {
			this._ws.close();
		}
		this._cleanup();
	}

	private _cleanup(): void {
		this._stopPing();
		if (this._reconnectTimer) {
			clearTimeout(this._reconnectTimer);
			this._reconnectTimer = undefined;
		}
		if (this._contextSendTimer) {
			clearTimeout(this._contextSendTimer);
			this._contextSendTimer = undefined;
		}
		this._pendingContext = undefined;
		this._ws = undefined;
		this._window = undefined;
		this._lastSessionId = undefined;
		this._lastSentById.clear();
		this._lastSentActive = '';
		this._setConnected(false);
	}

	private _startPing(): void {
		this._stopPing();
		const win = this._window ?? mainWindow;
		this._pingTimer = win.setInterval(() => {
			if (this._ws?.readyState === WebSocket.OPEN) {
				this._ws.send(JSON.stringify({ type: 'ping' }));
				this._pongTimer = setTimeout(() => {
					this._logService.warn('[voice] pong timeout — server unreachable, reconnecting');
					this._ws?.close(4000, 'pong timeout');
				}, PONG_TIMEOUT_MS);
			}
		}, PING_INTERVAL_MS);
	}

	private _stopPing(): void {
		if (this._pingTimer) {
			(this._window ?? mainWindow).clearInterval(this._pingTimer);
			this._pingTimer = undefined;
		}
		this._clearPongTimeout();
	}

	private _clearPongTimeout(): void {
		if (this._pongTimer) {
			clearTimeout(this._pongTimer);
			this._pongTimer = undefined;
		}
	}

	private _setConnected(connected: boolean): void {
		if (this._isConnected !== connected) {
			this._isConnected = connected;
			this._onDidChangeConnectionState.fire(connected);
		}
	}

	sendPttStart(turnId: string): void {
		if (this._ws?.readyState === WebSocket.OPEN) {
			this._ws.send(JSON.stringify({ type: 'ptt_start', turn_id: turnId }));
		}
	}

	sendPttAudioChunk(audio: string): void {
		if (this._ws?.readyState === WebSocket.OPEN) {
			this._ws.send(JSON.stringify({ type: 'ptt_audio_chunk', audio }));
		}
	}

	sendPttEnd(): void {
		if (this._ws?.readyState === WebSocket.OPEN) {
			this._ws.send(JSON.stringify({ type: 'ptt_end' }));
		}
	}

	sendPttDiagnostic(turnId: string, metrics: Record<string, unknown>): void {
		if (this._ws?.readyState === WebSocket.OPEN) {
			this._ws.send(JSON.stringify({ type: 'ptt_diagnostic', turn_id: turnId, metrics }));
		}
	}

	sendSessionContext(context: IVoiceSessionContext): void {
		if (!this._isConnected) {
			return;
		}
		this._pendingContext = context;
		if (this._contextSendTimer) {
			clearTimeout(this._contextSendTimer);
		}
		this._contextSendTimer = setTimeout(() => {
			this._contextSendTimer = undefined;
			const pending = this._pendingContext;
			this._pendingContext = undefined;
			if (pending && this._ws?.readyState === WebSocket.OPEN) {
				this._sendDelta(pending);
			}
		}, 500);
	}

	flushSessionContext(): void {
		if (!this._contextSendTimer) {
			return;
		}
		clearTimeout(this._contextSendTimer);
		this._contextSendTimer = undefined;
		const pending = this._pendingContext;
		this._pendingContext = undefined;
		if (pending && this._ws?.readyState === WebSocket.OPEN) {
			this._sendDelta(pending);
		}
	}

	invalidateSessionCache(sessionId: string): void {
		this._lastSentById.delete(sessionId);
	}

	private _sendDelta(context: IVoiceSessionContext): void {
		const currentIds = new Set(context.sessions.map(s => s.id));
		const removes = [...this._lastSentById.keys()].filter(id => !currentIds.has(id));
		const activeKey = context.active_session ? stableStringify(context.active_session) : '';
		const activeChanged = activeKey !== this._lastSentActive;

		// Compute per-session field-level patches (JSON Merge Patch style)
		const upserts: Record<string, unknown>[] = [];
		for (const session of context.sessions) {
			const current = session as unknown as Record<string, unknown>;
			const prev = this._lastSentById.get(session.id);
			if (!prev) {
				// New session — send all fields
				upserts.push(current);
			} else {
				const patch: Record<string, unknown> = { id: session.id };
				let hasChanges = false;
				// Fields that changed or were added
				for (const key of Object.keys(current)) {
					if (key === 'id') { continue; }
					if (stableStringify(current[key]) !== stableStringify(prev[key])) {
						patch[key] = current[key];
						hasChanges = true;
					}
				}
				// Fields that were removed (present in prev, absent in current) → null per RFC 7396
				for (const key of Object.keys(prev)) {
					if (key === 'id') { continue; }
					if (!Object.prototype.hasOwnProperty.call(current, key) || current[key] === undefined) {
						patch[key] = null;
						hasChanges = true;
					}
				}
				// ``agent_state_detail`` (the confirmation prompt text) and
				// ``last_response_summary`` (the agent's final reply) stream in
				// observables that may wobble multiple times within a single
				// stable ``agent_state``. Without this guard, each wobble ships
				// a delta and the BE re-narrates the same approval/idle event.
				// They are already delivered inline on ``session_state_change``
				// for real transitions, so we only let them ride in a context
				// delta when ``agent_state`` itself is in the same patch
				// (i.e. on an actual state transition).
				if (!Object.prototype.hasOwnProperty.call(patch, 'agent_state')) {
					if (Object.prototype.hasOwnProperty.call(patch, 'agent_state_detail')) {
						delete patch.agent_state_detail;
					}
					if (Object.prototype.hasOwnProperty.call(patch, 'last_response_summary')) {
						delete patch.last_response_summary;
					}
					// Recompute whether anything other than id remains
					hasChanges = Object.keys(patch).some(k => k !== 'id');
				}
				if (hasChanges) {
					upserts.push(patch);
				}
			}
		}

		if (upserts.length === 0 && removes.length === 0 && !activeChanged) {
			return;
		}

		// Update tracking state
		for (const session of context.sessions) {
			const obj: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(session as unknown as Record<string, unknown>)) {
				if (v !== undefined) { obj[k] = v; }
			}
			this._lastSentById.set(session.id, obj);
		}
		for (const id of removes) { this._lastSentById.delete(id); }
		this._lastSentActive = activeKey;

		this._ws!.send(JSON.stringify({
			type: 'session_context',
			mode: 'delta',
			upserts,
			removes,
			...(activeChanged && context.active_session ? { active_session: context.active_session } : {}),
		}));
	}

	private _seedTracking(context: IVoiceSessionContext): void {
		this._lastSentById.clear();
		for (const session of context.sessions) {
			const obj: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(session as unknown as Record<string, unknown>)) {
				if (v !== undefined) { obj[k] = v; }
			}
			this._lastSentById.set(session.id, obj);
		}
		this._lastSentActive = context.active_session ? stableStringify(context.active_session) : '';
	}

	sendToolResult(callId: string, result: string): void {
		if (this._ws?.readyState === WebSocket.OPEN) {
			this._ws.send(JSON.stringify({ type: 'tool_result', call_id: callId, result }));
		}
	}

	sendSessionStateChange(sessionId: string, newState: string, _label: string, detail?: string, lastResponseSummary?: string): void {
		if (this._ws?.readyState === WebSocket.OPEN) {
			const payload: Record<string, unknown> = { type: 'session_state_change', session_id: sessionId, new_state: newState };
			if (detail) { payload.detail = detail; }
			if (lastResponseSummary) { payload.last_response_summary = lastResponseSummary; }
			this._ws.send(JSON.stringify(payload));
		}
	}

	stopSpeaking(): void {
	}

	/**
	 * Send the start_session message with the given context.
	 * Called by the consumer after connect() resolves and AudioContext is ready.
	 *
	 * ``priorTimeline`` carries an ordered slice of cross-session entries
	 * (voice turns, voice tool calls, coding-session events, and a synthesized
	 * coding-agent-reply summary per active session) from the previous voice
	 * session. The BE consumes it once on the first command turn so the model
	 * can answer recall questions across reconnects without backend
	 * persistence. See ``IVoicePriorTimelineEntry``.
	 */
	sendStartSession(context: IVoiceSessionContext, machineId: string, priorTimeline?: readonly IVoicePriorTimelineEntry[]): void {
		if (this._ws?.readyState === WebSocket.OPEN) {
			this._seedTracking(context);
			const payload: Record<string, unknown> = { type: 'start_session', session_context: context, machine_id: machineId };
			if (priorTimeline && priorTimeline.length > 0) {
				payload.prior_timeline = priorTimeline;
			}
			this._ws.send(JSON.stringify(payload));
		}
	}

	sendResumeSession(context: IVoiceSessionContext, machineId: string): void {
		if (this._ws?.readyState === WebSocket.OPEN && this._lastSessionId) {
			this._seedTracking(context);
			this._ws.send(JSON.stringify({ type: 'resume_session', session_id: this._lastSessionId, session_context: context, machine_id: machineId }));
		}
	}

	async submitFeedback(payload: IVoiceFeedbackPayload): Promise<{ ok: boolean; error?: string }> {
		const httpUrl = this._getWsUrl()
			.replace('wss://', 'https://')
			.replace('ws://', 'http://')
			.replace(/\/realtime\/voice$/, '/feedback');
		const headers: Record<string, string> = { 'Content-Type': 'application/json' };
		if (this._authToken) {
			headers['Authorization'] = `Bearer ${this._authToken}`;
		}
		try {
			const response = await fetch(httpUrl, {
				method: 'POST',
				headers,
				body: JSON.stringify({
					feedback_text: payload.feedbackText,
					machine_id: payload.machineId,
					user_id: payload.userId,
					session_id: payload.sessionId,
					submission_id: payload.submissionId,
					transcript_history: payload.transcriptHistory.map(t => ({
						role: t.role,
						text: t.text,
						timestamp: t.timestamp,
					})),
					client_session_state: payload.clientSessionState,
					client_environment: payload.clientEnvironment,
					timestamp: payload.timestamp,
				}),
			});
			if (!response.ok) {
				const text = await response.text();
				return { ok: false, error: `HTTP ${response.status}: ${text}` };
			}
			return { ok: true };
		} catch (err) {
			return { ok: false, error: String(err) };
		}
	}

	override dispose(): void {
		this.disconnect();
		super.dispose();
	}
}

function stableStringify(value: unknown): string {
	if (value === null || typeof value !== 'object') {
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		return '[' + value.map(stableStringify).join(',') + ']';
	}
	const keys = Object.keys(value as Record<string, unknown>).sort();
	return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify((value as Record<string, unknown>)[k])).join(',') + '}';
}

registerSingleton(IVoiceClientService, VoiceClientService, InstantiationType.Delayed);
