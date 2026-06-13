/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import { tmpdir } from 'os';
import { Event } from '../../../../../base/common/event.js';
import { Schemas } from '../../../../../base/common/network.js';
import { join } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { Promises } from '../../../../../base/node/pfs.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getRandomTestPath } from '../../../../../base/test/node/testUtils.js';
import { IChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { INativeEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IMainProcessService } from '../../../../../platform/ipc/common/mainProcessService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { getWorkspaceIdentifier } from '../../../../../platform/workspaces/common/workspaceIdentifier.js';
import { UnusedWorkspaceStorageDataCleaner } from '../../../../electron-utility/sharedProcess/contrib/storageDataCleaner.js';

suite('UnusedWorkspaceStorageDataCleaner', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let testDir: string;

	setup(async () => {
		testDir = getRandomTestPath(tmpdir(), 'vsctests', 'storageDataCleaner');
		await fs.promises.mkdir(testDir, { recursive: true });
	});

	teardown(async () => {
		await Promises.rm(testDir);
	});

	test('preserves agents window workspace storage', async () => {
		const agentSessionsWorkspace = URI.file(join(testDir, 'agent-sessions.code-workspace'));
		const agentsWindowFolder = getWorkspaceIdentifier(agentSessionsWorkspace).id;
		const md5LikeFolder = '0'.repeat(32); // simulates a real (non-empty) workspace
		const otherEmptyFolder = 'random-empty-id';

		const workspaceStorageHome = join(testDir, 'workspaceStorage');
		await fs.promises.mkdir(workspaceStorageHome);
		for (const folder of [agentsWindowFolder, md5LikeFolder, 'ext-dev', otherEmptyFolder]) {
			await fs.promises.mkdir(join(workspaceStorageHome, folder));
		}

		const environmentService = {
			workspaceStorageHome: URI.file(workspaceStorageHome).with({ scheme: Schemas.file }),
			agentSessionsWorkspace
		} as INativeEnvironmentService;

		const nativeHostService = {
			getWindows: async () => []
		} as Partial<INativeHostService> as INativeHostService;

		const stubChannel: IChannel = {
			call: async <T>(): Promise<T> => false as unknown as T,
			listen: () => Event.None
		};
		const mainProcessService: IMainProcessService = {
			_serviceBrand: undefined,
			getChannel: () => stubChannel,
			registerChannel: () => { }
		};

		const cleaner = disposables.add(new UnusedWorkspaceStorageDataCleaner(environmentService, new NullLogService(), nativeHostService, mainProcessService));
		await cleaner.cleanUpStorage();

		const remaining = (await Promises.readdir(workspaceStorageHome)).sort();
		assert.deepStrictEqual(remaining, [agentsWindowFolder, md5LikeFolder, 'ext-dev'].sort());
	});
});
