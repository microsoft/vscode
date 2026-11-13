/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AGENT_HOST_SCHEME } from '../../../agentHost/common/agentHostUri.js';
import { IBrowserViewRemoteNetwork } from '../../common/browserView.js';
import { authorizeRemoteFilePath, computeRemoteFileAccess, normalizeRemoteFilePath } from '../../electron-main/browserSessionFiles.js';

suite('computeRemoteFileAccess', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const proxy = { port: 1, username: 'u', password: 'p' } as unknown as IBrowserViewRemoteNetwork['proxy'];

	function network(trustedRoots: string[], options: Partial<IBrowserViewRemoteNetwork> = {}): IBrowserViewRemoteNetwork {
		return { proxy, scheme: AGENT_HOST_SCHEME, trustedRoots, trustAllFiles: false, caseSensitive: true, ...options };
	}

	test('merges what windows contribute per authority', () => {
		const remotes = computeRemoteFileAccess([
			{ 'Host-A': network(['/repo']), 'host-b': network(['/other'], { caseSensitive: false }) },
			{ 'Host-A': network(['/more', '/bad\\root'], { trustAllFiles: true, caseSensitive: false }) },
			undefined,
		]);
		const paths = ['/repo/a', '/REPO/a', '/more/a', '/bad/a', '/other/a', '/OTHER/a'];
		assert.deepStrictEqual(Object.fromEntries([...remotes].map(([authority, remote]) => [authority, {
			trustAllFiles: remote.trustAllFiles, scheme: remote.scheme, caseSensitive: remote.caseSensitive,
			trusted: paths.filter(path => remote.roots.findSubstr(path)),
		}])), {
			'Host-A': { trustAllFiles: true, scheme: AGENT_HOST_SCHEME, caseSensitive: false, trusted: ['/repo/a', '/REPO/a', '/more/a'] },
			'host-b': { trustAllFiles: false, scheme: AGENT_HOST_SCHEME, caseSensitive: false, trusted: ['/other/a', '/OTHER/a'] },
		});
	});

	test('treats a root of the whole file system as trusting every file', () => {
		const access = computeRemoteFileAccess([{ host: network(['/']) }]).get('host')!;
		assert.deepStrictEqual({ trustAllFiles: access.trustAllFiles }, { trustAllFiles: true });
	});

	test('ignores case only for case-insensitive remotes', () => {
		const request = '/C:/Users/me/web-example/index.html';
		const trust = (caseSensitive: boolean) => computeRemoteFileAccess([{ host: network(['/c:/Users/me/web-example'], { caseSensitive }) }]).get('host')!.roots;
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

suite('authorizeRemoteFilePath', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('only authorizes paths of the remote under its trusted roots', () => {
		const access = computeRemoteFileAccess([{ host: { proxy: undefined as unknown as IBrowserViewRemoteNetwork['proxy'], scheme: AGENT_HOST_SCHEME, trustedRoots: ['/share'], trustAllFiles: false, caseSensitive: true } }]).get('host');
		const authorize = (uri: string) => authorizeRemoteFilePath(access!, URI.parse(uri));
		assert.deepStrictEqual({
			inside: authorize('file:///share/a/../index.html'),
			outside: authorize('file:///share/../secret'),
			networkShare: authorize('file://server/share/index.html'),
		}, { inside: '/share/index.html', outside: undefined, networkShare: undefined });
	});
});
