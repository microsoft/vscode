/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test } from 'vitest';
import { parseNewSessionPolicy } from '../../common/newSessionPolicy';

const control = {
	version: 1,
	experiment_id: 'auto_default_v1',
	assignment: 'control',
	assignment_context: 'fixture-auto-default:control',
};
const treatment = {
	version: 1,
	experiment_id: 'auto_default_v1',
	assignment: 'treatment',
	assignment_context: 'fixture-auto-default:treatment',
	default_model: 'auto',
};

describe('new session policy', () => {
	test('accepts the server control, treatment, and unassigned fixtures', () => {
		expect([
			parseNewSessionPolicy({}),
			parseNewSessionPolicy({ new_session_policy: control }),
			parseNewSessionPolicy({ new_session_policy: treatment }),
		]).toEqual([
			undefined,
			{ variant: 'control', assignmentContext: 'fixture-auto-default:control' },
			{ variant: 'treatment', assignmentContext: 'fixture-auto-default:treatment' },
		]);
	});

	test('ignores harmless version one extensions', () => {
		expect(parseNewSessionPolicy({ new_session_policy: { ...treatment, extra: true } })).toEqual({
			variant: 'treatment', assignmentContext: 'fixture-auto-default:treatment',
		});
	});

	test.each([
		null,
		[],
		{ new_session_policy: null },
		{ new_session_policy: { ...treatment, version: 2 } },
		{ new_session_policy: { ...treatment, experiment_id: 'different' } },
		{ new_session_policy: { ...treatment, assignment: 'unknown' } },
		{ new_session_policy: { ...treatment, default_model: 'different' } },
		{ new_session_policy: { ...treatment, default_model: undefined } },
		{ new_session_policy: { ...control, default_model: 'auto' } },
		{ new_session_policy: { ...treatment, assignment_context: '' } },
		{ new_session_policy: { ...treatment, assignment_context: '\n' } },
		{ new_session_policy: { ...treatment, assignment_context: 'a'.repeat(8193) } },
	])('rejects invalid or contradictory policy %#', response => {
		expect(() => parseNewSessionPolicy(response)).toThrow();
	});
});
