/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { TestProtocolClient } from '../../serverIntegrationTestHelpers.js';
import type { IAgentHostE2EProviderConfig } from '../harness/agentHostE2ETestHarness.js';

/**
 * Which axis a scenario belongs to.
 *
 * - `conformance` — the contract is owned by the agent host and is invariant
 *   across providers. These scenarios describe the Agent Host Protocol itself,
 *   so they are registered **once per target** rather than once per provider.
 * - `parity` — the contract depends on a specific provider's runtime behavior
 *   (tool selection, transcript reconstruction, advertised capabilities), so it
 *   is registered once per (target, provider).
 *
 * Providers are a dimension of the *target*, not a multiplier on every test.
 */
export type AgentHostE2ETier = 'conformance' | 'parity';

export interface IAgentHostE2ETestContext {
	readonly tier: AgentHostE2ETier;
	readonly targetId: string;
	readonly config: IAgentHostE2EProviderConfig;
	readonly client: TestProtocolClient;
	readonly createdSessions: string[];
	readonly tempDirs: string[];
	/**
	 * Whether shell-dependent tests can replay.
	 *
	 * This is only about the provider's shell-tool replay stability on Linux.
	 * There is deliberately no Windows exclusion: every committed capture that
	 * runs a shell command is expected to be platform-neutral, either because
	 * the command is pinned to something `cmd`/PowerShell also understands or
	 * because the prompt steers the agent to its file tools instead. A test that
	 * cannot meet that bar should be scoped to a platform explicitly, so the
	 * reason is visible at the call site.
	 */
	readonly portableShellToolReplayEnabled: boolean;
	readonly isLinux: boolean;
	readonly isWindows: boolean;
	readonly runRecordOnlyTests: boolean;
	/** Whether explicitly requested known-issue reproductions should run against live recording. */
	readonly runKnownIssueTests: boolean;
	/** Whether explicitly requested model-free known-issue reproductions should run in strict replay. */
	readonly runHostOnlyKnownIssueTests: boolean;
	readonly registerNoModelTrafficTest: (title: string) => void;
	readonly observedModelRequestBodies: readonly string[];
	/**
	 * Restart the target against the current test's isolated persistent state and
	 * replay stream. The replacement client is connected but not initialized.
	 */
	readonly restartServer: () => Promise<void>;
	/**
	 * Open an extra connection to the same server. Needed only by tests that
	 * exercise connection lifecycle, which cannot be expressed on the single
	 * shared connection. The caller must close what it opens.
	 */
	readonly connectClient: () => Promise<TestProtocolClient>;
}

function registerHostOnlyTest(context: IAgentHostE2ETestContext, title: string, run: Mocha.AsyncFunc, enabled: boolean): void {
	context.registerNoModelTrafficTest(title);
	(enabled ? test : test.skip)(title, function () {
		this.timeout(120_000);
		return run.call(this);
	});
}

/**
 * Registers a provider-invariant Agent Host Protocol contract.
 *
 * The scenario must not contact the model boundary, and its result must not
 * depend on which provider backs the session — the provider only exists so a
 * session can be materialized. Registered once per target; a no-op when the
 * surrounding suite is running the parity tier.
 */
export function conformanceTest(context: IAgentHostE2ETestContext, title: string, run: Mocha.AsyncFunc, enabled = true): void {
	if (context.tier !== 'conformance') {
		return;
	}
	registerHostOnlyTest(context, title, run, enabled);
}

/**
 * Registers a per-provider scenario that must not contact the model boundary.
 *
 * Use this for contracts that genuinely vary by provider without needing the
 * model — advertised capabilities, and the host's behavior when a provider does
 * not support a feature. A no-op when the surrounding suite is running the
 * conformance tier.
 */
export function providerHostOnlyTest(context: IAgentHostE2ETestContext, title: string, run: Mocha.AsyncFunc, enabled = true): void {
	if (context.tier !== 'parity') {
		return;
	}
	registerHostOnlyTest(context, title, run, enabled);
}
