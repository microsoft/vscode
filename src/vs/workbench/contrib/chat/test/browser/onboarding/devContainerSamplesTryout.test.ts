/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { createDevContainerSamplesTryout } from '../../../browser/onboarding/devContainerSamplesTryout.contribution.js';

suite('Dev Container samples tryout registration', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('routes an AI-gated, payload-free tryout to Agents with explicit setup guidance', () => {
		const tryout = createDevContainerSamplesTryout();
		assert.deepStrictEqual({
			id: tryout.id,
			isAI: tryout.isAI,
			targetWindow: tryout.targetWindow,
			when: tryout.when?.serialize(),
			presentation: tryout.presentation,
			setup: tryout.setup,
		}, {
			id: 'chat.devContainerSamples',
			isAI: true,
			targetWindow: 'agents',
			when: 'chatIsEnabled',
			presentation: { kind: 'devContainerSamples', payload: undefined },
			setup: { label: 'Set Up Chat', command: { id: 'workbench.action.chat.triggerSetup' } },
		});
	});
});
