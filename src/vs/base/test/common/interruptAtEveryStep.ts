/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { errorHandler, isCancellationError, setUnexpectedErrorHandler } from '../../common/errors.js';
import { DisposableInfo, DisposableStore, DisposableTracker, getDisposableTracker, IDisposable, IDisposableTracker, setDisposableTracker } from '../../common/lifecycle.js';
import { nextMacrotask, realTimeApi } from './virtualScheduling/index.js';

/**
 * An operation that {@link interruptAtEveryStep} started and can interrupt.
 */
export interface IInterruptibleOperation {
	/** The running operation, such as `storage.init()`. */
	readonly promise: Promise<unknown>;
	/** Interrupts the operation, such as by disposing its object or cancelling its token. */
	interrupt(): void;
}

/**
 * Options for {@link interruptAtEveryStep}.
 */
export interface IInterruptAtEveryStepOptions {
	/**
	 * How far the operation advances in one step.
	 *
	 * - `'microtask'` (default): one hop of the microtask queue. This is deterministic and interrupts every `await` of an
	 *   operation that only waits on promises, such as one that uses in-memory services. An operation that waits on a
	 *   timer or on I/O never completes in microtask steps.
	 * - `'macrotask'`: one turn of the event loop, which also runs timers and I/O callbacks. Awaits that resume in the
	 *   same turn are not interrupted separately. Within `runWithFakedTimers`, timers run deterministically. With real
	 *   I/O, the step at which an await resumes can vary from one test run to the next.
	 */
	readonly step?: 'microtask' | 'macrotask';
	/** The most steps to try before failing. Defaults to 500. */
	readonly maxSteps?: number;
}

/** Real time that an operation may take to settle after it was interrupted. */
const settleTimeout = 4000;

/**
 * Starts an operation again and again, and interrupts it after 0, 1, 2, … steps until a run completes before it is
 * interrupted. This interrupts every `await` of the operation once. After each run, everything the run created must be
 * disposed (unless an object that existed before the run owns it) and no unexpected error may have occurred, otherwise
 * this rejects with the step at which it happened. Cancellation errors of interrupted runs are expected.
 *
 * ```ts
 * test('init does not leak when disposed at any step', () => interruptAtEveryStep(store => {
 * 	const storage = store.add(new InMemoryStorageMain(logService, fileService));
 * 	return { promise: storage.init(), interrupt: () => storage.dispose() };
 * }));
 * ```
 *
 * @param start Called for every run to create the object under test and start the operation. Disposables added to
 * `store` are disposed when the run ends.
 * @returns The number of steps the operation took when it was not interrupted.
 */
export async function interruptAtEveryStep(start: (store: DisposableStore) => IInterruptibleOperation, options?: IInterruptAtEveryStepOptions): Promise<number> {
	const maxSteps = options?.maxSteps ?? 500;
	const step = options?.step === 'macrotask' ? nextTurn : nextMicrotask;
	for (let interruptAfter = 0; interruptAfter <= maxSteps; interruptAfter++) {
		const steps = await runOnce(start, interruptAfter, step);
		if (steps !== undefined) {
			return steps;
		}
	}
	const hint = options?.step === 'macrotask' ? '' : ' If it waits on a timer or on I/O, use `step: \'macrotask\'`.';
	throw new Error(`The operation did not complete within ${maxSteps} steps.${hint}`);
}

/**
 * Runs the operation once and interrupts it after `interruptAfter` steps, unless it completes first.
 *
 * @returns The number of steps the operation took, if it completed without being interrupted.
 */
async function runOnce(start: (store: DisposableStore) => IInterruptibleOperation, interruptAfter: number, step: () => Promise<void>): Promise<number | undefined> {
	const outerTracker = getDisposableTracker();
	const outerErrorHandler = errorHandler.getUnexpectedErrorHandler();
	const outerDisposedWarning = DisposableStore.DISABLE_DISPOSED_WARNING;
	const tracker = new RunDisposableTracker(outerTracker);
	const errors: unknown[] = [];
	setDisposableTracker(tracker);
	setUnexpectedErrorHandler(error => errors.push(error));
	// The leak check below reports what a disposed store would have leaked.
	DisposableStore.DISABLE_DISPOSED_WARNING = true;

	const store = new DisposableStore();
	let steps = 0;
	let interrupted = false;
	const describe = () => interrupted ? `Interrupted after ${steps} steps` : `Not interrupted, completed after ${steps} steps`;
	try {
		const operation = start(store);
		let settled = false;
		const outcome = operation.promise.then(() => { settled = true; }, error => {
			settled = true;
			if (!interrupted || !isCancellationError(error)) {
				errors.push(error);
			}
		});
		while (steps < interruptAfter && !settled) {
			await step();
			steps++;
		}
		if (!settled) {
			interrupted = true;
			try {
				operation.interrupt();
			} catch (error) {
				errors.push(error);
			}
		}
		await settleWithin(outcome, describe);
	} catch (error) {
		errors.push(error);
	} finally {
		try {
			store.dispose();
		} catch (error) {
			errors.push(error);
		}
		try {
			// Let cleanup that the operation or its interruption started finish before checking for leaks.
			await nextTurn();
		} finally {
			DisposableStore.DISABLE_DISPOSED_WARNING = outerDisposedWarning;
			setUnexpectedErrorHandler(outerErrorHandler);
			setDisposableTracker(outerTracker);
		}
	}

	const leaks = tracker.computeLeaks();
	// Dispose what leaked, so that it cannot fail the leak check of a later test.
	for (const leak of leaks?.leaks ?? []) {
		try {
			leak.value.dispose();
		} catch {
			// The leak is reported below.
		}
	}
	const problems: string[] = [];
	if (errors.length > 0) {
		const details = errors.map(error => error instanceof Error ? error.stack ?? error.message : String(error)).join('\n\n');
		problems.push(`${errors.length === 1 ? 'An unexpected error occurred' : `${errors.length} unexpected errors occurred`}:\n${details}`);
	}
	if (leaks) {
		problems.push(`There are ${leaks.leaks.length} undisposed disposables!${leaks.details}`);
	}
	if (problems.length > 0) {
		throw new Error(`${describe()}: ${problems.join('\n\n')}`);
	}
	return interrupted ? undefined : steps;
}

function nextMicrotask(): Promise<void> {
	return Promise.resolve();
}

function nextTurn(): Promise<void> {
	return new Promise(resolve => nextMacrotask(realTimeApi, resolve));
}

function settleWithin(outcome: Promise<void>, describe: () => string): Promise<void> {
	return new Promise((resolve, reject) => {
		const handle = realTimeApi.setTimeout(() => reject(new Error(`${describe()}: The operation did not settle within ${settleTimeout}ms.`)), settleTimeout);
		outcome.then(() => {
			realTimeApi.clearTimeout(handle);
			resolve();
		});
	});
}

/**
 * Tracks the disposables that one run creates, and passes everything on to the tracker that was installed before, such
 * as the one of `ensureNoDisposablesAreLeakedInTestSuite`.
 */
class RunDisposableTracker implements IDisposableTracker {

	private readonly inner = new DisposableTracker();
	private readonly created = new Set<IDisposable>();
	private readonly disposed = new Set<IDisposable>();
	private readonly parents = new Map<IDisposable, IDisposable>();
	private readonly outer: IDisposableTracker | null;

	constructor(outer: IDisposableTracker | null) {
		this.outer = outer;
	}

	trackDisposable(disposable: IDisposable): void {
		this.created.add(disposable);
		this.inner.trackDisposable(disposable);
		this.outer?.trackDisposable(disposable);
	}

	setParent(child: IDisposable, parent: IDisposable | null): void {
		if (parent) {
			this.parents.set(child, parent);
		} else {
			this.parents.delete(child);
		}
		this.inner.setParent(child, parent);
		this.outer?.setParent(child, parent);
	}

	markAsDisposed(disposable: IDisposable): void {
		this.disposed.add(disposable);
		this.inner.markAsDisposed(disposable);
		this.outer?.markAsDisposed(disposable);
	}

	markAsSingleton(disposable: IDisposable): void {
		this.inner.markAsSingleton(disposable);
		this.outer?.markAsSingleton(disposable);
	}

	/**
	 * The disposables that the run created and that nothing will dispose. Disposables that an object which existed before
	 * the run owns, through owners that are not disposed, are left to that object, such as the timers of a virtual clock.
	 */
	computeLeaks(): { leaks: DisposableInfo[]; details: string } | undefined {
		const leaks = this.inner.computeLeakingDisposables()?.leaks.filter(leak => !this.isOwnedByOlderObject(leak.value));
		return leaks?.length ? this.inner.computeLeakingDisposables(10, leaks) : undefined;
	}

	private isOwnedByOlderObject(disposable: IDisposable): boolean {
		const seen = new Set<IDisposable>();
		for (let owner = this.parents.get(disposable); owner && !seen.has(owner); owner = this.parents.get(owner)) {
			if (this.disposed.has(owner)) {
				return false;
			}
			if (!this.created.has(owner)) {
				return true;
			}
			seen.add(owner);
		}
		return false;
	}
}
