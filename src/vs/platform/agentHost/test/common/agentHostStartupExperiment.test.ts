/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getAgentHostStartupExperiment } from '../../common/agentHostStartupExperiment.js';

suite('Agent Host startup experiment gate', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	for (const mode of [undefined, 'baseline', 'overlap', 'prewarm', 'prewarm-tools', 'invalid']) {
		for (const automation of [undefined, '0', '1']) {
			for (const dummyAuth of [undefined, '0', '1']) {
				test(`mode=${mode}, automation=${automation}, dummyAuth=${dummyAuth}`, () => {
					assert.strictEqual(getAgentHostStartupExperiment({
						VSCODE_AGENT_HOST_STARTUP_EXPERIMENT: mode,
						IS_SCENARIO_AUTOMATION: automation,
						EVAL_AHP_DUMMY_AUTH: dummyAuth,
					}), automation === '1' && dummyAuth === '1' && ['overlap', 'prewarm', 'prewarm-tools'].includes(mode ?? '') ? mode : undefined);
				});
			}
		}
	}
});
