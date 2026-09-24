/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Application, Logger } from '../../../../automation';
import { dumpFailureDiagnostics } from '../../utils';
import { setupAgentHostSuite, warmUpAgentHostModel } from '../agentsWindow/agentsWindow.test';
import { shellEchoResponseMatcher } from '../chat/shellScenarios';
import { managedSettingsEnv, managedSettingsFixture } from './managedSettings';

export function setup(logger: Logger): void {
	const isWindows = process.platform === 'win32';
	const fileSystemPlatform = isWindows ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux';
	for (const localSandbox of ['off', 'on']) {
		describe(`Policy Plumbing (Agent Host managed sandbox, local ${localSandbox})`, function () {
			this.timeout(5 * 60 * 1000);
			this.retries(0);
			let policy: ReturnType<typeof managedSettingsFixture> | undefined;
			let probeDirectory: string | undefined;
			let probeFile: string;
			const settings: Record<string, unknown> = {
				[isWindows ? 'chat.agent.sandbox.enabledWindows' : 'chat.agent.sandbox.enabled']: localSandbox,
				'chat.agent.sandbox.allowUnsandboxedCommands': true,
			};
			const scenario = `smoke-managed-sandbox-${localSandbox}`;
			const blocked = 'MANAGED_SANDBOX_WRITE_BLOCKED';
			const completed = 'MANAGED_SANDBOX_SHELL_COMPLETED';
			const original = 'UNCHANGED_MANAGED_SANDBOX_PROBE';

			before(() => {
				policy = managedSettingsFixture();
				probeDirectory = fs.mkdtempSync(path.join(os.homedir(), '.vscode-managed-sandbox-smoke-'));
				probeFile = path.join(probeDirectory, 'probe.txt');
				// Prove the file is writable outside the sandbox, then require the
				// SDK shell to leave it unchanged. This is never a user's file.
				fs.writeFileSync(probeFile, original);
				settings[`chat.agent.sandbox.fileSystem.${fileSystemPlatform}`] = { denyWrite: [probeDirectory] };
				policy.set({ sandbox: { enabled: true, allowBypass: false } });
			});

			setupAgentHostSuite(logger, {
				serverLabel: 'managed sandbox',
				registerScenarios: ({ registerScenario }) => registerScenario(scenario, {
					type: 'multi-turn',
					turns: [
						{
							kind: 'tool-calls',
							toolCalls: [{
								toolNamePattern: isWindows ? /^(pwsh|powershell)$/i : /^bash$/,
								arguments: {
									command: isWindows
										? `try { Set-Content -LiteralPath '${probeFile.replace(/'/g, `''`)}' -Value changed -NoNewline -ErrorAction Stop; Write-Output UNEXPECTED_UNSANDBOXED_WRITE } catch [System.UnauthorizedAccessException] { Write-Output ${blocked} }; Write-Output ${completed}`
										: `if printf changed > '${probeFile.replace(/'/g, `'\\''`)}'; then echo UNEXPECTED_UNSANDBOXED_WRITE; else echo ${blocked}; fi; echo ${completed}`,
								},
							}],
						},
						{ kind: 'echo-last-message' },
					],
				}),
				settings,
				extraEnv: managedSettingsEnv,
			});
			after(() => {
				try {
					policy?.clear();
				} finally {
					if (probeDirectory) {
						fs.rmSync(probeDirectory, { recursive: true, force: true });
					}
				}
			});

			it('runs a shell without a policy conflict and prevents an out-of-sandbox write', async function () {
				const app = this.app as Application;
				try {
					await warmUpAgentHostModel(app, logger, 'Managed sandbox');
					await app.workbench.agentsWindow.submitNewSessionPrompt(`test enforced sandbox [scenario:${scenario}]`);
					const text = await app.workbench.agentsWindow.waitForAssistantText(shellEchoResponseMatcher(completed), 120_000);
					assert.match(text, shellEchoResponseMatcher(blocked));
					assert.strictEqual(fs.readFileSync(probeFile, 'utf8'), original, 'The SDK shell wrote outside the sandbox');
				} catch (error) {
					await dumpFailureDiagnostics(app, logger, 'Managed sandbox');
					throw error;
				}
			});
		});
	}
}
