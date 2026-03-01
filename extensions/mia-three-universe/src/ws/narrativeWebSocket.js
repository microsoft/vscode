// src/ws/narrativeWebSocket.js — WebSocket client for real-time narrative events
// Manages persistent WebSocket connection to mia-code-server.

const vscode = require('vscode');

class NarrativeWebSocket {
	/**
	 * @param {string} serverUrl
	 * @param {import('vscode').ExtensionContext} context
	 */
	constructor(serverUrl, context) {
		this._serverUrl = serverUrl;
		this._context = context;
		this._ws = null;
		this._reconnectAttempts = 0;
		this._maxReconnectDelay = 60000;
		this._eventBuffer = [];
		this._maxBufferSize = 100;
		this._lastEventId = null;
		this._disposed = false;

		this._eventEmitter = new vscode.EventEmitter();
		this._stateEmitter = new vscode.EventEmitter();

		this.onEvent = this._eventEmitter.event;
		this.onStateChanged = this._stateEmitter.event;
	}

	get wsUrl() {
		if (!this._serverUrl) return null;
		const url = this._serverUrl.replace(/^http/, 'ws');
		return `${url}/api/ws/narrative`;
	}

	connect() {
		if (this._disposed || !this.wsUrl) return;

		this._stateEmitter.fire('connecting');

		try {
			// In VS Code extension host, WebSocket may not be available natively.
			// This is a contract — the actual WebSocket impl depends on the runtime.
			if (typeof WebSocket !== 'undefined') {
				this._ws = new WebSocket(this.wsUrl);
			} else {
				// Node.js runtime — would use 'ws' package
				try {
					const WS = require('ws');
					this._ws = new WS(this.wsUrl);
				} catch {
					this._stateEmitter.fire('disconnected');
					return;
				}
			}

			this._ws.onopen = () => {
				this._reconnectAttempts = 0;
				this._stateEmitter.fire('connected');

				// Authenticate
				this._context.secrets.get('mia.serverToken').then((token) => {
					if (token && this._ws && this._ws.readyState === 1) {
						this._ws.send(JSON.stringify({ type: 'auth', token }));
					}
				});

				// Request missed events if we have a last event ID
				if (this._lastEventId && this._ws.readyState === 1) {
					this._ws.send(JSON.stringify({
						type: 'replay',
						since: this._lastEventId,
					}));
				}
			};

			this._ws.onmessage = (event) => {
				try {
					const data = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());
					if (data.id) this._lastEventId = data.id;
					this._eventEmitter.fire(data);
				} catch {
					// Ignore malformed messages
				}
			};

			this._ws.onclose = () => {
				if (this._disposed) return;
				this._stateEmitter.fire('reconnecting');
				this._scheduleReconnect();
			};

			this._ws.onerror = () => {
				// Error event is always followed by close, so reconnect happens there
			};
		} catch (err) {
			this._stateEmitter.fire('disconnected');
		}
	}

	disconnect() {
		this._disposed = true;
		if (this._ws) {
			this._ws.close();
			this._ws = null;
		}
		this._stateEmitter.fire('disconnected');
	}

	reconnect(newServerUrl) {
		if (newServerUrl !== undefined) {
			this._serverUrl = newServerUrl;
		}
		if (this._ws) {
			this._ws.close();
			this._ws = null;
		}
		this._reconnectAttempts = 0;
		this._disposed = false;
		this.connect();
	}

	_scheduleReconnect() {
		if (this._disposed) return;

		const delay = Math.min(
			1000 * Math.pow(2, this._reconnectAttempts),
			this._maxReconnectDelay
		);

		this._reconnectAttempts++;

		setTimeout(() => {
			if (!this._disposed) {
				this.connect();
			}
		}, delay);
	}
}

module.exports = { NarrativeWebSocket };
