/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getAgentBranchNaming, getPersistedSessionConfigValues, omitAutomationSessionTemplateConfigValues, SessionConfigKey } from '../../common/sessionConfigKeys.js';

suite('Session config keys', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('config helpers retain prepared branch naming for persistence and omit it from automation templates', () => {
		const naming = { useGitSettings: true, preferredBranchName: 'team./quiet-otter' };
		const config = { [SessionConfigKey.WorktreeBranchNaming]: naming };
		assert.deepStrictEqual({
			persisted: getAgentBranchNaming(getPersistedSessionConfigValues(config, undefined)),
			automation: omitAutomationSessionTemplateConfigValues(config),
		}, { persisted: naming, automation: {} });
	});
});
