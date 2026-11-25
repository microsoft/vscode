/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { readlink } from 'fs/promises';
import { isWindows } from '../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { NullLogService } from '../../../platform/log/common/log.js';
import { ServerAgentHostEnvironment } from '../../node/serverAgentHostEnvironment.js';

suite('ServerAgentHostEnvironment', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const editor = { remoteAuthority: 'dev-container+test', clientId: 'editor' };
	const agents = { remoteAuthority: 'dev-container+test', clientId: 'agents' };

	test('crash restarts use only a connected window\'s launch overrides', async () => {
		const snapshots: object[] = [];
		const environment = store.add(new ServerAgentHostEnvironment((env, debugEnv) => snapshots.push({ env, debugEnv }), new NullLogService()));
		const first = { env: { FIRST: 'first' }, debugEnv: { DEBUG_ONLY: 'debug' } };
		const second = { env: { SECOND: 'second', REMOVED: null } };
		await environment.update(editor, first);
		await environment.update(agents, second);
		await environment.remove(agents);
		await environment.remove(editor);

		assert.deepStrictEqual(snapshots, [first, { ...second, debugEnv: undefined }, first, { env: {}, debugEnv: undefined }]);
	});

	(isWindows ? test.skip : test)('inherited socket paths follow a live resolver across connects, removals and restarts', async () => {
		let launch: Readonly<Record<string, string | null>> = {};
		const environment = store.add(new ServerAgentHostEnvironment(env => launch = env, new NullLogService()));
		const first = { REMOTE_CONTAINERS_IPC: '/first/git', SSH_AUTH_SOCK: '/first/ssh' };
		const second = { REMOTE_CONTAINERS_IPC: '/second/git', SSH_AUTH_SOCK: '/second/ssh' };
		await environment.update(editor, { env: first, debugEnv: { SSH_AUTH_SOCK: '/debug/ssh' } });
		const inherited = launch;
		const targets = (env = inherited) => Promise.all([readlink(env.REMOTE_CONTAINERS_IPC!), readlink(env.SSH_AUTH_SOCK!)]);
		await environment.update(agents, { env: {} });
		assert.deepStrictEqual(await targets(), Object.values(first));
		await environment.update(agents, { env: second });
		assert.deepStrictEqual(await targets(), Object.values(second));

		await environment.update(agents, { debugEnv: second, env: { REMOTE_CONTAINERS_IPC: null, SSH_AUTH_SOCK: '' } });
		assert.deepStrictEqual(launch, { REMOTE_CONTAINERS_IPC: null, SSH_AUTH_SOCK: '' });
		await assert.rejects(readlink(inherited.REMOTE_CONTAINERS_IPC!), { code: 'ENOENT' });
		await environment.remove(agents);
		assert.deepStrictEqual(await targets(), Object.values(first));
		await environment.remove(editor);
		await assert.rejects(readlink(inherited.SSH_AUTH_SOCK!), { code: 'ENOENT' });
		const restarted = launch;
		await environment.update(agents, { debugEnv: second });

		assert.deepStrictEqual(await targets(restarted), Object.values(second));
	});
});
