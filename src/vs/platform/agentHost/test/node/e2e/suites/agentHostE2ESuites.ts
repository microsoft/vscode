/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AgentHostE2EServerLease, type IAgentHostE2EProviderConfig, removeTempDirs } from '../harness/agentHostE2ETestHarness.js';
import { defaultAgentHostTarget, type IAgentHostTarget } from '../harness/agentHostTarget.js';
import type { TestProtocolClient } from '../../serverIntegrationTestHelpers.js';
import { defineCoreTests } from './coreSuite.js';
import { defineCustomizationDiscoveryTests } from './customizationDiscoverySuite.js';
import { defineAnnotationsTests } from './annotationsSuite.js';
import { defineChangesetTests } from './changesetSuite.js';
import { defineClientFilesystemTests } from './clientFilesystemSuite.js';
import { defineClientHostedFilesystemTests } from './clientHostedFilesystemSuite.js';
import { defineProtocolContractTests } from './protocolContractsSuite.js';
import { defineServerToolsTests } from './serverToolsSuite.js';
import { defineSessionPersistenceTests } from './sessionPersistenceSuite.js';
import { defineFileOperationsTests } from './fileOperationsSuite.js';
import { defineHostFeaturesTests } from './hostFeaturesSuite.js';
import { defineMultiChatTests } from './multiChatSuite.js';
import { defineMcpPluginTests } from './mcpPluginSuite.js';
import { defineStateOperationsTests } from './stateOperationsSuite.js';
import { defineSubagentTests } from './subagentSuite.js';
import { defineTurnLifecycleTests } from './turnLifecycleSuite.js';
import { defineWorkspaceTests } from './workspaceSuite.js';
import { defineCopilotCoverageTests } from './copilotCoverageSuite.js';
import { defineManagementExtensionTests } from './managementExtensionsSuite.js';
import type { AgentHostE2ETier, IAgentHostE2ETestContext } from './e2eTestContext.js';

const isLinux = process.platform === 'linux';

const RECORD = process.env['AGENT_HOST_REPLAY_RECORD'] === '1' || process.env['AGENT_HOST_UPDATE_SNAPSHOTS'] === '1';
const RUN_RECORD_ONLY_TESTS = process.env['AGENT_HOST_REPLAY_RECORD'] === '1';
const RUN_KNOWN_ISSUE_TESTS = RECORD && process.env['AGENT_HOST_RUN_KNOWN_ISSUES'] === '1';
const RUN_HOST_ONLY_KNOWN_ISSUE_TESTS = process.env['AGENT_HOST_RUN_KNOWN_ISSUES'] === '1';
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
			targetId: (options.target ?? defaultAgentHostTarget).id,
			config,
			get client() { return client; },
			createdSessions,
			tempDirs,
			portableShellToolReplayEnabled,
			isLinux,
			isWindows,
			runRecordOnlyTests: RUN_RECORD_ONLY_TESTS,
			runKnownIssueTests: RUN_KNOWN_ISSUE_TESTS,
			runHostOnlyKnownIssueTests: RUN_HOST_ONLY_KNOWN_ISSUE_TESTS,
			registerNoModelTrafficTest: title => noModelTrafficTestTitles.add(title),
			get observedModelRequestBodies() { return lease?.observedModelRequestBodies ?? []; },
			restartServer: async () => {
				if (!lease) {
					throw new Error('[agent-host-e2e] no server lease');
				}
				client = await lease.restart();
			},
			connectClient: () => {
				if (!lease) {
					throw new Error('[agent-host-e2e] no server lease');
				}
				return lease.connectClient();
			},
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
			this.timeout(120_000);
			const errors: Error[] = [];
			try {
				await lease?.dispose();
			} catch (error) {
				errors.push(error instanceof Error ? error : new Error(String(error)));
			}
			try {
				await removeTempDirs(tempDirs);
			} catch (error) {
				errors.push(error instanceof Error ? error : new Error(String(error)));
			}
			if (errors.length > 0) {
				throw new AggregateError(errors, `Failed to dispose Agent Host E2E suite resources: ${errors.map(error => error.message).join('; ')}`);
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
			this.timeout(120_000);
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
			const errors: Error[] = [];
			try {
				await lease.release(createdSessions, failed);
			} catch (error) {
				errors.push(error instanceof Error ? error : new Error(String(error)));
			}
			try {
				await removeTempDirs(tempDirs);
			} catch (error) {
				errors.push(error instanceof Error ? error : new Error(String(error)));
			}
			if (errors.length > 0) {
				throw new AggregateError(errors, `Failed to dispose Agent Host E2E test resources: ${errors.map(error => error.message).join('; ')}`);
			}
		});

		// Suites that contain only conformance-tier scenarios.
		if (options.tier === 'conformance') {
			defineHostFeaturesTests(context);
			defineStateOperationsTests(context);
			defineClientFilesystemTests(context);
			defineClientHostedFilesystemTests(context);
			defineAnnotationsTests(context);
			defineProtocolContractTests(context);
		}

		// Suites that contain only parity-tier scenarios.
		if (options.tier === 'parity') {
			defineCoreTests(context);
			defineHostFeaturesTests(context);
			defineCopilotCoverageTests(context);
			defineFileOperationsTests(context);
			defineTurnLifecycleTests(context);
			defineWorkspaceTests(context);
			defineSubagentTests(context);
		}

		// Mixed: peer-catalog semantics are host-owned (conformance) while
		// peer turns and capability advertisement are provider-dependent
		// (parity). The registrars self-select on `context.tier`.
		defineMultiChatTests(context);
		defineChangesetTests(context);
		defineMcpPluginTests(context);
		defineServerToolsTests(context);
		defineCustomizationDiscoveryTests(context);
		defineSessionPersistenceTests(context);
		defineManagementExtensionTests(context);
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
