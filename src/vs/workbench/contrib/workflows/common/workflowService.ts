/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { LRUCache } from '../../../../base/common/map.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkflowRuntime, WorkflowControl, WorkflowObject, WorkflowRun, WorkflowSnapshot, WorkflowStartOptions } from '../../../../platform/workflow/common/workflow.js';

export interface WorkflowSelection {
	readonly snapshot: WorkflowSnapshot;
	readonly stopAfter: string;
	readonly inputs?: WorkflowObject;
	/** Preserves lineage when configuring an independent child workflow. */
	readonly origin?: WorkflowRun['origin'];
}

export interface IWorkflowRuntimeAdapter {
	readonly id: string;
	readonly runtime: IWorkflowRuntime;
	supportsSession(session: URI): boolean;
	getUnsupportedReason?(session: URI): string | undefined;
}

export const IWorkflowService = createDecorator<IWorkflowService>('workflowService');

export interface IWorkflowService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeRun: Event<WorkflowRun>;
	readonly onDidChangeRuntimes: Event<void>;
	registerRuntime(adapter: IWorkflowRuntimeAdapter): IDisposable;
	/** Retains full run updates only for the lifetime of the returned view interest. */
	watchSession(session: URI): IDisposable;
	getUnsupportedReason(session: URI): string | undefined;
	getSessionRun(session: URI): Promise<WorkflowRun | undefined>;
	start(options: WorkflowStartOptions): Promise<WorkflowRun>;
	control(session: URI, control: WorkflowControl): Promise<WorkflowRun>;
}

class WorkflowSessionWatch extends Disposable {
	readonly subscription = this._register(new MutableDisposable<IDisposable>());
	references = 1;
	epoch = 0;
	updateVersion = 0;
	adapter: IWorkflowRuntimeAdapter | undefined;
	run: WorkflowRun | undefined;

	constructor(readonly session: URI) {
		super();
	}

	override dispose(): void {
		this.epoch++;
		this.run = undefined;
		this.adapter = undefined;
		super.dispose();
	}
}

interface WorkflowRunRevision {
	readonly generation: number;
	readonly id: string;
	readonly revision: number;
}

/** Routes explicit workflow operations to the session's owning runtime. */
export class WorkflowService extends Disposable implements IWorkflowService {
	declare readonly _serviceBrand: undefined;

	private readonly adapters = new Map<string, IWorkflowRuntimeAdapter>();
	private readonly adapterGenerations = new Map<IWorkflowRuntimeAdapter, number>();
	private nextGeneration = 0;
	private readonly sessionWatches = this._register(new DisposableMap<string, WorkflowSessionWatch>());
	private readonly revisions = new LRUCache<string, WorkflowRunRevision>(32);
	private readonly registrations = this._register(new DisposableStore());
	private readonly changeRun = this._register(new Emitter<WorkflowRun>());
	readonly onDidChangeRun = this.changeRun.event;
	private readonly changeRuntimes = this._register(new Emitter<void>());
	readonly onDidChangeRuntimes = this.changeRuntimes.event;

	registerRuntime(adapter: IWorkflowRuntimeAdapter): IDisposable {
		if (this._store.isDisposed) {
			throw new Error(localize('workflow.serviceDisposed', "The workflow service has been disposed."));
		}
		if (this.adapters.has(adapter.id)) {
			throw new Error(localize('workflow.runtimeDuplicate', "Workflow runtime '{0}' is already registered.", adapter.id));
		}
		const generation = ++this.nextGeneration;
		this.adapters.set(adapter.id, adapter);
		this.adapterGenerations.set(adapter, generation);
		const listener = adapter.runtime.onDidChangeRun(run => {
			const session = URI.parse(run.session);
			if (this.isCurrentAdapter(session, adapter, generation)) {
				this.acceptRun(session, run, adapter, generation);
			}
		});
		const registration = toDisposable(() => {
			listener.dispose();
			this.adapters.delete(adapter.id);
			this.adapterGenerations.delete(adapter);
			this.updateSessionWatches();
			this.changeRuntimes.fire();
			this.registrations.delete(registration);
		});
		this.registrations.add(registration);
		try {
			this.updateSessionWatches();
		} catch (error) {
			registration.dispose();
			throw error;
		}
		this.changeRuntimes.fire();
		return registration;
	}

	watchSession(session: URI): IDisposable {
		if (this._store.isDisposed) {
			return Disposable.None;
		}
		const key = session.toString();
		let watch = this.sessionWatches.get(key);
		if (watch) {
			watch.references++;
		} else {
			watch = new WorkflowSessionWatch(session);
			this.sessionWatches.set(key, watch);
			try {
				this.updateSessionWatch(watch);
			} catch (error) {
				this.sessionWatches.deleteAndDispose(key);
				throw error;
			}
		}
		const lease = watch;
		return toDisposable(() => {
			if (this.sessionWatches.get(key) === lease && --lease.references === 0) {
				this.sessionWatches.deleteAndDispose(key);
			}
		});
	}

	getUnsupportedReason(session: URI): string | undefined {
		const candidates = [...this.adapters.values()].filter(adapter => adapter.supportsSession(session));
		if (candidates.length > 1) {
			return localize('workflow.ambiguousRuntime', "More than one runtime owns this session. Reconnect the session before starting a workflow.");
		}
		if (!candidates.length) {
			return localize('workflow.unsupportedRuntime', "This session does not have a connected runtime that supports workflows.");
		}
		return candidates[0].getUnsupportedReason?.(session);
	}

	async getSessionRun(session: URI): Promise<WorkflowRun | undefined> {
		const adapter = this.findAdapter(session);
		if (!adapter) {
			return undefined;
		}
		const key = session.toString();
		const generation = this.adapterGenerations.get(adapter)!;
		const watch = this.sessionWatches.get(key);
		const epoch = watch?.epoch;
		const beforeUpdate = watch?.updateVersion;
		const beforeRead = this.revisions.get(key);
		const run = await adapter.runtime.getSessionRun(session.toString());
		if (!this.isCurrentAdapter(session, adapter, generation) || !this.isCurrentWatch(key, watch, epoch)) {
			return undefined;
		}
		const afterRead = this.revisions.get(key);
		if (watch && watch.updateVersion !== beforeUpdate && (!run || watch.run?.id !== run.id)
			|| afterRead !== beforeRead && afterRead?.id !== run?.id) {
			return watch?.run;
		}
		if (run) {
			return this.acceptRun(session, run, adapter, generation);
		}
		if (watch) {
			watch.run = undefined;
			watch.updateVersion++;
		}
		this.revisions.delete(key);
		return undefined;
	}

	async start(options: WorkflowStartOptions): Promise<WorkflowRun> {
		const session = URI.parse(options.session);
		const adapter = this.requireAdapter(session);
		const generation = this.adapterGenerations.get(adapter)!;
		const key = session.toString();
		const watch = this.sessionWatches.get(key);
		const epoch = watch?.epoch;
		const run = await adapter.runtime.start(options);
		if (this.isCurrentAdapter(session, adapter, generation) && this.isCurrentWatch(key, watch, epoch)) {
			this.acceptRun(session, run, adapter, generation);
		}
		return run;
	}

	async control(session: URI, control: WorkflowControl): Promise<WorkflowRun> {
		const adapter = this.requireAdapter(session);
		const generation = this.adapterGenerations.get(adapter)!;
		const key = session.toString();
		const watch = this.sessionWatches.get(key);
		const epoch = watch?.epoch;
		const current = await adapter.runtime.getSessionRun(session.toString());
		if (this.requireAdapter(session) !== adapter || this.adapterGenerations.get(adapter) !== generation) {
			throw new Error(localize('workflow.runtimeChanged', "The session reconnected to a different workflow runtime. Refresh its progress before trying again."));
		}
		if (!current || !isEqual(URI.parse(current.session), session) || current.id !== control.runId) {
			throw new Error(localize('workflow.sessionMismatch', "This workflow no longer belongs to the selected session. Refresh its progress before trying again."));
		}
		const run = await adapter.runtime.control(control);
		if (this.isCurrentAdapter(session, adapter, generation) && this.isCurrentWatch(key, watch, epoch)) {
			this.acceptRun(session, run, adapter, generation);
		}
		return run;
	}

	private updateSessionWatches(): void {
		if (this._store.isDisposed) {
			return;
		}
		for (const watch of [...this.sessionWatches.values()]) {
			if (this.sessionWatches.get(watch.session.toString()) === watch) {
				this.updateSessionWatch(watch);
			}
		}
	}

	private updateSessionWatch(watch: WorkflowSessionWatch): void {
		const adapter = this.findAdapter(watch.session);
		if (watch.adapter === adapter) {
			return;
		}
		watch.adapter = adapter;
		const epoch = ++watch.epoch;
		watch.run = undefined;
		watch.updateVersion++;
		watch.subscription.clear();
		const subscription = adapter?.runtime.watchSession?.(watch.session.toString());
		if (this.sessionWatches.get(watch.session.toString()) === watch && watch.epoch === epoch) {
			watch.subscription.value = subscription;
		} else {
			subscription?.dispose();
		}
	}

	private isCurrentAdapter(session: URI, adapter: IWorkflowRuntimeAdapter, generation: number): boolean {
		return this.findAdapter(session) === adapter && this.adapterGenerations.get(adapter) === generation;
	}

	private isCurrentWatch(key: string, watch: WorkflowSessionWatch | undefined, epoch: number | undefined): boolean {
		return this.sessionWatches.get(key) === watch && watch?.epoch === epoch;
	}

	private findAdapter(session: URI): IWorkflowRuntimeAdapter | undefined {
		const candidates = [...this.adapters.values()].filter(adapter => adapter.supportsSession(session));
		return candidates.length === 1 ? candidates[0] : undefined;
	}

	private requireAdapter(session: URI): IWorkflowRuntimeAdapter {
		const reason = this.getUnsupportedReason(session);
		const adapter = this.findAdapter(session);
		if (reason || !adapter) {
			throw new Error(reason ?? localize('workflow.unavailable', "The workflow runtime is unavailable."));
		}
		return adapter;
	}

	private acceptRun(session: URI, run: WorkflowRun, adapter: IWorkflowRuntimeAdapter, generation: number): WorkflowRun | undefined {
		if (!isEqual(URI.parse(run.session), session)) {
			throw new Error(localize('workflow.invalidRunSession', "The workflow runtime returned progress for a different session."));
		}
		const key = session.toString();
		const candidate = this.sessionWatches.get(key);
		const watch = candidate?.adapter === adapter ? candidate : undefined;
		const previous = watch?.run;
		if (previous?.id === run.id && previous.revision >= run.revision) {
			return previous;
		}
		const revision = this.revisions.get(key);
		if (revision?.generation === generation && revision.id === run.id && revision.revision > run.revision) {
			return previous;
		}
		const changed = revision?.generation !== generation || revision.id !== run.id || revision.revision !== run.revision;
		if (changed) {
			this.revisions.set(key, { generation, id: run.id, revision: run.revision });
		}
		if (watch) {
			watch.run = run;
			watch.updateVersion++;
		}
		if (changed || watch) {
			this.changeRun.fire(run);
		}
		return run;
	}

	override dispose(): void {
		super.dispose();
		this.revisions.clear();
	}
}
