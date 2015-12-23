/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';


import assert = require('assert');
import instantiation = require('vs/platform/instantiation/common/instantiation');
import instantiationService = require('vs/platform/instantiation/common/instantiationService');

import {SyncDescriptor, createSyncDescriptor} from 'vs/platform/instantiation/common/descriptors'

export class Target1 {

	constructor(private platformServices) {
		assert.ok(!!platformServices.editorService);
	}

	validate():boolean {
		try {
			this.platformServices.editorService;
			return false;
		} catch(e) {
			return e instanceof Error;
		}
	}
}

export class Target2 {

	constructor(private platformServices, private far:boolean) {
		assert.ok(!!platformServices.editorService);
	}

	validate():boolean {
		if(!this.far) {
			return false;
		}
		try {
			this.platformServices.editorService;
			return false;
		} catch(e) {
			return e instanceof Error;
		}
	}
}

class Target3 {
	constructor(private platformServices) {
		assert.ok(!!platformServices.editorService);
		assert.equal(platformServices['far'], 1234);
	}
}

class Target4 {
	constructor(private platformServices) {
		assert.equal(platformServices.editorService, 1234);
	}
}

export class EvilTarget1 {

	constructor(private platformServices) {
		platformServices.editorService = null;
	}
}

var IService1 = instantiation.createDecorator<IService1>('service1')

interface IService1 {
	serviceId : instantiation.ServiceIdentifier<any>;
	c: number;
}

class Service1 implements IService1 {
	serviceId = IService1;
	c = 1;
}

var IService2 = instantiation.createDecorator<IService2>('service2');

interface IService2 {
	serviceId : instantiation.ServiceIdentifier<any>;
	d: boolean;
}

class Service2 implements IService2 {
	serviceId = IService2;
	d = true;
}

var IService3 = instantiation.createDecorator<IService3>('service3');

interface IService3 {
	serviceId : instantiation.ServiceIdentifier<any>;
	s: string;
}

class Service3 implements IService3 {
	serviceId = IService3;
	s = 'farboo';
}

var IDependentService = instantiation.createDecorator<IDependentService>('dependentService')

interface IDependentService {
	serviceId : instantiation.ServiceIdentifier<any>;
	name: string;
}

class DependentService implements IDependentService {
	serviceId = IDependentService;
	constructor( @IService1 service: IService1) {
		assert.equal(service.c, 1);
	}

	name = 'farboo';
}

@instantiation.Uses(IService1)
class UsesTarget {

	constructor(ctx: instantiation.Context) {
		var service = ctx.get(IService1);
		assert.ok(service);
		assert.equal(service.c, 1);
	}
}

@instantiation.Uses(IService2)
class UsesTarget2 extends UsesTarget {
	constructor(ctx: instantiation.Context) {
		super(ctx);

		var service = ctx.get(IService2);
		assert.ok(service);
		assert.ok(service.d);
	}
}

class UsesTarget3 extends UsesTarget2 {
	constructor(ctx: instantiation.Context, @IService3 service:IService3) {
		super(ctx);

		assert.ok(service);
		assert.equal(service.s, 'farboo');
	}
}

class ParameterTarget {

	constructor( @IService1 service1: IService1) {
		assert.ok(service1);
		assert.equal(service1.c, 1);
	}
}

class ParameterTarget2 {
	constructor(v:boolean, @IService1 service1: IService1) {
		assert.ok(v);
		assert.ok(service1);
		assert.equal(service1.c, 1);
	}
}

class TargetOptional {
	constructor( @IService1 service1: IService1, @IService2 service2?: IService2) {
		assert.ok(service1);
		assert.equal(service1.c, 1);
		assert.ok(service2 === void 0)
	}
}

class DependentServiceTarget {
	constructor( @IDependentService d) {
		assert.ok(d);
		assert.equal(d.name, 'farboo');
	}
}

class DependentServiceTarget2 {
	constructor( @IDependentService d:IDependentService, @IService1 s:IService1) {
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

	constructor(@IService1 s:IService1) {

	}
}

suite('Instantiation Service', () => {
	var service:instantiation.IInstantiationService;

	setup(() => {
		service = instantiationService.create({
			editorService: 'boo',
		});
	});

	test('sync create, platformServices only', function(){
		var instance = service.createInstance(Target1);
		assert.ok(instance.validate());
	});

	test('sync create, platformServices & argument', function(){
		var instance = service.createInstance(Target2, true);
		assert.ok(instance.validate());
	});

	test('sync create, access service defined by child instantiation service', function(){
		var instance = service.createChild({ editorService: 'wee' } ).createInstance(Target2, true);
		assert.ok(instance.validate());
	});

	test('sync create, access service defined in a child instantiation service', function(){
		var instance = service.createChild({ someOtherService: 'hey' } ).createInstance(Target2, true);
		assert.ok(instance.validate());
	});

	test('sync create, platformServices & static argument', function(){
		var descriptor = createSyncDescriptor(Target2, true);
		var instance = service.createInstance(descriptor);
		assert.ok(instance.validate());
	});

	test('sync create, register NEW service', function(){
		service.registerService('far', 1234);
		service.createInstance(Target3);

		var child = service.createChild({});
		child.createInstance(Target3);
	});

	test('sync create, override service', () => {
		assert.throws(() => service.registerService('editorService', 1234));
	});

	// test('async create, platformServices only', (done) => {
	// 	var descriptor = new services.AsyncDescriptor<Target1>('vs/platform/instantiation/tests/instantiationService.test', 'Target1');
	// 	service.createInstance(descriptor, true).then((instance) => {
	// 		assert.ok(instance.validate());
	// 		done();
	// 	}, (e) => {
	// 		assert.ok(false, e);
	// 	});
	// });

	// test('async create, platformServices only & argument', (done) => {
	// 	var descriptor = new services.AsyncDescriptor<Target2>('vs/platform/instantiation/tests/instantiationService.test', 'Target1');
	// 	service.createInstance(descriptor, true).then((instance) => {
	// 		assert.ok(instance.validate());
	// 		done();
	// 	}, (e) => {
	// 		assert.ok(false, e);
	// 	});
	// });

	// test('async create, platformServices only & static argument', (done) => {
	// 	var descriptor = new services.AsyncDescriptor<Target2>('vs/platform/instantiation/tests/instantiationService.test', 'Target1', true);
	// 	service.createInstance(descriptor).then((instance) => {
	// 		assert.ok(instance.validate());
	// 		done();
	// 	}, (e) => {
	// 		assert.ok(false, e);
	// 	});
	// });

	// test('async create, illegal ctor name', (done) => {
	// 	var descriptor = new services.AsyncDescriptor<Target2>('vs/platform/instantiation/tests/instantiationService.test', 'TaRget1', true);
	// 	service.createInstance(descriptor).then((instance) => {
	// 		assert.ok(false);
	// 		done();
	// 	}, (e) => {
	// 		assert.ok(e instanceof Error);
	// 	});
	// });

	test('safe on create - don\'t allow service change', function() {
		assert.throws(() => service.createInstance(EvilTarget1));
	});

	test('@Uses - simple case', function () {

		var service = instantiationService.create(Object.create(null));
		service.addSingleton(IService1, new Service1());

		var target = service.createInstance(UsesTarget);
	});

	test('@Uses - inheritance', function () {
		var service = instantiationService.create(Object.create(null));
		service.addSingleton(IService1, new Service1());
		service.addSingleton(IService2, new Service2());

		service.createInstance(UsesTarget2);
	});

	test('@Uses and @IServiceName', function() {
		var service = instantiationService.create(Object.create(null));
		service.addSingleton(IService1, new Service1());
		service.addSingleton(IService2, new Service2());
		service.addSingleton(IService3, new Service3());

		service.createInstance(<instantiation.IConstructorSignature0<UsesTarget3>> UsesTarget3);
	});

	test('@Param - simple clase', function () {
		var service = instantiationService.create(Object.create(null));
		service.addSingleton(IService1, new Service1());
		service.addSingleton(IService2, new Service2());
		service.addSingleton(IService3, new Service3());

		service.createInstance(ParameterTarget);
	});

	test('@Param - fixed args', function () {
		var service = instantiationService.create(Object.create(null));
		service.addSingleton(IService1, new Service1());
		service.addSingleton(IService2, new Service2());
		service.addSingleton(IService3, new Service3());

		service.createInstance(ParameterTarget2, true);
	});

	test('@Param - optional', function() {
		var service = instantiationService.create(Object.create(null));
		service.addSingleton(IService1, new Service1());
		// service.addSingleton(IService2, new Service2());

		service.createInstance(TargetOptional);
	});

	// we made this a warning
	// test('@Param - too many args', function () {
	// 	var service = instantiationService.create(Object.create(null));
	// 	service.addSingleton(IService1, new Service1());
	// 	service.addSingleton(IService2, new Service2());
	// 	service.addSingleton(IService3, new Service3());

	// 	assert.throws(() => service.createInstance(ParameterTarget2, true, 2));
	// });

	// test('@Param - too few args', function () {
	// 	var service = instantiationService.create(Object.create(null));
	// 	service.addSingleton(IService1, new Service1());
	// 	service.addSingleton(IService2, new Service2());
	// 	service.addSingleton(IService3, new Service3());

	// 	assert.throws(() => service.createInstance(ParameterTarget2));
	// });

	test('SyncDesc - no dependencies', function () {
		var service = instantiationService.create(Object.create(null));
		service.addSingleton(IService1, new SyncDescriptor<IService1>(Service1));

		var service1 = service.getInstance(IService1);
		assert.ok(service1);
		assert.equal(service1.c, 1);

		var service2 = service.getInstance(IService1);
		assert.ok(service1 === service2);
	});

	test('SyncDesc - service with service dependency', function () {
		var service = instantiationService.create(Object.create(null));
		service.addSingleton(IService1, new SyncDescriptor<IService1>(Service1));
		service.addSingleton(IDependentService, new SyncDescriptor<IDependentService>(DependentService));

		var d = service.getInstance(IDependentService);
		assert.ok(d);
		assert.equal(d.name, 'farboo');
	});

	test('SyncDesc - target depends on service future', function () {
		var service = instantiationService.create(Object.create(null));
		service.addSingleton(IService1, new SyncDescriptor<IService1>(Service1));
		service.addSingleton(IDependentService, new SyncDescriptor<IDependentService>(DependentService));

		var d = service.createInstance(DependentServiceTarget);
		assert.ok(d instanceof DependentServiceTarget);

		var d2 = service.createInstance(DependentServiceTarget2);
		assert.ok(d2 instanceof DependentServiceTarget2);
	});

	test('SyncDesc - explode on loop', function () {
		var service = instantiationService.create(Object.create(null));
		service.addSingleton(IService1, new SyncDescriptor<IService1>(ServiceLoop1));
		service.addSingleton(IService2, new SyncDescriptor<IService2>(ServiceLoop2));

		assert.throws(() => service.getInstance(IService1));
		assert.throws(() => service.getInstance(IService2));
	});

	test('Invoke - get services', function() {
		var service = instantiationService.create(Object.create(null));
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
		var service = instantiationService.create(Object.create(null));
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
		var service = instantiationService.create(Object.create(null));
		service.addSingleton(IService1, new Service1());
		service.addSingleton(IService2, new Service2());

		function test(accessor: instantiation.ServicesAccessor) {
			throw new Error();
		}

		assert.throws(() => service.invokeFunction(test));
	})
});
