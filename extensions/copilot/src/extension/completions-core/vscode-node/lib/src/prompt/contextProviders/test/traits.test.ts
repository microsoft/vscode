/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ServicesAccessor } from '../../../../../../../../util/vs/platform/instantiation/common/instantiation';
import { createLibTestingContext } from '../../../test/context';
import { ResolvedContextItem } from '../../contextProviderRegistry';
import { ContextProviderStatistics, ICompletionsContextProviderService } from '../../contextProviderStatistics';
import { TestContextProviderStatistics } from '../../test/contextProviderStatistics';
import { TraitWithId } from './../contextItemSchemas';
import { getTraitsFromContextItems } from './../traits';

suite('traitsContextProvider', function () {
	let accessor: ServicesAccessor;
	const resolvedContextItems: ResolvedContextItem<TraitWithId>[] = [
		{
			providerId: 'testTraitsProvider',
			matchScore: 1,
			resolution: 'full',
			resolutionTimeMs: 10,
			data: [
				// This trait should be the last in the list, since higher importance
				// is closer to the end of the prompt.
				{
					name: 'trait_from_context_provider1_1',
					value: 'value_1',
					importance: 10,
					id: '1',
					type: 'Trait',
				},
				{
					name: 'trait_from_context_provider1_2',
					value: 'value_2',
					id: '2',
					type: 'Trait',
				},
			],
		},
		{
			providerId: 'testTraitsProvider2',
			matchScore: 1,
			resolution: 'full',
			resolutionTimeMs: 10,
			data: [{ name: 'trait_from_context_provider2_1', value: 'value_3', id: '3', type: 'Trait' }],
		},
	];

	setup(function () {
		const serviceCollection = createLibTestingContext();
		serviceCollection.define(
			ICompletionsContextProviderService,
			new ContextProviderStatistics(() => new TestContextProviderStatistics())
		);
		accessor = serviceCollection.createTestingAccessor();
	});

	test('can get traits from context text providers and flattens them', function () {
		const traits = getTraitsFromContextItems(accessor, 'COMPLETION_ID', resolvedContextItems);
		assert.deepStrictEqual(traits.length, 3);
		assert.deepStrictEqual(
			traits.map(t => t.name),
			['trait_from_context_provider1_2', 'trait_from_context_provider2_1', 'trait_from_context_provider1_1']
		);
	});

	test('set expectations for contextProviderStatistics', function () {

		getTraitsFromContextItems(accessor, 'COMPLETION_ID', resolvedContextItems);

		const statistics = accessor
			.get(ICompletionsContextProviderService)
			.getStatisticsForCompletion('COMPLETION_ID') as TestContextProviderStatistics;
		// Prompt components expectations
		assert.deepStrictEqual(statistics.expectations.size, 2);
		const traitExpectations = statistics.expectations.get('testTraitsProvider');
		assert.ok(traitExpectations);
		assert.deepStrictEqual(traitExpectations, [
			[
				{ id: '1', name: 'trait_from_context_provider1_1', value: 'value_1', importance: 10, type: 'Trait' },
				'included',
			],
			[{ id: '2', name: 'trait_from_context_provider1_2', value: 'value_2', type: 'Trait' }, 'included'],
		]);
		const traitExpectations2 = statistics.expectations.get('testTraitsProvider2');
		assert.ok(traitExpectations2);
		assert.deepStrictEqual(traitExpectations2, [
			[{ id: '3', name: 'trait_from_context_provider2_1', value: 'value_3', type: 'Trait' }, 'included'],
		]);
	});
});
