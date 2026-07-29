/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AgentHostE2EServerLease, type IAgentHostE2EProviderConfig, removeTempDirs } from '../harness/agentHostE2ETestHarness.js';
import type { IAgentHostTarget } from '../harness/agentHostTarget.js';
import type { TestProtocolClient } from '../../serverIntegrationTestHelpers.js';
import { defineCoreTests } from './coreSuite.js';
import { defineClientFilesystemTests } from './clientFilesystemSuite.js';
import { defineFileOperationsTests } from './fileOperationsSuite.js';
import { defineHostFeaturesTests } from './hostFeaturesSuite.js';
import { defineMultiChatTests } from './multiChatSuite.js';
import { defineStateOperationsTests } from './stateOperationsSuite.js';
import { defineSubagentTests } from './subagentSuite.js';
import { defineTurnLifecycleTests } from './turnLifecycleSuite.js';
import { defineWorkspaceTests } from './workspaceSuite.js';
import type { AgentHostE2ETier, IAgentHostE2ETestContext } from './e2eTestContext.js';

const RECORD = process.env['AGENT_HOST_REPLAY_RECORD'] === '1' || process.env['AGENT_HOST_UPDATE_SNAPSHOTS'] === '1';
const RUN_RECORD_ONLY_TESTS = process.env['AGENT_HOST_REPLAY_RECORD'] === '1';
const isLinux = process.platform === 'linux';
const isWindows = process.platform === 'win32';

interface IDefineOptions {
	readonly tier: AgentHostE2ETier;
	readonly suiteTitle: string;
	readonly target?: IAgentHostTarget;
}

function defineSuite(config: IAgentHostE2EProviderConfig, options: IDefineOptions): void {
	(config.enabled ? suite : suite.skip)(options.suiteTitle, function () {
		const portableShellToolReplayEnabled = RECORD || !isLinux || !config.shellToolReplayUnstableOnLinux;
		let client: TestProtocolClient;
		let lease: AgentHostE2EServerLease | undefined;
		const createdSessions: string[] = [];
		const tempDirs: string[] = [];
		const noModelTrafficTestTitles = new Set<string>();
		const context: IAgentHostE2ETestContext = {
			tier: options.tier,
			config,
			get client() { return client; },
			createdSessions,
			tempDirs,
			portableShellToolReplayEnabled,
			stableNewScenarioResponse: config.stableNewScenarioResponse,
			isWindows,
			runRecordOnlyTests: RUN_RECORD_ONLY_TESTS,
			registerNoModelTrafficTest: title => noModelTrafficTestTitles.add(title),
			get observedModelRequestBodies() { return lease?.observedModelRequestBodies ?? []; },
		};

		suiteSetup(async function () {
			this.timeout(60_000);
			lease = new AgentHostE2EServerLease(config, {
				claudeSdkRoot: config.claudeSdkRoot,
				codexSdkRoot: config.codexSdkRoot,
				target: options.target,
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
			// A failed test can leave a mid-turn session that wedges (or already
			// killed) the shared host; restart it so the failure does not cascade
			// into the next, unrelated test.
			const failed = this.currentTest?.state === 'failed';
			if (failed) {
				// Surface the Copilot runtime's own logs for a hang/timeout before
				// the server is restarted and its temp home is eventually removed.
				lease.dumpRuntimeLogsOnFailure(this.currentTest?.title ?? 'unknown');
			}
			await lease.release(createdSessions, failed);
		});

		// Suites that contain only conformance-tier scenarios.
		if (options.tier === 'conformance') {
			defineHostFeaturesTests(context);
			defineStateOperationsTests(context);
			defineClientFilesystemTests(context);
		}

		// Suites that contain only parity-tier scenarios.
		if (options.tier === 'parity') {
			defineCoreTests(context);
			defineFileOperationsTests(context);
			defineTurnLifecycleTests(context);
			defineWorkspaceTests(context);
			defineSubagentTests(context);
		}

		// Mixed: peer-catalog semantics are host-owned (conformance) while
		// peer turns and capability advertisement are provider-dependent
		// (parity). The registrars self-select on `context.tier`.
		defineMultiChatTests(context);
	});
}

/**
 * Registers the parity tier for one provider: scenarios whose contract depends
 * on that provider's runtime behavior. Called once per provider entrypoint.
 */
export function defineAgentHostE2ETests(config: IAgentHostE2EProviderConfig, target?: IAgentHostTarget): void {
	defineSuite(config, { tier: 'parity', suiteTitle: config.suiteTitle, target });
}

/**
 * Registers the conformance tier: provider-invariant Agent Host Protocol
 * contracts. Called **once per target**, not once per provider — the reference
 * provider only exists so sessions can be materialized.
 */
export function defineAgentHostConformanceTests(config: IAgentHostE2EProviderConfig, target?: IAgentHostTarget): void {
	defineSuite(config, { tier: 'conformance', suiteTitle: config.suiteTitle, target });
}
