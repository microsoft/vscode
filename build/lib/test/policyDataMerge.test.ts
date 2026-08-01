/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';
import type { CategoryDto, ExportedPolicyDataDto, PolicyDto } from '../policies/policyDto.ts';
import { mergePolicyData } from '../policies/policyDataMerge.ts';

const extensionsCategory: CategoryDto = {
	key: 'Extensions',
	name: { key: 'Extensions', value: 'Extensions' },
};

const interactiveSessionCategory: CategoryDto = {
	key: 'InteractiveSession',
	name: { key: 'InteractiveSession', value: 'Interactive Session' },
};

function policy(key: string, name: string, referencedSettings?: string[]): PolicyDto {
	return {
		key,
		name,
		category: 'InteractiveSession',
		minimumVersion: '1.130',
		localization: {
			description: { key: `${key}.policy`, value: `Policy for ${key}` },
		},
		type: 'boolean',
		default: true,
		included: true,
		...(referencedSettings ? { referencedSettings } : {}),
	};
}

function catalog(policies: PolicyDto[], categories = [interactiveSessionCategory, extensionsCategory]): ExportedPolicyDataDto {
	return { categories, policies };
}

suite('Policy data merge', () => {
	test('unions policies and references with stable ordering', () => {
		const shared = policy('chat.shared', 'SharedPolicy', ['z.setting', 'shared.setting']);
		const result = mergePolicyData([
			{
				source: 'Workbench',
				data: catalog([shared, policy('chat.workbench', 'WorkbenchPolicy')]),
			},
			{
				source: 'Agents window',
				data: catalog([
					policy('chat.agents', 'AgentsPolicy'),
					policy('chat.shared', 'SharedPolicy', ['a.setting', 'shared.setting']),
				], [extensionsCategory, interactiveSessionCategory]),
			},
		]);

		assert.deepStrictEqual(result, {
			categories: [extensionsCategory, interactiveSessionCategory],
			policies: [
				policy('chat.agents', 'AgentsPolicy'),
				policy('chat.shared', 'SharedPolicy', ['a.setting', 'shared.setting', 'z.setting']),
				policy('chat.workbench', 'WorkbenchPolicy'),
			],
		});
	});

	test('rejects conflicting policy metadata', () => {
		const conflicting = { ...policy('chat.shared', 'SharedPolicy'), default: false };

		assert.throws(() => mergePolicyData([
			{ source: 'Workbench', data: catalog([policy('chat.shared', 'SharedPolicy')]) },
			{ source: 'Agents window', data: catalog([conflicting]) },
		]), /Policy 'chat\.shared' differs between 'Workbench' and 'Agents window'\./);
	});

	test('rejects conflicting categories', () => {
		const conflictingCategory: CategoryDto = {
			key: interactiveSessionCategory.key,
			name: { key: 'InteractiveSession', value: 'Different Name' },
		};

		assert.throws(() => mergePolicyData([
			{ source: 'Workbench', data: catalog([]) },
			{ source: 'Agents window', data: catalog([], [conflictingCategory]) },
		]), /Policy category 'InteractiveSession' differs between 'Workbench' and 'Agents window'\./);
	});

	test('rejects duplicate policy keys within an entrypoint', () => {
		assert.throws(() => mergePolicyData([
			{
				source: 'Workbench',
				data: catalog([
					policy('chat.shared', 'SharedPolicy'),
					policy('chat.shared', 'SharedPolicy'),
				]),
			},
		]), /Policy key 'chat\.shared' occurs more than once in 'Workbench'\./);
	});

	test('rejects a policy name owned by different setting keys', () => {
		assert.throws(() => mergePolicyData([
			{ source: 'Workbench', data: catalog([policy('chat.workbench', 'SharedPolicy')]) },
			{ source: 'Agents window', data: catalog([policy('chat.agents', 'SharedPolicy')]) },
		]), /Policy name 'SharedPolicy' is owned by both 'chat\.workbench' in 'Workbench' and 'chat\.agents' in 'Agents window'\./);
	});
});
