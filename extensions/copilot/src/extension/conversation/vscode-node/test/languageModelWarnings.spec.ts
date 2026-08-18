/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { resolveModelWarnings } from '../../common/languageModelAccess';

const DEPRECATION = 'Claude Sonnet 4.6 has a planned deprecation date of 2026-09-01.';
const DEGRADATION = 'This model is currently degraded.';

describe('resolveModelWarnings', () => {
	it('flags a pending deprecation even though it arrives without a degradation', () => {
		expect(resolveModelWarnings({ warningText: { model_pending_deprecation: DEPRECATION } })).toEqual({
			texts: { model_pending_deprecation: DEPRECATION },
			primary: DEPRECATION,
		});
	});

	it('lets a degradation explain the model even when other warnings are present', () => {
		expect(resolveModelWarnings({
			warningText: { data_retention: 'Prompts are retained for 30 days.' },
			degradationReason: DEGRADATION,
		})).toEqual({
			texts: { data_retention: 'Prompts are retained for 30 days.', degradation: DEGRADATION },
			primary: DEGRADATION,
		});
	});

	it('has no warning presentation when the model carries no warnings', () => {
		expect(resolveModelWarnings({})).toBeUndefined();
	});
});
