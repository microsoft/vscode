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
import { createDecorator, IInstantiationService, _util } from '../../../instantiation/common/instantiation.js';
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

	test('allows descriptor resolution after sealing', () => {
		const services = new AgentHostServiceCollection();
		services.set(ITestService, new SyncDescriptor(TestService));
		const instantiationService = disposables.add(new InstantiationService(services, true));
		services.seal();

		const resolved = instantiationService.invokeFunction(accessor => accessor.get(ITestService));

		assert.deepStrictEqual({
			value: resolved.value,
			registered: services.get(ITestService) === resolved,
		}, {
			value: 1,
			registered: true,
		});
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
		assert.throws(() => services.set(IReplacementService, new ReplacementTestService()), /service collection is sealed/);
	});

	test('registers descriptors with exact leading static arguments', () => {
		const services = new AgentHostServiceCollection();
		const ids = [
			...registerAgentHostCoreServices(services, {
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
			}),
			...registerAgentHostHostServices(services, {
				userDataPath: URI.file('/user-data'),
				fetchFn: globalThis.fetch,
				byok: { kind: 'renderer', bridgeRegistry: new NullByokLmBridgeRegistry() },
			}),
		];

		const descriptors = ids
			.map(id => services.get(id))
			.filter((candidate): candidate is SyncDescriptor<unknown> => candidate instanceof SyncDescriptor);
		const actual = descriptors.map(descriptor => {
			const dependencies = _util.getServiceDependencies(descriptor.ctor).sort((a, b) => a.index - b.index);
			return {
				name: descriptor.ctor.name,
				staticArguments: descriptor.staticArguments.length,
				firstServiceArgument: dependencies[0]?.index ?? 0,
			};
		});

		assert.ok(actual.length > 0);
		assert.deepStrictEqual(
			actual.filter(entry => entry.staticArguments !== entry.firstServiceArgument),
			[],
		);
	});

	test('preserves typed overrides', () => {
		const services = new AgentHostServiceCollection();
		const override = new NullAgentEditAttributionService();
		services.set(IAgentEditAttributionService, override);

		const ids = registerAgentHostCoreServices(services, {
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
			returned: ids.includes(IAgentEditAttributionService),
		}, {
			preserved: true,
			returned: false,
		});
	});

	test('keeps worktree isolation production-only', () => {
		const services = new AgentHostServiceCollection();
		const coreIds = registerAgentHostCoreServices(services, {
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
		const hostIds = registerAgentHostHostServices(services, {
			userDataPath: URI.file('/user-data'),
			fetchFn: globalThis.fetch,
			byok: { kind: 'renderer', bridgeRegistry: new NullByokLmBridgeRegistry() },
		});

		assert.deepStrictEqual({
			core: coreIds.includes(IAgentHostWorktreeIsolation),
			host: hostIds.includes(IAgentHostWorktreeIsolation),
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
		instantiationService.invokeFunction(accessor => accessor.get(ITestService));

		instantiationService.dispose();
		instantiationService.dispose();

		assert.strictEqual(disposeCount, 1);
	});
});
