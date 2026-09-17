/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IWorkflowRuntime, WorkflowControl, WorkflowRun, WorkflowStartOptions } from '../../../../../platform/workflow/common/workflow.js';
import { WorkflowRunViewModel } from '../../common/workflowRunViewModel.js';
import { WorkflowService } from '../../common/workflowService.js';
import { testWorkflowRun } from './workflowTestData.js';

class TestRuntime extends Disposable implements IWorkflowRuntime {
	readonly changes = this._register(new Emitter<WorkflowRun>());
	readonly onDidChangeRun = this.changes.event;
	run = testWorkflowRun();
	readonly controls: WorkflowControl[] = [];
	readonly watched: string[] = [];
	readonly released: string[] = [];
	readonly activeWatches = new Set<string>();
	starts = 0;
	watchSession(session: string): IDisposable {
		this.watched.push(session);
		this.activeWatches.add(session);
		return toDisposable(() => {
			this.released.push(session);
			this.activeWatches.delete(session);
		});
	}
	async getSessionRun(session: string): Promise<WorkflowRun | undefined> { return this.run.session === session ? this.run : undefined; }
	async start(_options: WorkflowStartOptions): Promise<WorkflowRun> { this.starts++; return this.run; }
	async control(control: WorkflowControl): Promise<WorkflowRun> {
		this.controls.push(control);
		this.run = { ...this.run, revision: this.run.revision + 1, stopAfter: control.kind === 'setStopAfter' ? control.checkpointId : this.run.stopAfter };
		this.changes.fire(this.run);
		return this.run;
	}
}

suite('Workflow service and run view model', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('registration and inspection do not start a workflow', async () => {
		const runtime = store.add(new TestRuntime());
		const service = store.add(new WorkflowService());
		const session = URI.parse(runtime.run.session);
		const registration = store.add(service.registerRuntime({ id: 'neutral-adapter', runtime, supportsSession: candidate => candidate.scheme === session.scheme }));
		await service.getSessionRun(session);
		registration.dispose();
		assert.deepStrictEqual({ starts: runtime.starts, controls: runtime.controls, unsupported: !!service.getUnsupportedReason(session), run: await service.getSessionRun(session) }, { starts: 0, controls: [], unsupported: true, run: undefined });
	});

	test('unsupported runtime reasons are explicit and prevent start', async () => {
		const runtime = store.add(new TestRuntime());
		const service = store.add(new WorkflowService());
		store.add(service.registerRuntime({ id: 'neutral-adapter', runtime, supportsSession: () => true, getUnsupportedReason: () => 'Connection unavailable' }));
		await assert.rejects(service.start({ session: runtime.run.session, chat: runtime.run.chat, task: runtime.run.task, snapshot: runtime.run.snapshot, stopAfter: 'plan' }), /Connection unavailable/);
		assert.strictEqual(runtime.starts, 0);
	});

	test('start returns and publishes durable waiting or blocked runs without a first-turn event', async () => {
		const outcomes = [];
		for (const status of ['waiting', 'blocked'] as const) {
			const runtime = store.add(new TestRuntime());
			runtime.run = { ...runtime.run, status, firstTurns: {}, reason: 'The starting condition is unresolved.' };
			const service = store.add(new WorkflowService());
			store.add(service.registerRuntime({ id: 'neutral-adapter', runtime, supportsSession: () => true }));
			const changes: WorkflowRun['status'][] = [];
			store.add(service.onDidChangeRun(run => changes.push(run.status)));
			const run = await service.start({ session: runtime.run.session, chat: runtime.run.chat, task: runtime.run.task, snapshot: runtime.run.snapshot, stopAfter: 'plan' });
			outcomes.push({ status: run.status, firstTurns: run.firstTurns, changes, starts: runtime.starts, controls: runtime.controls });
		}
		assert.deepStrictEqual(outcomes, [
			{ status: 'waiting', firstTurns: {}, changes: ['waiting'], starts: 1, controls: [] },
			{ status: 'blocked', firstTurns: {}, changes: ['blocked'], starts: 1, controls: [] },
		]);
	});

	test('a stop proposal is local until Apply and Cancel has no runtime side effects', async () => {
		const runtime = store.add(new TestRuntime());
		const service = store.add(new WorkflowService());
		store.add(service.registerRuntime({ id: 'neutral-adapter', runtime, supportsSession: () => true }));
		const model = store.add(new WorkflowRunViewModel(URI.parse(runtime.run.session), runtime.run, service));
		model.proposeStop('plan');
		model.cancelProposal();
		const cancelled = { controls: runtime.controls.length, proposal: model.proposedStopAfter.get() };
		model.proposeStop('plan');
		await model.applyProposal();
		assert.deepStrictEqual({ cancelled, controls: runtime.controls, stop: model.run.get().stopAfter }, {
			cancelled: { controls: 0, proposal: undefined },
			controls: [{ kind: 'setStopAfter', runId: 'test-run', revision: 1, checkpointId: 'plan' }],
			stop: 'plan',
		});
	});

	test('older events cannot roll progress back and another session is ignored', async () => {
		const runtime = store.add(new TestRuntime());
		const service = store.add(new WorkflowService());
		const session = URI.parse(runtime.run.session);
		store.add(service.registerRuntime({ id: 'neutral-adapter', runtime, supportsSession: candidate => candidate.path === session.path }));
		store.add(service.watchSession(session));
		const changes: number[] = [];
		store.add(service.onDidChangeRun(run => changes.push(run.revision)));
		runtime.changes.fire({ ...runtime.run, revision: 3 });
		runtime.changes.fire({ ...runtime.run, revision: 2 });
		runtime.changes.fire({ ...runtime.run, session: 'test-session://owner/two', revision: 4 });
		assert.deepStrictEqual({ changes, revision: (await service.getSessionRun(session))?.revision }, { changes: [3], revision: 3 });
	});

	test('ambiguous ownership and cross-session control are rejected', async () => {
		const runtime = store.add(new TestRuntime());
		const service = store.add(new WorkflowService());
		store.add(service.registerRuntime({ id: 'first', runtime, supportsSession: () => true }));
		const duplicate = store.add(service.registerRuntime({ id: 'second', runtime, supportsSession: () => true }));
		assert.match(service.getUnsupportedReason(URI.parse(runtime.run.session))!, /More than one runtime/);
		duplicate.dispose();
		await assert.rejects(service.control(URI.parse('test-session://owner/two'), { kind: 'pause', runId: runtime.run.id, revision: 1 }), /no longer belongs/);
		assert.deepStrictEqual(runtime.controls, []);
	});

	test('a runtime disconnected during lookup cannot receive the pending control', async () => {
		const runtime = store.add(new TestRuntime());
		const service = store.add(new WorkflowService());
		const registration = store.add(service.registerRuntime({ id: 'neutral-adapter', runtime, supportsSession: () => true }));
		const read = new DeferredPromise<WorkflowRun | undefined>();
		runtime.getSessionRun = () => read.p;
		const pending = service.control(URI.parse(runtime.run.session), { kind: 'pause', runId: runtime.run.id, revision: 1 });
		registration.dispose();
		await read.complete(runtime.run);
		await assert.rejects(pending, /connected runtime/);
		assert.deepStrictEqual(runtime.controls, []);
	});

	test('a newer event wins over an older asynchronous lookup response', async () => {
		const runtime = store.add(new TestRuntime());
		const service = store.add(new WorkflowService());
		store.add(service.registerRuntime({ id: 'neutral-adapter', runtime, supportsSession: () => true }));
		store.add(service.watchSession(URI.parse(runtime.run.session)));
		const read = new DeferredPromise<WorkflowRun | undefined>();
		runtime.getSessionRun = () => read.p;
		const pending = service.getSessionRun(URI.parse(runtime.run.session));
		runtime.changes.fire({ ...runtime.run, revision: 5 });
		await read.complete(runtime.run);
		assert.strictEqual((await pending)?.revision, 5);
	});

	test('session watches are reference counted without starting work', () => {
		const runtime = store.add(new TestRuntime());
		const service = store.add(new WorkflowService());
		const session = URI.parse(runtime.run.session);
		store.add(service.registerRuntime({ id: 'adapter', runtime, supportsSession: () => true }));
		const first = store.add(service.watchSession(session));
		const second = store.add(service.watchSession(session));
		first.dispose();
		const shared = { watched: runtime.watched.length, released: runtime.released.length, active: runtime.activeWatches.size };
		second.dispose();
		assert.deepStrictEqual({
			shared,
			watched: runtime.watched,
			released: runtime.released,
			active: runtime.activeWatches.size,
			starts: runtime.starts,
			controls: runtime.controls,
		}, {
			shared: { watched: 1, released: 0, active: 1 },
			watched: [session.toString()],
			released: [session.toString()],
			active: 0,
			starts: 0,
			controls: [],
		});
	});

	test('the run view model owns its watch and receives synchronous initial progress', () => {
		const runtime = store.add(new class extends TestRuntime {
			override watchSession(session: string): IDisposable {
				const watch = super.watchSession(session);
				this.changes.fire({ ...this.run, revision: 3, status: 'paused' });
				return watch;
			}
		});
		const service = store.add(new WorkflowService());
		store.add(service.registerRuntime({ id: 'adapter', runtime, supportsSession: () => true }));
		const model = store.add(new WorkflowRunViewModel(URI.parse(runtime.run.session), runtime.run, service));
		const observed = { revision: model.run.get().revision, active: runtime.activeWatches.size };
		model.dispose();
		runtime.changes.fire({ ...runtime.run, revision: 4 });
		assert.deepStrictEqual({ observed, revision: model.run.get().revision, active: runtime.activeWatches.size }, { observed: { revision: 3, active: 1 }, revision: 3, active: 0 });
	});

	test('releasing the last watch removes the full snapshot fallback', async () => {
		const runtime = store.add(new TestRuntime());
		const service = store.add(new WorkflowService());
		const session = URI.parse(runtime.run.session);
		store.add(service.registerRuntime({ id: 'adapter', runtime, supportsSession: () => true }));
		const watch = store.add(service.watchSession(session));
		runtime.changes.fire({ ...runtime.run, revision: 5 });
		const watched = await service.getSessionRun(session);
		watch.dispose();
		const released = await service.getSessionRun(session);
		assert.deepStrictEqual({ watched: watched?.revision, released, active: runtime.activeWatches.size }, { watched: 5, released: undefined, active: 0 });
	});

	test('an unwatched observation does not retain a full snapshot', async () => {
		const runtime = store.add(new TestRuntime());
		const service = store.add(new WorkflowService());
		store.add(service.registerRuntime({ id: 'adapter', runtime, supportsSession: () => true }));
		runtime.changes.fire({ ...runtime.run, revision: 5 });
		const result = await service.getSessionRun(URI.parse(runtime.run.session));
		assert.deepStrictEqual({ result, watched: runtime.watched }, { result: undefined, watched: [] });
	});

	test('browsing many runs releases every backend watch and snapshot fallback', async () => {
		const runtime = store.add(new TestRuntime());
		const service = store.add(new WorkflowService());
		store.add(service.registerRuntime({ id: 'adapter', runtime, supportsSession: () => true }));
		for (let index = 0; index < 64; index++) {
			runtime.run = { ...testWorkflowRun(), id: `run-${index}`, session: `test-session://owner/${index}` };
			const watch = store.add(service.watchSession(URI.parse(runtime.run.session)));
			runtime.changes.fire({ ...runtime.run, revision: 5 });
			watch.dispose();
		}
		assert.deepStrictEqual({
			active: runtime.activeWatches.size,
			watched: runtime.watched.length,
			released: runtime.released.length,
			last: await service.getSessionRun(URI.parse(runtime.run.session)),
		}, { active: 0, watched: 64, released: 64, last: undefined });
	});

	test('watched progress survives lightweight revision eviction during a read', async () => {
		const runtime = store.add(new TestRuntime());
		const service = store.add(new WorkflowService());
		const session = URI.parse(runtime.run.session);
		store.add(service.registerRuntime({ id: 'adapter', runtime, supportsSession: () => true }));
		store.add(service.watchSession(session));
		const read = new DeferredPromise<WorkflowRun | undefined>();
		runtime.getSessionRun = () => read.p;
		const pending = service.getSessionRun(session);
		runtime.changes.fire({ ...runtime.run, revision: 5 });
		for (let index = 0; index < 64; index++) {
			runtime.changes.fire({ ...runtime.run, id: `other-${index}`, session: `test-session://owner/other-${index}` });
		}
		await read.complete(undefined);
		assert.strictEqual((await pending)?.revision, 5);
	});

	test('a read completing after release cannot restore the closed watch', async () => {
		const runtime = store.add(new TestRuntime());
		const service = store.add(new WorkflowService());
		const session = URI.parse(runtime.run.session);
		store.add(service.registerRuntime({ id: 'adapter', runtime, supportsSession: () => true }));
		const watch = store.add(service.watchSession(session));
		const read = new DeferredPromise<WorkflowRun | undefined>();
		runtime.getSessionRun = () => read.p;
		const changes: number[] = [];
		store.add(service.onDidChangeRun(run => changes.push(run.revision)));
		const pending = service.getSessionRun(session);
		watch.dispose();
		await read.complete(runtime.run);
		assert.deepStrictEqual({ result: await pending, changes, active: runtime.activeWatches.size }, { result: undefined, changes: [], active: 0 });
	});

	test('a stale read cannot replace a newly opened watch', async () => {
		const runtime = store.add(new TestRuntime());
		const service = store.add(new WorkflowService());
		const session = URI.parse(runtime.run.session);
		store.add(service.registerRuntime({ id: 'adapter', runtime, supportsSession: () => true }));
		const first = store.add(service.watchSession(session));
		const read = new DeferredPromise<WorkflowRun | undefined>();
		runtime.getSessionRun = () => read.p;
		const pending = service.getSessionRun(session);
		first.dispose();
		store.add(service.watchSession(session));
		runtime.changes.fire({ ...runtime.run, revision: 7 });
		await read.complete({ ...runtime.run, revision: 9 });
		const stale = await pending;
		runtime.getSessionRun = async () => ({ ...runtime.run, revision: 7 });
		assert.deepStrictEqual({ stale, current: (await service.getSessionRun(session))?.revision }, { stale: undefined, current: 7 });
	});

	test('a stale missing response cannot erase progress observed during the read', async () => {
		const runtime = store.add(new TestRuntime());
		const service = store.add(new WorkflowService());
		const session = URI.parse(runtime.run.session);
		store.add(service.registerRuntime({ id: 'adapter', runtime, supportsSession: () => true }));
		store.add(service.watchSession(session));
		const read = new DeferredPromise<WorkflowRun | undefined>();
		runtime.getSessionRun = () => read.p;
		const pending = service.getSessionRun(session);
		runtime.changes.fire({ ...runtime.run, revision: 5 });
		await read.complete(undefined);
		assert.strictEqual((await pending)?.revision, 5);
	});

	test('a newer run wins over an asynchronous response for the prior run', async () => {
		const runtime = store.add(new TestRuntime());
		const service = store.add(new WorkflowService());
		const session = URI.parse(runtime.run.session);
		store.add(service.registerRuntime({ id: 'adapter', runtime, supportsSession: () => true }));
		store.add(service.watchSession(session));
		const read = new DeferredPromise<WorkflowRun | undefined>();
		runtime.getSessionRun = () => read.p;
		const pending = service.getSessionRun(session);
		const newer = { ...runtime.run, id: 'replacement-run', revision: 1 };
		runtime.changes.fire(newer);
		await read.complete({ ...runtime.run, revision: 99 });
		assert.strictEqual(await pending, newer);
	});

	test('a disposed view model ignores a pending explicit control result', async () => {
		const runtime = store.add(new TestRuntime());
		const service = store.add(new WorkflowService());
		store.add(service.registerRuntime({ id: 'adapter', runtime, supportsSession: () => true }));
		const control = new DeferredPromise<WorkflowRun>();
		runtime.control = () => control.p;
		const model = store.add(new WorkflowRunViewModel(URI.parse(runtime.run.session), runtime.run, service));
		const pending = model.stopWorkflow();
		model.dispose();
		await control.complete({ ...runtime.run, revision: 2, status: 'paused' });
		await pending;
		assert.deepStrictEqual({ revision: model.run.get().revision, active: runtime.activeWatches.size }, { revision: 1, active: 0 });
	});

	test('watch interest survives runtime replacement but old reads do not', async () => {
		const runtime = store.add(new TestRuntime());
		const service = store.add(new WorkflowService());
		const session = URI.parse(runtime.run.session);
		const adapter = { id: 'adapter', runtime, supportsSession: () => true };
		const watch = store.add(service.watchSession(session));
		const registration = store.add(service.registerRuntime(adapter));
		const read = new DeferredPromise<WorkflowRun | undefined>();
		runtime.getSessionRun = () => read.p;
		const pending = service.getSessionRun(session);
		registration.dispose();
		store.add(service.registerRuntime(adapter));
		await read.complete(runtime.run);
		const result = await pending;
		watch.dispose();
		assert.deepStrictEqual({ result, watched: runtime.watched.length, released: runtime.released.length, active: runtime.activeWatches.size }, { result: undefined, watched: 2, released: 2, active: 0 });
	});

	test('ambiguous runtimes release interest until ownership is unique again', () => {
		const first = store.add(new TestRuntime());
		const second = store.add(new TestRuntime());
		const service = store.add(new WorkflowService());
		store.add(service.registerRuntime({ id: 'first', runtime: first, supportsSession: () => true }));
		store.add(service.watchSession(URI.parse(first.run.session)));
		const duplicate = store.add(service.registerRuntime({ id: 'second', runtime: second, supportsSession: () => true }));
		const ambiguous = [first.activeWatches.size, second.activeWatches.size];
		duplicate.dispose();
		assert.deepStrictEqual({ ambiguous, restored: first.activeWatches.size, starts: first.starts + second.starts }, { ambiguous: [0, 0], restored: 1, starts: 0 });
	});

	test('legacy runtimes need no watch implementation and service disposal releases interest', async () => {
		const runtime = store.add(new TestRuntime());
		const service = store.add(new WorkflowService());
		const session = URI.parse(runtime.run.session);
		const legacy: IWorkflowRuntime = {
			onDidChangeRun: runtime.onDidChangeRun,
			getSessionRun: session => runtime.getSessionRun(session),
			start: options => runtime.start(options),
			control: control => runtime.control(control),
		};
		const registration = store.add(service.registerRuntime({ id: 'legacy', runtime: legacy, supportsSession: () => true }));
		const watch = store.add(service.watchSession(session));
		const result = await service.getSessionRun(session);
		registration.dispose();
		store.add(service.registerRuntime({ id: 'current', runtime, supportsSession: () => true }));
		service.dispose();
		watch.dispose();
		assert.deepStrictEqual({ revision: result?.revision, active: runtime.activeWatches.size, watched: runtime.watched.length, released: runtime.released.length }, { revision: 1, active: 0, watched: 1, released: 1 });
	});
});
