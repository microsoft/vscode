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

	test('matches js-yaml string semantics for implicitly typed scalars', async () => {
		const logService = new NullLogService();
		const fileService = disposables.add(new FileService(logService));
		const tools: Tool[] = ['null_value', 'boolean_value', 'integer_value', 'float_value', 'date_value', 'quoted_value', 'literal_value', 'folded_value']
			.map(name => ({ name, description: 'original' }));
		const result = await applyConfiguredPromptOverrides([
			'systemPrompt: false',
			'toolDescriptions:',
			'  null_value:',
			'    description: null',
			'  boolean_value:',
			'    description: true',
			'  integer_value:',
			'    description: 42',
			'  float_value:',
			'    description: 3.14',
			'  date_value:',
			'    description: 2024-01-02',
			'  quoted_value:',
			'    description: "42"',
			'  literal_value:',
			'    description: |-',
			'      literal',
			'  folded_value:',
			'    description: >-',
			'      folded',
			'      text',
		].join('\n'), undefined, tools, fileService, logService);

		assert.deepStrictEqual(result, {
			tools: [
				{ name: 'null_value', description: 'original' },
				{ name: 'boolean_value', description: 'original' },
				{ name: 'integer_value', description: 'original' },
				{ name: 'float_value', description: 'original' },
				{ name: 'date_value', description: 'original' },
				{ name: 'quoted_value', description: '42' },
				{ name: 'literal_value', description: 'literal' },
				{ name: 'folded_value', description: 'folded text' },
			],
		});
	});
});
