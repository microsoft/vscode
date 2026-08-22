/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { URI } from '../../../../base/common/uri.js';
import { SyncDescriptor } from '../../../instantiation/common/descriptors.js';
import { createDecorator, IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { IAgentEditAttributionService, NullAgentEditAttributionService } from '../../common/fileEditAttribution.js';
import { NullByokLmBridgeRegistry } from '../../node/byokLmBridgeRegistry.js';
import { AgentHostServiceCollection, registerAgentHostCoreServices, registerAgentHostHostServices } from '../../node/agentHostServices.js';
import { IAgentHostWorktreeIsolation } from '../../node/shared/worktreeIsolation.js';

const ITestService = createDecorator<ITestService>('agentHostTestService');
const IReplacementService = createDecorator<ITestService>('agentHostReplacementService');

interface ITestService {
	readonly _serviceBrand: undefined;
	readonly value: number;
}

class TestService implements ITestService {
	declare readonly _serviceBrand: undefined;
	readonly value = 1;
}

class ReplacementTestService implements ITestService {
	declare readonly _serviceBrand: undefined;
	readonly value = 2;
}

class SubclassTestService extends TestService { }

class StaticArgumentTestService implements ITestService {
	declare readonly _serviceBrand: undefined;

	constructor(readonly value: number) { }
}

class DefaultStaticArgumentTestService implements ITestService {
	declare readonly _serviceBrand: undefined;

	constructor(readonly value = 1) { }
}

class ServiceDependentTestService implements ITestService {
	declare readonly _serviceBrand: undefined;

	constructor(
		readonly value: number,
		@ITestService _dependency: ITestService,
	) { }
}

class DisposableTestService extends Disposable implements ITestService {
	declare readonly _serviceBrand: undefined;
	readonly value = 1;

	constructor(private readonly onDispose: () => void) {
		super();
	}

	override dispose(): void {
		this.onDispose();
		super.dispose();
	}
}

suite('AgentHostServiceCollection', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('registers the instantiation service before sealing', () => {
		const services = new AgentHostServiceCollection();
		const instantiationService = disposables.add(new InstantiationService(services, true));

		services.seal();

		assert.strictEqual(services.get(IInstantiationService), instantiationService);
	});

	test('records descriptors supplied as constructor entries', () => {
		const descriptor = new SyncDescriptor(TestService);
		const services = new AgentHostServiceCollection(
			[ITestService, descriptor],
			[IReplacementService, new ReplacementTestService()],
		);

		assert.deepStrictEqual({
			ids: services.registeredDescriptorIds,
			descriptor: services.get(ITestService) === descriptor,
		}, {
			ids: [ITestService],
			descriptor: true,
		});
	});

	test('validates descriptor static arguments when registered', () => {
		const services = new AgentHostServiceCollection();

		assert.throws(
			() => services.set(ITestService, new SyncDescriptor(ServiceDependentTestService)),
			/ServiceDependentTestService must pass exactly 1 leading static arguments \(got 0\)/,
		);
		assert.throws(
			() => services.set(ITestService, new SyncDescriptor(StaticArgumentTestService)),
			/StaticArgumentTestService must pass at least 1 required static arguments \(got 0\)/,
		);
		services.set(ITestService, new SyncDescriptor(StaticArgumentTestService, [1]));
		services.set(IReplacementService, new SyncDescriptor(DefaultStaticArgumentTestService));
	});

	test('allows collection-controlled descriptor resolution after sealing', () => {
		const services = new AgentHostServiceCollection();
		services.set(ITestService, new SyncDescriptor(TestService));
		const instantiationService = disposables.add(new InstantiationService(services, true));
		services.seal();

		services.instantiateRegisteredDescriptors(instantiationService);
		const resolved = services.get(ITestService);

		assert.deepStrictEqual({
			value: resolved instanceof SyncDescriptor ? undefined : resolved.value,
			registered: services.get(ITestService) === resolved,
		}, {
			value: 1,
			registered: true,
		});
	});

	test('instantiates registered descriptors exactly once with the collection instantiation service', () => {
		const services = new AgentHostServiceCollection(
			[ITestService, new SyncDescriptor(TestService)],
			[IReplacementService, new SyncDescriptor(ReplacementTestService)],
		);
		const instantiationService = disposables.add(new InstantiationService(services, true));
		const foreignInstantiationService = disposables.add(new InstantiationService(new AgentHostServiceCollection(), true));

		assert.throws(
			() => services.instantiateRegisteredDescriptors(instantiationService),
			/must be sealed before instantiating registered descriptors/,
		);
		services.seal();
		assert.throws(
			() => services.instantiateRegisteredDescriptors(foreignInstantiationService),
			/must be instantiated by the collection instantiation service/,
		);
		services.instantiateRegisteredDescriptors(instantiationService);

		assert.deepStrictEqual(
			services.registeredDescriptorIds.map(id => services.get(id) instanceof SyncDescriptor),
			[false, false],
		);
		assert.throws(
			() => services.instantiateRegisteredDescriptors(instantiationService),
			/registered descriptors have already been instantiated/,
		);
	});

	test('rejects registrations and replacements after sealing', () => {
		const services = new AgentHostServiceCollection();
		services.set(ITestService, new TestService());
		services.set(IReplacementService, new SyncDescriptor(TestService));
		disposables.add(new InstantiationService(services, true));
		services.seal();

		assert.throws(() => services.set(createDecorator<ITestService>('agentHostLateService'), new TestService()), /service collection is sealed/);
		assert.throws(() => services.set(ITestService, new TestService()), /service collection is sealed/);
		assert.throws(() => services.set(IReplacementService, new SyncDescriptor(TestService)), /service collection is sealed/);
		assert.throws(() => services.set(IReplacementService, new TestService()), /service collection is sealed/);
		assert.throws(() => services.set(IReplacementService, new SubclassTestService()), /service collection is sealed/);
		assert.throws(() => services.set(IReplacementService, new ReplacementTestService()), /service collection is sealed/);
	});

	test('registers descriptors with exact leading static arguments', () => {
		const services = new AgentHostServiceCollection();
		registerAgentHostCoreServices(services, {
			storageResource: URI.file('/storage.json'),
			fetchFn: globalThis.fetch,
			gitHubServiceOptions: {
				endpoint: {
					onDidChange: Event.None,
					getApiBaseUri: () => 'https://api.github.com',
					getGraphQlUri: () => 'https://api.github.com/graphql',
				},
				tokenProvider: { getToken: () => undefined },
				fetch: globalThis.fetch,
			},
		});
		registerAgentHostHostServices(services, {
			userDataPath: URI.file('/user-data'),
			fetchFn: globalThis.fetch,
			byok: { kind: 'renderer', bridgeRegistry: new NullByokLmBridgeRegistry() },
		});

		assert.ok(services.registeredDescriptorIds.length > 0);
		assert.ok(services.registeredDescriptorIds.every(id => services.get(id) instanceof SyncDescriptor));
	});

	test('preserves typed overrides', () => {
		const services = new AgentHostServiceCollection();
		const override = new NullAgentEditAttributionService();
		services.set(IAgentEditAttributionService, override);

		registerAgentHostCoreServices(services, {
			storageResource: undefined,
			fetchFn: globalThis.fetch,
			gitHubServiceOptions: {
				endpoint: {
					onDidChange: Event.None,
					getApiBaseUri: () => 'https://api.github.com',
					getGraphQlUri: () => 'https://api.github.com/graphql',
				},
				tokenProvider: { getToken: () => undefined },
				fetch: globalThis.fetch,
			},
		});

		assert.deepStrictEqual({
			preserved: services.get(IAgentEditAttributionService) === override,
			recorded: services.registeredDescriptorIds.includes(IAgentEditAttributionService),
		}, {
			preserved: true,
			recorded: false,
		});
	});

	test('keeps worktree isolation production-only', () => {
		const coreServices = new AgentHostServiceCollection();
		registerAgentHostCoreServices(coreServices, {
			storageResource: undefined,
			fetchFn: globalThis.fetch,
			gitHubServiceOptions: {
				endpoint: {
					onDidChange: Event.None,
					getApiBaseUri: () => 'https://api.github.com',
					getGraphQlUri: () => 'https://api.github.com/graphql',
				},
				tokenProvider: { getToken: () => undefined },
				fetch: globalThis.fetch,
			},
		});
		const hostServices = new AgentHostServiceCollection();
		registerAgentHostHostServices(hostServices, {
			userDataPath: URI.file('/user-data'),
			fetchFn: globalThis.fetch,
			byok: { kind: 'renderer', bridgeRegistry: new NullByokLmBridgeRegistry() },
		});

		assert.deepStrictEqual({
			core: coreServices.registeredDescriptorIds.includes(IAgentHostWorktreeIsolation),
			host: hostServices.registeredDescriptorIds.includes(IAgentHostWorktreeIsolation),
		}, {
			core: false,
			host: true,
		});
	});

	test('descriptor-created services have one disposal owner', () => {
		const services = new AgentHostServiceCollection();
		let disposeCount = 0;
		services.set(ITestService, new SyncDescriptor(DisposableTestService, [() => disposeCount++]));
		const instantiationService = disposables.add(new InstantiationService(services, true));
		services.seal();
		services.instantiateRegisteredDescriptors(instantiationService);

		instantiationService.dispose();
		instantiationService.dispose();

		assert.strictEqual(disposeCount, 1);
	});
});
