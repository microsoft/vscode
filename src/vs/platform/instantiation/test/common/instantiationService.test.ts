/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';


import assert = require('assert');
import instantiation = require('vs/platform/instantiation/common/instantiation');
import instantiationService = require('vs/platform/instantiation/common/instantiationService');

import {SyncDescriptor} from 'vs/platform/instantiation/common/descriptors';

let IService1 = instantiation.createDecorator<IService1>('service1');

interface IService1 {
	serviceId: instantiation.ServiceIdentifier<any>;
	c: number;
}

class Service1 implements IService1 {
	serviceId = IService1;
	c = 1;
}

let IService2 = instantiation.createDecorator<IService2>('service2');

interface IService2 {
	serviceId: instantiation.ServiceIdentifier<any>;
	d: boolean;
}

class Service2 implements IService2 {
	serviceId = IService2;
	d = true;
}

let IService3 = instantiation.createDecorator<IService3>('service3');

interface IService3 {
	serviceId: instantiation.ServiceIdentifier<any>;
	s: string;
}

class Service3 implements IService3 {
	serviceId = IService3;
	s = 'farboo';
}

let IDependentService = instantiation.createDecorator<IDependentService>('dependentService');

interface IDependentService {
	serviceId: instantiation.ServiceIdentifier<any>;
	name: string;
}

class DependentService implements IDependentService {
	serviceId = IDependentService;
	constructor( @IService1 service: IService1) {
		assert.equal(service.c, 1);
	}

	name = 'farboo';
}

class ParameterTarget {

	constructor( @IService1 service1: IService1) {
		assert.ok(service1);
		assert.equal(service1.c, 1);
	}
}

class ParameterTarget2 {
	constructor(v: boolean, @IService1 service1: IService1) {
		assert.ok(v);
		assert.ok(service1);
		assert.equal(service1.c, 1);
	}
}

class TargetOptional {
	constructor( @IService1 service1: IService1, @IService2 service2?: IService2) {
		assert.ok(service1);
		assert.equal(service1.c, 1);
		assert.ok(service2 === void 0);
	}
}

class DependentServiceTarget {
	constructor( @IDependentService d) {
		assert.ok(d);
		assert.equal(d.name, 'farboo');
	}
}

class DependentServiceTarget2 {
	constructor( @IDependentService d: IDependentService, @IService1 s: IService1) {
		assert.ok(d);
		assert.equal(d.name, 'farboo');
		assert.ok(s);
		assert.equal(s.c, 1);
	}
}


class ServiceLoop1 implements IService1 {
	serviceId = IService1;
	c = 1;

	constructor( @IService2 s: IService2) {

	}
}

class ServiceLoop2 implements IService2 {
	serviceId = IService2;
	d = true;

	constructor( @IService1 s: IService1) {

	}
}

suite('Instantiation Service', () => {
	test('@Param - simple clase', function() {
		let service = instantiationService.createInstantiationService(Object.create(null));
		service.addSingleton(IService1, new Service1());
		service.addSingleton(IService2, new Service2());
		service.addSingleton(IService3, new Service3());

		service.createInstance(ParameterTarget);
	});

	test('@Param - fixed args', function() {
		let service = instantiationService.createInstantiationService(Object.create(null));
		service.addSingleton(IService1, new Service1());
		service.addSingleton(IService2, new Service2());
		service.addSingleton(IService3, new Service3());

		service.createInstance(ParameterTarget2, true);
	});

	test('@Param - optional', function() {
		let service = instantiationService.createInstantiationService(Object.create(null));
		service.addSingleton(IService1, new Service1());
		// service.addSingleton(IService2, new Service2());

		service.createInstance(TargetOptional);
	});

	// we made this a warning
	// test('@Param - too many args', function () {
	// 	let service = instantiationService.create(Object.create(null));
	// 	service.addSingleton(IService1, new Service1());
	// 	service.addSingleton(IService2, new Service2());
	// 	service.addSingleton(IService3, new Service3());

	// 	assert.throws(() => service.createInstance(ParameterTarget2, true, 2));
	// });

	// test('@Param - too few args', function () {
	// 	let service = instantiationService.create(Object.create(null));
	// 	service.addSingleton(IService1, new Service1());
	// 	service.addSingleton(IService2, new Service2());
	// 	service.addSingleton(IService3, new Service3());

	// 	assert.throws(() => service.createInstance(ParameterTarget2));
	// });

	test('SyncDesc - no dependencies', function() {
		let service = instantiationService.createInstantiationService(Object.create(null));
		service.addSingleton(IService1, new SyncDescriptor<IService1>(Service1));

		let service1 = service.getInstance(IService1);
		assert.ok(service1);
		assert.equal(service1.c, 1);

		let service2 = service.getInstance(IService1);
		assert.ok(service1 === service2);
	});

	test('SyncDesc - service with service dependency', function() {
		let service = instantiationService.createInstantiationService(Object.create(null));
		service.addSingleton(IService1, new SyncDescriptor<IService1>(Service1));
		service.addSingleton(IDependentService, new SyncDescriptor<IDependentService>(DependentService));

		let d = service.getInstance(IDependentService);
		assert.ok(d);
		assert.equal(d.name, 'farboo');
	});

	test('SyncDesc - target depends on service future', function() {
		let service = instantiationService.createInstantiationService(Object.create(null));
		service.addSingleton(IService1, new SyncDescriptor<IService1>(Service1));
		service.addSingleton(IDependentService, new SyncDescriptor<IDependentService>(DependentService));

		let d = service.createInstance(DependentServiceTarget);
		assert.ok(d instanceof DependentServiceTarget);

		let d2 = service.createInstance(DependentServiceTarget2);
		assert.ok(d2 instanceof DependentServiceTarget2);
	});

	test('SyncDesc - explode on loop', function() {
		let service = instantiationService.createInstantiationService(Object.create(null));
		service.addSingleton(IService1, new SyncDescriptor<IService1>(ServiceLoop1));
		service.addSingleton(IService2, new SyncDescriptor<IService2>(ServiceLoop2));

		assert.throws(() => service.getInstance(IService1));
		assert.throws(() => service.getInstance(IService2));
	});

	test('Invoke - get services', function() {
		let service = instantiationService.createInstantiationService(Object.create(null));
		service.addSingleton(IService1, new Service1());
		service.addSingleton(IService2, new Service2());

		function test(accessor: instantiation.ServicesAccessor) {
			assert.ok(accessor.get(IService1) instanceof Service1);
			assert.equal(accessor.get(IService1).c, 1);

			return true;
		}

		assert.equal(service.invokeFunction(test), true);
	});

	test('Invoke - keeping accessor NOT allowed', function() {
		let service = instantiationService.createInstantiationService(Object.create(null));
		service.addSingleton(IService1, new Service1());
		service.addSingleton(IService2, new Service2());

		let cached: instantiation.ServicesAccessor;

		function test(accessor: instantiation.ServicesAccessor) {
			assert.ok(accessor.get(IService1) instanceof Service1);
			assert.equal(accessor.get(IService1).c, 1);
			cached = accessor;
			return true;
		}

		assert.equal(service.invokeFunction(test), true);

		assert.throws(() => cached.get(IService2));
	});

	test('Invoke - throw error', function() {
		let service = instantiationService.createInstantiationService(Object.create(null));
		service.addSingleton(IService1, new Service1());
		service.addSingleton(IService2, new Service2());

		function test(accessor: instantiation.ServicesAccessor) {
			throw new Error();
		}

		assert.throws(() => service.invokeFunction(test));
	});
});
