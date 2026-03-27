/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { DeferredPromise, assertNoRpc, closeAllEditors, disposeAll } from '../utils';

const enum ShellIntegrationTimeoutOverride {
	DisableForTests = -2
}

const isWindows = process.platform === 'win32';
const isMacOS = process.platform === 'darwin';
const sandboxFileSystemSetting = isMacOS
	? 'chat.tools.terminal.sandbox.macFileSystem'
	: 'chat.tools.terminal.sandbox.linuxFileSystem';

/**
 * Extracts all text content from a LanguageModelToolResult.
 */
function extractTextContent(result: vscode.LanguageModelToolResult): string {
	return result.content
		.filter((c): c is vscode.LanguageModelTextPart => c instanceof vscode.LanguageModelTextPart)
		.map(c => c.value)
		.join('');
}

(vscode.env.uiKind === vscode.UIKind.Web ? suite.skip : suite)('chat - run_in_terminal', () => {

	let disposables: vscode.Disposable[] = [];

	setup(async () => {
		disposables = [];

		// Register a dummy default model required for participant requests
		disposables.push(vscode.lm.registerLanguageModelChatProvider('copilot', {
			async provideLanguageModelChatInformation(_options, _token) {
				return [{
					id: 'test-lm',
					name: 'test-lm',
					family: 'test',
					version: '1.0.0',
					maxInputTokens: 100,
					maxOutputTokens: 100,
					isDefault: true,
					isUserSelectable: true,
					capabilities: {}
				}];
			},
			async provideLanguageModelChatResponse(_model, _messages, _options, _progress, _token) {
				return undefined;
			},
			async provideTokenCount(_model, _text, _token) {
				return 1;
			},
		}));

		// Enable global auto-approve + skip the confirmation dialog via test-mode context key
		const chatToolsConfig = vscode.workspace.getConfiguration('chat.tools.global');
		await chatToolsConfig.update('autoApprove', true, vscode.ConfigurationTarget.Global);
		await vscode.commands.executeCommand('setContext', 'vscode.chat.tools.global.autoApprove.testMode', true);
	});

	teardown(async () => {
		assertNoRpc();
		await closeAllEditors();
		disposeAll(disposables);
		participantRegistered = false;
		pendingResult = undefined;
		pendingCommand = undefined;
		pendingOptions = undefined;

		const chatToolsConfig = vscode.workspace.getConfiguration('chat.tools.global');
		await chatToolsConfig.update('autoApprove', undefined, vscode.ConfigurationTarget.Global);
		await vscode.commands.executeCommand('setContext', 'vscode.chat.tools.global.autoApprove.testMode', undefined);
	});

	/**
	 * Helper: invokes run_in_terminal via a chat participant and returns the tool result text.
	 * Each call creates a new chat session to avoid participant re-registration issues.
	 */
	interface RunInTerminalOptions {
		timeout?: number;
		requestUnsandboxedExecution?: boolean;
		requestUnsandboxedExecutionReason?: string;
	}

	let participantRegistered = false;
	let pendingResult: DeferredPromise<vscode.LanguageModelToolResult> | undefined;
	let pendingCommand: string | undefined;
	let pendingOptions: RunInTerminalOptions | undefined;

	function setupParticipant() {
		if (participantRegistered) {
			return;
		}
		participantRegistered = true;
		const participant = vscode.chat.createChatParticipant('api-test.participant', async (request, _context, _progress, _token) => {
			if (!pendingResult || !pendingCommand) {
				return {};
			}
			const currentResult = pendingResult;
			const currentCommand = pendingCommand;
			const currentOptions = pendingOptions ?? {};
			pendingResult = undefined;
			pendingCommand = undefined;
			pendingOptions = undefined;
			try {
				const result = await vscode.lm.invokeTool('run_in_terminal', {
					input: {
						command: currentCommand,
						explanation: 'Integration test command',
						goal: 'Test run_in_terminal output',
						isBackground: false,
						timeout: currentOptions.timeout ?? 15000,
						...currentOptions.requestUnsandboxedExecution ? {
							requestUnsandboxedExecution: true,
							requestUnsandboxedExecutionReason: currentOptions.requestUnsandboxedExecutionReason,
						} : {},
					},
					toolInvocationToken: request.toolInvocationToken,
				});
				currentResult.complete(result);
			} catch (e) {
				currentResult.error(e);
			}
			return {};
		});
		disposables.push(participant);
	}

	async function invokeRunInTerminal(command: string, options?: RunInTerminalOptions): Promise<string>;
	async function invokeRunInTerminal(command: string, timeout?: number): Promise<string>;
	async function invokeRunInTerminal(command: string, optionsOrTimeout?: RunInTerminalOptions | number): Promise<string> {
		setupParticipant();

		const opts: RunInTerminalOptions = typeof optionsOrTimeout === 'number'
			? { timeout: optionsOrTimeout }
			: optionsOrTimeout ?? {};
		const resultPromise = new DeferredPromise<vscode.LanguageModelToolResult>();
		pendingResult = resultPromise;
		pendingCommand = command;
		pendingOptions = opts;

		await vscode.commands.executeCommand('workbench.action.chat.newChat');
		vscode.commands.executeCommand('workbench.action.chat.open', { query: '@participant test' });

		const result = await resultPromise.p;
		return extractTextContent(result);
	}

	test('tool should be registered with expected schema', async function () {
		this.timeout(15000);
		// The run_in_terminal tool is registered asynchronously (it needs to
		// resolve terminal profiles), so poll until it appears.
		let tool: vscode.LanguageModelToolInformation | undefined;
		for (let i = 0; i < 50; i++) {
			tool = vscode.lm.tools.find(t => t.name === 'run_in_terminal');
			if (tool) {
				break;
			}
			await new Promise(r => setTimeout(r, 200));
		}
		assert.ok(tool, 'run_in_terminal tool should be registered');
		assert.ok(tool.inputSchema, 'Tool should have an input schema');

		const schema = tool.inputSchema as { properties?: Record<string, unknown> };
		assert.ok(schema.properties?.['command'], 'Schema should have a command property');
		assert.ok(schema.properties?.['explanation'], 'Schema should have an explanation property');
		assert.ok(schema.properties?.['goal'], 'Schema should have a goal property');
		assert.ok(schema.properties?.['isBackground'], 'Schema should have an isBackground property');
	});

	// --- Shell integration OFF (fast idle polling) ---

	suite('shell integration off', () => {

		setup(async () => {
			const termConfig = vscode.workspace.getConfiguration('terminal.integrated');
			await termConfig.update('shellIntegration.enabled', false, vscode.ConfigurationTarget.Global);
			await termConfig.update('shellIntegration.timeout', ShellIntegrationTimeoutOverride.DisableForTests, vscode.ConfigurationTarget.Global);

			const toolConfig = vscode.workspace.getConfiguration('chat.tools.terminal');
			await toolConfig.update('idlePollInterval', 100, vscode.ConfigurationTarget.Global);
		});

		teardown(async () => {
			const termConfig = vscode.workspace.getConfiguration('terminal.integrated');
			await termConfig.update('shellIntegration.enabled', undefined, vscode.ConfigurationTarget.Global);
			await termConfig.update('shellIntegration.timeout', undefined, vscode.ConfigurationTarget.Global);

			const toolConfig = vscode.workspace.getConfiguration('chat.tools.terminal');
			await toolConfig.update('idlePollInterval', undefined, vscode.ConfigurationTarget.Global);
		});

		defineTests(false);
	});

	// --- Shell integration ON ---

	suite('shell integration on', () => {
		defineTests(true);
	});

	function defineTests(hasShellIntegration: boolean) {

		// --- Sandbox OFF tests ---

		suite('sandbox off', () => {

			test('echo command returns exactly the echoed text', async function () {
				this.timeout(60000);

				const marker = `MARKER_${Date.now()}_ECHO`;
				const output = await invokeRunInTerminal(`echo ${marker}`);

				assert.strictEqual(output.trim(), marker);
			});

			test('no-output command reports empty output, not prompt echo (issue #303531)', async function () {
				this.timeout(60000);

				// `true` on Unix exits 0 with no output; `cmd /c rem` on Windows is a no-op
				const command = isWindows ? 'cmd /c rem' : 'true';
				const output = await invokeRunInTerminal(command);

				assert.strictEqual(output.trim(), 'Command produced no output');
			});

			test('multi-line output preserves all lines in order', async function () {
				this.timeout(60000);

				const m1 = `M1_${Date.now()}`;
				const m2 = `M2_${Date.now()}`;
				const m3 = `M3_${Date.now()}`;
				// Use `;` on Windows (PowerShell) since `&&` is rewritten to `;`
				const sep = isWindows ? ';' : '&&';
				const output = await invokeRunInTerminal(`echo ${m1} ${sep} echo ${m2} ${sep} echo ${m3}`);

				// Without shell integration, idle polling may miss the
				// output on slow CI machines.
				const acceptable = [
					`${m1}\n${m2}\n${m3}`,
					...(!hasShellIntegration ? ['Command produced no output'] : []),
				];
				assert.ok(acceptable.includes(output.trim()), `Unexpected output: ${JSON.stringify(output.trim())}`);
			});

			(isWindows ? test : test.skip)('&& operators are converted to ; on PowerShell', async function () {
				this.timeout(60000);

				const m1 = `CHAIN_${Date.now()}_A`;
				const m2 = `CHAIN_${Date.now()}_B`;
				const output = await invokeRunInTerminal(`echo ${m1} && echo ${m2}`);

				// The rewriter prepends a note explaining the simplification
				const trimmed = output.trim();
				assert.ok(trimmed.startsWith('Note: The tool simplified the command to'), `Expected rewrite note, got: ${trimmed}`);
				assert.ok(trimmed.endsWith(`${m1}\n${m2}`), `Expected markers at end, got: ${trimmed}`);
			});

			test('non-zero exit code is reported', async function () {
				this.timeout(60000);

				// Use a subshell so we don't kill the shared terminal
				const command = isWindows ? 'cmd /c exit 42' : 'bash -c "exit 42"';
				const output = await invokeRunInTerminal(command);

				// Without shell integration, exit codes are unavailable.
				// On Windows with shell integration, `cmd /c exit 42` may report
				// exit code 1 instead of 42 due to how PowerShell propagates
				// cmd.exe exit codes through shell integration sequences.
				const acceptable = [
					'Command produced no output\nCommand exited with code 42',
					...(!hasShellIntegration ? ['Command produced no output'] : []),
					...(isWindows && hasShellIntegration ? ['Command produced no output\nCommand exited with code 1'] : []),
				];
				assert.ok(acceptable.includes(output.trim()), `Unexpected output: ${JSON.stringify(output.trim())}`);
			});

			test('output with special characters is captured verbatim', async function () {
				this.timeout(60000);

				const marker = `SP_${Date.now()}`;
				const output = await invokeRunInTerminal(`echo "${marker} hello & world"`);

				assert.strictEqual(output.trim(), `${marker} hello & world`);
			});

		});

		// --- Sandbox ON tests (macOS and Linux only) ---

		(isWindows ? suite.skip : suite)('sandbox on', () => {

			setup(async () => {
				const sandboxConfig = vscode.workspace.getConfiguration('chat.tools.terminal.sandbox');
				await sandboxConfig.update('enabled', true, vscode.ConfigurationTarget.Global);
			});

			teardown(async () => {
				const sandboxConfig = vscode.workspace.getConfiguration('chat.tools.terminal.sandbox');
				await sandboxConfig.update('enabled', undefined, vscode.ConfigurationTarget.Global);
			});

			test('echo works in sandbox and output is clean', async function () {
				this.timeout(60000);

				const marker = `SANDBOX_ECHO_${Date.now()}`;
				const output = await invokeRunInTerminal(`echo ${marker}`);

				assert.strictEqual(output.trim(), marker);
			});

			test('network requests are blocked', async function () {
				this.timeout(60000);

				const output = await invokeRunInTerminal('curl -s --max-time 5 https://example.com');

				// Without shell integration, exit code is unavailable and
				// curl produces no sandbox-specific error strings, so the
				// sandbox analyzer may not trigger.
				const acceptable = [
					[
						'Command failed while running in sandboxed mode. If the command failed due to sandboxing:',
						`- If it would be reasonable to extend the sandbox rules, work with the user to update allowWrite for file system access problems in ${sandboxFileSystemSetting}, or to add required domains to chat.tools.terminal.sandbox.network.allowedDomains.`,
						'- Otherwise, immediately retry the command with requestUnsandboxedExecution=true. Do NOT ask the user \u2014 setting this flag automatically shows a confirmation prompt to the user.',
						'',
						'Here is the output of the command:',
						'',
						'',
						'',
						'Command produced no output',
						'Command exited with code 56',
					].join('\n'),
					...(!hasShellIntegration ? ['Command produced no output'] : []),
				];
				assert.ok(acceptable.includes(output.trim()), `Unexpected output: ${JSON.stringify(output.trim())}`);
			});

			test('requestUnsandboxedExecution preserves sandbox $TMPDIR', async function () {
				this.timeout(60000);

				const marker = `SANDBOX_UNSANDBOX_${Date.now()}`;
				const sentinelName = `sentinel-${marker}.txt`;

				// Step 1: Write a sentinel file into the sandbox-provided $TMPDIR.
				const writeOutput = await invokeRunInTerminal(`echo ${marker} > "$TMPDIR/${sentinelName}" && echo ${marker}`);
				assert.strictEqual(writeOutput.trim(), marker);

				// Step 2: Retry with requestUnsandboxedExecution=true while sandbox
				// stays enabled. The tool should preserve $TMPDIR from the sandbox so
				// the sentinel file created in step 1 is still accessible.
				const retryOutput = await invokeRunInTerminal(`cat "$TMPDIR/${sentinelName}"`, {
					timeout: 30000,
					requestUnsandboxedExecution: true,
					requestUnsandboxedExecutionReason: 'Need to verify $TMPDIR persists on unsandboxed retry',
				});
				assert.strictEqual(retryOutput.trim(), marker);
			});

			test('cannot write to /tmp', async function () {
				this.timeout(60000);

				const marker = `SANDBOX_TMP_${Date.now()}`;
				const output = await invokeRunInTerminal(`echo "${marker}" > /tmp/${marker}.txt`);

				// macOS sandbox-exec returns "Operation not permitted" via /bin/bash;
				// Linux read-only bind mount returns "Read-only file system" via /usr/bin/bash.
				// Some shells include "line N:" in the error (e.g. "/usr/bin/bash: line 1: …").
				const shellError = isMacOS
					? `/bin/bash: /tmp/${marker}.txt: Operation not permitted`
					: `/usr/bin/bash: line 1: /tmp/${marker}.txt: Read-only file system`;
				const sandboxBody = [
					`- If it would be reasonable to extend the sandbox rules, work with the user to update allowWrite for file system access problems in ${sandboxFileSystemSetting}, or to add required domains to chat.tools.terminal.sandbox.network.allowedDomains.`,
					'- Otherwise, immediately retry the command with requestUnsandboxedExecution=true. Do NOT ask the user \u2014 setting this flag automatically shows a confirmation prompt to the user.',
					'',
					'Here is the output of the command:',
					'',
					shellError,
				].join('\n');
				const acceptable = [
					// With shell integration: known failure with exit code
					`Command failed while running in sandboxed mode. If the command failed due to sandboxing:\n${sandboxBody}\n\nCommand exited with code 1`,
					// Without shell integration: heuristic detection, no exit code
					...(!hasShellIntegration ? [`Command ran in sandboxed mode and may have been blocked by the sandbox. If the command failed due to sandboxing:\n${sandboxBody}`] : []),
				];
				assert.ok(acceptable.includes(output.trim()), `Unexpected output: ${JSON.stringify(output.trim())}`);
			});

			test('can read files outside the workspace', async function () {
				this.timeout(60000);

				const output = await invokeRunInTerminal('head -1 /etc/shells');

				const trimmed = output.trim();
				// macOS: "# List of acceptable shells for chpass(1)."
				// Linux: "# /etc/shells: valid login shells"
				assert.ok(
					trimmed.startsWith('#'),
					`Expected a comment line from /etc/shells, got: ${trimmed}`
				);
			});

			test('can write inside the workspace folder', async function () {
				this.timeout(60000);

				const marker = `SANDBOX_WS_${Date.now()}`;
				const output = await invokeRunInTerminal(`echo "${marker}" > .sandbox-test-${marker}.tmp && cat .sandbox-test-${marker}.tmp && rm .sandbox-test-${marker}.tmp`);

				assert.strictEqual(output.trim(), marker);
			});

			test('$TMPDIR is writable inside the sandbox', async function () {
				this.timeout(60000);

				const marker = `SANDBOX_TMPDIR_${Date.now()}`;
				const output = await invokeRunInTerminal(`echo "${marker}" > "$TMPDIR/${marker}.tmp" && cat "$TMPDIR/${marker}.tmp" && rm "$TMPDIR/${marker}.tmp"`);

				assert.strictEqual(output.trim(), marker);
			});
		});
	}
});
