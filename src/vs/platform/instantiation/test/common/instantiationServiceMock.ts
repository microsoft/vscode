/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as sinon from 'sinon';
import { DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { SyncDescriptor, SyncDescriptor0 } from '../../common/descriptors.js';
import { GetLeadingNonServiceArgs, ServiceIdentifier, ServicesAccessor } from '../../common/instantiation.js';
import { InstantiationService, Trace } from '../../common/instantiationService.js';
import { ServiceCollection } from '../../common/serviceCollection.js';

interface IServiceMock<T> {
	id: ServiceIdentifier<T>;
	service: any;
}

const isSinonSpyLike = (fn: Function): fn is sinon.SinonSpy => fn && 'callCount' in fn;

export class TestInstantiationService extends InstantiationService implements IDisposable, ServicesAccessor {

	private _servciesMap: Map<ServiceIdentifier<any>, any>;
	private readonly _classStubs: Map<Function, any> = new Map();

	constructor(private _serviceCollection: ServiceCollection = new ServiceCollection(), strict: boolean = false, parent?: TestInstantiationService, private _properDispose?: boolean) {
		super(_serviceCollection, strict, parent);

		this._servciesMap = new Map<ServiceIdentifier<any>, any>();
	}

	public get<T>(service: ServiceIdentifier<T>): T {
		return super._getOrCreateServiceInstance(service, Trace.traceCreation(false, TestInstantiationService));
	}

	public getIfExists<T>(service: ServiceIdentifier<T>): T | undefined {
		try {
			return super._getOrCreateServiceInstance(service, Trace.traceCreation(false, TestInstantiationService));
		} catch (e) {
			return undefined;
		}
	}

	public set<T>(service: ServiceIdentifier<T>, instance: T): T {
		return <T>this._serviceCollection.set(service, instance);
	}

	public mock<T>(service: ServiceIdentifier<T>): T | sinon.SinonMock {
		return <T>this._create(service, { mock: true });
	}

	public stubInstance<T>(ctor: new (...args: any[]) => T, instance: Partial<T>): void {
		this._classStubs.set(ctor, instance);
	}

	public override createInstance<T>(descriptor: SyncDescriptor0<T>): T;
	public override createInstance<Ctor extends new (...args: any[]) => unknown, R extends InstanceType<Ctor>>(ctor: Ctor, ...args: GetLeadingNonServiceArgs<ConstructorParameters<Ctor>>): R;
	public override createInstance(ctorOrDescriptor: any | SyncDescriptor<any>, ...rest: unknown[]): unknown {
		if (this._classStubs.has(ctorOrDescriptor)) {
			return this._classStubs.get(ctorOrDescriptor);
		}
		return super.createInstance(ctorOrDescriptor, ...rest);
	}

	public stub<T>(service: ServiceIdentifier<T>, ctor: Function): T;
	public stub<T>(service: ServiceIdentifier<T>, obj: Partial<T>): T;
	public stub<T, V>(service: ServiceIdentifier<T>, ctor: Function, property: string, value: V): V extends Function ? sinon.SinonSpy : sinon.SinonStub;
	public stub<T, V>(service: ServiceIdentifier<T>, obj: Partial<T>, property: string, value: V): V extends Function ? sinon.SinonSpy : sinon.SinonStub;
	public stub<T, V>(service: ServiceIdentifier<T>, property: string, value: V): V extends Function ? sinon.SinonSpy : sinon.SinonStub;
	public stub<T>(serviceIdentifier: ServiceIdentifier<T>, arg2: any, arg3?: string, arg4?: any): sinon.SinonStub | sinon.SinonSpy {
		const service = typeof arg2 !== 'string' ? arg2 : undefined;
		const serviceMock: IServiceMock<any> = { id: serviceIdentifier, service: service };
		const property = typeof arg2 === 'string' ? arg2 : arg3;
		const value = typeof arg2 === 'string' ? arg3 : arg4;

		const stubObject = this._create(serviceMock, { stub: true }, service && !property);
		if (property) {
			if (stubObject[property]) {
				if (stubObject[property].hasOwnProperty('restore')) {
					stubObject[property].restore();
				}
				if (typeof value === 'function') {
					const spy = isSinonSpyLike(value) ? value : sinon.spy(value);
					stubObject[property] = spy;
					return spy;
				} else {
					const stub = value ? sinon.stub().returns(value) : sinon.stub();
					stubObject[property] = stub;
					return stub;
				}
			} else {
				stubObject[property] = value;
			}
		}
		return stubObject;
	}

	public stubPromise<T>(service?: ServiceIdentifier<T>, fnProperty?: string, value?: any): T | sinon.SinonStub;
	public stubPromise<T, V>(service?: ServiceIdentifier<T>, ctor?: any, fnProperty?: string, value?: V): V extends Function ? sinon.SinonSpy : sinon.SinonStub;
	public stubPromise<T, V>(service?: ServiceIdentifier<T>, obj?: any, fnProperty?: string, value?: V): V extends Function ? sinon.SinonSpy : sinon.SinonStub;
	public stubPromise(arg1?: any, arg2?: any, arg3?: any, arg4?: any): sinon.SinonStub | sinon.SinonSpy {
		arg3 = typeof arg2 === 'string' ? Promise.resolve(arg3) : arg3;
		arg4 = typeof arg2 !== 'string' && typeof arg3 === 'string' ? Promise.resolve(arg4) : arg4;
		return this.stub(arg1, arg2, arg3, arg4);
	}

	public spy<T>(service: ServiceIdentifier<T>, fnProperty: string): sinon.SinonSpy {
		const spy = sinon.spy();
		this.stub(service, fnProperty, spy);
		return spy;
	}

	private _create<T>(serviceMock: IServiceMock<T>, options: SinonOptions, reset?: boolean): any;
	private _create<T>(ctor: any, options: SinonOptions): any;
	private _create(arg1: any, options: SinonOptions, reset: boolean = false): any {
		if (this.isServiceMock(arg1)) {
			const service = this._getOrCreateService(arg1, options, reset);
			this._serviceCollection.set(arg1.id, service);
			return service;
		}
		return options.mock ? sinon.mock(arg1) : this._createStub(arg1);
	}

	private _getOrCreateService<T>(serviceMock: IServiceMock<T>, opts: SinonOptions, reset?: boolean): any {
		const service: any = this._serviceCollection.get(serviceMock.id);
		if (!reset && service) {
			if (opts.mock && service['sinonOptions'] && !!service['sinonOptions'].mock) {
				return service;
			}
			if (opts.stub && service['sinonOptions'] && !!service['sinonOptions'].stub) {
				return service;
			}
		}
		return this._createService(serviceMock, opts);
	}

	private _createService(serviceMock: IServiceMock<any>, opts: SinonOptions): any {
		serviceMock.service = serviceMock.service ? serviceMock.service : this._servciesMap.get(serviceMock.id);
		const service = opts.mock ? sinon.mock(serviceMock.service) : this._createStub(serviceMock.service);
		service['sinonOptions'] = opts;
		return service;
	}

	private _createStub(arg: any): any {
		return typeof arg === 'object' ? arg : sinon.createStubInstance(arg);
	}

	private isServiceMock(arg1: any): boolean {
		return typeof arg1 === 'object' && arg1.hasOwnProperty('id');
	}

	override createChild(services: ServiceCollection): TestInstantiationService {
		return new TestInstantiationService(services, false, this);
	}

	override dispose() {
		sinon.restore();
		if (this._properDispose) {
			super.dispose();
		}
	}
}

interface SinonOptions {
	mock?: boolean;
	stub?: boolean;
}

export type ServiceIdCtorPair<T> = [id: ServiceIdentifier<T>, ctorOrInstance: T | (new (...args: any[]) => T)];

export function createServices(disposables: DisposableStore, services: ServiceIdCtorPair<any>[]): TestInstantiationService {
	const serviceIdentifiers: ServiceIdentifier<any>[] = [];
	const serviceCollection = new ServiceCollection();

	const define = <T>(id: ServiceIdentifier<T>, ctorOrInstance: T | (new (...args: any[]) => T)) => {
		if (!serviceCollection.has(id)) {
			if (typeof ctorOrInstance === 'function') {
				serviceCollection.set(id, new SyncDescriptor(ctorOrInstance as new (...args: any[]) => T));
			} else {
				serviceCollection.set(id, ctorOrInstance);
			}
		}
		serviceIdentifiers.push(id);
	};

	for (const [id, ctor] of services) {
		define(id, ctor);
	}

	const instantiationService = disposables.add(new TestInstantiationService(serviceCollection, true));
	disposables.add(toDisposable(() => {
		for (const id of serviceIdentifiers) {
			const instanceOrDescriptor = serviceCollection.get(id);
			if (typeof instanceOrDescriptor.dispose === 'function') {
				instanceOrDescriptor.dispose();
			}
		}
	}));
	return instantiationService;
}
