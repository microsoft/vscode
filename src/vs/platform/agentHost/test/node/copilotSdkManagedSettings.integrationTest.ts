/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CopilotClient } from '@github/copilot-sdk';
import { existsSync } from 'fs';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from '../../../../base/common/path.js';
import { assertSnapshot } from '../../../../base/test/common/snapshot.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { createCopilotCliEnvironment } from '../../node/copilot/copilotCliEnvironment.js';
import { AgentHostUpdateAhpSnapshotsEnvVar, snapshotPathForTest } from './e2e/harness/ahpSnapshot.js';
import { createIsolatedProviderEnvironment } from './providerTestEnvironment.js';

suite('Copilot SDK - managed settings', function () {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('bundled managedSettings.schema matches the snapshot', async function () {
		this.timeout(60_000);
		const home = await mkdtemp(join(tmpdir(), 'copilot-managed-schema-'));
		const client = new CopilotClient({
			mode: 'empty',
			baseDirectory: home,
			useLoggedInUser: false,
			env: createCopilotCliEnvironment(createIsolatedProviderEnvironment(home, {
				PATH: process.env.PATH,
				SystemRoot: process.env.SystemRoot,
				WINDIR: process.env.WINDIR,
				COPILOT_TELEMETRY_ENABLED: 'false',
			})),
		});
		try {
			await client.start();
			const result = await client.rpc.managedSettings.schema();
			assert.ok(result.schema && typeof result.schema === 'object' && !Array.isArray(result.schema));
			const content = JSON.stringify(result, null, '\t') + '\n';
			const snapshotPath = snapshotPathForTest(this.test!, 'schema', 'json');
			if (process.env[AgentHostUpdateAhpSnapshotsEnvVar] === '1') {
				await mkdir(dirname(snapshotPath), { recursive: true });
				await writeFile(snapshotPath, content);
			} else {
				assert.ok(existsSync(snapshotPath), `Missing schema baseline. Generate it with ${AgentHostUpdateAhpSnapshotsEnvVar}=1 and review the result.`);
				await assertSnapshot(content, { name: 'schema', extension: 'json' });
			}
		} finally {
			try {
				await client.stop();
			} finally {
				await rm(home, { recursive: true, force: true });
			}
		}
	});
});
