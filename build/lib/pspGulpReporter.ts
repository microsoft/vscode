/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Centralized Process State Protocol reporter for gulp.
 *
 * Hooks gulp's underlying undertaker `start` / `stop` / `error` events and publishes a single
 * aggregated document describing every task currently running and the last result of every task
 * that has run. Synthetic `series` / `parallel` wrappers (`branch: true`) are ignored.
 *
 * Individual tasks can attach richer structured data (e.g. parsed TS errors) via
 * `setTaskDetails(name, details)`.
 */

import type Undertaker from 'undertaker';
import { connectPspPublisher, type IPspPublisher } from '@vscode/psp';

interface IUndertakerStartEvent {
	uid: number;
	name: string;
	branch: boolean;
	time: number;
}

interface IUndertakerStopEvent extends IUndertakerStartEvent {
	duration: [number, number];
}

interface IUndertakerErrorEvent extends IUndertakerStopEvent {
	error: Error | unknown;
}

type TaskStatus = 'running' | 'idle' | 'error';

interface ITaskState {
	status: TaskStatus;
	lastDurationMs?: number;
	lastFinishedAt?: string;
	lastError?: string;
	details?: Readonly<Record<string, unknown>>;
}

export interface IPspGulpReporter {
	/**
	 * Attach extra structured data to a task's last-result entry (e.g. parsed compiler errors).
	 * Merged into the task's `details` field. Passing `undefined` clears it.
	 */
	setTaskDetails(name: string, details: Readonly<Record<string, unknown>> | undefined): void;
	close(): void;
}

const NOOP_REPORTER: IPspGulpReporter = {
	setTaskDetails() { /* noop */ },
	close() { /* noop */ },
};

let attached: IPspGulpReporter | undefined;

/**
 * Attach the reporter to a gulp instance. Safe to call multiple times — only the first call
 * does work; subsequent calls return the same reporter.
 */
export function attachPspGulpReporter(gulp: Undertaker, clientName = 'gulp'): IPspGulpReporter {
	if (attached) {
		return attached;
	}

	const running = new Map<number, string>(); // uid -> task name
	const tasks = new Map<string, ITaskState>();
	let publisher: IPspPublisher | undefined;
	let pendingPublish: NodeJS.Immediate | undefined;

	const computeStatus = (): TaskStatus => {
		if (running.size > 0) {
			return 'running';
		}
		for (const t of tasks.values()) {
			if (t.status === 'error') {
				return 'error';
			}
		}
		return 'idle';
	};

	const publish = () => {
		pendingPublish = undefined;
		if (!publisher) {
			return;
		}
		const runningNames = Array.from(new Set(running.values())).sort();
		const taskObj: Record<string, ITaskState> = {};
		for (const name of Array.from(tasks.keys()).sort()) {
			taskObj[name] = tasks.get(name)!;
		}
		publisher.setDoc({
			status: computeStatus(),
			running: runningNames,
			tasks: taskObj,
		});
	};

	const schedulePublish = () => {
		if (pendingPublish) {
			return;
		}
		pendingPublish = setImmediate(publish);
	};

	const upsert = (name: string, patch: Partial<ITaskState>) => {
		const existing = tasks.get(name);
		tasks.set(name, { status: 'idle', ...existing, ...patch });
	};

	gulp.on('start', (e: IUndertakerStartEvent) => {
		if (e.branch) {
			return;
		}
		running.set(e.uid, e.name);
		upsert(e.name, { status: 'running' });
		schedulePublish();
	});

	gulp.on('stop', (e: IUndertakerStopEvent) => {
		if (e.branch) {
			return;
		}
		running.delete(e.uid);
		upsert(e.name, {
			status: 'idle',
			lastDurationMs: hrtimeToMs(e.duration),
			lastFinishedAt: new Date(e.time).toISOString(),
			lastError: undefined,
		});
		schedulePublish();
	});

	gulp.on('error', (e: IUndertakerErrorEvent) => {
		if (e.branch) {
			return;
		}
		running.delete(e.uid);
		const err = e.error instanceof Error ? e.error : new Error(String(e.error));
		upsert(e.name, {
			status: 'error',
			lastDurationMs: hrtimeToMs(e.duration),
			lastFinishedAt: new Date(e.time).toISOString(),
			lastError: err.message,
		});
		schedulePublish();
	});

	// Fire-and-forget connect. Publish current state once ready (no-op if env vars missing).
	connectPspPublisher({ client: { name: clientName } }).then(p => {
		publisher = p;
		publish();
	});

	attached = {
		setTaskDetails(name, details) {
			const existing = tasks.get(name);
			tasks.set(name, { status: 'idle', ...existing, details });
			schedulePublish();
		},
		close() {
			publisher?.close();
			publisher = undefined;
		},
	};
	return attached;
}

/**
 * Returns the currently attached reporter, or a no-op if `attachPspGulpReporter` has not been
 * called yet. Lets task definitions safely report details without worrying about init order.
 */
export function getPspGulpReporter(): IPspGulpReporter {
	return attached ?? NOOP_REPORTER;
}

function hrtimeToMs(hr: [number, number]): number {
	return hr[0] * 1000 + hr[1] / 1e6;
}
