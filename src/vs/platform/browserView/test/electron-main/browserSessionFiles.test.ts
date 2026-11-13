/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AGENT_HOST_SCHEME } from '../../../agentHost/common/agentHostUri.js';
import { IBrowserViewRemoteNetwork } from '../../common/browserView.js';
import { computeRemoteFileTrust, normalizeRemoteFilePath } from '../../electron-main/browserSessionFiles.js';

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
		const paths = ['/repo/a', '/REPO/a', '/more/a', '/bad/a', '/other/a', '/OTHER/a'];
		assert.deepStrictEqual(Object.fromEntries([...remotes].map(([authority, remote]) => [authority, {
			trustAll: remote.trustAll, scheme: remote.scheme, caseSensitive: remote.caseSensitive,
			trusted: paths.filter(path => remote.roots.findSubstr(path)),
		}])), {
			'host-a': { trustAll: true, scheme: AGENT_HOST_SCHEME, caseSensitive: false, trusted: ['/repo/a', '/REPO/a', '/more/a'] },
			'host-b': { trustAll: false, scheme: AGENT_HOST_SCHEME, caseSensitive: false, trusted: ['/other/a', '/OTHER/a'] },
		});
	});

	test('ignores case only for case-insensitive remotes', () => {
		const request = '/C:/Users/me/web-example/index.html';
		const trust = (caseSensitive: boolean) => computeRemoteFileTrust([{ host: network(['/c:/Users/me/web-example'], { caseSensitive }) }]).get('host')!.roots;
		assert.deepStrictEqual({
			insensitive: !!trust(false).findSubstr(request),
			sensitive: !!trust(true).findSubstr(request),
			sibling: !!trust(false).findSubstr('/c:/Users/me/web-example2/index.html'),
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
