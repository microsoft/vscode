/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtemp, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { retry } from '../../../../../../base/common/async.js';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { AgentHostE2EServerLease, createRealSession, driveTurnToCompletion, removeTempDirs } from '../harness/agentHostE2ETestHarness.js';
import { TestProtocolClient } from '../../serverIntegrationTestHelpers.js';
import { COPILOT_CONFIG } from './copilotTestConfiguration.js';

suite('Agent Host E2E — Copilot OTel file exporter', function () {
	let client: TestProtocolClient;
	let lease: AgentHostE2EServerLease | undefined;
	const createdSessions: string[] = [];
	const tempDirs: string[] = [];
	let exportFile: string;
	let savedEnv: Record<string, string | undefined> | undefined;

	suiteSetup(async function () {
		this.timeout(60_000);
		const directory = await mkdtemp(join(tmpdir(), 'copilot-otel-e2e-'));
		tempDirs.push(directory);
		exportFile = join(directory, 'spans.jsonl');
		savedEnv = {
			COPILOT_OTEL_ENABLED: process.env['COPILOT_OTEL_ENABLED'],
			COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED: process.env['COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED'],
			COPILOT_OTEL_EXPORTER_TYPE: process.env['COPILOT_OTEL_EXPORTER_TYPE'],
			COPILOT_OTEL_FILE_EXPORTER_PATH: process.env['COPILOT_OTEL_FILE_EXPORTER_PATH'],
			OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT: process.env['OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT'],
		};
		process.env['COPILOT_OTEL_ENABLED'] = 'true';
		process.env['COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED'] = 'true';
		process.env['COPILOT_OTEL_EXPORTER_TYPE'] = 'file';
		process.env['COPILOT_OTEL_FILE_EXPORTER_PATH'] = exportFile;
		process.env['OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT'] = 'true';
		lease = new AgentHostE2EServerLease(COPILOT_CONFIG);
	});

	setup(async function () {
		this.timeout(60_000);
		if (!lease) {
			throw new Error('OTel E2E server lease was not initialized');
		}
		({ client } = await lease.acquire(this.currentTest?.title ?? 'unknown'));
	});

	teardown(async function () {
		this.timeout(120_000);
		await lease?.release(createdSessions, this.currentTest?.state === 'failed');
	});

	suiteTeardown(async function () {
		this.timeout(120_000);
		const errors: Error[] = [];
		try {
			await lease?.dispose();
		} catch (error) {
			errors.push(error instanceof Error ? error : new Error(String(error)));
		}
		if (savedEnv) {
			for (const [key, value] of Object.entries(savedEnv)) {
				if (value === undefined) {
					delete process.env[key];
				} else {
					process.env[key] = value;
				}
			}
		}
		try {
			await removeTempDirs(tempDirs);
		} catch (error) {
			errors.push(error instanceof Error ? error : new Error(String(error)));
		}
		if (errors.length > 0) {
			throw new AggregateError(errors, 'Failed to dispose Copilot OTel E2E resources');
		}
	});

	test('provider turn exports SDK spans through the Agent Host file exporter', async function () {
		this.timeout(180_000);
		const workspace = await mkdtemp(join(tmpdir(), 'copilot-otel-turn-'));
		tempDirs.push(workspace);
		const sessionUri = await createRealSession(client, COPILOT_CONFIG, 'copilot-otel-turn', createdSessions, URI.file(workspace));

		await driveTurnToCompletion(client, sessionUri, 'turn-otel-export', 'Reply exactly "traced".', 1);
		await driveTurnToCompletion(client, sessionUri, 'turn-otel-title', '/rename OTel Captured Title', 10);
		const exported = await retry(async () => {
			const contents = await readFile(exportFile, 'utf8').catch(() => '');
			if (!contents.includes('"traceId"')
				|| !contents.includes('"spanId"')
				|| !contents.includes('vscode.agent_host.session.title_changed')
				|| !contents.includes('"name":"invoke_agent"')
				|| !contents.includes('"service.name":"github-copilot"')) {
				throw new Error(`OTel spans have not reached the file exporter: ${contents}`);
			}
			return contents;
		}, 100, 100);

		assert.ok(exported.split('\n').filter(Boolean).length > 0);
	});
});
