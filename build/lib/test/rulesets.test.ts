/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { suite, test } from 'node:test';
import { findDrift } from '../../../.github/rulesets/rulesets.ts';

suite('Rulesets', () => {
	test('a live ruleset differs from its definition in the values and rules of the definition, and in the bypass actors only when they are visible', () => {
		const definition = {
			name: 'main merge queue',
			enforcement: 'active',
			bypass_actors: [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'pull_request' }],
			rules: [{ type: 'merge_queue', parameters: { max_entries_to_build: 8, grouping_strategy: 'HEADGREEN' } }],
		};
		const live = { ...definition, id: 1, created_at: '2026-11-12T00:00:00Z', rules: [{ type: 'merge_queue', parameters: { max_entries_to_build: 8, grouping_strategy: 'HEADGREEN', default_added_by_github: true } }] };
		assert.deepStrictEqual({
			matching: findDrift(definition, live),
			bypassActorsHidden: findDrift(definition, { ...live, bypass_actors: undefined }),
			changed: findDrift(definition, {
				...live,
				enforcement: 'disabled',
				bypass_actors: [],
				rules: [{ type: 'merge_queue', parameters: { max_entries_to_build: 4, grouping_strategy: 'HEADGREEN' } }, { type: 'deletion' }],
			}),
		}, {
			matching: [],
			bypassActorsHidden: [],
			changed: [
				'enforcement: expected "active", found "disabled"',
				'bypass_actors: expected [{"actor_id":5,"actor_type":"RepositoryRole","bypass_mode":"pull_request"}], found []',
				'rules.merge_queue.parameters.max_entries_to_build: expected 8, found 4',
				'rules.deletion: not in the definition',
			],
		});
	});
});
