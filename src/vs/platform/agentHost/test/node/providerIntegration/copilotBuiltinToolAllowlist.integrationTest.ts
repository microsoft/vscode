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
 * Built-ins the runtime registers in this session that the host deliberately
 * leaves off. Each one is also excluded in `CopilotSessionLauncher`.
 */
const KNOWN_LEFT_OFF: readonly string[] = [
	'dynamic_workflows_manage',
	'run_dynamic_workflow',
	'semantic_code_search',
];

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
				...createCopilotCliEnvironment(createIsolatedProviderEnvironment(directory), [], false, undefined, true),
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

	/** The built-ins a session registers across every mode, sorted. */
	async function registeredBuiltins(model: string, availableTools: string[] | undefined): Promise<string[]> {
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
			const names = new Set<string>();
			for (const mode of MODES) {
				await session.rpc.mode.set({ mode });
				await session.rpc.tools.initializeAndValidate();
				const { tools } = await session.rpc.tools.getCurrentMetadata();
				for (const tool of tools ?? []) {
					if (!tool.mcpServerName) {
						names.add(tool.name);
					}
				}
			}
			return [...names].sort();
		} finally {
			await session.disconnect();
		}
	}

	test('every built-in the bundled runtime registers is reviewed against the allow-list', async function () {
		this.timeout(240_000);

		const allowListed = new Set(COPILOT_ENABLED_BUILTIN_TOOL_NAMES);
		const registered = new Set<string>();
		const filteredMismatches: string[] = [];
		for (const model of MODELS) {
			const unfiltered = await registeredBuiltins(model, undefined);
			const filtered = await registeredBuiltins(model, [...COPILOT_DEFAULT_AVAILABLE_TOOLS]);
			unfiltered.forEach(name => registered.add(name));
			const expectedFiltered = unfiltered.filter(name => allowListed.has(name));
			if (JSON.stringify(filtered) !== JSON.stringify(expectedFiltered)) {
				filteredMismatches.push(`${model}: expected [${expectedFiltered.join(', ')}] but got [${filtered.join(', ')}]`);
			}
		}

		assert.deepStrictEqual({
			registeredButNotAllowListed: [...registered].filter(name => !allowListed.has(name)).sort(),
			allowListedButNotRegistered: [...allowListed].filter(name => !registered.has(name)).sort(),
			filteredMismatches,
		}, {
			registeredButNotAllowListed: [...KNOWN_LEFT_OFF].sort(),
			allowListedButNotRegistered: Object.keys(NOT_EXERCISED).sort(),
			filteredMismatches: [],
		}, 'The runtime\'s built-in tools and COPILOT_ENABLED_BUILTIN_TOOL_NAMES disagree. A new runtime built-in must be adopted into the allow-list or added to KNOWN_LEFT_OFF; a renamed or removed one must be updated in the allow-list. See section 9 of src/vs/platform/agentHost/AGENTS.md.');
	});
});
