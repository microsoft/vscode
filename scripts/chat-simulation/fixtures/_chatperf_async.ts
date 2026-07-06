/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// perf-benchmark-marker

/**
 * Fixture for chat-simulation benchmarks.
 * Simplified from src/vs/base/common/async.ts for stable perf testing.
 */

import { IDisposable } from './lifecycle';
import { CancellationError } from './errors';

export class Throttler {
	private activePromise: Promise<any> | null = null;
	private queuedPromiseFactory: (() => Promise<any>) | null = null;

	queue<T>(promiseFactory: () => Promise<T>): Promise<T> {
		if (this.activePromise) {
			this.queuedPromiseFactory = promiseFactory;
			return this.activePromise as Promise<T>;
		}
		this.activePromise = promiseFactory();
		return this.activePromise.finally(() => {
			this.activePromise = null;
			if (this.queuedPromiseFactory) {
				const factory = this.queuedPromiseFactory;
				this.queuedPromiseFactory = null;
				return this.queue(factory);
			}
		});
	}
}

export class Delayer<T> implements IDisposable {
	private timeout: any;
	private task: (() => T | Promise<T>) | null = null;

	constructor(public defaultDelay: number) { }

	trigger(task: () => T | Promise<T>, delay: number = this.defaultDelay): Promise<T> {
		this.task = task;
		this.cancelTimeout();
		return new Promise<T>((resolve, reject) => {
			this.timeout = setTimeout(() => {
				this.timeout = null;
				try { resolve(this.task!()); } catch (e) { reject(e); }
				this.task = null;
			}, delay);
		});
	}

	private cancelTimeout(): void {
		if (this.timeout !== null) {
			clearTimeout(this.timeout);
			this.timeout = null;
		}
	}

	dispose(): void {
		this.cancelTimeout();
	}
}

export class RunOnceScheduler implements IDisposable {
	private runner: (() => void) | null;
	private timeout: any;

	constructor(runner: () => void, private delay: number) {
		this.runner = runner;
	}

	schedule(delay = this.delay): void {
		this.cancel();
		this.timeout = setTimeout(() => {
			this.timeout = null;
			this.runner?.();
		}, delay);
	}

	cancel(): void {
		if (this.timeout !== null) {
			clearTimeout(this.timeout);
			this.timeout = null;
		}
	}

	isScheduled(): boolean { return this.timeout !== null; }

	dispose(): void {
		this.cancel();
		this.runner = null;
	}
}

export class Queue<T> {
	private readonly queue: Array<() => Promise<T>> = [];
	private running = false;

	async enqueue(factory: () => Promise<T>): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			this.queue.push(() => factory().then(resolve, reject));
			if (!this.running) { this.processQueue(); }
		});
	}

	private async processQueue(): Promise<void> {
		this.running = true;
		while (this.queue.length > 0) {
			const task = this.queue.shift()!;
			await task();
		}
		this.running = false;
	}

	get size(): number { return this.queue.length; }
}

export function timeout(millis: number): Promise<void> {
	return new Promise<void>(resolve => setTimeout(resolve, millis));
}

export async function retry<T>(task: () => Promise<T>, delay: number, retries: number): Promise<T> {
	let lastError: Error | undefined;
	for (let i = 0; i < retries; i++) {
		try { return await task(); }
		catch (error) { lastError = error as Error; await timeout(delay); }
	}
	throw lastError;
}
