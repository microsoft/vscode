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

export const IVoiceCodeTranscriptionClient = createDecorator<IVoiceCodeTranscriptionClient>('voiceCodeTranscriptionClient');

export interface IVoiceCodeTranscription {
	readonly turnId: string;
	readonly text: string;
	readonly status: 'partial' | 'final';
	readonly revision: number;
}

export interface IVoiceCodeTranscriptionError {
	readonly detail: string;
	readonly code?: string;
	readonly turnId?: string;
	readonly terminal?: boolean;
	readonly limitSeconds?: number;
	readonly usedSeconds?: number;
	readonly remainingSeconds?: number;
	readonly resetAt?: string;
}

export interface IVoiceCodeTranscriptionClient {
	readonly _serviceBrand: undefined;
	readonly onTranscription: Event<IVoiceCodeTranscription>;
	readonly onError: Event<IVoiceCodeTranscriptionError>;
	readonly onDidClose: Event<void>;
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

	private readonly _onDidClose = this._register(new Emitter<void>());
	readonly onDidClose = this._onDidClose.event;

	private _window: (Window & typeof globalThis) | undefined;
	private _socket: WebSocket | undefined;
	private _connectDeferred: DeferredPromise<void> | undefined;
	private _sessionInit: DeferredPromise<void> | undefined;
	private _intentionalClose = false;
	private _pingTimer: ReturnType<Window['setInterval']> | undefined;
	private _pongTimer: ReturnType<typeof setTimeout> | undefined;
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

		this._window = window;
		this._intentionalClose = false;
		const socket = new window.WebSocket(addWebSocketAuthToken(baseUrl, authToken));
		this._socket = socket;

		const opened = this._connectDeferred = new DeferredPromise<void>();
		socket.onopen = () => {
			if (this._socket !== socket) {
				return;
			}
			this._startPing();
			opened.complete();
		};
		socket.onmessage = event => {
			if (this._socket === socket) {
				this._handleMessage(event);
			}
		};
		socket.onerror = () => {
			if (!opened.isSettled) {
				opened.error(new Error('Transcription WebSocket connection failed'));
			}
		};
		socket.onclose = event => {
			if (this._socket !== socket) {
				return;
			}
			this._stopPing();
			this._socket = undefined;
			this._sessionInit?.error(new Error(event.reason || `Transcription connection closed (${event.code})`));
			this._sessionInit = undefined;
			if (!opened.isSettled) {
				opened.error(new Error(event.reason || `Transcription connection closed (${event.code})`));
			}
			if (!this._intentionalClose) {
				this._onDidClose.fire();
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
		this._send({ type: 'start_session' });
		await this._sessionInit.p;
	}

	sendPttStart(turnId: string): void {
		this._assertTurnId(turnId);
		this._lastRevisionByTurn.set(turnId, 0);
		this._send({ type: 'ptt_start', turn_id: turnId });
	}

	sendPttAudioChunk(turnId: string, audio: string): void {
		this._assertTurnId(turnId);
		if (!audio) {
			throw new Error('Transcription audio must be non-empty');
		}
		this._send({ type: 'ptt_audio_chunk', turn_id: turnId, audio });
	}

	sendPttEnd(turnId: string): void {
		this._assertTurnId(turnId);
		this._send({ type: 'ptt_end', turn_id: turnId });
	}

	private _handleMessage(event: MessageEvent): void {
		const message = parseMessage(event.data);
		if (!message) {
			this._logService.warn('[chat-dictation] ignored malformed transcription frame');
			return;
		}

		switch (message.type) {
			case 'pong':
				this._clearPongTimeout();
				return;
			case 'session_init':
				if (typeof message.session_id !== 'string' || !message.session_id) {
					this._logService.warn('[chat-dictation] ignored malformed session_init frame');
					return;
				}
				this._sessionInit?.complete();
				this._sessionInit = undefined;
				return;
			case 'transcription':
				this._handleTranscription(message);
				return;
			case 'error':
				this._handleError(message);
				return;
			default:
				this._logService.trace(`[chat-dictation] ignored unsupported frame type ${message.type}`);
		}
	}

	private _handleTranscription(message: Record<string, string | number | boolean | undefined>): void {
		const turnId = message.turn_id;
		const text = message.text;
		const status = message.status;
		const revision = message.revision;
		if (typeof turnId !== 'string' || !turnId
			|| typeof text !== 'string'
			|| (status !== 'partial' && status !== 'final')
			|| typeof revision !== 'number' || !Number.isInteger(revision) || revision <= 0
		) {
			this._logService.warn('[chat-dictation] ignored malformed transcription metadata');
			return;
		}
		const lastRevision = this._lastRevisionByTurn.get(turnId);
		if (lastRevision === undefined || revision <= lastRevision) {
			return;
		}
		this._lastRevisionByTurn.set(turnId, revision);
		this._onTranscription.fire({ turnId, text, status, revision });
	}

	private _handleError(message: Record<string, string | number | boolean | undefined>): void {
		if (typeof message.detail !== 'string') {
			this._logService.warn('[chat-dictation] ignored malformed error frame');
			return;
		}
		this._onError.fire({
			detail: message.detail,
			code: optionalString(message.code),
			turnId: optionalString(message.turn_id),
			terminal: optionalBoolean(message.terminal),
			limitSeconds: optionalNumber(message.limit_seconds),
			usedSeconds: optionalNumber(message.used_seconds),
			remainingSeconds: optionalNumber(message.remaining_seconds),
			resetAt: optionalUtcTimestamp(message.reset_at),
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

	private _startPing(): void {
		this._stopPing();
		const window = this._window;
		if (!window) {
			return;
		}
		this._pingTimer = window.setInterval(() => {
			if (!this.isConnected) {
				return;
			}
			this._send({ type: 'ping' });
			this._pongTimer = setTimeout(() => this._socket?.close(4000, 'pong timeout'), PONG_TIMEOUT_MS);
		}, PING_INTERVAL_MS);
	}

	private _stopPing(): void {
		if (this._pingTimer) {
			this._window?.clearInterval(this._pingTimer);
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

	disconnect(): void {
		this._intentionalClose = true;
		this._stopPing();
		this._connectDeferred?.cancel();
		this._connectDeferred = undefined;
		this._sessionInit?.cancel();
		this._sessionInit = undefined;
		const socket = this._socket;
		this._socket = undefined;
		this._window = undefined;
		this._lastRevisionByTurn.clear();
		if (socket && socket.readyState < WebSocket.CLOSING) {
			socket.close();
		}
	}

	override dispose(): void {
		this.disconnect();
		super.dispose();
	}
}

function parseMessage(data: string | ArrayBufferLike | Blob | ArrayBufferView): Record<string, string | number | boolean | undefined> | undefined {
	if (typeof data !== 'string') {
		return undefined;
	}
	try {
		const value: unknown = JSON.parse(data);
		if (!value || typeof value !== 'object' || Array.isArray(value)) {
			return undefined;
		}
		const record = value as Record<string, string | number | boolean | undefined>;
		return typeof record.type === 'string' ? record : undefined;
	} catch {
		return undefined;
	}
}

function optionalString(value: string | number | boolean | undefined): string | undefined {
	return typeof value === 'string' && value ? value : undefined;
}

function optionalBoolean(value: string | number | boolean | undefined): boolean | undefined {
	return typeof value === 'boolean' ? value : undefined;
}

function optionalNumber(value: string | number | boolean | undefined): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function optionalUtcTimestamp(value: string | number | boolean | undefined): string | undefined {
	if (typeof value !== 'string' || !value.endsWith('Z') || Number.isNaN(Date.parse(value))) {
		return undefined;
	}
	return value;
}
