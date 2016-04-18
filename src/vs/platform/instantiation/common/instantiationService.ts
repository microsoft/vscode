/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {illegalArgument, illegalState, canceled} from 'vs/base/common/errors';
import {create} from 'vs/base/common/types';
import * as assert from 'vs/base/common/assert';
import {forEach} from 'vs/base/common/collections';
import {Graph} from 'vs/base/common/graph';
import {SyncDescriptor, AsyncDescriptor} from 'vs/platform/instantiation/common/descriptors';
import {ServiceIdentifier, IInstantiationService, ServicesAccessor, _util, createDecorator} from 'vs/platform/instantiation/common/instantiation';
import {ServiceCollection} from 'vs/platform/instantiation/common/serviceCollection';

/**
 * Creates a new instance of an instantiation service.
 */
export function createInstantiationService(param: ServiceCollection | { [legacyId: string]: any } = new ServiceCollection()): IInstantiationService {

	if (param instanceof ServiceCollection) {
		return new InstantiationService(param);
	}

	// legacy
	let services = new ServiceCollection();
	forEach(param, entry => {
		services.set(createDecorator(entry.key), entry.value);
	});
	return new InstantiationService(services);
}

export class InstantiationService implements IInstantiationService {

	serviceId: any;

	private _services: ServiceCollection;

	constructor(services: ServiceCollection) {
		this._services = services;

		this._services.set(IInstantiationService, this);
	}

	createChild(services: ServiceCollection): IInstantiationService {
		this._services.forEach((id, thing) => {
			if (!services.has(id)) {
				services.set(id, thing);
			}
		});
		return new InstantiationService(services);
	}

	addSingleton<T>(id: ServiceIdentifier<T>, instanceOrDescriptor: T | SyncDescriptor<T>): void {
		if (this._services.has(id)) {
			throw new Error('duplicate service');
		}
		this._services.set(id, instanceOrDescriptor);
	}

	getInstance<T>(id: ServiceIdentifier<T>): T {
		let thing = this._services.get(id);
		if (thing instanceof SyncDescriptor) {
			return this._createAndCacheServiceInstance(id, thing);
		} else {
			return thing;
		}
	}

	invokeFunction<R>(signature: (accessor: ServicesAccessor, ...more: any[]) => R, ...args: any[]): R {
		let accessor: ServicesAccessor;
		try {
			accessor = {
				get: <T>(id: ServiceIdentifier<T>) => {
					return this.getInstance(id);
				}
			};
			return signature.apply(undefined, [accessor].concat(args));
		} finally {
			accessor.get = function () {
				throw illegalState('service accessor is only valid during the invocation of its target method');
			};
		}
	}

	createInstance<T>(param: any, ...rest:any[]): any {

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

		let allArguments: any[] = [];
		let serviceInjections = _util.getServiceDependencies(desc.ctor);
		let fixedArguments = desc.staticArguments().concat(args);
		let expectedFirstServiceIndex = fixedArguments.length;
		let actualFirstServiceIndex = Number.MAX_VALUE;
		serviceInjections.forEach(serviceInjection => {
			// @IServiceName
			let {id, index} = serviceInjection;
			// let service = this._lock.runUnlocked(() => this[serviceId]);
			allArguments[index] = this.getInstance(id);
			actualFirstServiceIndex = Math.min(actualFirstServiceIndex, index);
		});

		// insert the fixed arguments into the array of all ctor
		// arguments. don't overwrite existing values tho it indicates
		// something is off
		let i = 0;
		for (let arg of fixedArguments) {
			let hasValue = allArguments[i] !== void 0;
			if (!hasValue) {
				allArguments[i] = arg;
			}
			i += 1;
		}

		allArguments.unshift(desc.ctor); // ctor is first arg

		// services are the last arguments of ctor-calls. We check if static ctor arguments
		// (like those from a [sync|async] desriptor) or args that are passed by createInstance
		// don't override positions of those arguments
		if (actualFirstServiceIndex !== Number.MAX_VALUE
			&& actualFirstServiceIndex !== expectedFirstServiceIndex) {

			let msg = `[createInstance] constructor '${desc.ctor.name}' has first` +
				` service dependency at position ${actualFirstServiceIndex + 1} but is called with` +
				` ${expectedFirstServiceIndex - 1} static arguments that are expected to come first`;

			// throw new Error(msg);
			console.warn(msg);
		}

		// return this._lock.runUnlocked(() => {
			const instance = create.apply(null, allArguments);
			desc._validate(instance);
			return <T>instance;
		// });
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
				this._services.set(id, instance);
				graph.removeNode(root.data);
			}
		}

		return <T> this._services.get(id);
	}
}
