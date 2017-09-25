/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { illegalArgument, illegalState, canceled } from 'vs/base/common/errors';
import { create } from 'vs/base/common/types';
import * as assert from 'vs/base/common/assert';
import { Graph } from 'vs/base/common/graph';
import { SyncDescriptor, AsyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ServiceIdentifier, IInstantiationService, ServicesAccessor, _util, optional } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';


export class InstantiationService implements IInstantiationService {

	_serviceBrand: any;

	private _services: ServiceCollection;
	private _strict: boolean;

	constructor(services: ServiceCollection = new ServiceCollection(), strict: boolean = false) {
		this._services = services;
		this._strict = strict;

		this._services.set(IInstantiationService, this);
	}

	createChild(services: ServiceCollection): IInstantiationService {
		this._services.forEach((id, thing) => {
			if (services.has(id)) {
				return;
			}
			// If we copy descriptors we might end up with
			// multiple instances of the same service
			if (thing instanceof SyncDescriptor) {
				thing = this._createAndCacheServiceInstance(id, thing);
			}
			services.set(id, thing);
		});
		return new InstantiationService(services, this._strict);
	}

	invokeFunction<R>(signature: (accessor: ServicesAccessor, ...more: any[]) => R, ...args: any[]): R {
		let accessor: ServicesAccessor;
		try {
			accessor = {
				get: <T>(id: ServiceIdentifier<T>, isOptional?: typeof optional) => {
					const result = this._getOrCreateServiceInstance(id);
					if (!result && isOptional !== optional) {
						throw new Error(`[invokeFunction] unkown service '${id}'`);
					}
					return result;
				}
			};
			return signature.apply(undefined, [accessor].concat(args));
		} finally {
			accessor.get = function () {
				throw illegalState('service accessor is only valid during the invocation of its target method');
			};
		}
	}

	createInstance<T>(param: any, ...rest: any[]): any {

		if (param instanceof AsyncDescriptor) {
			// async
			return this._createInstanceAsync(param, rest);

		} else if (param instanceof SyncDescriptor) {
			// sync
			return this._createInstance(param, rest);

		} else {
			// sync, just ctor
			return this._createInstance(new SyncDescriptor(param), rest);
		}
	}

	private _createInstanceAsync<T>(descriptor: AsyncDescriptor<T>, args: any[]): TPromise<T> {

		let canceledError: Error;

		return new TPromise((c, e, p) => {
			require([descriptor.moduleName], (_module?: any) => {
				if (canceledError) {
					e(canceledError);
				}

				if (!_module) {
					return e(illegalArgument('module not found: ' + descriptor.moduleName));
				}

				let ctor: Function;
				if (!descriptor.ctorName) {
					ctor = _module;
				} else {
					ctor = _module[descriptor.ctorName];
				}

				if (typeof ctor !== 'function') {
					return e(illegalArgument('not a function: ' + descriptor.ctorName || descriptor.moduleName));
				}

				try {
					args.unshift.apply(args, descriptor.staticArguments()); // instead of spread in ctor call
					c(this._createInstance(new SyncDescriptor<T>(ctor), args));
				} catch (error) {
					return e(error);
				}
			}, e);
		}, () => {
			canceledError = canceled();
		});
	}

	private _createInstance<T>(desc: SyncDescriptor<T>, args: any[]): T {

		// arguments given by createInstance-call and/or the descriptor
		let staticArgs = desc.staticArguments().concat(args);

		// arguments defined by service decorators
		let serviceDependencies = _util.getServiceDependencies(desc.ctor).sort((a, b) => a.index - b.index);
		let serviceArgs: any[] = [];
		for (const dependency of serviceDependencies) {
			let service = this._getOrCreateServiceInstance(dependency.id);
			if (!service && this._strict && !dependency.optional) {
				throw new Error(`[createInstance] ${desc.ctor.name} depends on UNKNOWN service ${dependency.id}.`);
			}
			serviceArgs.push(service);
		}

		let firstServiceArgPos = serviceDependencies.length > 0 ? serviceDependencies[0].index : staticArgs.length;

		// check for argument mismatches, adjust static args if needed
		if (staticArgs.length !== firstServiceArgPos) {
			console.warn(`[createInstance] First service dependency of ${desc.ctor.name} at position ${
				firstServiceArgPos + 1} conflicts with ${staticArgs.length} static arguments`);

			let delta = firstServiceArgPos - staticArgs.length;
			if (delta > 0) {
				staticArgs = staticArgs.concat(new Array(delta));
			} else {
				staticArgs = staticArgs.slice(0, firstServiceArgPos);
			}
		}

		// // check for missing args
		// for (let i = 0; i < serviceArgs.length; i++) {
		// 	if (!serviceArgs[i]) {
		// 		console.warn(`${desc.ctor.name} MISSES service dependency ${serviceDependencies[i].id}`, new Error().stack);
		// 	}
		// }

		// now create the instance
		const argArray = [desc.ctor];
		argArray.push(...staticArgs);
		argArray.push(...serviceArgs);

		const instance = create.apply(null, argArray);
		desc._validate(instance);
		return <T>instance;
	}

	private _getOrCreateServiceInstance<T>(id: ServiceIdentifier<T>): T {
		let thing = this._services.get(id);
		if (thing instanceof SyncDescriptor) {
			return this._createAndCacheServiceInstance(id, thing);
		} else {
			return thing;
		}
	}

	private _createAndCacheServiceInstance<T>(id: ServiceIdentifier<T>, desc: SyncDescriptor<T>): T {
		assert.ok(this._services.get(id) instanceof SyncDescriptor);

		const graph = new Graph<{ id: ServiceIdentifier<any>, desc: SyncDescriptor<any> }>(data => data.id.toString());

		function throwCycleError() {
			const err = new Error('[createInstance] cyclic dependency between services');
			err.message = graph.toString();
			throw err;
		}

		let count = 0;
		const stack = [{ id, desc }];
		while (stack.length) {
			const item = stack.pop();
			graph.lookupOrInsertNode(item);

			// TODO@joh use the graph to find a cycle
			// a weak heuristic for cycle checks
			if (count++ > 100) {
				throwCycleError();
			}

			// check all dependencies for existence and if the need to be created first
			let dependencies = _util.getServiceDependencies(item.desc.ctor);
			for (let dependency of dependencies) {

				let instanceOrDesc = this._services.get(dependency.id);
				if (!instanceOrDesc) {
					console.warn(`[createInstance] ${id} depends on ${dependency.id} which is NOT registered.`);
				}

				if (instanceOrDesc instanceof SyncDescriptor) {
					const d = { id: dependency.id, desc: instanceOrDesc };
					graph.insertEdge(item, d);
					stack.push(d);
				}
			}
		}

		while (true) {
			let roots = graph.roots();

			// if there is no more roots but still
			// nodes in the graph we have a cycle
			if (roots.length === 0) {
				if (graph.length !== 0) {
					throwCycleError();
				}
				break;
			}

			for (let root of roots) {
				// create instance and overwrite the service collections
				const instance = this._createInstance(root.data.desc, []);
				this._services.set(root.data.id, instance);
				graph.removeNode(root.data);
			}
		}

		return <T>this._services.get(id);
	}
}
