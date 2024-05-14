/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GlobalIdleValue } from 'vs/base/common/async';
import { Event } from 'vs/base/common/event';
import { illegalState } from 'vs/base/common/errors';
import { dispose, IDisposable, isDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { SyncDescriptor, SyncDescriptor0 } from 'vs/platform/instantiation/common/descriptors';
import { Graph } from 'vs/platform/instantiation/common/graph';
import { GetLeadingNonServiceArgs, IInstantiationService, ServiceIdentifier, ServicesAccessor, _util } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { LinkedList } from 'vs/base/common/linkedList';

// TRACING
const _enableAllTracing = false
	// || "TRUE" // DO NOT CHECK IN!
	;

class CyclicDependencyError extends Error {
	constructor(graph: Graph<any>) {
		super('cyclic dependency between services');
		this.message = graph.findCycleSlow() ?? `UNABLE to detect cycle, dumping graph: \n${graph.toString()}`;
	}
}

export class InstantiationService implements IInstantiationService {

	declare readonly _serviceBrand: undefined;

	readonly _globalGraph?: Graph<string>;
	private _globalGraphImplicitDependency?: string;

	private _isDisposed = false;
	private readonly _servicesToMaybeDispose = new Set<any>();
	private readonly _children = new Set<InstantiationService>();

	constructor(
		private readonly _services: ServiceCollection = new ServiceCollection(),
		private readonly _strict: boolean = false,
		private readonly _parent?: InstantiationService,
		private readonly _enableTracing: boolean = _enableAllTracing
	) {

		this._services.set(IInstantiationService, this);
		this._globalGraph = _enableTracing ? _parent?._globalGraph ?? new Graph(e => e) : undefined;
	}

	dispose(): void {
		if (!this._isDisposed) {
			this._isDisposed = true;
			// dispose all child services
			dispose(this._children);
			this._children.clear();

			// dispose all services created by this service
			for (const candidate of this._servicesToMaybeDispose) {
				if (isDisposable(candidate)) {
					candidate.dispose();
				}
			}
			this._servicesToMaybeDispose.clear();
		}
	}

	private _throwIfDisposed(): void {
		if (this._isDisposed) {
			throw new Error('InstantiationService has been disposed');
		}
	}

	createChild(services: ServiceCollection): IInstantiationService {
		this._throwIfDisposed();

		const result = new class extends InstantiationService {
			override dispose(): void {
				this._children.delete(result);
				super.dispose();
			}
		}(services, this._strict, this, this._enableTracing);
		this._children.add(result);
		return result;
	}

	invokeFunction<R, TS extends any[] = []>(fn: (accessor: ServicesAccessor, ...args: TS) => R, ...args: TS): R {
		this._throwIfDisposed();

		const _trace = Trace.traceInvocation(this._enableTracing, fn);
		let _done = false;
		try {
			const accessor: ServicesAccessor = {
				get: <T>(id: ServiceIdentifier<T>) => {

					if (_done) {
						throw illegalState('service accessor is only valid during the invocation of its target method');
					}

					const result = this._getOrCreateServiceInstance(id, _trace);
					if (!result) {
						throw new Error(`[invokeFunction] unknown service '${id}'`);
					}
					return result;
				}
			};
			return fn(accessor, ...args);
		} finally {
			_done = true;
			_trace.stop();
		}
	}

	createInstance<T>(descriptor: SyncDescriptor0<T>): T;
	createInstance<Ctor extends new (...args: any[]) => any, R extends InstanceType<Ctor>>(ctor: Ctor, ...args: GetLeadingNonServiceArgs<ConstructorParameters<Ctor>>): R;
	createInstance(ctorOrDescriptor: any | SyncDescriptor<any>, ...rest: any[]): any {
		this._throwIfDisposed();

		let _trace: Trace;
		let result: any;
		if (ctorOrDescriptor instanceof SyncDescriptor) {
			_trace = Trace.traceCreation(this._enableTracing, ctorOrDescriptor.ctor);
			result = this._createInstance(ctorOrDescriptor.ctor, ctorOrDescriptor.staticArguments.concat(rest), _trace);
		} else {
			_trace = Trace.traceCreation(this._enableTracing, ctorOrDescriptor);
			result = this._createInstance(ctorOrDescriptor, rest, _trace);
		}
		_trace.stop();
		return result;
	}

	private _createInstance<T>(ctor: any, args: any[] = [], _trace: Trace): T {

		// arguments defined by service decorators
		const serviceDependencies = _util.getServiceDependencies(ctor).sort((a, b) => a.index - b.index);
		const serviceArgs: any[] = [];
		for (const dependency of serviceDependencies) {
			const service = this._getOrCreateServiceInstance(dependency.id, _trace);
			if (!service) {
				this._throwIfStrict(`[createInstance] ${ctor.name} depends on UNKNOWN service ${dependency.id}.`, false);
			}
			serviceArgs.push(service);
		}

		const firstServiceArgPos = serviceDependencies.length > 0 ? serviceDependencies[0].index : args.length;

		// check for argument mismatches, adjust static args if needed
		if (args.length !== firstServiceArgPos) {
			console.trace(`[createInstance] First service dependency of ${ctor.name} at position ${firstServiceArgPos + 1} conflicts with ${args.length} static arguments`);

			const delta = firstServiceArgPos - args.length;
			if (delta > 0) {
				args = args.concat(new Array(delta));
			} else {
				args = args.slice(0, firstServiceArgPos);
			}
		}

		// now create the instance
		return Reflect.construct<any, T>(ctor, args.concat(serviceArgs));
	}

	private _setCreatedServiceInstance<T>(id: ServiceIdentifier<T>, instance: T): void {
		if (this._services.get(id) instanceof SyncDescriptor) {
			this._services.set(id, instance);
		} else if (this._parent) {
			this._parent._setCreatedServiceInstance(id, instance);
		} else {
			throw new Error('illegalState - setting UNKNOWN service instance');
		}
	}

	private _getServiceInstanceOrDescriptor<T>(id: ServiceIdentifier<T>): T | SyncDescriptor<T> {
		const instanceOrDesc = this._services.get(id);
		if (!instanceOrDesc && this._parent) {
			return this._parent._getServiceInstanceOrDescriptor(id);
		} else {
			return instanceOrDesc;
		}
	}

	protected _getOrCreateServiceInstance<T>(id: ServiceIdentifier<T>, _trace: Trace): T {
		if (this._globalGraph && this._globalGraphImplicitDependency) {
			this._globalGraph.insertEdge(this._globalGraphImplicitDependency, String(id));
		}
		const thing = this._getServiceInstanceOrDescriptor(id);
		if (thing instanceof SyncDescriptor) {
			return this._safeCreateAndCacheServiceInstance(id, thing, _trace.branch(id, true));
		} else {
			_trace.branch(id, false);
			return thing;
		}
	}

	private readonly _activeInstantiations = new Set<ServiceIdentifier<any>>();


	private _safeCreateAndCacheServiceInstance<T>(id: ServiceIdentifier<T>, desc: SyncDescriptor<T>, _trace: Trace): T {
		if (this._activeInstantiations.has(id)) {
			throw new Error(`illegal state - RECURSIVELY instantiating service '${id}'`);
		}
		this._activeInstantiations.add(id);
		try {
			return this._createAndCacheServiceInstance(id, desc, _trace);
		} finally {
			this._activeInstantiations.delete(id);
		}
	}

	private _createAndCacheServiceInstance<T>(id: ServiceIdentifier<T>, desc: SyncDescriptor<T>, _trace: Trace): T {

		type Triple = { id: ServiceIdentifier<any>; desc: SyncDescriptor<any>; _trace: Trace };
		const graph = new Graph<Triple>(data => data.id.toString());

		let cycleCount = 0;
		const stack = [{ id, desc, _trace }];
		while (stack.length) {
			const item = stack.pop()!;
			graph.lookupOrInsertNode(item);

			// a weak but working heuristic for cycle checks
			if (cycleCount++ > 1000) {
				throw new CyclicDependencyError(graph);
			}

			// check all dependencies for existence and if they need to be created first
			for (const dependency of _util.getServiceDependencies(item.desc.ctor)) {

				const instanceOrDesc = this._getServiceInstanceOrDescriptor(dependency.id);
				if (!instanceOrDesc) {
					this._throwIfStrict(`[createInstance] ${id} depends on ${dependency.id} which is NOT registered.`, true);
				}

				// take note of all service dependencies
				this._globalGraph?.insertEdge(String(item.id), String(dependency.id));

				if (instanceOrDesc instanceof SyncDescriptor) {
					const d = { id: dependency.id, desc: instanceOrDesc, _trace: item._trace.branch(dependency.id, true) };
					graph.insertEdge(item, d);
					stack.push(d);
				}
			}
		}

		while (true) {
			const roots = graph.roots();

			// if there is no more roots but still
			// nodes in the graph we have a cycle
			if (roots.length === 0) {
				if (!graph.isEmpty()) {
					throw new CyclicDependencyError(graph);
				}
				break;
			}

			for (const { data } of roots) {
				// Repeat the check for this still being a service sync descriptor. That's because
				// instantiating a dependency might have side-effect and recursively trigger instantiation
				// so that some dependencies are now fullfilled already.
				const instanceOrDesc = this._getServiceInstanceOrDescriptor(data.id);
				if (instanceOrDesc instanceof SyncDescriptor) {
					// create instance and overwrite the service collections
					const instance = this._createServiceInstanceWithOwner(data.id, data.desc.ctor, data.desc.staticArguments, data.desc.supportsDelayedInstantiation, data._trace);
					this._setCreatedServiceInstance(data.id, instance);
				}
				graph.removeNode(data);
			}
		}
		return <T>this._getServiceInstanceOrDescriptor(id);
	}

	private _createServiceInstanceWithOwner<T>(id: ServiceIdentifier<T>, ctor: any, args: any[] = [], supportsDelayedInstantiation: boolean, _trace: Trace): T {
		if (this._services.get(id) instanceof SyncDescriptor) {
			return this._createServiceInstance(id, ctor, args, supportsDelayedInstantiation, _trace, this._servicesToMaybeDispose);
		} else if (this._parent) {
			return this._parent._createServiceInstanceWithOwner(id, ctor, args, supportsDelayedInstantiation, _trace);
		} else {
			throw new Error(`illegalState - creating UNKNOWN service instance ${ctor.name}`);
		}
	}

	private _createServiceInstance<T>(id: ServiceIdentifier<T>, ctor: any, args: any[] = [], supportsDelayedInstantiation: boolean, _trace: Trace, disposeBucket: Set<any>): T {
		if (!supportsDelayedInstantiation) {
			// eager instantiation
			const result = this._createInstance<T>(ctor, args, _trace);
			disposeBucket.add(result);
			return result;

		} else {
			const child = new InstantiationService(undefined, this._strict, this, this._enableTracing);
			child._globalGraphImplicitDependency = String(id);

			type EaryListenerData = {
				listener: Parameters<Event<any>>;
				disposable?: IDisposable;
			};

			// Return a proxy object that's backed by an idle value. That
			// strategy is to instantiate services in our idle time or when actually
			// needed but not when injected into a consumer

			// return "empty events" when the service isn't instantiated yet
			const earlyListeners = new Map<string, LinkedList<EaryListenerData>>();

			const idle = new GlobalIdleValue<any>(() => {
				const result = child._createInstance<T>(ctor, args, _trace);

				// early listeners that we kept are now being subscribed to
				// the real service
				for (const [key, values] of earlyListeners) {
					const candidate = <Event<any>>(<any>result)[key];
					if (typeof candidate === 'function') {
						for (const value of values) {
							value.disposable = candidate.apply(result, value.listener);
						}
					}
				}
				earlyListeners.clear();
				disposeBucket.add(result);
				return result;
			});
			return <T>new Proxy(Object.create(null), {
				get(target: any, key: PropertyKey): any {

					if (!idle.isInitialized) {
						// looks like an event
						if (typeof key === 'string' && (key.startsWith('onDid') || key.startsWith('onWill'))) {
							let list = earlyListeners.get(key);
							if (!list) {
								list = new LinkedList();
								earlyListeners.set(key, list);
							}
							const event: Event<any> = (callback, thisArg, disposables) => {
								if (idle.isInitialized) {
									return idle.value[key](callback, thisArg, disposables);
								} else {
									const entry: EaryListenerData = { listener: [callback, thisArg, disposables], disposable: undefined };
									const rm = list.push(entry);
									const result = toDisposable(() => {
										rm();
										entry.disposable?.dispose();
									});
									return result;
								}
							};
							return event;
						}
					}

					// value already exists
					if (key in target) {
						return target[key];
					}

					// create value
					const obj = idle.value;
					let prop = obj[key];
					if (typeof prop !== 'function') {
						return prop;
					}
					prop = prop.bind(obj);
					target[key] = prop;
					return prop;
				},
				set(_target: T, p: PropertyKey, value: any): boolean {
					idle.value[p] = value;
					return true;
				},
				getPrototypeOf(_target: T) {
					return ctor.prototype;
				}
			});
		}
	}

	private _throwIfStrict(msg: string, printWarning: boolean): void {
		if (printWarning) {
			console.warn(msg);
		}
		if (this._strict) {
			throw new Error(msg);
		}
	}
}

//#region -- tracing ---

const enum TraceType {
	None = 0,
	Creation = 1,
	Invocation = 2,
	Branch = 3,
}

export class Trace {

	static all = new Set<string>();

	private static readonly _None = new class extends Trace {
		constructor() { super(TraceType.None, null); }
		override stop() { }
		override branch() { return this; }
	};

	static traceInvocation(_enableTracing: boolean, ctor: any): Trace {
		return !_enableTracing ? Trace._None : new Trace(TraceType.Invocation, ctor.name || new Error().stack!.split('\n').slice(3, 4).join('\n'));
	}

	static traceCreation(_enableTracing: boolean, ctor: any): Trace {
		return !_enableTracing ? Trace._None : new Trace(TraceType.Creation, ctor.name);
	}

	private static _totals: number = 0;
	private readonly _start: number = Date.now();
	private readonly _dep: [ServiceIdentifier<any>, boolean, Trace?][] = [];

	private constructor(
		readonly type: TraceType,
		readonly name: string | null
	) { }

	branch(id: ServiceIdentifier<any>, first: boolean): Trace {
		const child = new Trace(TraceType.Branch, id.toString());
		this._dep.push([id, first, child]);
		return child;
	}

	stop() {
		const dur = Date.now() - this._start;
		Trace._totals += dur;

		let causedCreation = false;

		function printChild(n: number, trace: Trace) {
			const res: string[] = [];
			const prefix = new Array(n + 1).join('\t');
			for (const [id, first, child] of trace._dep) {
				if (first && child) {
					causedCreation = true;
					res.push(`${prefix}CREATES -> ${id}`);
					const nested = printChild(n + 1, child);
					if (nested) {
						res.push(nested);
					}
				} else {
					res.push(`${prefix}uses -> ${id}`);
				}
			}
			return res.join('\n');
		}

		const lines = [
			`${this.type === TraceType.Creation ? 'CREATE' : 'CALL'} ${this.name}`,
			`${printChild(1, this)}`,
			`DONE, took ${dur.toFixed(2)}ms (grand total ${Trace._totals.toFixed(2)}ms)`
		];

		if (dur > 2 || causedCreation) {
			Trace.all.add(lines.join('\n'));
		}
	}
}

//#endregion
