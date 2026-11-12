/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AGENT_HOST_SCHEME, toAgentHostUri } from '../../../agentHost/common/agentHostUri.js';
import { computeFileTrust, IWindowFileTrust, normalizeRemoteFilePath } from '../../electron-main/browserSessionFiles.js';

suite('computeFileTrust', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function window(_windowId: number, remoteAuthority: string | undefined, trustAllFiles: boolean, roots: URI[]): IWindowFileTrust {
		return { remoteAuthority, trustAllFiles, trustedFileRoots: roots };
	}

	function snapshot(windows: IWindowFileTrust[]) {
		const { local, remotes } = computeFileTrust(windows);
		return {
			local: { roots: [...local.roots], trustAll: local.trustAll },
			remotes: Object.fromEntries([...remotes].map(([authority, remote]) => [authority, { ...remote, roots: [...remote.roots] }])),
		};
	}

	test('applies remote roots only to the window\'s own authority', () => {
		const remoteRoot = (authority: string, path: string) => URI.from({ scheme: Schemas.vscodeRemote, authority, path });

		assert.deepStrictEqual(snapshot([
			window(1, 'Test+A', false, [remoteRoot('test+a', '/mine'), remoteRoot('test+b', '/other'), URI.file('/local')]),
		]), {
			local: { roots: [URI.file('/local').fsPath], trustAll: false },
			remotes: { 'test+a': { roots: ['/mine'], trustAll: false, scheme: Schemas.vscodeRemote } },
		});
	});

	test('ignores agent host roots that have a file authority', () => {
		const { remotes } = computeFileTrust([window(1, undefined, false, [
			toAgentHostUri(URI.from({ scheme: Schemas.file, authority: 'server', path: '/share' }), 'host-a'),
			toAgentHostUri(URI.file('/repo'), 'host-a'),
		])]);
		assert.deepStrictEqual([...remotes.get('host-a')!.roots], ['/repo']);
	});

	test('ignores remote roots containing backslashes', () => {
		const { remotes } = computeFileTrust([window(1, 'Test+A', false, [URI.from({ scheme: Schemas.vscodeRemote, authority: 'test+a', path: '/ok' }), URI.from({ scheme: Schemas.vscodeRemote, authority: 'test+a', path: '/foo\\bar' })])]);
		assert.deepStrictEqual([...remotes.get('test+a')!.roots], ['/ok']);
	});

	test('does not let a remote window\'s trust-all reach local files', () => {
		assert.deepStrictEqual(snapshot([
			window(1, 'test+a', true, []),
			window(2, undefined, false, [URI.file('/local')]),
		]), {
			local: { roots: [URI.file('/local').fsPath], trustAll: false },
			remotes: { 'test+a': { roots: [], trustAll: true, scheme: Schemas.vscodeRemote } },
		});

		assert.strictEqual(snapshot([window(2, undefined, true, [])]).local.trustAll, true);
	});

	test('keys agent host roots by host', () => {
		assert.deepStrictEqual(snapshot([
			window(3, undefined, true, [
				toAgentHostUri(URI.file('/repo'), 'Host-A'),
				toAgentHostUri(URI.file('/other'), 'host-b'),
				toAgentHostUri(URI.from({ scheme: 'https', authority: 'example.com', path: '/web' }), 'host-a'),
			]),
		]), {
			local: { roots: [], trustAll: true },
			remotes: {
				'host-a': { roots: ['/repo'], trustAll: false, scheme: AGENT_HOST_SCHEME },
				'host-b': { roots: ['/other'], trustAll: false, scheme: AGENT_HOST_SCHEME },
			},
		});
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
