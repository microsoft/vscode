/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import type { ToolDefinition } from '../../../../common/state/sessionState.js';
import { workbenchClientProfileRunnerSource } from './workbenchClientProfileRunner.js';

suite('Workbench client profile runner', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function createRunner(options: {
		isActive?: boolean;
		missingExtension?: boolean;
		activationError?: Error;
		tools?: ToolDefinition[];
		commandError?: Error;
		output?: string | null;
	} = {}) {
		const events: string[] = [];
		const written: { tools?: ToolDefinition[]; error?: string }[] = [];
		const exports: { run?: () => Promise<void> } = {};
		const context = {
			exports,
			process: { env: { AGENT_HOST_CLIENT_PROFILE_OUTPUT: options.output === null ? undefined : options.output ?? 'profile.json' } },
			require: (id: string) => {
				if (id === 'fs/promises') {
					return {
						writeFile: async (path: string, contents: string) => {
							events.push(`write:${path}`);
							written.push(JSON.parse(contents));
						}
					};
				}
				assert.strictEqual(id, 'vscode');
				return {
					extensions: {
						getExtension: (extensionId: string) => {
							events.push(`extension:${extensionId}`);
							return options.missingExtension ? undefined : {
								isActive: options.isActive ?? false,
								activate: async () => {
									events.push('activate');
									if (options.activationError) {
										throw options.activationError;
									}
									await Promise.resolve();
									events.push('activated');
								}
							};
						}
					},
					commands: {
						executeCommand: async (command: string, optionsArgument: { toolSets: string[] }) => {
							events.push(`command:${command}:${optionsArgument.toolSets.join(',')}`);
							if (options.commandError) {
								throw options.commandError;
							}
							return options.tools;
						}
					}
				};
			}
		};
		new Function('exports', 'process', 'require', workbenchClientProfileRunnerSource)(context.exports, context.process, context.require);
		return { run: exports.run!, events, written };
	}

	test('awaits real extension activation before capturing the selected tool sets', async () => {
		const tools: ToolDefinition[] = [{ name: 'example', description: 'Runtime description', inputSchema: { type: 'object' } }];
		const runner = createRunner({ tools });
		await runner.run();
		assert.deepStrictEqual({ events: runner.events, written: runner.written }, {
			events: [
				'extension:GitHub.copilot-chat',
				'activate',
				'activated',
				'command:_test.captureAgentHostClientProfile:vscode-general,vscode-browser',
				'write:profile.json'
			],
			written: [{ tools }]
		});
	});

	test('does not reactivate an already active extension', async () => {
		const runner = createRunner({ isActive: true, tools: [{ name: 'example' }] });
		await runner.run();
		assert.deepStrictEqual(runner.events, [
			'extension:GitHub.copilot-chat',
			'command:_test.captureAgentHostClientProfile:vscode-general,vscode-browser',
			'write:profile.json'
		]);
	});

	test('propagates and captures activation failures without invoking the renderer', async () => {
		const error = new Error('activation failed');
		const runner = createRunner({ activationError: error });
		await assert.rejects(runner.run(), /activation failed/);
		assert.deepStrictEqual({ events: runner.events, written: runner.written }, {
			events: ['extension:GitHub.copilot-chat', 'activate', 'write:profile.json'],
			written: [{ error: error.stack }]
		});
	});

	test('rejects a missing extension', async () => {
		const runner = createRunner({ missingExtension: true });
		await assert.rejects(runner.run(), /real GitHub.copilot-chat extension is not available/);
		assert.deepStrictEqual(runner.events, ['extension:GitHub.copilot-chat', 'write:profile.json']);
	});

	test('rejects empty or missing profiles instead of supplying fallback tools', async () => {
		for (const tools of [undefined, []]) {
			const runner = createRunner({ tools });
			await assert.rejects(runner.run(), /returned no client tools/);
			assert.strictEqual(runner.written.length, 1);
		}
	});

	test('propagates renderer errors and bounds diagnostics', async () => {
		const runner = createRunner({ commandError: new Error('x'.repeat(20_000)) });
		await assert.rejects(runner.run(), /xxx/);
		assert.strictEqual(runner.written[0].error?.length, 16_384);
	});

	test('requires an output path before activating extensions', async () => {
		const runner = createRunner({ output: null });
		await assert.rejects(runner.run(), /AGENT_HOST_CLIENT_PROFILE_OUTPUT is required/);
		assert.deepStrictEqual({ events: runner.events, written: runner.written }, { events: [], written: [] });
	});
});
