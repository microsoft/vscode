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

	let home: string;
	let client: CopilotClient;

	setup(async function () {
		this.timeout(60_000);
		home = await mkdtemp(join(tmpdir(), 'copilot-managed-settings-'));
		client = new CopilotClient({
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
		await client.start();
	});

	teardown(async function () {
		this.timeout(60_000);
		try {
			await client?.stop();
		} finally {
			if (home) {
				await rm(home, { recursive: true, force: true });
			}
		}
	});

	test('bundled managedSettings.schema matches the snapshot', async function () {
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
	});

	type Composition = Awaited<ReturnType<CopilotClient['rpc']['managedSettings']['compose']>>;
	const cases: {
		name: string;
		layers: Parameters<CopilotClient['rpc']['managedSettings']['compose']>[0]['layers'];
		values: Composition['values'];
		meta: Composition['meta'];
		warnings: string[];
	}[] = [
			{
				name: 'reports model options with independent lock and default metadata',
				layers: [{ source: 'server', settings: { model: 'gpt-5', effortLevel: 'high', contextTier: { overridable: 'long_context' } } }],
				values: { model: 'gpt-5', effortLevel: 'high', contextTier: 'long_context' },
				meta: {
					model: { overridable: true, source: 'server' },
					effortLevel: { overridable: false, source: 'server' },
					contextTier: { overridable: true, source: 'server' },
				},
				warnings: [],
			},
			{
				name: 'does not attach weaker model options to a stronger model default',
				layers: [
					{ source: 'server', settings: { model: 'gpt-5', effortLevel: 'high', contextTier: 'long_context' } },
					{ source: 'device', settings: { model: 'gpt-4o' } },
				],
				values: { model: 'gpt-4o' },
				meta: { model: { overridable: true, source: 'device' } },
				warnings: [],
			},
			{
				name: 'takes options from the model source rather than a stronger options-only source',
				layers: [
					{ source: 'device', settings: { effortLevel: 'low' } },
					{ source: 'server', settings: { model: 'gpt-5', effortLevel: { overridable: 'high' } } },
				],
				values: { model: 'gpt-5', effortLevel: 'high' },
				meta: {
					model: { overridable: true, source: 'server' },
					effortLevel: { overridable: true, source: 'server' },
				},
				warnings: ['device.effortLevel'],
			},
			{
				name: 'drops concrete-model options for Auto while retaining the routing default',
				layers: [{ source: 'server', settings: { model: 'auto', effortLevel: 'high', contextTier: 'long_context', autoTier: { overridable: 'intelligence' } } }],
				values: { model: 'auto', autoTier: 'intelligence', ensembleTier: 'high' },
				meta: {
					model: { overridable: true, source: 'server' },
					autoTier: { overridable: true, source: 'server' },
					ensembleTier: { overridable: true, source: 'server' },
				},
				warnings: ['server.contextTier', 'server.effortLevel'],
			},
			{
				name: 'does not turn options without a managed model into global defaults',
				layers: [{ source: 'server', settings: { effortLevel: 'high', contextTier: 'long_context' } }],
				values: undefined,
				meta: undefined,
				warnings: ['server.contextTier', 'server.effortLevel'],
			},
			{
				name: 'does not mistake policy composition for model availability validation',
				layers: [{ source: 'server', settings: { model: 'unavailable-model', effortLevel: 'unsupported-effort' } }],
				values: { model: 'unavailable-model', effortLevel: 'unsupported-effort' },
				meta: {
					model: { overridable: true, source: 'server' },
					effortLevel: { overridable: false, source: 'server' },
				},
				warnings: [],
			},
		];

	for (const { name, layers, values, meta, warnings } of cases) {
		test(`bundled model policy ${name}`, async () => {
			const result = await client.rpc.managedSettings.compose({ layers });
			assert.deepStrictEqual({
				values: result.values,
				meta: result.meta,
				diagnostics: result.diagnostics.map(diagnostic => ({ path: diagnostic.path, severity: diagnostic.severity })).sort((a, b) => a.path.localeCompare(b.path)),
			}, {
				values,
				meta,
				diagnostics: warnings.map(path => ({ path, severity: 'warning' })),
			});
		});
	}
});
