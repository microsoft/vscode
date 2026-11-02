/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdir, mkdtemp, rm } from 'fs/promises';
import type { Server } from 'http';
import { tmpdir } from 'os';
import { CopilotClient, type SessionConfig } from '@github/copilot-sdk';
import { join } from '../../../../../base/common/path.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { COPILOT_DEFAULT_AVAILABLE_TOOLS, COPILOT_ENABLED_BUILTIN_TOOL_NAMES } from '../../../node/copilot/copilotBuiltinToolAllowlist.js';
import { createCopilotCliEnvironment } from '../../../node/copilot/copilotCliEnvironment.js';
import { AGENT_HOST_COPILOT_CLIENT_NAME } from '../../../node/copilot/copilotManagedSettings.js';
import { getAncillaryStub } from '../e2e/harness/capiStubs.js';
import { createIsolatedProviderEnvironment } from '../providerTestEnvironment.js';

/**
 * One model per tool profile: the standard profile (`create`/`edit`/`grep`) and
 * the patch profile (`apply_patch`/`rg`).
 */
const MODELS = ['claude-sonnet-4.5', 'gpt-5.3-codex'] as const;
const MODES = ['interactive', 'plan', 'autopilot'] as const;

/**
 * Built-ins the runtime registers that the host leaves off, with the reason.
 *
 * This is the default home for a built-in that a new runtime introduces: add it
 * here (for example `new_tool: 'new in SDK x.y.z, not reviewed'`) and the test
 * passes while the tool stays off for every session. Adopting a tool into
 * `COPILOT_ENABLED_BUILTIN_TOOL_NAMES` instead puts its definition in front of
 * the model on every request, so it is a decision for the tool budget owners,
 * whom `.github/CODENOTIFY` notifies. Never adopt a new tool just to make this
 * test pass. A rename of an already adopted tool is different: replace the old
 * name with the new one in the allow-list so the capability stays on.
 */
const KNOWN_LEFT_OFF: Readonly<Record<string, string>> = {
	dynamic_workflows_manage: 'dynamic workflows are excluded by CopilotSessionLauncher until Agent Host support is validated',
	run_dynamic_workflow: 'dynamic workflows are excluded by CopilotSessionLauncher until Agent Host support is validated',
	semantic_code_search: 'replaced by the semantic_search client tool; excluded by CopilotSessionLauncher',
};

/**
 * Allow-listed built-ins this session cannot register, with the reason. Feature-
 * and experiment-gated tools are reviewed by hand when the SDK is bumped
 * (see section 9 of `src/vs/platform/agentHost/AGENTS.md`).
 */
const NOT_EXERCISED: Readonly<Record<string, string>> = {
	...(isWindows
		? { bash: 'POSIX shell', read_bash: 'POSIX shell', stop_bash: 'POSIX shell', list_bash: 'POSIX shell' }
		: { powershell: 'Windows shell', read_powershell: 'Windows shell', stop_powershell: 'Windows shell', list_powershell: 'Windows shell' }),
	local_shell: 'runtime shell variant not selected for these models',
	search_code_subagent: 'runtime feature flag',
	execution_subagent: 'host setting overridden by runtime experiment assignments',
	image_generation: 'host setting and an authorized image model',
	tool_search_tool: 'tool search, which needs a supporting model and deferred tools',
	tool_search_tool_regex: 'provider-native tool search',
	store_memory: 'Copilot Memory setting and GitHub account entitlement',
	vote_memory: 'Copilot Memory setting and GitHub account entitlement',
	list_canvas_capabilities: 'canvases setting',
	open_canvas: 'canvases setting',
	invoke_canvas_action: 'canvases setting',
};

/**
 * Builds the failure message: which names disagree and the fix for each.
 * Agents asked to make this test pass follow it, so it must steer a new tool
 * toward `KNOWN_LEFT_OFF` and a renamed adopted tool toward its new name.
 */
function describeDrift(registered: ReadonlyMap<string, string>, registeredButNotAllowListed: readonly string[], allowListedButNotRegistered: readonly string[], filteredMismatches: readonly string[]): string {
	const lines = ['The bundled runtime\'s built-in tools and COPILOT_ENABLED_BUILTIN_TOOL_NAMES disagree (see section 9 of src/vs/platform/agentHost/AGENTS.md).'];
	const unreviewed = registeredButNotAllowListed.filter(name => !Object.hasOwn(KNOWN_LEFT_OFF, name));
	const missing = allowListedButNotRegistered.filter(name => !Object.hasOwn(NOT_EXERCISED, name));
	if (unreviewed.length) {
		lines.push(`New runtime built-ins:`);
		for (const name of unreviewed) {
			lines.push(`  - ${name}: ${(registered.get(name) ?? '').replace(/\s+/g, ' ').slice(0, 200)}`);
		}
	}
	if (missing.length) {
		lines.push(`Allow-listed but no longer registered: ${missing.join(', ')}.`);
	}
	if (unreviewed.length && missing.length) {
		lines.push('Check each new built-in for a rename first. It is a rename when it does the same job as a missing allow-listed tool; compare its description above with the old tool\'s definition in test/node/e2e/providers/__snapshots__/*.prompt.md. For a rename, adopt the new name so the capability stays on: replace the old name with the new one in COPILOT_ENABLED_BUILTIN_TOOL_NAMES and in expectedModelFacingToolNames (copilotPromptsE2E.integrationTest.ts), add the new name to the tool display mapping (CopilotToolName in copilotToolDisplay.ts and the aliases in toolPresentation.ts) while keeping the old entry so restored sessions still render, regenerate the prompt snapshots, and name the rename in the PR description.');
	}
	if (unreviewed.length) {
		lines.push('For a new built-in that is not a rename, add it to KNOWN_LEFT_OFF in this file with a reason such as \'new in SDK x.y.z, not reviewed\'. That keeps it off for every session. Do not add it to COPILOT_ENABLED_BUILTIN_TOOL_NAMES to make this test pass; adopting a new tool is a decision for the tool budget owners listed for copilotBuiltinToolAllowlist.ts in .github/CODENOTIFY.');
	}
	if (missing.length) {
		lines.push('For a missing tool that was not renamed, remove it from COPILOT_ENABLED_BUILTIN_TOOL_NAMES and expectedModelFacingToolNames, and keep its display mapping for restored sessions.');
	}
	const staleLeftOff = Object.keys(KNOWN_LEFT_OFF).filter(name => !registeredButNotAllowListed.includes(name));
	if (staleLeftOff.length) {
		lines.push(`No longer registered by the runtime: ${staleLeftOff.join(', ')}. Remove them from KNOWN_LEFT_OFF.`);
	}
	const staleNotExercised = Object.keys(NOT_EXERCISED).filter(name => !allowListedButNotRegistered.includes(name));
	if (staleNotExercised.length) {
		lines.push(`Listed in NOT_EXERCISED but now registered here, or no longer allow-listed: ${staleNotExercised.join(', ')}. Remove them from NOT_EXERCISED.`);
	}
	if (filteredMismatches.length) {
		lines.push(`The default availableTools filter no longer keeps exactly the allow-listed built-ins, so the SDK's tool filter semantics may have changed: ${filteredMismatches.join('; ')}.`);
	}
	return lines.join('\n');
}

/**
 * Guards `COPILOT_ENABLED_BUILTIN_TOOL_NAMES` against drift in either direction.
 * The bundled runtime registers its built-ins in a session with no tool filter,
 * against a local synthetic Copilot API, for each tool profile and session mode.
 * A built-in the runtime registers that is neither allow-listed nor known to be
 * left off fails here (a new or renamed runtime tool), and so does an allow-listed
 * name the runtime no longer registers (a renamed or removed tool, or a typo in
 * the list). The same sessions with the default filter must keep exactly the
 * allow-listed built-ins.
 */
suite('Agent Host Provider Integration - Copilot built-in tool allow-list', function () {

	ensureNoDisposablesAreLeakedInTestSuite();

	let directory: string;
	let endpoint: string;
	let server: Server | undefined;
	let client: CopilotClient | undefined;

	setup(async () => {
		directory = await mkdtemp(join(tmpdir(), 'copilot-builtin-tools-'));
		await mkdir(join(directory, 'workspace'));
		const { createServer } = await import('http');
		server = createServer(async (request, response) => {
			const path = new URL(request.url ?? '/', 'http://localhost').pathname;
			let body = '';
			for await (const chunk of request) {
				body += chunk;
			}
			const stub = getAncillaryStub(request.method ?? 'GET', path, body);
			if (stub) {
				response.writeHead(stub.status, stub.headers);
				response.end(stub.body.replaceAll('${capi}', endpoint));
				return;
			}
			response.writeHead(500, { 'x-should-retry': 'false' });
			response.end('Unexpected synthetic endpoint');
		});
		await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
		const address = server.address();
		assert.ok(address && typeof address !== 'string');
		endpoint = `http://127.0.0.1:${address.port}`;
		client = new CopilotClient({
			useLoggedInUser: false,
			gitHubToken: 'synthetic-no-real-credential',
			logLevel: 'error',
			env: {
				...createCopilotCliEnvironment(createIsolatedProviderEnvironment(directory), [], false, undefined, undefined, true),
				COPILOT_API_URL: endpoint,
				COPILOT_DEBUG_GITHUB_API_URL: endpoint,
				COPILOT_MANAGED_SETTINGS_CACHE: '0',
				COPILOT_TELEMETRY_ENABLED: 'false',
			},
		});
		await client.start();
	});

	teardown(async function () {
		this.timeout(60_000);
		try {
			await client?.stop();
			client = undefined;
		} finally {
			try {
				if (server) {
					server.closeAllConnections();
					await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
					server = undefined;
				}
			} finally {
				await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
			}
		}
	});

	/** The built-ins a session registers across every mode, by name, with their descriptions. */
	async function registeredBuiltins(model: string, availableTools: string[] | undefined): Promise<Map<string, string>> {
		const config: SessionConfig = {
			model,
			clientName: AGENT_HOST_COPILOT_CLIENT_NAME,
			workingDirectory: join(directory, 'workspace'),
			onPermissionRequest: () => ({ kind: 'denied-interactively-by-user' }),
			onUserInputRequest: () => ({ answer: '', wasFreeform: true }),
			askUserVariant: 'elicitation',
			onElicitationRequest: () => ({ action: 'cancel' }),
			onExitPlanModeRequest: () => ({ approved: false }),
			interactiveUser: true,
			enableConfigDiscovery: false,
			enableSkills: true,
			enableSessionStore: true,
			infiniteSessions: { enabled: true },
			...(availableTools ? { availableTools } : {}),
		};
		const session = await client!.createSession(config);
		try {
			const tools = new Map<string, string>();
			for (const mode of MODES) {
				await session.rpc.mode.set({ mode });
				await session.rpc.tools.initializeAndValidate();
				const metadata = await session.rpc.tools.getCurrentMetadata();
				for (const tool of metadata.tools ?? []) {
					if (!tool.mcpServerName) {
						tools.set(tool.name, tool.description);
					}
				}
			}
			return tools;
		} finally {
			await session.disconnect();
		}
	}

	test('every built-in the bundled runtime registers is reviewed against the allow-list', async function () {
		this.timeout(240_000);

		const allowListed = new Set(COPILOT_ENABLED_BUILTIN_TOOL_NAMES);
		const registered = new Map<string, string>();
		const filteredMismatches: string[] = [];
		for (const model of MODELS) {
			const unfiltered = await registeredBuiltins(model, undefined);
			const filtered = [...(await registeredBuiltins(model, [...COPILOT_DEFAULT_AVAILABLE_TOOLS])).keys()].sort();
			unfiltered.forEach((description, name) => registered.set(name, description));
			const expectedFiltered = [...unfiltered.keys()].filter(name => allowListed.has(name)).sort();
			if (JSON.stringify(filtered) !== JSON.stringify(expectedFiltered)) {
				filteredMismatches.push(`${model}: expected [${expectedFiltered.join(', ')}] but got [${filtered.join(', ')}]`);
			}
		}

		const registeredButNotAllowListed = [...registered.keys()].filter(name => !allowListed.has(name)).sort();
		const allowListedButNotRegistered = [...allowListed].filter(name => !registered.has(name)).sort();
		assert.deepStrictEqual({
			registeredButNotAllowListed,
			allowListedButNotRegistered,
			filteredMismatches,
		}, {
			registeredButNotAllowListed: Object.keys(KNOWN_LEFT_OFF).sort(),
			allowListedButNotRegistered: Object.keys(NOT_EXERCISED).sort(),
			filteredMismatches: [],
		}, describeDrift(registered, registeredButNotAllowListed, allowListedButNotRegistered, filteredMismatches));
	});
});
