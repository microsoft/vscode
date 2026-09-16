/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentSessionProviders } from '../../../browser/agentSessions/agentSessions.js';
import {
	filterDeletableAgentSessions,
	resolveContextMenuSessions,
	resolveSessionsFromViewFallback,
} from '../../../browser/agentSessions/agentSessionMultiSelect.js';
import { IAgentSession } from '../../../browser/agentSessions/agentSessionsModel.js';

suite('agentSessionMultiSelect', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function session(path: string, providerType: string = AgentSessionProviders.Local): IAgentSession {
		return { resource: URI.file(path), providerType } as IAgentSession;
	}

	suite('resolveContextMenuSessions', () => {
		test('returns full selection when clicked session matches by URI identity', () => {
			const a = session('/a');
			const b = session('/b');
			const clickedSameResourceDifferentObject = session('/a');
			const result = resolveContextMenuSessions(clickedSameResourceDifferentObject, [a, b]);
			assert.strictEqual(result.length, 2);
			assert.strictEqual(result[0], a);
			assert.strictEqual(result[1], b);
			assert.notStrictEqual(clickedSameResourceDifferentObject, a);
		});

		test('returns only clicked session when it is outside the selection', () => {
			const a = session('/a');
			const b = session('/b');
			const outside = session('/c');
			const result = resolveContextMenuSessions(outside, [a, b]);
			assert.deepStrictEqual(result.map(s => s.resource.toString()), [outside.resource.toString()]);
		});

		test('returns only clicked session when selection has a single item', () => {
			const a = session('/a');
			const result = resolveContextMenuSessions(a, [a]);
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0], a);
		});
	});

	suite('resolveSessionsFromViewFallback', () => {
		test('prefers selection over focus', () => {
			const selected = [session('/a'), session('/b')];
			const focused = [session('/c')];
			const result = resolveSessionsFromViewFallback(selected, focused);
			assert.strictEqual(result.length, 2);
			assert.strictEqual(result[0].resource.toString(), selected[0].resource.toString());
		});

		test('falls back to a single focused session when selection is empty', () => {
			const focused = [session('/a'), session('/b')];
			const result = resolveSessionsFromViewFallback([], focused);
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].resource.toString(), focused[0].resource.toString());
		});

		test('returns empty when neither selection nor focus exists', () => {
			assert.deepStrictEqual(resolveSessionsFromViewFallback([], []), []);
		});
	});

	suite('filterDeletableAgentSessions', () => {
		test('keeps local and agent-host sessions and drops others', () => {
			const local = session('/local', AgentSessionProviders.Local);
			const agentHost = session('/ah', AgentSessionProviders.AgentHostCopilot);
			const cloud = session('/cloud', AgentSessionProviders.Cloud);
			const result = filterDeletableAgentSessions([local, cloud, agentHost]);
			assert.strictEqual(result.length, 2);
			assert.strictEqual(result[0], local);
			assert.strictEqual(result[1], agentHost);
		});
	});
});
