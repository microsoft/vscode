/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { OperatingSystem } from '../../../base/common/platform.js';
import { upcastPartial } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../base/test/common/virtualScheduling/runWithFakedTimers.js';
import { IDialogHandler } from '../../../platform/dialogs/common/dialogs.js';
import { IRemoteAgentEnvironment } from '../../../platform/remote/common/remoteAgentEnvironment.js';
import { showAboutDialog } from '../../common/dialogs.js';
import { IRemoteAgentConnection, IRemoteAgentService } from '../../services/remote/common/remoteAgentService.js';

suite('Workspace remote in About', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const about = { title: 'About', details: 'Local details (2 days ago)', detailsToCopy: 'Local details' };
	const connection = upcastPartial<IRemoteAgentConnection>({ isConnected: true, remoteAuthority: 'ssh-remote+private-host' });

	async function getDetails(remote: Partial<IRemoteAgentService>) {
		let result: typeof about | undefined;
		await showAboutDialog(upcastPartial<IDialogHandler>({
			about: async (title, details, detailsToCopy) => { result = { title, details, detailsToCopy }; }
		}), about, upcastPartial(remote));
		return result;
	}

	test('adds only the OS family and architecture to both outputs', async () => {
		const result = await getDetails({
			getConnection: () => connection,
			getEnvironment: async () => upcastPartial<IRemoteAgentEnvironment>({
				os: OperatingSystem.Linux, arch: 'arm64', connectionToken: 'private-token', execPath: '/private/bin/code'
			})
		});
		assert.deepStrictEqual(result, { title: 'About', details: 'Local details (2 days ago)\nRemote connection: SSH\nRemote OS: Linux arm64', detailsToCopy: 'Local details\nRemote connection: SSH\nRemote OS: Linux arm64' });
	});

	test('does not copy remote authority or arbitrary text from unknown values', async () => {
		const result = await getDetails({
			getConnection: () => upcastPartial<IRemoteAgentConnection>({ ...connection, remoteAuthority: 'private-host.example.com:1234' }),
			getEnvironment: async () => upcastPartial<IRemoteAgentEnvironment>({ os: OperatingSystem.Windows, arch: 'x64\nprivate-host' })
		});
		assert.deepStrictEqual(result, { title: 'About', details: 'Local details (2 days ago)\nRemote connection: Other\nRemote OS: Windows', detailsToCopy: 'Local details\nRemote connection: Other\nRemote OS: Windows' });
	});

	test('does not request the environment for local or disconnected windows', async () => {
		assert.deepStrictEqual(await getDetails({ getConnection: () => null }), about);
		assert.deepStrictEqual(await getDetails({ getConnection: () => upcastPartial<IRemoteAgentConnection>({ ...connection, isConnected: false }) }), {
			title: 'About',
			details: 'Local details (2 days ago)\nRemote connection: SSH',
			detailsToCopy: 'Local details\nRemote connection: SSH'
		});
	});

	test('still opens without waiting for the remote environment', () => runWithFakedTimers({}, async () => {
		for (const environment of [Promise.resolve(null), new Promise<null>(() => { })]) {
			assert.deepStrictEqual(await getDetails({ getConnection: () => connection, getEnvironment: () => environment }), {
				title: 'About',
				details: 'Local details (2 days ago)\nRemote connection: SSH',
				detailsToCopy: 'Local details\nRemote connection: SSH'
			});
		}
	}));
});
