/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from './disposable';

export interface BusMessage {
	readonly type: string;
}

type Handler<M> = (message: M) => void;

/** Typed publish/subscribe. Agents talk through it (via the Orchestrator), never to each other. */
export interface IMessageBus<M extends BusMessage> {
	publish(message: M): void;
	subscribe<T extends M['type']>(type: T, handler: Handler<Extract<M, { type: T }>>): IDisposable;
	/** Resolves with the next matching message; rejects if `signal` aborts first. */
	waitFor<T extends M['type']>(type: T, predicate?: (message: Extract<M, { type: T }>) => boolean, signal?: AbortSignal): Promise<Extract<M, { type: T }>>;
}

export class MessageBus<M extends BusMessage> implements IMessageBus<M> {
	private readonly handlers = new Map<string, Set<Handler<M>>>();

	/** `onHandlerError` sees exceptions thrown by subscribers; one bad subscriber never blocks the rest. */
	constructor(private readonly onHandlerError: (error: unknown, message: M) => void = () => { }) { }

	publish(message: M): void {
		for (const handler of [...this.handlers.get(message.type) ?? []]) {
			try {
				handler(message);
			} catch (err) {
				this.onHandlerError(err, message);
			}
		}
	}

	subscribe<T extends M['type']>(type: T, handler: Handler<Extract<M, { type: T }>>): IDisposable {
		let set = this.handlers.get(type);
		if (!set) {
			set = new Set();
			this.handlers.set(type, set);
		}
		const h = handler as Handler<M>;
		set.add(h);
		return toDisposable(() => set!.delete(h));
	}

	waitFor<T extends M['type']>(type: T, predicate?: (message: Extract<M, { type: T }>) => boolean, signal?: AbortSignal): Promise<Extract<M, { type: T }>> {
		return new Promise((resolve, reject) => {
			if (signal?.aborted) {
				reject(signal.reason ?? new Error('Aborted'));
				return;
			}
			const onAbort = () => {
				subscription.dispose();
				reject(signal!.reason ?? new Error('Aborted'));
			};
			const subscription = this.subscribe(type, message => {
				let matches: boolean;
				try {
					matches = !predicate || predicate(message);
				} catch (err) {
					subscription.dispose();
					signal?.removeEventListener('abort', onAbort);
					reject(err);
					return;
				}
				if (matches) {
					subscription.dispose();
					signal?.removeEventListener('abort', onAbort);
					resolve(message);
				}
			});
			signal?.addEventListener('abort', onAbort, { once: true });
		});
	}
}
