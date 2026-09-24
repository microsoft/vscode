/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { isAgentHostWorkspaceTrusted } from '../../common/agentHostWorkspaceTrust.js';

suite('Agent Host workspace trust', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('missing trust is not authority, while explicitly disabled Workspace Trust trusts resources', () => {
		const resource = URI.file('/workspace/repo/file');
		assert.deepStrictEqual([
			isAgentHostWorkspaceTrusted(resource, undefined),
			isAgentHostWorkspaceTrusted(resource, { enabled: true, trustedUris: [] }),
			isAgentHostWorkspaceTrusted(resource, { enabled: false, trustedUris: [] }),
		], [false, false, true]);
	});

	test('trusted folders cover their descendants but not siblings, other authorities or other schemes', () => {
		const root = URI.file('/workspace/repo');
		const trust = { enabled: true, trustedUris: [root.toString()] };
		assert.deepStrictEqual([
			root,
			URI.joinPath(root, '.github/extensions/report/extension.mjs'),
			URI.file('/workspace/repo-other/extension.mjs'),
			root.with({ authority: 'other' }),
			root.with({ scheme: Schemas.vscodeRemote }),
		].map(resource => isAgentHostWorkspaceTrusted(resource, trust)), [true, true, false, false, false]);
	});

	test('malformed folder entries cannot grant trust or hide a valid folder entry', () => {
		const resource = URI.file('/workspace/repo/extension.mjs');
		assert.deepStrictEqual([
			isAgentHostWorkspaceTrusted(resource, { enabled: true, trustedUris: ['not a scheme:/workspace/repo'] }),
			isAgentHostWorkspaceTrusted(resource, { enabled: true, trustedUris: ['not a scheme:/workspace/repo', URI.file('/workspace/repo').toString()] }),
		], [false, true]);
	});
});
