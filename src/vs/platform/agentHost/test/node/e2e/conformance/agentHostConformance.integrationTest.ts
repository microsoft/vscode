/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Agent Host Protocol conformance tests.
 *
 * These are the scenarios whose contract is owned by the **agent host**, not by
 * any particular agent provider: session and chat lifecycle, state operations,
 * peer-catalog semantics, host-executed commands, and completions. They are
 * registered once — not once per provider — because running them three times
 * only re-verifies host code that has no provider-dependent branch.
 *
 * Everything here is host-only: no request ever reaches the model boundary, so
 * the suite needs no credentials, no network, and no recorded fixtures beyond
 * the empty capture.
 *
 * A provider still has to exist so that sessions can be materialized. Copilot
 * is the reference provider purely because its CLI is an unconditional dev
 * dependency; no assertion in this suite may depend on that choice. If one
 * does, it belongs in the parity tier instead (see
 * `providers/*AgentHostE2E.integrationTest.ts`).
 *
 * The implementation under test is reached only through `IAgentHostTarget`
 * (see `harness/agentHostTarget.ts`). Any process that speaks the Agent Host
 * Protocol can be substituted there and should pass this suite unchanged.
 */

import { defineAgentHostConformanceTests } from '../suites/agentHostE2ESuites.js';
import type { IAgentHostE2EProviderConfig } from '../harness/agentHostE2ETestHarness.js';

/**
 * The reference provider. Only the fields that gate *host* behavior are
 * meaningful here; the capability flags exist so that host code paths guarded
 * by them are exercised.
 */
const REFERENCE_CONFIG: IAgentHostE2EProviderConfig = {
	suiteTitle: 'Agent Host E2E — Conformance',
	provider: 'copilotcli',
	scheme: 'copilotcli',
	shellToolName: 'bash',
	fileOperationStrategy: 'fileTools',
	subagentToolNames: ['task'],
	exitPlanModeToolName: 'exit_plan_mode',
	enabled: true,
	supportsWorktreeIsolation: true,
	supportsHostTerminalTool: true,
	supportsSubagents: true,
	planModeStyle: 'session-state',
	supportsMultipleChats: true,
	supportsChatFork: true,
	supportsChatForkE2E: true,
};

defineAgentHostConformanceTests(REFERENCE_CONFIG);
