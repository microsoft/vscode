/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { promises as fs } from 'fs';
import { parse } from '../../../../base/common/json.js';
import { FileAccess } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { agentHostPolicySupport } from '../../common/agentHostPolicySupport.js';

interface IExportedPolicy {
	readonly name: string;
	readonly agentHost?: { readonly status: string };
}

suite('agentHostPolicySupport', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('matches the exported policy catalog', async () => {
		const policyDataPath = URI.joinPath(FileAccess.asFileUri(''), '../build/lib/policies/policyData.jsonc').fsPath;
		const policyData = parse(await fs.readFile(policyDataPath, 'utf8')) as { policies: IExportedPolicy[] };

		const exported = Object.fromEntries(policyData.policies.map(policy => [policy.name, policy.agentHost?.status]));
		const declared = Object.fromEntries(Object.entries(agentHostPolicySupport).map(([name, support]) => [name, support.status]));

		// Run `npm run export-policy-data` after changing either side.
		assert.deepStrictEqual(exported, declared);
	});
});

