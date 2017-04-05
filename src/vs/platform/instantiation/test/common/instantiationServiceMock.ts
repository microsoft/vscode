/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as sinon from 'sinon';
import { TPromise } from 'vs/base/common/winjs.base';
import * as types from 'vs/base/common/types';
import { LinkedMap } from 'vs/base/common/map';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';

interface IServiceMock<T> {
	id: ServiceIdentifier<T>;
	service: any;
}

export class TestInstantiationService extends InstantiationService {

	private _servciesMap: LinkedMap<ServiceIdentifier<any>, any>;

	constructor(private _serviceCollection: ServiceCollection = new ServiceCollection()) {
		super(_serviceCollection);

		this._servciesMap = new LinkedMap<ServiceIdentifier<any>, any>();
	}

	public get<T>(service: ServiceIdentifier<T>): T {
		return <T>this._serviceCollection.get(service);
	}

	public set<T>(service: ServiceIdentifier<T>, instance: T): T {
		return <T>this._serviceCollection.set(service, instance);
	}

	public mock<T>(service: ServiceIdentifier<T>): T | sinon.SinonMock {
		return <T>this._create(service, { mock: true });
	}

	public stub<T>(service?: ServiceIdentifier<T>, ctor?: any): T
	public stub<T>(service?: ServiceIdentifier<T>, obj?: any): T
	public stub<T>(service?: ServiceIdentifier<T>, ctor?: any, property?: string, value?: any): sinon.SinonStub
	public stub<T>(service?: ServiceIdentifier<T>, obj?: any, property?: string, value?: any): sinon.SinonStub
	public stub<T>(service?: ServiceIdentifier<T>, property?: string, value?: any): sinon.SinonStub
	public stub<T>(serviceIdentifier?: ServiceIdentifier<T>, arg2?: any, arg3?: string, arg4?: any): sinon.SinonStub {
		let service = typeof arg2 !== 'string' ? arg2 : void 0;
		let serviceMock: IServiceMock<any> = { id: serviceIdentifier, service: service };
		let property = typeof arg2 === 'string' ? arg2 : arg3;
		let value = typeof arg2 === 'string' ? arg3 : arg4;

		let stubObject = <any>this._create(serviceMock, { stub: true });
		if (property) {
			if (stubObject[property]) {
				if (stubObject[property].hasOwnProperty('restore')) {
					stubObject[property].restore();
				}
				if (typeof value === 'function') {
					stubObject[property] = value;
				} else {
					let stub = value ? sinon.stub().returns(value) : sinon.stub();
					stubObject[property] = stub;
					return stub;
				}
			} else {
				stubObject[property] = value;
			}
		}
		return stubObject;
	}

	public stubPromise<T>(service?: ServiceIdentifier<T>, fnProperty?: string, value?: any): T | sinon.SinonStub
	public stubPromise<T>(service?: ServiceIdentifier<T>, ctor?: any, fnProperty?: string, value?: any): sinon.SinonStub
	public stubPromise<T>(service?: ServiceIdentifier<T>, obj?: any, fnProperty?: string, value?: any): sinon.SinonStub
	public stubPromise<T>(arg1?: any, arg2?: any, arg3?: any, arg4?: any): sinon.SinonStub {
		arg3 = typeof arg2 === 'string' ? TPromise.as(arg3) : arg3;
		arg4 = typeof arg2 !== 'string' && typeof arg3 === 'string' ? TPromise.as(arg4) : arg4;
		return this.stub(arg1, arg2, arg3, arg4);
	}

	public spy<T>(service: ServiceIdentifier<T>, fnProperty: string): sinon.SinonSpy {
		let spy = sinon.spy();
		this.stub(service, fnProperty, spy);
		return spy;
	}

	private _create<T>(serviceMock: IServiceMock<T>, options: SinonOptions): any
	private _create<T>(ctor: any, options: SinonOptions): any
	private _create<T>(arg1: any, options: SinonOptions): any {
		if (this.isServiceMock(arg1)) {
			let service = this._getOrCreateService(arg1, options);
			this._serviceCollection.set(arg1.id, service);
			return service;
		}
		return options.mock ? sinon.mock(arg1) : this._createStub(arg1);
	}

	private _getOrCreateService<T>(serviceMock: IServiceMock<T>, opts: SinonOptions): any {
		let service: any = this._serviceCollection.get(serviceMock.id);
		if (service) {
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
		let service = opts.mock ? sinon.mock(serviceMock.service) : this._createStub(serviceMock.service);
		service['sinonOptions'] = opts;
		return service;
	}

	private _createStub(arg: any): any {
		return typeof arg === 'object' ? arg : sinon.createStubInstance(arg);
	}

	private isServiceMock(arg1: any): boolean {
		return typeof arg1 === 'object' && arg1.hasOwnProperty('id');
	}
}

export function stubFunction<T>(ctor: any, fnProperty: string, value: any): T | sinon.SinonStub {
	let stub = sinon.createStubInstance(ctor);
	stub[fnProperty].restore();
	sinon.stub(stub, fnProperty, types.isFunction(value) ? value : () => { return value; });
	return stub;
}

interface SinonOptions {
	mock?: boolean;
	stub?: boolean;
}