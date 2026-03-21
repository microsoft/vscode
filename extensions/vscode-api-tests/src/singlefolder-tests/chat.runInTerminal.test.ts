/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { DeferredPromise, assertNoRpc, closeAllEditors, disposeAll } from '../utils';

const isWindows = process.platform === 'win32';

/**
 * Extracts all text content from a LanguageModelToolResult.
 */
function extractTextContent(result: vscode.LanguageModelToolResult): string {
	return result.content
		.filter((c): c is vscode.LanguageModelTextPart => c instanceof vscode.LanguageModelTextPart)
		.map(c => c.value)
		.join('');
}

// https://github.com/microsoft/vscode/issues/303531
(vscode.env.uiKind === vscode.UIKind.Web ? suite.skip : suite)('chat - run_in_terminal (issue #303531)', () => {

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
		pendingTimeout = undefined;

		const chatToolsConfig = vscode.workspace.getConfiguration('chat.tools.global');
		await chatToolsConfig.update('autoApprove', undefined, vscode.ConfigurationTarget.Global);
		await vscode.commands.executeCommand('setContext', 'vscode.chat.tools.global.autoApprove.testMode', undefined);
	});

	/**
	 * Helper: invokes run_in_terminal via a chat participant and returns the tool result text.
	 * Each call creates a new chat session to avoid participant re-registration issues.
	 */
	let participantRegistered = false;
	let pendingResult: DeferredPromise<vscode.LanguageModelToolResult> | undefined;
	let pendingCommand: string | undefined;
	let pendingTimeout: number | undefined;

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
			const currentTimeout = pendingTimeout ?? 15000;
			pendingResult = undefined;
			pendingCommand = undefined;
			pendingTimeout = undefined;
			try {
				const result = await vscode.lm.invokeTool('run_in_terminal', {
					input: {
						command: currentCommand,
						explanation: 'Integration test command',
						goal: 'Test run_in_terminal output',
						isBackground: false,
						timeout: currentTimeout
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

	async function invokeRunInTerminal(command: string, timeout = 15000): Promise<string> {
		setupParticipant();

		const resultPromise = new DeferredPromise<vscode.LanguageModelToolResult>();
		pendingResult = resultPromise;
		pendingCommand = command;
		pendingTimeout = timeout;

		await vscode.commands.executeCommand('workbench.action.chat.newChat');
		vscode.commands.executeCommand('workbench.action.chat.open', { query: '@participant test' });

		const result = await resultPromise.p;
		return extractTextContent(result);
	}

	test('tool should be registered with expected schema', () => {
		const tool = vscode.lm.tools.find(t => t.name === 'run_in_terminal');
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
			await termConfig.update('shellIntegration.timeout', 0, vscode.ConfigurationTarget.Global);

			const toolConfig = vscode.workspace.getConfiguration('chat.tools.terminal');
			await toolConfig.update('idlePollInterval', 50, vscode.ConfigurationTarget.Global);
		});

		teardown(async () => {
			const termConfig = vscode.workspace.getConfiguration('terminal.integrated');
			await termConfig.update('shellIntegration.enabled', undefined, vscode.ConfigurationTarget.Global);
			await termConfig.update('shellIntegration.timeout', undefined, vscode.ConfigurationTarget.Global);

			const toolConfig = vscode.workspace.getConfiguration('chat.tools.terminal');
			await toolConfig.update('idlePollInterval', undefined, vscode.ConfigurationTarget.Global);
		});

		defineTests();
	});

	// --- Shell integration ON ---

	suite('shell integration on', () => {
		defineTests();
	});

	function defineTests() {

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
				const output = await invokeRunInTerminal(`echo ${m1} && echo ${m2} && echo ${m3}`);

				assert.strictEqual(output.trim(), `${m1}\n${m2}\n${m3}`);
			});

			test('non-zero exit code is reported', async function () {
				this.timeout(60000);

				// Use a subshell so we don't kill the shared terminal
				const command = isWindows ? 'cmd /c exit 42' : 'bash -c "exit 42"';
				const output = await invokeRunInTerminal(command);

				assert.strictEqual(output.trim(), 'Command produced no output\nCommand exited with code 42');
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

				// The sandbox blocks network access. curl fails and the sandbox
				// output analyzer prepends its error message.
				assert.strictEqual(output.trim(), [
					'Command failed while running in sandboxed mode. If the command failed due to sandboxing:',
					'- If it would be reasonable to extend the sandbox rules, work with the user to update allowWrite for file system access problems in chat.tools.terminal.sandbox.macFileSystem, or to add required domains to chat.tools.terminal.sandbox.network.allowedDomains.',
					'- Otherwise, immediately retry the command with requestUnsandboxedExecution=true. Do NOT ask the user \u2014 setting this flag automatically shows a confirmation prompt to the user.',
					'',
					'Here is the output of the command:',
					'',
					'',
					'',
					'Command produced no output',
					'Command exited with code 56',
				].join('\n'));
			});

			test('cannot write to /tmp', async function () {
				this.timeout(60000);

				const marker = `SANDBOX_TMP_${Date.now()}`;
				const output = await invokeRunInTerminal(`echo "${marker}" > /tmp/${marker}.txt`);

				assert.strictEqual(output.trim(), [
					'Command failed while running in sandboxed mode. If the command failed due to sandboxing:',
					'- If it would be reasonable to extend the sandbox rules, work with the user to update allowWrite for file system access problems in chat.tools.terminal.sandbox.macFileSystem, or to add required domains to chat.tools.terminal.sandbox.network.allowedDomains.',
					'- Otherwise, immediately retry the command with requestUnsandboxedExecution=true. Do NOT ask the user \u2014 setting this flag automatically shows a confirmation prompt to the user.',
					'',
					'Here is the output of the command:',
					'',
					`/bin/bash: /tmp/${marker}.txt: Operation not permitted`,
					'',
					'',
					'Command exited with code 1',
				].join('\n'));
			});

			test('can read files outside the workspace', async function () {
				this.timeout(60000);

				const output = await invokeRunInTerminal('head -1 /etc/shells');

				assert.strictEqual(output.trim(), '# List of acceptable shells for chpass(1).');
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
