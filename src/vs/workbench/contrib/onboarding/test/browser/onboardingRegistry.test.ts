/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { OnboardingScenarioRegistry } from '../../common/onboardingRegistry.js';

suite('OnboardingScenarioRegistry', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('includes declared and active scenarios in the descriptor catalog', () => {
		const registry = new OnboardingScenarioRegistry();
		registry.registerDescriptor({ id: 'declared', developerModeVariations: ['first'] });
		registry.registerDescriptor({ id: 'declared', developerModeVariations: ['second'] });
		const registration = disposables.add(registry.register({
			id: 'active',
			trigger: { kind: 'auto' },
			presentation: { kind: 'test', payload: undefined },
		}));

		assert.deepStrictEqual(registry.getScenarioDescriptors(), [
			{ id: 'declared', developerModeVariations: ['second'] },
			{
				id: 'active',
				trigger: { kind: 'auto' },
				presentation: { kind: 'test', payload: undefined },
			},
		]);

		registration.dispose();
		assert.deepStrictEqual(registry.getScenarioDescriptors(), [
			{ id: 'declared', developerModeVariations: ['second'] },
		]);
	});

	test('active scenarios override their persistent descriptors', () => {
		const registry = new OnboardingScenarioRegistry();
		registry.registerDescriptor({ id: 'dynamic' });
		const scenario = {
			id: 'dynamic',
			developerModeVariations: ['active'],
			trigger: { kind: 'auto' } as const,
			presentation: { kind: 'test', payload: undefined },
		};
		disposables.add(registry.register(scenario));

		assert.deepStrictEqual(registry.getScenarioDescriptors(), [scenario]);
	});
});
