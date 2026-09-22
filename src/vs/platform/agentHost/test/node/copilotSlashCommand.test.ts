/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { renderCopilotSlashCommandOutput, type CopilotSlashCommandOutput, type ICopilotSlashCommandHandler, type RuntimeSlashCommandInfo } from '../../node/copilot/copilotSlashCommand.js';
import { CopilotSlashCommandProvider } from '../../node/copilot/copilotSlashCommandProvider.js';

suite('Copilot slash command output', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const cases: { name: string; output: CopilotSlashCommandOutput; expected: string }[] = [
		{
			name: 'escapes text when markdown is omitted',
			output: { kind: 'text', text: '*report*' },
			expected: '\\*report\\*',
		},
		{
			name: 'escapes explicitly plain text',
			output: { kind: 'text', text: '*report*', markdown: false },
			expected: '\\*report\\*',
		},
		{
			name: 'preserves explicitly marked Markdown',
			output: { kind: 'text', text: '*report*', markdown: true },
			expected: '*report*',
		},
		{
			name: 'renders a link without opting into preview',
			output: { kind: 'link', resource: URI.parse('file:///diagnostics/report.md'), label: 'Open Report' },
			expected: '[Open Report](file:///diagnostics/report.md)',
		},
		{
			name: 'does not request preview when explicitly disabled',
			output: { kind: 'link', resource: URI.parse('file:///diagnostics/report.md'), label: 'Open Report', preview: false },
			expected: '[Open Report](file:///diagnostics/report.md)',
		},
		{
			name: 'renders a Markdown preview link',
			output: { kind: 'link', resource: URI.parse('file:///diagnostics/report.md'), label: 'Open Report', preview: true },
			expected: '[Open Report](file:///diagnostics/report.md?vscodeLinkType%3Dmarkdown-preview)',
		},
		{
			name: 'preserves query and fragment when requesting preview',
			output: { kind: 'link', resource: URI.parse('file:///diagnostics/report.md?view=full#section'), label: 'Open Report', preview: true },
			expected: '[Open Report](file:///diagnostics/report.md?view%3Dfull%26vscodeLinkType%3Dmarkdown-preview#section)',
		},
		{
			name: 'escapes the link label',
			output: { kind: 'link', resource: URI.parse('file:///diagnostics/report.md'), label: 'Open [Report]' },
			expected: '[Open [Report\\]](file:///diagnostics/report.md)',
		},
	];

	for (const { name, output, expected } of cases) {
		test(name, () => {
			assert.strictEqual(renderCopilotSlashCommandOutput(output), expected);
		});
	}
});

suite('Copilot slash command handlers', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const command: RuntimeSlashCommandInfo = {
		name: 'diagnostic',
		aliases: ['diag'],
		kind: 'builtin',
		description: 'Show diagnostics',
		allowDuringAgentExecution: true,
	};

	test('preserves SDK commands when handler lookup is omitted', async () => {
		const provider = new CopilotSlashCommandProvider(async () => [command], undefined, store.add(new NullLogService()));

		assert.deepStrictEqual({
			byName: await provider.resolveSlashCommand('diagnostic'),
			byAlias: await provider.resolveSlashCommand('/DIAG'),
			missing: await provider.resolveSlashCommand('missing'),
		}, {
			byName: command,
			byAlias: command,
			missing: undefined,
		});
	});

	for (const handler of [undefined, {}] satisfies (ICopilotSlashCommandHandler | undefined)[]) {
		test(`preserves SDK commands with ${handler ? 'empty' : 'no matching'} handlers`, async () => {
			const provider = new CopilotSlashCommandProvider(async () => [command], {
				getCommandHandler: () => handler,
			}, store.add(new NullLogService()));

			assert.deepStrictEqual(await provider.resolveSlashCommand('diagnostic'), command);
		});
	}

	test('attaches hooks to canonical commands without changing catalog metadata', async () => {
		const handler: ICopilotSlashCommandHandler = {
			getInvocation: input => ({ name: 'diagnostic', input: `report ${input}` }),
			getOutput: async (_input, result) => result.kind === 'text' ? { kind: 'text', text: result.text, markdown: true } : undefined,
		};
		const provider = new CopilotSlashCommandProvider(async () => [command], {
			getCommandHandler: resolved => resolved.name === command.name ? handler : undefined,
		}, store.add(new NullLogService()));
		const resolved = await provider.resolveSlashCommand('/DIAG');
		const output = await resolved?.getOutput?.('all', { kind: 'text', text: '**Report**' });

		assert.deepStrictEqual({
			invocation: resolved?.getInvocation?.('all'),
			output: output && renderCopilotSlashCommandOutput(output),
			catalogCommand: (await provider.getSlashCommands()).find(item => item.name === command.name),
			catalogHasHooks: Object.hasOwn(command, 'getOutput') || Object.hasOwn(command, 'getInvocation'),
		}, {
			invocation: { name: 'diagnostic', input: 'report all' },
			output: '**Report**',
			catalogCommand: command,
			catalogHasHooks: false,
		});
	});

	test('supports output-only handlers and synchronous link results', async () => {
		const output: CopilotSlashCommandOutput = { kind: 'link', resource: URI.parse('file:///diagnostics/report.md'), label: 'Open Report' };
		const provider = new CopilotSlashCommandProvider(async () => [command], {
			getCommandHandler: () => ({ getOutput: () => output }),
		}, store.add(new NullLogService()));
		const resolved = await provider.resolveSlashCommand('diagnostic');

		assert.deepStrictEqual({
			getInvocation: resolved?.getInvocation,
			output: await resolved?.getOutput?.('', { kind: 'completed', message: 'Report saved' }),
		}, {
			getInvocation: undefined,
			output,
		});
	});

	test('supports invocation-only handlers', async () => {
		const provider = new CopilotSlashCommandProvider(async () => [command], {
			getCommandHandler: () => ({ getInvocation: () => ({ name: 'diagnostic', input: 'report' }) }),
		}, store.add(new NullLogService()));
		const resolved = await provider.resolveSlashCommand('diagnostic');

		assert.deepStrictEqual({
			invocation: resolved?.getInvocation?.(''),
			getOutput: resolved?.getOutput,
		}, {
			invocation: { name: 'diagnostic', input: 'report' },
			getOutput: undefined,
		});
	});

	test('allows handlers to defer to the SDK invocation and output', async () => {
		const provider = new CopilotSlashCommandProvider(async () => [command], {
			getCommandHandler: () => ({
				getInvocation: () => undefined,
				getOutput: async () => undefined,
			}),
		}, store.add(new NullLogService()));
		const resolved = await provider.resolveSlashCommand('diagnostic');

		assert.deepStrictEqual({
			invocation: resolved?.getInvocation?.(''),
			output: await resolved?.getOutput?.('', { kind: 'completed' }),
		}, {
			invocation: undefined,
			output: undefined,
		});
	});
});
