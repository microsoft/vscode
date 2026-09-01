/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getAgentsVoicePolicyValue } from '../../common/agentsVoice.js';

suite('Voice Mode policy', () => {

	test('disables Voice Mode when preview features are disabled by policy', () => {
		assert.deepStrictEqual([
			getAgentsVoicePolicyValue({ chat_preview_features_enabled: false }),
			getAgentsVoicePolicyValue({ chat_preview_features_enabled: true }),
			getAgentsVoicePolicyValue({}),
		], [
			false,
			undefined,
			undefined,
		]);
	});
});
