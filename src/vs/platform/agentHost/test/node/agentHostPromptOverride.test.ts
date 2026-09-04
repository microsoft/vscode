/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Tool } from '@github/copilot-sdk';
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { NullLogService } from '../../../log/common/log.js';
import { applyConfiguredPromptOverrides } from '../../node/copilot/prompts/promptOverride.js';

suite('AgentHostPromptOverride', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('inline YAML overrides the system prompt and tool descriptions and takes precedence over a file', async () => {
		const logService = new NullLogService();
		const fileService = disposables.add(new FileService(logService));
		const tools: Tool[] = [
			{ name: 'read_file', description: 'Read a file' },
			{ name: 'run_tests', description: 'Run tests' },
		];
		const result = await applyConfiguredPromptOverrides([
			'systemPrompt: You are an evaluation agent.',
			'toolDescriptions:',
			'  read_file:',
			'    description: Read exactly one file.',
		].join('\n'), '/path/that/must/not/be/read.yaml', tools, fileService, logService);

		assert.deepStrictEqual(result, {
			systemPrompt: 'You are an evaluation agent.',
			tools: [
				{ name: 'read_file', description: 'Read exactly one file.' },
				{ name: 'run_tests', description: 'Run tests' },
			],
		});
	});

	test('applies BOM-prefixed overrides and ignores empty values', async () => {
		const logService = new NullLogService();
		const fileService = disposables.add(new FileService(logService));
		const tools: Tool[] = [
			{ name: 'date_prefixed', description: 'original' },
			{ name: 'null_description', description: 'original' },
			{ name: 'quoted_empty_description', description: 'original' },
		];
		const result = await applyConfiguredPromptOverrides('\uFEFF' + [
			'systemPrompt: 2024-01-02 evaluation agent',
			'toolDescriptions:',
			'  date_prefixed:',
			'    description: 2024-01-02 do exactly one thing',
			'  null_description:',
			'    description:',
			'  quoted_empty_description:',
			'    description: ""',
		].join('\n'), undefined, tools, fileService, logService);

		assert.deepStrictEqual(result, {
			systemPrompt: '2024-01-02 evaluation agent',
			tools: [
				{ name: 'date_prefixed', description: '2024-01-02 do exactly one thing' },
				{ name: 'null_description', description: 'original' },
				{ name: 'quoted_empty_description', description: 'original' },
			],
		});
	});

	test('ignores a quoted empty system prompt', async () => {
		const logService = new NullLogService();
		const fileService = disposables.add(new FileService(logService));
		const result = await applyConfiguredPromptOverrides('systemPrompt: ""', undefined, [], fileService, logService);

		assert.deepStrictEqual(result, { tools: [] });
	});
});
