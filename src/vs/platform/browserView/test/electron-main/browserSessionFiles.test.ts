/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AGENT_HOST_SCHEME, toAgentHostUri } from '../../../agentHost/common/agentHostUri.js';
import { computeFileTrust, IWindowFileTrust } from '../../electron-main/browserSessionFiles.js';

suite('computeFileTrust', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function window(windowId: number, remoteAuthority: string | undefined, trustAllFiles: boolean, roots: URI[]): IWindowFileTrust {
		return { windowId, remoteAuthority, trustAllFiles, trustedFileRoots: roots };
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
			remotes: { 'test+a': { roots: ['/mine'], trustAll: false, windowId: 1, scheme: Schemas.vscodeRemote } },
		});
	});

	test('does not let a remote window\'s trust-all reach local files', () => {
		assert.deepStrictEqual(snapshot([
			window(1, 'test+a', true, []),
			window(2, undefined, false, [URI.file('/local')]),
		]), {
			local: { roots: [URI.file('/local').fsPath], trustAll: false },
			remotes: { 'test+a': { roots: [], trustAll: true, windowId: 1, scheme: Schemas.vscodeRemote } },
		});

		assert.strictEqual(snapshot([window(2, undefined, true, [])]).local.trustAll, true);
	});

	test('keys agent host roots by host and records the contributing window', () => {
		assert.deepStrictEqual(snapshot([
			window(3, undefined, true, [
				toAgentHostUri(URI.file('/repo'), 'Host-A'),
				toAgentHostUri(URI.file('/other'), 'host-b'),
				toAgentHostUri(URI.from({ scheme: 'https', authority: 'example.com', path: '/web' }), 'host-a'),
			]),
		]), {
			local: { roots: [], trustAll: true },
			remotes: {
				'host-a': { roots: ['/repo'], trustAll: false, windowId: 3, scheme: AGENT_HOST_SCHEME },
				'host-b': { roots: ['/other'], trustAll: false, windowId: 3, scheme: AGENT_HOST_SCHEME },
			},
		});
	});
});
