/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { formatAutoModeDetails, formatModelDetails } from '../../common/chatModelDetails';

describe('chat response footer details', () => {

	it('reports the user\'s choice for Auto rather than the model it picked', () => {
		// The resolved model and routing rationale are surfaced in the footer's
		// hover instead, so the footer must not leak the picked model name.
		const details = [
			formatAutoModeDetails(0.7, undefined),
			formatAutoModeDetails(1, undefined),
			formatAutoModeDetails(undefined, 2),
			formatAutoModeDetails(undefined, undefined),
		];

		expect(details).toEqual([
			'Auto • 0.7 credits',
			'Auto • 1 credit',
			'Auto • 2x',
			'Auto',
		]);
		expect(details.some(detail => detail.includes('GPT'))).toBe(false);
	});

	it('names the model for non-Auto picks', () => {
		expect([
			formatModelDetails('GPT-5.6 Luna', undefined, 0.7),
			formatModelDetails('GPT-5.6 Luna', 2, undefined),
		]).toEqual([
			'GPT-5.6 Luna • 0.7 credits',
			'GPT-5.6 Luna • 2x',
		]);
	});
});
