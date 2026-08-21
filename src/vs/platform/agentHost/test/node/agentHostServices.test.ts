/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { SyncDescriptor } from '../../../instantiation/common/descriptors.js';
import { createDecorator, IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { AgentHostServiceCollection } from '../../node/agentHostServices.js';

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
	});
});
