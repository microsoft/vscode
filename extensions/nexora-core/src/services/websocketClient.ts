/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import WebSocket from 'ws';

export interface WebSocketMessage {
	type: string;
	plan_id?: string;
	task_id?: string;
	task_name?: string;
	status?: string;
	result?: unknown;
	error?: string;
	cost?: number;
	actual_cost?: number;
	attempt?: number;
	max_attempts?: number;
	platform?: string;
}

export type MessageCallback = (message: WebSocketMessage) => void;

export class OrchestrationWebSocket {
	private ws: WebSocket | null = null;
	private userId: string;
	private baseUrl: string;
	private reconnectAttempts = 0;
	private maxReconnectAttempts = 3;
	private callbacks: MessageCallback[] = [];
	private subscribedPlans: Set<string> = new Set();

	constructor(userId: string = 'default', baseUrl: string = 'ws://127.0.0.1:8000') {
		this.userId = userId;
		this.baseUrl = baseUrl;
	}

	connect(): Promise<boolean> {
		return new Promise((resolve) => {
			try {
				const url = `${this.baseUrl}/api/orchestrate/ws/${this.userId}`;
				this.ws = new WebSocket(url);

				this.ws.on('open', () => {
					console.log('[Nexora WS] Connected');
					this.reconnectAttempts = 0;

					// Resubscribe to plans
					this.subscribedPlans.forEach(planId => {
						this.subscribeToPlan(planId);
					});

					resolve(true);
				});

				this.ws.on('message', (data: WebSocket.Data) => {
					try {
						const message: WebSocketMessage = JSON.parse(data.toString());
						this.notifyCallbacks(message);
					} catch (e) {
						console.error('[Nexora WS] Failed to parse message:', e);
					}
				});

				this.ws.on('error', (error: Error) => {
					console.error('[Nexora WS] Error:', error.message);
				});

				this.ws.on('close', () => {
					console.log('[Nexora WS] Disconnected');
					this.ws = null;

					// Attempt reconnect
					if (this.reconnectAttempts < this.maxReconnectAttempts) {
						this.reconnectAttempts++;
						setTimeout(() => this.connect(), 2000 * this.reconnectAttempts);
					}
				});

				// Timeout for connection
				setTimeout(() => {
					if (this.ws?.readyState !== WebSocket.OPEN) {
						resolve(false);
					}
				}, 5000);

			} catch (e) {
				console.error('[Nexora WS] Connection failed:', e);
				resolve(false);
			}
		});
	}

	disconnect(): void {
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
		this.callbacks = [];
		this.subscribedPlans.clear();
	}

	isConnected(): boolean {
		return this.ws?.readyState === WebSocket.OPEN;
	}

	subscribeToPlan(planId: string): void {
		this.subscribedPlans.add(planId);

		if (this.isConnected() && this.ws) {
			this.ws.send(JSON.stringify({
				type: 'subscribe_plan',
				plan_id: planId
			}));
		}
	}

	unsubscribeFromPlan(planId: string): void {
		this.subscribedPlans.delete(planId);
	}

	onMessage(callback: MessageCallback): () => void {
		this.callbacks.push(callback);

		// Return unsubscribe function
		return () => {
			const index = this.callbacks.indexOf(callback);
			if (index > -1) {
				this.callbacks.splice(index, 1);
			}
		};
	}

	private notifyCallbacks(message: WebSocketMessage): void {
		this.callbacks.forEach(cb => {
			try {
				cb(message);
			} catch (e) {
				console.error('[Nexora WS] Callback error:', e);
			}
		});
	}
}

// Singleton instance
let wsInstance: OrchestrationWebSocket | null = null;

export function getOrchestrationWebSocket(userId: string = 'default'): OrchestrationWebSocket {
	if (!wsInstance || wsInstance['userId'] !== userId) {
		wsInstance = new OrchestrationWebSocket(userId);
	}
	return wsInstance;
}

export function disposeWebSocket(): void {
	if (wsInstance) {
		wsInstance.disconnect();
		wsInstance = null;
	}
}
