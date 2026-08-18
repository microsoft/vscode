/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isDeepStrictEqual } from 'util';
import type { CategoryDto, ExportedPolicyDataDto, PolicyDto } from './policyDto.ts';

export interface NamedPolicyData {
	readonly source: string;
	readonly data: ExportedPolicyDataDto;
}

function mergeCategories(inputs: readonly NamedPolicyData[]): CategoryDto[] {
	const categories = new Map<string, { source: string; category: CategoryDto }>();

	for (const input of inputs) {
		for (const category of input.data.categories) {
			const existing = categories.get(category.key);
			if (existing && !isDeepStrictEqual(existing.category, category)) {
				throw new Error(`Policy category '${category.key}' differs between '${existing.source}' and '${input.source}'.`);
			}
			categories.set(category.key, { source: input.source, category });
		}
	}

	return [...categories.values()]
		.map(({ category }) => category)
		.sort((a, b) => a.key.localeCompare(b.key));
}

function withoutReferences(policy: PolicyDto): PolicyDto {
	const { referencedSettings: _, ...metadata } = policy;
	return metadata;
}

function mergePolicies(inputs: readonly NamedPolicyData[]): PolicyDto[] {
	const policies = new Map<string, { source: string; policy: PolicyDto; references: Set<string> }>();
	const policyNames = new Map<string, { source: string; key: string }>();

	for (const input of inputs) {
		const sourceKeys = new Set<string>();
		for (const policy of input.data.policies) {
			if (sourceKeys.has(policy.key)) {
				throw new Error(`Policy key '${policy.key}' occurs more than once in '${input.source}'.`);
			}
			sourceKeys.add(policy.key);

			const existingName = policyNames.get(policy.name);
			if (existingName && existingName.key !== policy.key) {
				throw new Error(`Policy name '${policy.name}' is owned by both '${existingName.key}' in '${existingName.source}' and '${policy.key}' in '${input.source}'.`);
			}
			policyNames.set(policy.name, { source: input.source, key: policy.key });

			const existing = policies.get(policy.key);
			if (existing) {
				if (!isDeepStrictEqual(withoutReferences(existing.policy), withoutReferences(policy))) {
					throw new Error(`Policy '${policy.key}' differs between '${existing.source}' and '${input.source}'.`);
				}
				for (const reference of policy.referencedSettings ?? []) {
					existing.references.add(reference);
				}
			} else {
				policies.set(policy.key, {
					source: input.source,
					policy,
					references: new Set(policy.referencedSettings),
				});
			}
		}
	}

	return [...policies.values()]
		.map(({ policy, references }) => {
			const referencedSettings = [...references].sort();
			return referencedSettings.length > 0
				? { ...policy, referencedSettings }
				: withoutReferences(policy);
		})
		.sort((a, b) => a.key.localeCompare(b.key));
}

export function mergePolicyData(inputs: readonly NamedPolicyData[]): ExportedPolicyDataDto {
	if (inputs.length === 0) {
		throw new Error('At least one policy catalog is required.');
	}

	return {
		categories: mergeCategories(inputs),
		policies: mergePolicies(inputs),
	};
}
