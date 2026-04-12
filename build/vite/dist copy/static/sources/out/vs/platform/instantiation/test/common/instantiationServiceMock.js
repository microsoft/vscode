/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as sinon from 'sinon';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { SyncDescriptor } from '../../common/descriptors.js';
import { InstantiationService, Trace } from '../../common/instantiationService.js';
import { ServiceCollection } from '../../common/serviceCollection.js';
const isSinonSpyLike = (fn) => fn && 'callCount' in fn;
export class TestInstantiationService extends InstantiationService {
    constructor(_serviceCollection = new ServiceCollection(), strict = false, parent, _properDispose) {
        super(_serviceCollection, strict, parent);
        this._serviceCollection = _serviceCollection;
        this._properDispose = _properDispose;
        this._classStubs = new Map();
        this._servciesMap = new Map();
        if (parent instanceof TestInstantiationService) {
            this._parentTestService = parent;
        }
    }
    get(service) {
        return super._getOrCreateServiceInstance(service, Trace.traceCreation(false, TestInstantiationService));
    }
    set(service, instance) {
        return this._serviceCollection.set(service, instance);
    }
    mock(service) {
        return this._create(service, { mock: true });
    }
    stubInstance(ctor, instance) {
        this._classStubs.set(ctor, instance);
    }
    _getClassStub(ctor) {
        return this._classStubs.get(ctor) ?? this._parentTestService?._getClassStub(ctor);
    }
    createInstance(ctorOrDescriptor, ...rest) {
        const stub = this._getClassStub(ctorOrDescriptor);
        if (stub) {
            return stub;
        }
        return super.createInstance(ctorOrDescriptor, ...rest);
    }
    stub(serviceIdentifier, arg2, arg3, arg4) {
        const service = typeof arg2 !== 'string' ? arg2 : undefined;
        const serviceMock = { id: serviceIdentifier, service: service };
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
                }
                else {
                    const stub = value ? sinon.stub().returns(value) : sinon.stub();
                    stubObject[property] = stub;
                    return stub;
                }
            }
            else {
                stubObject[property] = value;
            }
        }
        return stubObject;
    }
    stubPromise(arg1, arg2, arg3, arg4) {
        arg3 = typeof arg2 === 'string' ? Promise.resolve(arg3) : arg3;
        arg4 = typeof arg2 !== 'string' && typeof arg3 === 'string' ? Promise.resolve(arg4) : arg4;
        return this.stub(arg1, arg2, arg3, arg4);
    }
    spy(service, fnProperty) {
        const spy = sinon.spy();
        this.stub(service, fnProperty, spy);
        return spy;
    }
    _create(arg1, options, reset = false) {
        if (this.isServiceMock(arg1)) {
            const service = this._getOrCreateService(arg1, options, reset);
            this._serviceCollection.set(arg1.id, service);
            return service;
        }
        return options.mock ? sinon.mock(arg1) : this._createStub(arg1);
    }
    _getOrCreateService(serviceMock, opts, reset) {
        const service = this._serviceCollection.get(serviceMock.id);
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
    _createService(serviceMock, opts) {
        serviceMock.service = serviceMock.service ? serviceMock.service : this._servciesMap.get(serviceMock.id);
        const service = opts.mock ? sinon.mock(serviceMock.service) : this._createStub(serviceMock.service);
        service['sinonOptions'] = opts;
        return service;
    }
    _createStub(arg) {
        return typeof arg === 'object' ? arg : sinon.createStubInstance(arg);
    }
    isServiceMock(arg1) {
        return typeof arg1 === 'object' && arg1.hasOwnProperty('id');
    }
    createChild(services) {
        return new TestInstantiationService(services, false, this);
    }
    dispose() {
        sinon.restore();
        if (this._properDispose) {
            super.dispose();
        }
    }
}
export function createServices(disposables, services) {
    const serviceIdentifiers = [];
    const serviceCollection = new ServiceCollection();
    const define = (id, ctorOrInstance) => {
        if (!serviceCollection.has(id)) {
            if (typeof ctorOrInstance === 'function') {
                serviceCollection.set(id, new SyncDescriptor(ctorOrInstance));
            }
            else {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEtBQUssTUFBTSxPQUFPLENBQUM7QUFDL0IsT0FBTyxFQUFnQyxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRyxPQUFPLEVBQUUsY0FBYyxFQUFtQixNQUFNLDZCQUE2QixDQUFDO0FBRTlFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxLQUFLLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNuRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQU90RSxNQUFNLGNBQWMsR0FBRyxDQUFDLEVBQVksRUFBd0IsRUFBRSxDQUFDLEVBQUUsSUFBSSxXQUFXLElBQUksRUFBRSxDQUFDO0FBRXZGLE1BQU0sT0FBTyx3QkFBeUIsU0FBUSxvQkFBb0I7SUFNakUsWUFBb0IscUJBQXdDLElBQUksaUJBQWlCLEVBQUUsRUFBRSxTQUFrQixLQUFLLEVBQUUsTUFBNkIsRUFBVSxjQUF3QjtRQUM1SyxLQUFLLENBQUMsa0JBQWtCLEVBQUUsTUFBTSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBRHZCLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBNkM7UUFBa0UsbUJBQWMsR0FBZCxjQUFjLENBQVU7UUFINUosZ0JBQVcsR0FBdUIsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQU01RCxJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksR0FBRyxFQUErQixDQUFDO1FBQzNELElBQUksTUFBTSxZQUFZLHdCQUF3QixFQUFFLENBQUM7WUFDaEQsSUFBSSxDQUFDLGtCQUFrQixHQUFHLE1BQU0s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