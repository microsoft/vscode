/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { IFileService } from '../../../files/common/files.js';
import { SyncDescriptor } from '../../../instantiation/common/descriptors.js';
import { createDecorator, IInstantiationService, ServiceIdentifier, _util } from '../../../instantiation/common/instantiation.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { StrictServiceCollection } from '../../../instantiation/common/strictServiceCollection.js';
import { ILogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { IRequestService } from '../../../request/common/request.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { IAgentEditAttributionService, NullAgentEditAttributionService } from '../../common/fileEditAttribution.js';
import { IAgentHostGitService } from '../../common/agentHostGitService.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { IAgentHostAuthenticationService } from '../../node/agentHostAuthenticationService.js';
import { IAgentHostClientConnectionService } from '../../node/agentHostClientConnectionService.js';
import { IAgentHostGitHubEndpointService } from '../../node/agentHostGitHubEndpointService.js';
import { IAgentHostProxyResolver } from '../../node/agentHostProxyResolver.js';
import { IAgentHostStateManager } from '../../node/agentHostStateManager.js';
import { NullByokLmBridgeRegistry, IByokLmBridgeRegistry } from '../../node/byokLmBridgeRegistry.js';
import { registerAgentHostCoreServices, registerAgentHostHostServices } from '../../node/agentHostServices.js';
import { IAgentHostWorktreeIsolation, NullAgentHostWorktreeIsolation } from '../../node/shared/worktreeIsolation.js';

const ITestService = createDecorator<ITestService>('agentHostTestService');

interface ITestService {
	readonly _serviceBrand: undefined;
	readonly value: number;
}

class CountingTestService implements ITestService {
	declare readonly _serviceBrand: undefined;
	readonly value = 1;

	constructor(onCreate: () => void) {
		onCreate();
	}
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

class RecordingServiceCollection extends StrictServiceCollection {
	private readonly _descriptorIds = new Set<ServiceIdentifier<unknown>>();

	constructor(...entries: ConstructorParameters<typeof ServiceCollection>) {
		super();
		for (const [id, service] of entries) {
			this.set(id, service);
		}
	}

	get descriptorIds(): readonly ServiceIdentifier<unknown>[] {
		return [...this._descriptorIds];
	}

	override set<T>(id: ServiceIdentifier<T>, instanceOrDescriptor: T | SyncDescriptor<T>): T | SyncDescriptor<T> {
		if (instanceOrDescriptor instanceof SyncDescriptor) {
			this._descriptorIds.add(id);
		}
		return super.set(id, instanceOrDescriptor);
	}
}

function registerCoreServices(services: ServiceCollection): void {
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
}

function registerHostServices(services: ServiceCollection): void {
	registerAgentHostHostServices(services, {
		userDataPath: URI.file('/user-data'),
		fetchFn: globalThis.fetch,
		byok: { kind: 'renderer', bridgeRegistry: new NullByokLmBridgeRegistry() },
	});
}

function assertCompleteAcyclicGraph(services: RecordingServiceCollection, externallyRegistered: ReadonlySet<ServiceIdentifier<unknown>>): void {
	const descriptorIds = new Set(services.descriptorIds);
	const dependencies = new Map<ServiceIdentifier<unknown>, readonly ServiceIdentifier<unknown>[]>();
	for (const id of descriptorIds) {
		const descriptor = services.get(id);
		assert.ok(descriptor instanceof SyncDescriptor);
		const serviceDependencies = _util.getServiceDependencies(descriptor.ctor).map(dependency => dependency.id);
		dependencies.set(id, serviceDependencies);
		for (const dependency of serviceDependencies) {
			assert.ok(descriptorIds.has(dependency) || externallyRegistered.has(dependency), `${id} depends on unregistered service ${dependency}`);
		}
	}

	const visiting = new Set<ServiceIdentifier<unknown>>();
	const visited = new Set<ServiceIdentifier<unknown>>();
	const visit = (id: ServiceIdentifier<unknown>): void => {
		if (visited.has(id)) {
			return;
		}
		assert.ok(!visiting.has(id), `Cyclic Agent Host service dependency at ${id}`);
		visiting.add(id);
		for (const dependency of dependencies.get(id) ?? []) {
			if (descriptorIds.has(dependency)) {
				visit(dependency);
			}
		}
		visiting.delete(id);
		visited.add(id);
	};
	for (const id of descriptorIds) {
		visit(id);
	}

	assert.ok(descriptorIds.size > 0);
}

suite('Agent Host service registrations', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves descriptors lazily and caches the instance', () => {
		let createCount = 0;
		const services = new StrictServiceCollection(
			[ITestService, new SyncDescriptor(CountingTestService, [() => createCount++])],
		);
		const instantiationService = disposables.add(new InstantiationService(services, true));

		assert.ok(services.get(ITestService) instanceof SyncDescriptor);
		const first = instantiationService.invokeFunction(accessor => accessor.get(ITestService));
		const second = instantiationService.invokeFunction(accessor => accessor.get(ITestService));

		assert.deepStrictEqual({
			createCount,
			sameInstance: first === second,
			cached: services.get(ITestService) === first,
		}, {
			createCount: 1,
			sameInstance: true,
			cached: true,
		});
	});

	test('registers the production graph with complete, acyclic dependencies', () => {
		const services = new RecordingServiceCollection();
		registerCoreServices(services);
		registerHostServices(services);

		const externallyRegistered = new Set<ServiceIdentifier<unknown>>([
			INativeEnvironmentService,
			ILogService,
			IFileService,
			ISessionDataService,
			IProductService,
			ITelemetryService,
			IRequestService,
			IInstantiationService,
			IAgentHostStateManager,
			IAgentConfigurationService,
			IAgentHostAuthenticationService,
			IAgentHostGitHubEndpointService,
			IAgentHostProxyResolver,
			IAgentHostClientConnectionService,
			IByokLmBridgeRegistry,
		]);
		assertCompleteAcyclicGraph(services, externallyRegistered);
	});

	test('registers the core-only test graph with complete, acyclic dependencies', () => {
		const services = new RecordingServiceCollection();
		registerCoreServices(services);

		assertCompleteAcyclicGraph(services, new Set<ServiceIdentifier<unknown>>([
			ILogService,
			IFileService,
			ISessionDataService,
			IProductService,
			ITelemetryService,
			IRequestService,
			IInstantiationService,
			IAgentHostStateManager,
			IAgentConfigurationService,
			IAgentHostAuthenticationService,
			IAgentHostGitHubEndpointService,
			IAgentHostProxyResolver,
			IAgentHostClientConnectionService,
			IByokLmBridgeRegistry,
			IAgentHostGitService,
		]));
	});

	test('preserves typed overrides', () => {
		const services = new StrictServiceCollection();
		const override = new NullAgentEditAttributionService();
		services.set(IAgentEditAttributionService, override);

		registerCoreServices(services);

		assert.strictEqual(services.get(IAgentEditAttributionService), override);
	});

	test('selects the core worktree isolation implementation', () => {
		const coreServices = new StrictServiceCollection();
		registerCoreServices(coreServices);
		const nullServices = new StrictServiceCollection(
			[IAgentHostWorktreeIsolation, new NullAgentHostWorktreeIsolation()],
		);
		registerCoreServices(nullServices);
		const hostServices = new StrictServiceCollection();
		registerHostServices(hostServices);
		const nullInstantiationService = disposables.add(new InstantiationService(nullServices, true));
		const nullWorktreeIsolation = nullInstantiationService.invokeFunction(accessor => accessor.get(IAgentHostWorktreeIsolation));

		assert.deepStrictEqual({
			core: coreServices.get(IAgentHostWorktreeIsolation) instanceof SyncDescriptor,
			nullSupported: nullWorktreeIsolation.supported,
			host: hostServices.has(IAgentHostWorktreeIsolation),
		}, {
			core: true,
			nullSupported: false,
			host: false,
		});
	});

	test('descriptor-created services have one disposal owner', () => {
		const services = new StrictServiceCollection();
		let disposeCount = 0;
		services.set(ITestService, new SyncDescriptor(DisposableTestService, [() => disposeCount++]));
		const instantiationService = disposables.add(new InstantiationService(services, true));
		instantiationService.invokeFunction(accessor => accessor.get(ITestService));

		instantiationService.dispose();
		instantiationService.dispose();

		assert.strictEqual(disposeCount, 1);
	});
});
