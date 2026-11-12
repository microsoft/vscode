/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AGENT_HOST_SCHEME } from '../../../agentHost/common/agentHostUri.js';
import { IBrowserViewRemoteNetwork } from '../../common/browserView.js';
import { computeRemoteFileTrust, createRemoteRootTree, normalizeRemoteFilePath } from '../../electron-main/browserSessionFiles.js';

suite('computeRemoteFileTrust', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const proxy = { port: 1, username: 'u', password: 'p' } as unknown as IBrowserViewRemoteNetwork['proxy'];

	function network(trustedRoots: string[], options: Partial<IBrowserViewRemoteNetwork> = {}): IBrowserViewRemoteNetwork {
		return { proxy, scheme: AGENT_HOST_SCHEME, trustedRoots, trustAllFiles: false, caseSensitive: true, ...options };
	}

	test('merges what windows contribute per authority', () => {
		const remotes = computeRemoteFileTrust([
			{ 'Host-A': network(['/repo']), 'host-b': network(['/other'], { caseSensitive: false }) },
			{ 'host-a': network(['/more', '/bad\\root'], { trustAllFiles: true, caseSensitive: false }) },
			undefined,
		]);
		assert.deepStrictEqual(Object.fromEntries([...remotes].map(([authority, remote]) => [authority, { ...remote, roots: [...remote.roots] }])), {
			'host-a': { roots: ['/repo', '/more'], trustAll: true, scheme: AGENT_HOST_SCHEME, caseSensitive: false },
			'host-b': { roots: ['/other'], trustAll: false, scheme: AGENT_HOST_SCHEME, caseSensitive: false },
		});
	});
});

suite('createRemoteRootTree', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('ignores case only for case-insensitive remotes', () => {
		const request = '/C:/Users/me/web-example/index.html';
		const roots = ['/c:/Users/me/web-example'];
		assert.deepStrictEqual({
			insensitive: !!createRemoteRootTree(roots, false).findSubstr(request),
			sensitive: !!createRemoteRootTree(roots, true).findSubstr(request),
			sibling: !!createRemoteRootTree(roots, false).findSubstr('/c:/Users/me/web-example2/index.html'),
		}, { insensitive: true, sensitive: false, sibling: false });
	});
});

suite('normalizeRemoteFilePath', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('normalizes dot segments and rejects backslashes', () => {
		assert.deepStrictEqual({
			dotSegments: normalizeRemoteFilePath('/trusted/a/../b.html'),
			escapes: normalizeRemoteFilePath('/trusted/../secret'),
			backslash: normalizeRemoteFilePath('/c:/trusted/..\\secret.txt'),
		}, {
			dotSegments: '/trusted/b.html',
			escapes: '/secret',
			backslash: undefined,
		});
	});
});
