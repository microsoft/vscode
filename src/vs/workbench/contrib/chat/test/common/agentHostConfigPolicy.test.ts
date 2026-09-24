/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { hydraFusionPolicyValue } from '../../common/agentHostConfigPolicy.js';

suite('AgentHostConfigPolicy', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('disables HydraFusion when preview features are disabled by policy', () => {
		assert.deepStrictEqual([
			hydraFusionPolicyValue({ chat_preview_features_enabled: false }),
			hydraFusionPolicyValue({ chat_preview_features_enabled: true }),
			hydraFusionPolicyValue({}),
		], [
			false,
			undefined,
			undefined,
		]);
	});
});
