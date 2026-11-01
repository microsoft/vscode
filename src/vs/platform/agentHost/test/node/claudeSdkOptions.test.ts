/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spawnSync } from 'child_process';
import { isWindows } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { buildClaudeTelemetryEnv, buildOptions, buildSubprocessEnv, toClaudeMcpServers } from '../../node/claude/claudeSdkOptions.js';
import type { ClaudeTransport, IClaudeProxyHandle } from '../../node/claude/claudeProxyService.js';
import { McpServerType } from '../../../mcp/common/mcpPlatformTypes.js';
import { CustomizationType, McpServerStatus, type McpServerCustomization } from '../../common/state/protocol/state.js';
import type { IMcpServerDefinition } from '../../../agentPlugins/common/pluginParsers.js';

suite('claudeSdkOptions / buildSubprocessEnv', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const SAVED_ENV = { ...process.env };
	const KNOWN_KEYS = new Set([
		'ELECTRON_RUN_AS_NODE',
		'NODE_OPTIONS',
		'ANTHROPIC_API_KEY',
		'VSCODE_PID',
		'VSCODE_NLS_CONFIG',
		'ELECTRON_NO_ATTACH_CONSOLE',
		'PATH',
		'HOME',
		'USERPROFILE',
	]);
	const toolEnv = {
		PATHEXT: '.COM;.EXE;.BAT;.CMD',
		ComSpec: 'C:\\Windows\\System32\\cmd.exe',
		SystemRoot: 'C:\\Windows',
		APPDATA: 'C:\\Users\\test\\AppData\\Roaming',
		LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local',
		ProgramData: 'C:\\ProgramData',
		TEMP: 'C:\\Temp',
		TMP: 'C:\\Temp',
		COMPUTERNAME: 'TEST-PC',
		JAVA_HOME: 'C:\\jdk',
		CLAUDE_CODE_GIT_BASH_PATH: 'C:\\Git\\bin\\bash.exe',
		CLAUDE_CODE_USE_POWERSHELL_TOOL: '1',
		CLAUDE_CODE_USE_NATIVE_FILE_SEARCH: '1',
		CLAUDE_CODE_USE_COWORK_PLUGINS: '1',
		GH_TOKEN: 'test-tool-token',
		AWS_ACCESS_KEY_ID: 'test-tool-key',
		MY_TOOL_SETTING: '',
	};
	const providerEnv = {
		ANTHROPIC_API_KEY: 'test-key',
		ANTHROPIC_AUTH_TOKEN: 'test-token',
		ANTHROPIC_BASE_URL: 'https://gateway.example',
		ANTHROPIC_CUSTOM_HEADERS: 'Authorization: test',
		ANTHROPIC_DEFAULT_SONNET_MODEL: 'other-model',
		CLAUDE_CODE_OAUTH_TOKEN: 'test-oauth',
		CLAUDE_CODE_OAUTH_REFRESH_TOKEN: 'test-refresh',
		CLAUDE_CODE_USE_BEDROCK: '1',
		CLAUDE_CODE_USE_VERTEX: '1',
		CLAUDE_CODE_USE_FOUNDRY: '1',
		CLAUDE_CODE_USE_ANTHROPIC_AWS: '1',
		CLAUDE_CODE_USE_MANTLE: '1',
		CLAUDE_CODE_USE_ANTHROPIC_GOOGLE_CLOUD: '1',
		CLAUDE_CODE_USE_GATEWAY: '1',
		AWS_BEARER_TOKEN_BEDROCK: 'test-bedrock',
		CLAUDE_CODE_CLIENT_CERT: '/test/cert',
		CLAUDE_CODE_CLIENT_KEY: '/test/key',
		CLAUDE_CODE_CLIENT_KEY_PASSPHRASE: 'test-passphrase',
		CLAUDE_CODE_EXTRA_BODY: '{"provider_option":true}',
		CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR: '3',
		CLAUDE_CODE_GATEWAY_TOKEN_FILE_DESCRIPTOR: '4',
	};
	const telemetryEnv = {
		OTEL_EXPORTER_OTLP_ENDPOINT: 'https://ambient.example',
		OTEL_EXPORTER_OTLP_HEADERS: 'authorization=test',
		OTEL_LOG_USER_PROMPTS: '1',
		ANT_OTEL_LOGS_EXPORTER: 'otlp',
		ANT_OTEL_EXPORTER_OTLP_ENDPOINT: 'https://ambient.example',
		TRACEPARENT: 'ambient-parent',
		TRACESTATE: 'ambient-state',
		CLAUDE_CODE_ENABLE_TELEMETRY: '1',
		CLAUDE_CODE_ENHANCED_TELEMETRY_BETA: '1',
		CLAUDE_CODE_OTEL_HEADERS_HELPER_DEBOUNCE_MS: '1',
		BETA_TRACING_ENDPOINT: 'https://ambient.example',
		ENABLE_BETA_TRACING_DETAILED: '1',
	};

	function clearAndSet(values: Record<string, string>): void {
		for (const key of Object.keys(values)) { KNOWN_KEYS.add(key); }
		for (const key of KNOWN_KEYS) { delete process.env[key]; }
		for (const [key, value] of Object.entries(values)) { process.env[key] = value; }
	}

	teardown(() => {
		for (const key of KNOWN_KEYS) { delete process.env[key]; }
		for (const [key, value] of Object.entries(SAVED_ENV)) {
			if (value !== undefined) { process.env[key] = value; }
		}
	});

	test('strips unsafe variables and forwards home paths in proxy mode', () => {
		clearAndSet({
			VSCODE_PID: '1234',
			VSCODE_NLS_CONFIG: '{}',
			ELECTRON_NO_ATTACH_CONSOLE: '1',
			NODE_OPTIONS: '--inspect',
			ANTHROPIC_API_KEY: 'sk-leak',
			PATH: '/usr/bin',
			HOME: '/Users/test',
			USERPROFILE: 'C:\\Users\\test',
		});

		const env = buildSubprocessEnv();

		assert.deepStrictEqual({
			runAsNode: env.ELECTRON_RUN_AS_NODE,
			nodeOptions: env.NODE_OPTIONS,
			anthropicKey: env.ANTHROPIC_API_KEY,
			vscodePid: env.VSCODE_PID,
			vscodeNls: env.VSCODE_NLS_CONFIG,
			electronOther: env.ELECTRON_NO_ATTACH_CONSOLE,
			path: env.PATH,
			home: env.HOME,
			userProfile: env.USERPROFILE,
			aiAgent: env.AI_AGENT,
		}, {
			runAsNode: '1',
			nodeOptions: undefined,
			anthropicKey: undefined,
			vscodePid: undefined,
			vscodeNls: undefined,
			electronOther: undefined,
			path: '/usr/bin', // settings.env still prepends the bundled ripgrep directory
			home: '/Users/test',
			userProfile: 'C:\\Users\\test',
			aiAgent: 'github_copilot_vscode_agent',
		});
	});

	for (const proxied of [true, false]) {
		test(`preserves OS variables and tool preferences in ${proxied ? 'proxy' : 'native'} mode without changing the parent`, () => {
			clearAndSet(toolEnv);
			const before = { ...process.env };
			const env = buildSubprocessEnv(proxied);
			assert.deepStrictEqual({
				tools: Object.fromEntries(Object.keys(toolEnv).map(key => [key, env[key]])),
				parent: { ...process.env },
			}, { tools: toolEnv, parent: before });
		});
	}

	test('strips personal Claude authentication and explicit provider selectors only in proxy mode', () => {
		clearAndSet(providerEnv);
		const proxy = buildSubprocessEnv();
		const native = buildSubprocessEnv(false);
		assert.deepStrictEqual({
			proxy: Object.fromEntries(Object.keys(providerEnv).map(key => [key, proxy[key]])),
			native: Object.fromEntries(Object.keys(providerEnv).map(key => [key, native[key]])),
		}, {
			proxy: Object.fromEntries(Object.keys(providerEnv).map(key => [key, undefined])),
			native: providerEnv,
		});
	});

	test('keeps inherited telemetry out of proxy mode and preserves it in native mode', () => {
		clearAndSet(telemetryEnv);
		const proxy = buildSubprocessEnv();
		const native = buildSubprocessEnv(false);
		assert.deepStrictEqual({
			proxy: Object.fromEntries(Object.keys(telemetryEnv).map(key => [key, proxy[key]])),
			native: Object.fromEntries(Object.keys(telemetryEnv).map(key => [key, native[key]])),
		}, {
			proxy: Object.fromEntries(Object.keys(telemetryEnv).map(key => [key, undefined])),
			native: telemetryEnv,
		});
	});

	test('filters Windows aliases before applying canonical host markers', () => {
		const aliases = {
			Anthropic_Api_Key: 'test-key',
			Claude_Code_Use_Bedrock: '1',
			Vscode_Test: 'test',
			Electron_Run_As_Node: '0',
			Node_Options: '--inspect',
			Ai_Agent: 'other-agent',
			Claude_Code_Additional_Directories_Claude_Md: '0',
			Otel_Exporter_Otlp_Endpoint: 'https://ambient.example',
		};
		clearAndSet(aliases);
		const env = buildSubprocessEnv();
		assert.deepStrictEqual({
			aliases: Object.fromEntries(Object.keys(aliases).map(key => [key, env[key]])),
			runAsNode: env.ELECTRON_RUN_AS_NODE,
			aiAgent: env.AI_AGENT,
			additionalDirectories: env.CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD,
		}, {
			aliases: isWindows ? Object.fromEntries(Object.keys(aliases).map(key => [key, undefined])) : aliases,
			runAsNode: '1',
			aiAgent: 'github_copilot_vscode_agent',
			additionalDirectories: '1',
		});
	});

	test('OS and tool variables reach a real subprocess without Claude credentials', () => {
		clearAndSet({ ...toolEnv, ...providerEnv });
		const keys = [...Object.keys(toolEnv), ...Object.keys(providerEnv)];
		const child = spawnSync(process.execPath, ['-e', `process.stdout.write(JSON.stringify(Object.fromEntries(${JSON.stringify(keys)}.map(key => [key, process.env[key] ?? null]))))`], {
			env: buildSubprocessEnv(), encoding: 'utf8', timeout: 10000,
		});
		assert.strictEqual(child.status, 0, child.stderr || child.error?.message);
		assert.deepStrictEqual(JSON.parse(child.stdout), {
			...toolEnv,
			...Object.fromEntries(Object.keys(providerEnv).map(key => [key, null])),
		});
	});

	test('buildOptions overlays host telemetry and proxy credentials on the inherited tool environment', async () => {
		clearAndSet({ ...toolEnv, ...providerEnv, ...telemetryEnv, PATH: '/test/bin' });
		const opts = await buildOptions({
			sessionId: 's1', workingDirectory: URI.file('/tmp/x'), model: undefined,
			abortController: new AbortController(), permissionMode: 'default',
			canUseTool: async () => ({ behavior: 'allow', updatedInput: {} }),
			onElicitation: async () => ({ action: 'cancel' }), isResume: false, mcpServers: undefined,
			telemetry: {
				traces: { endpoint: 'http://127.0.0.1:4567/v1/traces', protocol: 'http/json' },
				captureContent: false, resourceAttributes: {},
			},
		}, { kind: 'proxy', handle: { baseUrl: 'http://127.0.0.1:0', nonce: 'n', dispose: () => { } } }, () => { });
		const settingsEnv = (opts.settings as { env: Record<string, string> }).env;
		assert.deepStrictEqual({
			appData: opts.env?.APPDATA,
			personalKey: opts.env?.ANTHROPIC_API_KEY,
			ambientEndpoint: opts.env?.OTEL_EXPORTER_OTLP_ENDPOINT,
			traceEndpoint: opts.env?.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
			capturePrompts: opts.env?.OTEL_LOG_USER_PROMPTS,
			baseUrl: settingsEnv.ANTHROPIC_BASE_URL,
			authToken: settingsEnv.ANTHROPIC_AUTH_TOKEN,
			traceSettings: settingsEnv.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
			pathPreserved: settingsEnv.PATH.endsWith('/test/bin'),
		}, {
			appData: toolEnv.APPDATA, personalKey: undefined, ambientEndpoint: undefined,
			traceEndpoint: 'http://127.0.0.1:4567/v1/traces', capturePrompts: '0',
			baseUrl: 'http://127.0.0.1:0', authToken: 'n.s1',
			traceSettings: 'http://127.0.0.1:4567/v1/traces', pathPreserved: true,
		});
	});

	test('maps Agent Host traces to loopback and logs/metrics to the external sink', () => {
		const env = buildClaudeTelemetryEnv({
			traces: { endpoint: 'http://127.0.0.1:4567/v1/traces', protocol: 'http/json' },
			external: { endpoint: 'http://collector:4318', protocol: 'http/protobuf', headers: { authorization: 'Bearer test/token' } },
			captureContent: false,
			resourceAttributes: { 'service.namespace': 'vscode.agent-host', region: 'west us' },
		}, {
			traceId: '1'.repeat(32),
			spanId: '2'.repeat(16),
			traceparent: `00-${'1'.repeat(32)}-${'2'.repeat(16)}-01`,
		});

		assert.deepStrictEqual(env, {
			CLAUDE_CODE_ENABLE_TELEMETRY: '1',
			OTEL_SERVICE_NAME: 'claude-code',
			OTEL_RESOURCE_ATTRIBUTES: 'service.namespace=vscode.agent-host,region=west%20us',
			CLAUDE_CODE_ENHANCED_TELEMETRY_BETA: '1',
			OTEL_TRACES_EXPORTER: 'otlp',
			OTEL_LOGS_EXPORTER: 'otlp',
			OTEL_METRICS_EXPORTER: 'otlp',
			OTEL_LOG_USER_PROMPTS: '0',
			OTEL_LOG_ASSISTANT_RESPONSES: '0',
			OTEL_LOG_TOOL_DETAILS: '0',
			OTEL_LOG_TOOL_CONTENT: '0',
			OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://127.0.0.1:4567/v1/traces',
			OTEL_EXPORTER_OTLP_TRACES_PROTOCOL: 'http/json',
			OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: 'http://collector:4318/v1/logs',
			OTEL_EXPORTER_OTLP_LOGS_PROTOCOL: 'http/protobuf',
			OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: 'http://collector:4318/v1/metrics',
			OTEL_EXPORTER_OTLP_METRICS_PROTOCOL: 'http/protobuf',
			OTEL_EXPORTER_OTLP_HEADERS: 'authorization=Bearer%20test%2Ftoken',
			TRACEPARENT: `00-${'1'.repeat(32)}-${'2'.repeat(16)}-01`,
		});
	});

	test('keeps gRPC signal endpoints unchanged', () => {
		const env = buildClaudeTelemetryEnv({
			traces: { endpoint: 'https://collector:4317', protocol: 'grpc' },
			external: { endpoint: 'https://collector:4317', protocol: 'grpc' },
			captureContent: false,
			resourceAttributes: {},
		});
		assert.deepStrictEqual({
			trace: env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
			logs: env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT,
			metrics: env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT,
		}, {
			trace: 'https://collector:4317',
			logs: 'https://collector:4317',
			metrics: 'https://collector:4317',
		});
	});

	test('always sets ELECTRON_RUN_AS_NODE=1 even when not present in process.env', () => {
		clearAndSet({});

		const env = buildSubprocessEnv();

		assert.strictEqual(env.ELECTRON_RUN_AS_NODE, '1');
	});

	test('native mode (proxied=false) inherits auth vars + PATH (SDK replace semantics) while still stripping VSCODE_*/ELECTRON_*/NODE_OPTIONS', () => {
		clearAndSet({
			VSCODE_PID: '1234',
			ELECTRON_NO_ATTACH_CONSOLE: '1',
			NODE_OPTIONS: '--inspect',
			ANTHROPIC_API_KEY: 'sk-user-key',
			CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat-user',
			PATH: '/usr/bin',
			HOME: '/Users/test',
		});

		const env = buildSubprocessEnv(false);

		assert.deepStrictEqual({
			// Inherited so the user's own credentials reach the `claude` subprocess.
			anthropicKey: env.ANTHROPIC_API_KEY,
			oauthToken: env.CLAUDE_CODE_OAUTH_TOKEN,
			path: env.PATH,
			home: env.HOME,
			// Still stripped — these break the Electron-node subprocess.
			vscodePid: env.VSCODE_PID,
			electronOther: env.ELECTRON_NO_ATTACH_CONSOLE,
			nodeOptions: env.NODE_OPTIONS,
			runAsNode: env.ELECTRON_RUN_AS_NODE,
			// Announces the originating VS Code surface to `gh`.
			aiAgent: env.AI_AGENT,
		}, {
			anthropicKey: 'sk-user-key',
			oauthToken: 'sk-ant-oat-user',
			path: '/usr/bin',
			home: '/Users/test',
			vscodePid: undefined,
			electronOther: undefined,
			nodeOptions: undefined,
			runAsNode: '1',
			aiAgent: 'github_copilot_vscode_agent',
		});
	});
});

suite('claudeSdkOptions / MCP server projection', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const customization: McpServerCustomization = {
		type: CustomizationType.McpServer,
		id: 'mcp',
		uri: 'file:///mcp',
		name: 'mcp',
		state: { kind: McpServerStatus.Stopped },
	};
	const definition = (name: string, defaultCwd: URI, remote = false): IMcpServerDefinition => ({
		name,
		defaultCwd,
		uri: URI.file('/mcp.json'),
		configuration: remote
			? { type: McpServerType.REMOTE, url: 'https://example.com/mcp' }
			: { type: McpServerType.LOCAL, command: name },
		customization: { ...customization, name },
	});

	test('keeps primary stdio and all remote servers while skipping additional-root stdio', () => {
		const primary = URI.file('/primary');
		const remotePrimary = URI.parse('vscode-remote://ssh-remote+linux/primary');
		const relativePrimary = {
			...definition('relative-primary', primary),
			configuration: { type: McpServerType.LOCAL, command: 'relative-primary', cwd: '.' },
		} satisfies IMcpServerDefinition;
		const normalizedPrimary = {
			...definition('normalized-primary', primary),
			configuration: { type: McpServerType.LOCAL, command: 'normalized-primary', cwd: `${primary.fsPath}/child/..` },
		} satisfies IMcpServerDefinition;
		const result = toClaudeMcpServers([
			definition('primary', primary),
			definition('remote-primary', remotePrimary),
			relativePrimary,
			normalizedPrimary,
			definition('additional', URI.file('/additional')),
			definition('remote', URI.file('/additional'), true),
			{
				...definition('sse', URI.file('/additional'), true),
				configuration: { type: McpServerType.REMOTE, transport: 'sse', url: 'https://example.com/sse' },
			},
		], primary);

		assert.deepStrictEqual(Object.keys(result.servers), ['primary', 'remote-primary', 'relative-primary', 'normalized-primary', 'remote', 'sse']);
		assert.strictEqual(result.servers.sse.type, 'sse');
		assert.deepStrictEqual(result.skipped, ['additional']);
	});
});

suite('claudeSdkOptions / buildOptions plugins projection', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const proxyHandle: IClaudeProxyHandle = {
		baseUrl: 'http://127.0.0.1:0',
		nonce: 'n',
		dispose: () => { },
	};
	const proxyTransport: ClaudeTransport = { kind: 'proxy', handle: proxyHandle };

	function input(pluginUris: readonly URI[] | undefined) {
		return {
			sessionId: 's1',
			workingDirectory: URI.file('/tmp/x'),
			model: undefined,
			abortController: new AbortController(),
			permissionMode: 'default' as const,
			canUseTool: async () => ({ behavior: 'allow' as const, updatedInput: {} }),
			onElicitation: async () => ({ action: 'cancel' as const }),
			isResume: false,
			mcpServers: undefined,
			...(pluginUris !== undefined ? { plugins: pluginUris.map(uri => ({ uri, skipMcpDiscovery: true })) } : {}),
		};
	}

	test('non-empty plugins project without duplicate SDK MCP discovery', async () => {
		const opts = await buildOptions(
			input([URI.file('/p/a'), URI.file('/p/b')]),
			proxyTransport,
			() => { },
		);
		assert.deepStrictEqual(opts.plugins, [
			{ type: 'local', path: URI.file('/p/a').fsPath, skipMcpDiscovery: true },
			{ type: 'local', path: URI.file('/p/b').fsPath, skipMcpDiscovery: true },
		]);
	});

	test('empty plugins array omits Options.plugins', async () => {
		const opts = await buildOptions(input([]), proxyTransport, () => { });
		assert.strictEqual(opts.plugins, undefined);
	});

	test('undefined plugins omits Options.plugins', async () => {
		const opts = await buildOptions(input(undefined), proxyTransport, () => { });
		assert.strictEqual(opts.plugins, undefined);
	});

	test('projects denied workspace MCP servers into startup settings', async () => {
		const opts = await buildOptions({
			...input(undefined),
			deniedMcpServers: [
				{ serverCommand: ['node', 'server.js'] },
				{ serverUrl: 'https://disabled.example.com/mcp' },
			],
		}, proxyTransport, () => { });
		assert.deepStrictEqual(typeof opts.settings === 'string' ? undefined : opts.settings?.deniedMcpServers, [
			{ serverCommand: ['node', 'server.js'] },
			{ serverUrl: 'https://disabled.example.com/mcp' },
		]);
	});

	test('UserPromptSubmit adds transient host context', async () => {
		const opts = await buildOptions({
			...input(undefined),
			getUserPromptAdditionalContext: () => 'Rename with exact casing',
		}, proxyTransport, () => { });
		const hook = opts.hooks?.UserPromptSubmit?.[0].hooks[0];
		const result = await hook?.({
			hook_event_name: 'UserPromptSubmit',
			prompt: 'Keep GitHub casing',
			session_id: 's1',
			transcript_path: '/tmp/transcript',
			cwd: '/tmp/x',
		}, undefined, { signal: new AbortController().signal });

		assert.deepStrictEqual(result, {
			hookSpecificOutput: {
				hookEventName: 'UserPromptSubmit',
				additionalContext: 'Rename with exact casing',
			},
		});
	});

	test('PreToolUse projects a host runtime restriction', async () => {
		const opts = await buildOptions({
			...input(undefined),
			onPreToolUse: (toolName, toolInput) => ({
				continue: false,
				stopReason: `${toolName}:${JSON.stringify(toolInput)}`,
			}),
		}, proxyTransport, () => { });
		const hook = opts.hooks?.PreToolUse?.[0].hooks[0];
		const result = await hook?.({
			hook_event_name: 'PreToolUse',
			tool_name: 'Bash',
			tool_input: { command: 'gh pr merge' },
			tool_use_id: 'tool-1',
			session_id: 's1',
			transcript_path: '/tmp/transcript',
			cwd: '/tmp/x',
		}, undefined, { signal: new AbortController().signal });

		assert.deepStrictEqual(result, {
			continue: false,
			stopReason: 'Bash:{"command":"gh pr merge"}',
		});
	});

	test('proxy transport sets ANTHROPIC_BASE_URL + per-session ANTHROPIC_AUTH_TOKEN', async () => {
		const opts = await buildOptions(input(undefined), proxyTransport, () => { });
		const env = (opts.settings as { env?: Record<string, string> }).env ?? {};
		assert.deepStrictEqual({
			baseUrl: env.ANTHROPIC_BASE_URL,
			authToken: env.ANTHROPIC_AUTH_TOKEN,
			nonessential: env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC,
			// Projected into `settings.env`; the CLI still re-stamps `AI_AGENT`
			// for its own Bash tool.
			aiAgent: env.AI_AGENT,
		}, {
			baseUrl: 'http://127.0.0.1:0',
			authToken: 'n.s1',
			nonessential: '1',
			aiAgent: 'github_copilot_vscode_agent',
		});
	});

	test('native transport omits ANTHROPIC_BASE_URL/ANTHROPIC_AUTH_TOKEN (subprocess env carries the user credentials)', async () => {
		const opts = await buildOptions(input(undefined), { kind: 'native' }, () => { });
		const env = (opts.settings as { env?: Record<string, string> }).env ?? {};
		assert.deepStrictEqual({
			baseUrl: env.ANTHROPIC_BASE_URL,
			authToken: env.ANTHROPIC_AUTH_TOKEN,
			nonessential: env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC,
		}, {
			baseUrl: undefined,
			authToken: undefined,
			nonessential: '1',
		});
	});
});

suite('claudeSdkOptions / buildOptions resumeSessionAt projection', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const proxyHandle: IClaudeProxyHandle = {
		baseUrl: 'http://127.0.0.1:0',
		nonce: 'n',
		dispose: () => { },
	};
	const proxyTransport: ClaudeTransport = { kind: 'proxy', handle: proxyHandle };

	function input(isResume: boolean, resumeSessionAt: string | undefined) {
		return {
			sessionId: 's1',
			workingDirectory: URI.file('/tmp/x'),
			model: undefined,
			abortController: new AbortController(),
			permissionMode: 'default' as const,
			canUseTool: async () => ({ behavior: 'allow' as const, updatedInput: {} }),
			onElicitation: async () => ({ action: 'cancel' as const }),
			isResume,
			mcpServers: undefined,
			...(resumeSessionAt !== undefined ? { resumeSessionAt } : {}),
		};
	}

	test('resume + resumeSessionAt projects onto Options.resume and Options.resumeSessionAt', async () => {
		const opts = await buildOptions(input(true, 'anchor-uuid'), proxyTransport, () => { });
		assert.deepStrictEqual(
			{ resume: opts.resume, sessionId: opts.sessionId, resumeSessionAt: opts.resumeSessionAt },
			{ resume: 's1', sessionId: undefined, resumeSessionAt: 'anchor-uuid' },
		);
	});

	test('resume without resumeSessionAt omits Options.resumeSessionAt', async () => {
		const opts = await buildOptions(input(true, undefined), proxyTransport, () => { });
		assert.deepStrictEqual(
			{ resume: opts.resume, resumeSessionAt: opts.resumeSessionAt },
			{ resume: 's1', resumeSessionAt: undefined },
		);
	});

	test('non-resume startup never carries resumeSessionAt even when provided', async () => {
		const opts = await buildOptions(input(false, 'anchor-uuid'), proxyTransport, () => { });
		assert.deepStrictEqual(
			{ sessionId: opts.sessionId, resume: opts.resume, resumeSessionAt: opts.resumeSessionAt },
			{ sessionId: 's1', resume: undefined, resumeSessionAt: undefined },
		);
	});
});

suite('claudeSdkOptions / buildOptions additionalDirectories projection', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const proxyHandle: IClaudeProxyHandle = {
		baseUrl: 'http://127.0.0.1:0',
		nonce: 'n',
		dispose: () => { },
	};
	const proxyTransport: ClaudeTransport = { kind: 'proxy', handle: proxyHandle };

	function input(additionalDirectories: readonly URI[] | undefined) {
		return {
			sessionId: 's1',
			workingDirectory: URI.file('/tmp/primary'),
			model: undefined,
			abortController: new AbortController(),
			permissionMode: 'default' as const,
			canUseTool: async () => ({ behavior: 'allow' as const, updatedInput: {} }),
			onElicitation: async () => ({ action: 'cancel' as const }),
			isResume: false,
			mcpServers: undefined,
			...(additionalDirectories !== undefined ? { additionalDirectories } : {}),
		};
	}

	test('projects cwd from the primary and additionalDirectories from the tail', async () => {
		const opts = await buildOptions(input([URI.file('/tmp/b'), URI.file('/tmp/c')]), proxyTransport, () => { });
		assert.deepStrictEqual(
			{ cwd: opts.cwd, additionalDirectories: opts.additionalDirectories },
			{ cwd: URI.file('/tmp/primary').fsPath, additionalDirectories: [URI.file('/tmp/b').fsPath, URI.file('/tmp/c').fsPath] },
		);
	});

	test('empty additionalDirectories omits Options.additionalDirectories', async () => {
		const opts = await buildOptions(input([]), proxyTransport, () => { });
		assert.deepStrictEqual(
			{ cwd: opts.cwd, additionalDirectories: opts.additionalDirectories },
			{ cwd: URI.file('/tmp/primary').fsPath, additionalDirectories: undefined },
		);
	});

	test('undefined additionalDirectories omits Options.additionalDirectories', async () => {
		const opts = await buildOptions(input(undefined), proxyTransport, () => { });
		assert.strictEqual(opts.additionalDirectories, undefined);
	});
});
