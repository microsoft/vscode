/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { addWebSocketAuthToken, getTranscriptionWebSocketUrl } from '../voiceClient/voiceEndpoint.js';

const PING_INTERVAL_MS = 25_000;
const PONG_TIMEOUT_MS = 10_000;
const CONNECT_TIMEOUT_MS = 8000;
const SESSION_INIT_TIMEOUT_MS = 4000;

export const IVoiceCodeTranscriptionClient = createDecorator<IVoiceCodeTranscriptionClient>('voiceCodeTranscriptionClient');

export interface IVoiceCodeTranscription {
	readonly turnId: string;
	readonly text: string;
	readonly status: 'partial' | 'final';
	readonly revision: number;
	readonly committed: string;
}

export interface IVoiceCodeTranscriptionError {
	readonly detail: string;
	readonly code?: string;
	readonly turnId?: string;
	readonly terminal?: boolean;
}

export interface IVoiceCodeTranscriptionClient {
	readonly _serviceBrand: undefined;
	readonly onTranscription: Event<IVoiceCodeTranscription>;
	readonly onError: Event<IVoiceCodeTranscriptionError>;
	readonly onDidClose: Event<number>;
	readonly isConnected: boolean;

	connect(window: Window & typeof globalThis, authToken: string): Promise<void>;
	startSession(): Promise<void>;
	sendPttStart(turnId: string): void;
	sendPttAudioChunk(turnId: string, audio: string): void;
	sendPttEnd(turnId: string): void;
	disconnect(): void;
}

export class VoiceCodeTranscriptionClient extends Disposable implements IVoiceCodeTranscriptionClient {
	declare readonly _serviceBrand: undefined;

	private readonly _onTranscription = this._register(new Emitter<IVoiceCodeTranscription>());
	readonly onTranscription = this._onTranscription.event;
	private readonly _onError = this._register(new Emitter<IVoiceCodeTranscriptionError>());
	readonly onError = this._onError.event;
	private readonly _onDidClose = this._register(new Emitter<number>());
	readonly onDidClose = this._onDidClose.event;

	private _socket: WebSocket | undefined;
	private _connectDeferred: DeferredPromise<void> | undefined;
	private _sessionInit: DeferredPromise<void> | undefined;
	private _connectTimeout: ReturnType<typeof setTimeout> | undefined;
	private _sessionInitTimeout: ReturnType<typeof setTimeout> | undefined;
	private _intentionalClose = false;
	private _window: (Window & typeof globalThis) | undefined;
	private _pingTimer: ReturnType<Window['setInterval']> | undefined;
	private _pongTimer: ReturnType<typeof setTimeout> | undefined;
	private readonly _activeTurns = new Set<string>();
	private readonly _lastRevisionByTurn = new Map<string, number>();

	get isConnected(): boolean {
		return this._socket?.readyState === WebSocket.OPEN;
	}

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IProductService private readonly _productService: IProductService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	async connect(window: Window & typeof globalThis, authToken: string): Promise<void> {
		this.disconnect();
		const baseUrl = getTranscriptionWebSocketUrl(this._configurationService, this._productService);
		if (!baseUrl) {
			throw new Error('No transcription WebSocket URL is configured');
		}

		this._intentionalClose = false;
		this._window = window;
		const socket = new window.WebSocket(addWebSocketAuthToken(baseUrl, authToken));
		this._socket = socket;
		const opened = this._connectDeferred = new DeferredPromise<void>();
		this._connectTimeout = setTimeout(() => {
			if (this._socket === socket && !opened.isSettled) {
				opened.error(new Error('Timed out connecting to the transcription service'));
				socket.close(4000, 'connect timeout');
			}
		}, CONNECT_TIMEOUT_MS);
		socket.onopen = () => {
			if (this._socket === socket) {
				this._clearConnectTimeout();
				this._startPing();
				opened.complete();
			}
		};
		socket.onmessage = event => {
			if (this._socket === socket) {
				this._handleMessage(event);
			}
		};
		socket.onerror = () => {
			if (this._socket !== socket) {
				return;
			}
			this._clearConnectTimeout();
			if (!opened.isSettled) {
				opened.error(new Error('Transcription WebSocket connection failed'));
				return;
			}
			this._reportError('Transcription WebSocket error', undefined, undefined, true);
		};
		socket.onclose = event => {
			if (this._socket !== socket) {
				return;
			}
			this._socket = undefined;
			this._clearConnectTimeout();
			this._clearSessionInitTimeout();
			this._stopPing();
			const detail = `Transcription connection closed (${event.code})${event.reason ? `: ${event.reason}` : ''}`;
			this._sessionInit?.error(new Error(detail));
			this._sessionInit = undefined;
			if (!opened.isSettled) {
				opened.error(new Error(detail));
			}
			if (!this._intentionalClose) {
				this._onDidClose.fire(event.code);
				this._reportError(detail, undefined, undefined, true);
			}
		};
		try {
			await opened.p;
		} finally {
			if (this._connectDeferred === opened) {
				this._connectDeferred = undefined;
			}
		}
	}

	async startSession(): Promise<void> {
		this._assertConnected();
		if (this._sessionInit) {
			throw new Error('Transcription session initialization is already in progress');
		}
		this._sessionInit = new DeferredPromise<void>();
		this._sessionInitTimeout = setTimeout(() => {
			if (this._sessionInit) {
				this._sessionInit.error(new Error('Timed out initializing the transcription session'));
				this._sessionInit = undefined;
				this._socket?.close(4000, 'session initialization timeout');
			}
		}, SESSION_INIT_TIMEOUT_MS);
		this._send({ type: 'start_session' });
		try {
			await this._sessionInit.p;
		} finally {
			this._clearSessionInitTimeout();
		}
	}

	sendPttStart(turnId: string): void {
		this._assertTurnId(turnId);
		if (this._activeTurns.has(turnId)) {
			throw new Error('Transcription turn is already active');
		}
		this._activeTurns.add(turnId);
		this._lastRevisionByTurn.set(turnId, 0);
		this._send({ type: 'ptt_start', turn_id: turnId });
	}

	sendPttAudioChunk(turnId: string, audio: string): void {
		this._assertTurnId(turnId);
		this._assertActiveTurn(turnId);
		if (!audio) {
			throw new Error('Transcription audio must be non-empty');
		}
		this._send({ type: 'ptt_audio_chunk', turn_id: turnId, audio });
	}

	sendPttEnd(turnId: string): void {
		this._assertTurnId(turnId);
		this._assertActiveTurn(turnId);
		this._send({ type: 'ptt_end', turn_id: turnId });
		this._activeTurns.delete(turnId);
	}

	disconnect(): void {
		this._intentionalClose = true;
		this._stopPing();
		this._clearConnectTimeout();
		this._clearSessionInitTimeout();
		this._connectDeferred?.cancel();
		this._connectDeferred = undefined;
		this._sessionInit?.cancel();
		this._sessionInit = undefined;
		const socket = this._socket;
		this._socket = undefined;
		this._window = undefined;
		this._activeTurns.clear();
		this._lastRevisionByTurn.clear();
		if (socket && socket.readyState < WebSocket.CLOSING) {
			socket.close();
		}
	}

	override dispose(): void {
		this.disconnect();
		super.dispose();
	}

	private _handleMessage(event: MessageEvent): void {
		const message = parseMessage(event.data);
		if (!message) {
			this._logService.warn('[chat-stt] ignored malformed transcription frame');
			return;
		}
		switch (message.type) {
			case 'pong':
				this._clearPongTimeout();
				return;
			case 'session_init':
				if (typeof message.session_id !== 'string' || !message.session_id) {
					this._logService.warn('[chat-stt] ignored malformed session_init frame');
					return;
				}
				this._sessionInit?.complete();
				this._sessionInit = undefined;
				this._clearSessionInitTimeout();
				return;
			case 'transcription':
				this._handleTranscription(message);
				return;
			case 'error':
				this._handleError(message);
				return;
			default:
				this._logService.warn(`[chat-stt] ignored unsupported transcription frame type ${message.type}`);
		}
	}

	private _handleTranscription(message: Record<string, unknown>): void {
		const transcription = parseTranscription(message);
		if (!transcription) {
			this._logService.warn('[chat-stt] ignored malformed transcription metadata');
			return;
		}
		const { turnId, revision } = transcription;
		const lastRevision = this._lastRevisionByTurn.get(turnId);
		if (lastRevision === undefined || revision <= lastRevision) {
			return;
		}
		this._lastRevisionByTurn.set(turnId, revision);
		this._onTranscription.fire(transcription);
	}

	private _handleError(message: Record<string, unknown>): void {
		if (typeof message.detail !== 'string' || !message.detail) {
			this._logService.warn('[chat-stt] ignored malformed transcription error frame');
			return;
		}
		this._reportError(
			message.detail,
			optionalNonEmptyString(message.code),
			optionalNonEmptyString(message.turn_id),
			optionalBoolean(message.terminal),
		);
	}

	private _reportError(detail: string, code?: string, turnId?: string, terminal?: boolean): void {
		this._onError.fire({
			detail,
			...(code !== undefined ? { code } : {}),
			...(turnId !== undefined ? { turnId } : {}),
			...(terminal !== undefined ? { terminal } : {}),
		});
	}

	private _send(message: Record<string, string>): void {
		this._assertConnected();
		this._socket!.send(JSON.stringify(message));
	}

	private _assertConnected(): void {
		if (!this.isConnected) {
			throw new Error('Transcription WebSocket is not connected');
		}
	}

	private _assertTurnId(turnId: string): void {
		if (!turnId) {
			throw new Error('Transcription turn ID must be non-empty');
		}
	}

	private _assertActiveTurn(turnId: string): void {
		if (!this._activeTurns.has(turnId)) {
			throw new Error('Transcription turn is not active');
		}
	}

	private _startPing(): void {
		this._stopPing();
		if (!this._window) {
			return;
		}
		this._pingTimer = this._window.setInterval(() => {
			if (!this.isConnected) {
				return;
			}
			this._send({ type: 'ping' });
			this._clearPongTimeout();
			this._pongTimer = setTimeout(() => this._socket?.close(4000, 'pong timeout'), PONG_TIMEOUT_MS);
		}, PING_INTERVAL_MS);
	}

	private _stopPing(): void {
		if (this._pingTimer !== undefined) {
			this._window?.clearInterval(this._pingTimer);
			this._pingTimer = undefined;
		}
		this._clearPongTimeout();
	}

	private _clearPongTimeout(): void {
		if (this._pongTimer !== undefined) {
			clearTimeout(this._pongTimer);
			this._pongTimer = undefined;
		}
	}

	private _clearConnectTimeout(): void {
		if (this._connectTimeout !== undefined) {
			clearTimeout(this._connectTimeout);
			this._connectTimeout = undefined;
		}
	}

	private _clearSessionInitTimeout(): void {
		if (this._sessionInitTimeout !== undefined) {
			clearTimeout(this._sessionInitTimeout);
			this._sessionInitTimeout = undefined;
		}
	}
}

function parseMessage(data: unknown): Record<string, unknown> | undefined {
	if (typeof data !== 'string') {
		return undefined;
	}
	try {
		const value: unknown = JSON.parse(data);
		if (!value || typeof value !== 'object' || Array.isArray(value)) {
			return undefined;
		}
		const message = value as Record<string, unknown>;
		return typeof message.type === 'string' && message.type ? message : undefined;
	} catch {
		return undefined;
	}
}

function parseTranscription(message: Record<string, unknown>): IVoiceCodeTranscription | undefined {
	const turnId = optionalNonEmptyString(message.turn_id);
	if (turnId === undefined || typeof message.text !== 'string') {
		return undefined;
	}
	const status = transcriptionStatus(message.status);
	const revision = positiveSafeInteger(message.revision);
	if (status === undefined || revision === undefined || !isOptionalString(message.committed)) {
		return undefined;
	}
	return { turnId, text: message.text, status, revision, committed: message.committed ?? '' };
}

function transcriptionStatus(value: unknown): IVoiceCodeTranscription['status'] | undefined {
	return value === 'partial' || value === 'final' ? value : undefined;
}

function positiveSafeInteger(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function isOptionalString(value: unknown): value is string | undefined {
	return value === undefined || typeof value === 'string';
}

function optionalNonEmptyString(value: unknown): string | undefined {
	return typeof value === 'string' && value ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
	return typeof value === 'boolean' ? value : undefined;
}
