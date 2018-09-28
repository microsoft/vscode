/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { illegalState } from 'vs/base/common/errors';
import { create } from 'vs/base/common/types';
import { Graph } from 'vs/platform/instantiation/common/graph';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ServiceIdentifier, IInstantiationService, ServicesAccessor, _util, optional } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';


class Trace {

	static _enabled = false;

	static None = new class extends Trace {
		constructor() { super(null); }
		stop() { }
		dep() { return this; }
	};

	static start(thing: any): Trace {
		return Trace._enabled ? new Trace(thing) : Trace.None;
	}

	static totals: number = 0;

	private readonly _start: number = performance.now();
	private readonly _dep: [ServiceIdentifier<any>, boolean, Trace?][] = [];

	private constructor(readonly thing: any) { }

	dep(id: ServiceIdentifier<any>, first: boolean): Trace {
		let child = new Trace(id);
		this._dep.push([id, first, child]);
		return child;
	}

	stop() {
		let dur = performance.now() - this._start;
		let msg = `${this.thing.name}`;
		let firstOnce = false;

		function firstOnly(n: number, trace: Trace) {
			let res: string[] = [];
			for (const [id, first, child] of trace._dep) {
				if (first) {
					res.push(`${n}+,${id} (${firstOnly(n + 1, child)})`);
				}
			}
			return res.join(', ');
		}

		for (const [id, first, child] of this._dep) {
			if (first) {
				firstOnce = true;
				msg += `\n\tcreates -> ${id}`;
				msg += ` (${firstOnly(1, child)})`;
			} else {
				msg += `\n\tuses -> ${id}`;
			}
		}
		msg += `\nDone, took ${dur}ms (total ${Trace.totals}ms)`;
		if (dur > 2 || firstOnce) {
			console.log(msg);
		}

		Trace.totals += dur;
	}
}

export class InstantiationService implements IInstantiationService {

	_serviceBrand: any;

	private readonly _services: ServiceCollection;
	private readonly _strict: boolean;
	private readonly _parent: InstantiationService;

	constructor(services: ServiceCollection = new ServiceCollection(), strict: boolean = false, parent?: InstantiationService) {
		this._services = services;
		this._strict = strict;
		this._parent = parent;

		this._services.set(IInstantiationService, this);
	}

	createChild(services: ServiceCollection): IInstantiationService {
		return new InstantiationService(services, this._strict, this);
	}

	invokeFunction<R, TS extends any[]=[]>(fn: (accessor: ServicesAccessor, ...args: TS) => R, ...args: TS): R {
		let accessor: ServicesAccessor;
		try {
			accessor = {
				get: <T>(id: ServiceIdentifier<T>, isOptional?: typeof optional) => {
					const result = this._getOrCreateServiceInstance(id, Trace.None);
					if (!result && isOptional !== optional) {
						throw new Error(`[invokeFunction] unknown service '${id}'`);
					}
					return result;
				}
			};
			return fn.apply(undefined, [accessor].concat(args));
		} finally {
			accessor.get = function () {
				throw illegalState('service accessor is only valid during the invocation of its target method');
			};
		}
	}

	createInstance(ctorOrDescriptor: any | SyncDescriptor<any>, ...rest: any[]): any {
		if (ctorOrDescriptor instanceof SyncDescriptor) {
			return this._createInstance(ctorOrDescriptor.ctor, ctorOrDescriptor.staticArguments.concat(rest));
		} else {
			return this._createInstance(ctorOrDescriptor, rest);
		}
	}

	private _createInstance<T>(ctor: any, args: any[] = []): T {

		let _trace = Trace.start(ctor);

		// arguments defined by service decorators
		let serviceDependencies = _util.getServiceDependencies(ctor).sort((a, b) => a.index - b.index);
		let serviceArgs: any[] = [];
		for (const dependency of serviceDependencies) {
			let service = this._getOrCreateServiceInstance(dependency.id, _trace);
			if (!service && this._strict && !dependency.optional) {
				throw new Error(`[createInstance] ${ctor.name} depends on UNKNOWN service ${dependency.id}.`);
			}
			serviceArgs.push(service);
		}

		let firstServiceArgPos = serviceDependencies.length > 0 ? serviceDependencies[0].index : args.length;

		// check for argument mismatches, adjust static args if needed
		if (args.length !== firstServiceArgPos) {
			console.warn(`[createInstance] First service dependency of ${ctor.name} at position ${
				firstServiceArgPos + 1} conflicts with ${args.length} static arguments`);

			let delta = firstServiceArgPos - args.length;
			if (delta > 0) {
				args = args.concat(new Array(delta));
			} else {
				args = args.slice(0, firstServiceArgPos);
			}
		}

		// // check for missing args
		// for (let i = 0; i < serviceArgs.length; i++) {
		// 	if (!serviceArgs[i]) {
		// 		console.warn(`${ctor.name} MISSES service dependency ${serviceDependencies[i].id}`, new Error().stack);
		// 	}
		// }

		_trace.stop();

		// now create the instance
		return <T>create.apply(null, [ctor].concat(args, serviceArgs));
	}

	private _setServiceInstance<T>(id: ServiceIdentifier<T>, instance: T): void {
		if (this._services.get(id) instanceof SyncDescriptor) {
			this._services.set(id, instance);
		} else if (this._parent) {
			this._parent._setServiceInstance(id, instance);
		} else {
			throw new Error('illegalState - setting UNKNOWN service instance');
		}
	}

	private _getServiceInstanceOrDescriptor<T>(id: ServiceIdentifier<T>): T | SyncDescriptor<T> {
		let instanceOrDesc = this._services.get(id);
		if (!instanceOrDesc && this._parent) {
			return this._parent._getServiceInstanceOrDescriptor(id);
		} else {
			return instanceOrDesc;
		}
	}

	private _getOrCreateServiceInstance<T>(id: ServiceIdentifier<T>, _trace: Trace): T {
		let thing = this._getServiceInstanceOrDescriptor(id);
		if (thing instanceof SyncDescriptor) {
			return this._createAndCacheServiceInstance(id, thing, _trace.dep(id, true));
		} else {
			_trace.dep(id, false);
			return thing;
		}
	}

	private _createAndCacheServiceInstance<T>(id: ServiceIdentifier<T>, desc: SyncDescriptor<T>, _trace: Trace): T {
		type Triple = { id: ServiceIdentifier<any>, desc: SyncDescriptor<any>, _trace: Trace };
		const graph = new Graph<Triple>(data => data.id.toString());

		function throwCycleError() {
			const err = new Error('[createInstance] cyclic dependency between services');
			err.message = graph.toString();
			throw err;
		}

		let count = 0;
		const stack = [{ id, desc, _trace }];
		while (stack.length) {
			const item = stack.pop();
			graph.lookupOrInsertNode(item);

			// TODO@joh use the graph to find a cycle
			// a weak heuristic for cycle checks
			if (count++ > 100) {
				throwCycleError();
			}

			// check all dependencies for existence and if they need to be created first
			let dependencies = _util.getServiceDependencies(item.desc.ctor);
			for (let dependency of dependencies) {

				let instanceOrDesc = this._getServiceInstanceOrDescriptor(dependency.id);
				if (!instanceOrDesc && !dependency.optional) {
					console.warn(`[createInstance] ${id} depends on ${dependency.id} which is NOT registered.`);
				}

				if (instanceOrDesc instanceof SyncDescriptor) {
					const d = { id: dependency.id, desc: instanceOrDesc, _trace: item._trace.dep(dependency.id, true) };
					graph.insertEdge(item, d);
					stack.push(d);

				} else {
					item._trace.dep(dependency.id, false);
				}
			}
		}

		while (true) {
			let roots = graph.roots();

			// if there is no more roots but still
			// nodes in the graph we have a cycle
			if (roots.length === 0) {
				if (!graph.isEmpty()) {
					throwCycleError();
				}
				break;
			}

			for (let root of roots) {
				// create instance and overwrite the service collections
				const instance = this._createInstance(root.data.desc.ctor, root.data.desc.staticArguments);
				this._setServiceInstance(root.data.id, instance);
				graph.removeNode(root.data);
			}
		}

		return <T>this._getServiceInstanceOrDescriptor(id);
	}
}
