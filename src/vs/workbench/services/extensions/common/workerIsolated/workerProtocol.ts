/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SerializedError } from '../../../../../base/common/errors.js';

/**
 * Minimal interface for a worker-like object that can send/receive messages.
 * In production, this is a `worker_threads.Worker`. In tests, this can be a fake.
 */
export interface IWorkerLike {
	postMessage(value: unknown): void;
	on(event: string, listener: (...args: unknown[]) => void): void;
	terminate(): Promise<number>;
}

/**
 * Message types for the worker ↔ supervisor protocol.
 */
export const enum WorkerMessageType {
	Request = 1,
	Response = 2,
	ResponseError = 3,
	Notification = 4,
	Cancel = 5,
}

/**
 * Wire format for messages between supervisor and worker threads.
 * All messages are sent as structured-cloneable objects over MessagePort.
 */
export interface WorkerMessage {
	readonly type: WorkerMessageType;
	/** Request/response correlation ID. Present on Request, Response, ResponseError, and Cancel. */
	readonly id?: number;
	/** Method name. Present on Request and Notification. */
	readonly method?: string;
	/** Serialized arguments. Present on Request and Notification. */
	readonly args?: readonly unknown[];
	/** Result value. Present on Response. */
	readonly result?: unknown;
	/** Error details. Present on ResponseError. */
	readonly error?: SerializedError;
}

export function createRequest(id: number, method: string, args: readonly unknown[]): WorkerMessage {
	return { type: WorkerMessageType.Request, id, method, args };
}

export function createResponse(id: number, result: unknown): WorkerMessage {
	return { type: WorkerMessageType.Response, id, result };
}

export function createResponseError(id: number, error: SerializedError): WorkerMessage {
	return { type: WorkerMessageType.ResponseError, id, error };
}

export function createNotification(method: string, args: readonly unknown[]): WorkerMessage {
	return { type: WorkerMessageType.Notification, method, args };
}

export function createCancel(id: number): WorkerMessage {
	return { type: WorkerMessageType.Cancel, id };
}
