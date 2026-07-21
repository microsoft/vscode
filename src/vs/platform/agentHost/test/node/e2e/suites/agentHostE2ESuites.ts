/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AgentHostE2EServerLease, type IAgentHostE2EProviderConfig, removeTempDirs } from '../harness/agentHostE2ETestHarness.js';
import type { TestProtocolClient } from '../../serverIntegrationTestHelpers.js';
import { defineCoreTests } from './coreSuite.js';
import { defineFileOperationsTests } from './fileOperationsSuite.js';
import { defineHostFeaturesTests } from './hostFeaturesSuite.js';
import { defineStateOperationsTests } from './stateOperationsSuite.js';
import { defineSubagentTests } from './subagentSuite.js';
import { defineTurnLifecycleTests } from './turnLifecycleSuite.js';
import { defineWorkspaceTests } from './workspaceSuite.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';

const RECORD = process.env['AGENT_HOST_REPLAY_RECORD'] === '1' || process.env['AGENT_HOST_UPDATE_SNAPSHOTS'] === '1';
const RUN_RECORD_ONLY_TESTS = process.env['AGENT_HOST_REPLAY_RECORD'] === '1';
const isLinux = process.platform === 'linux';
const isWindows = process.platform === 'win32';

export function defineAgentHostE2ETests(config: IAgentHostE2EProviderConfig): void {
	(config.enabled ? suite : suite.skip)(config.suiteTitle, function () {
		const shellToolReplayEnabled = !isWindows && (RECORD || !isLinux || !config.shellToolReplayUnstableOnLinux);
		const stableNewScenarioResponse = config.provider !== 'codex';
		let client: TestProtocolClient;
		let lease: AgentHostE2EServerLease | undefined;
		const createdSessions: string[] = [];
		const tempDirs: string[] = [];
		const noModelTrafficTestTitles = new Set<string>();
		const context: IAgentHostE2ETestContext = {
			config,
			get client() { return client; },
			createdSessions,
			tempDirs,
			shellToolReplayEnabled,
			stableNewScenarioResponse,
			isWindows,
			runRecordOnlyTests: RUN_RECORD_ONLY_TESTS,
			registerNoModelTrafficTest: title => noModelTrafficTestTitles.add(title),
		};

		suiteSetup(async function () {
			this.timeout(60_000);
			lease = new AgentHostE2EServerLease(config, {
				claudeSdkRoot: config.claudeSdkRoot,
				codexSdkRoot: config.codexSdkRoot,
			});
		});

		suiteTeardown(async function () {
			this.timeout(90_000);
			try {
				await lease?.dispose();
			} finally {
				await removeTempDirs(tempDirs);
			}
		});

		setup(async function () {
			this.timeout(60_000);
			if (!lease) {
				throw new Error('Agent Host E2E server lease was not initialized.');
			}
			const title = this.currentTest?.title ?? 'unknown';
			({ client } = await lease.acquire(title, noModelTrafficTestTitles.has(title) ? 'none' : 'recorded'));
		});

		teardown(async function () {
			this.timeout(90_000);
			if (!lease) {
				throw new Error('Agent Host E2E server lease was not initialized.');
			}
			await lease.release(createdSessions);
		});

		defineCoreTests(context);
		defineHostFeaturesTests(context);
		defineStateOperationsTests(context);
		defineFileOperationsTests(context);
		defineTurnLifecycleTests(context);
		defineWorkspaceTests(context);
		defineSubagentTests(context);
	});
}
