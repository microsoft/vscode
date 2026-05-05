/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { parseCustomAgentMarkdown } from '../../node/copilot/copilotAgentMarkdownParser.js';

suite('parseCustomAgentMarkdown', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	// ---- body extraction -----------------------------------------------

	test('returns whole file as body when there is no front matter', () => {
		const result = parseCustomAgentMarkdown('You are a helpful assistant.');
		assert.deepStrictEqual(result, { body: 'You are a helpful assistant.' });
	});

	test('returns empty body when file is empty', () => {
		const result = parseCustomAgentMarkdown('');
		assert.deepStrictEqual(result, { body: '' });
	});

	test('extracts body after closing front matter delimiter', () => {
		const content = [
			'---',
			'description: My agent',
			'---',
			'Agent body content.',
		].join('\n');
		const result = parseCustomAgentMarkdown(content);
		assert.strictEqual(result.body, 'Agent body content.');
		assert.strictEqual(result.description, 'My agent');
	});

	test('handles CRLF line endings in front matter and body', () => {
		const content = '---\r\ndescription: CRLF agent\r\n---\r\nBody here.';
		const result = parseCustomAgentMarkdown(content);
		assert.strictEqual(result.description, 'CRLF agent');
		assert.strictEqual(result.body, 'Body here.');
	});

	test('body preserves multi-line content including blank lines', () => {
		const content = [
			'---',
			'description: Test',
			'---',
			'Line one.',
			'',
			'Line two.',
		].join('\n');
		const result = parseCustomAgentMarkdown(content);
		assert.strictEqual(result.body, 'Line one.\n\nLine two.');
	});

	test('body is empty string when front matter is followed by nothing', () => {
		const content = ['---', 'description: Test', '---'].join('\n');
		const result = parseCustomAgentMarkdown(content);
		assert.strictEqual(result.body, '');
	});

	test('treats file with only opening delimiter as no front matter', () => {
		// Unclosed delimiter — no closing '---' found; the whole file is treated as body
		const content = ['---', 'This is just content.'].join('\n');
		const result = parseCustomAgentMarkdown(content);
		assert.strictEqual(result.body, '');
		assert.strictEqual(result.name, undefined);
	});

	// ---- name ----------------------------------------------------------

	test('reads name from front matter', () => {
		const content = ['---', 'name: My Agent', '---', 'Body.'].join('\n');
		const result = parseCustomAgentMarkdown(content);
		assert.strictEqual(result.name, 'My Agent');
	});

	test('reads quoted name from front matter', () => {
		const content = ['---', 'name: "Quoted Agent"', '---', 'Body.'].join('\n');
		const result = parseCustomAgentMarkdown(content);
		assert.strictEqual(result.name, 'Quoted Agent');
	});

	test('name is undefined when not present in front matter', () => {
		const content = ['---', 'description: No name here', '---', 'Body.'].join('\n');
		const result = parseCustomAgentMarkdown(content);
		assert.strictEqual(result.name, undefined);
	});

	// ---- description ---------------------------------------------------

	test('reads description from front matter', () => {
		const content = ['---', 'description: Does useful things', '---', 'Body.'].join('\n');
		const result = parseCustomAgentMarkdown(content);
		assert.strictEqual(result.description, 'Does useful things');
	});

	test('reads quoted description containing colon', () => {
		const content = ['---', 'description: "Step 1: do the thing"', '---', 'Body.'].join('\n');
		const result = parseCustomAgentMarkdown(content);
		assert.strictEqual(result.description, 'Step 1: do the thing');
	});

	test('description with unquoted colon-space is still parsed correctly', () => {
		const content = ['---', 'name: Test', 'description: This has a colon: in the middle', 'infer: true', '---', 'Body.'].join('\n');
		const result = parseCustomAgentMarkdown(content);
		assert.strictEqual(result.name, 'Test');
		assert.strictEqual(result.description, 'This has a colon: in the middle');
		assert.strictEqual(result.infer, true);
	});

	test('description is undefined when not present', () => {
		const content = ['---', 'name: Agent', '---', 'Body.'].join('\n');
		const result = parseCustomAgentMarkdown(content);
		assert.strictEqual(result.description, undefined);
	});

	// ---- infer ---------------------------------------------------------

	test('reads infer: true', () => {
		const content = ['---', 'infer: true', '---', 'Body.'].join('\n');
		const result = parseCustomAgentMarkdown(content);
		assert.strictEqual(result.infer, true);
	});

	test('reads infer: false', () => {
		const content = ['---', 'infer: false', '---', 'Body.'].join('\n');
		const result = parseCustomAgentMarkdown(content);
		assert.strictEqual(result.infer, false);
	});

	test('infer is undefined when not present', () => {
		const content = ['---', 'description: Agent', '---', 'Body.'].join('\n');
		const result = parseCustomAgentMarkdown(content);
		assert.strictEqual(result.infer, undefined);
	});

	// ---- tools (YAML sequence) -----------------------------------------

	test('reads tools as YAML sequence with single-quoted values', () => {
		const content = [`---`, `tools: ['search', 'terminal']`, `---`, `Body.`].join('\n');
		const result = parseCustomAgentMarkdown(content);
		assert.deepStrictEqual(result.tools, ['search', 'terminal']);
	});

	test('reads tools as YAML sequence with double-quoted values', () => {
		const content = [`---`, `tools: ["web", "memory"]`, `---`, `Body.`].join('\n');
		const result = parseCustomAgentMarkdown(content);
		assert.deepStrictEqual(result.tools, ['web', 'memory']);
	});

	test('reads tools as YAML block sequence', () => {
		const content = [
			'---',
			'tools:',
			'  - search',
			'  - terminal',
			'  - web',
			'---',
			'Body.',
		].join('\n');
		const result = parseCustomAgentMarkdown(content);
		assert.deepStrictEqual(result.tools, ['search', 'terminal', 'web']);
	});

	test('reads tools as full real-world sequence', () => {
		const content = [
			'---',
			'name: Explore',
			'description: Fast read-only codebase exploration and Q&A subagent. Specify thoroughness: quick, medium, or thorough.',
			`tools: ['search', 'read', 'web', 'vscode/memory', 'github/issue_read', 'execute/getTerminalOutput']`,
			'infer: false',
			'---',
			'You are an exploration agent.',
		].join('\n');
		const result = parseCustomAgentMarkdown(content);
		assert.strictEqual(result.name, 'Explore');
		assert.strictEqual(result.description, 'Fast read-only codebase exploration and Q&A subagent. Specify thoroughness: quick, medium, or thorough.');
		assert.deepStrictEqual(result.tools, ['search', 'read', 'web', 'vscode/memory', 'github/issue_read', 'execute/getTerminalOutput']);
		assert.strictEqual(result.infer, false);
		assert.strictEqual(result.body, 'You are an exploration agent.');
	});

	// ---- tools (comma-separated scalar) --------------------------------

	test('reads tools as comma-separated scalar', () => {
		const content = [`---`, `tools: search, terminal`, `---`, `Body.`].join('\n');
		const result = parseCustomAgentMarkdown(content);
		assert.deepStrictEqual(result.tools, ['search', 'terminal']);
	});

	test('reads tools as comma-separated scalar with quoted values containing spaces', () => {
		const content = [`---`, `tools: search, 'web search', terminal`, `---`, `Body.`].join('\n');
		const result = parseCustomAgentMarkdown(content);
		assert.deepStrictEqual(result.tools, ['search', 'web search', 'terminal']);
	});

	test('reads tools as single comma-separated tool with no comma', () => {
		const content = [`---`, `tools: only-tool`, `---`, `Body.`].join('\n');
		const result = parseCustomAgentMarkdown(content);
		assert.deepStrictEqual(result.tools, ['only-tool']);
	});

	test('tools is undefined when not present', () => {
		const content = ['---', 'description: Agent', '---', 'Body.'].join('\n');
		const result = parseCustomAgentMarkdown(content);
		assert.strictEqual(result.tools, undefined);
	});

	// ---- all fields together -------------------------------------------

	test('parses all supported fields in one front matter block', () => {
		const content = [
			'---',
			'name: Full Agent',
			'description: Does everything',
			`tools: ['tool1', 'tool2', 'tool3']`,
			'infer: true',
			'---',
			'This is the agent body.',
			'',
			'It spans multiple lines.',
		].join('\n');
		const result = parseCustomAgentMarkdown(content);
		assert.deepStrictEqual(result, {
			name: 'Full Agent',
			description: 'Does everything',
			tools: ['tool1', 'tool2', 'tool3'],
			infer: true,
			body: 'This is the agent body.\n\nIt spans multiple lines.',
		});
	});

	test('unknown front matter fields are ignored', () => {
		const content = [
			'---',
			'name: Agent',
			'model: gpt-4',
			'skills: [skill1]',
			'mcpServers: {}',
			'applyTo: "**"',
			'---',
			'Body.',
		].join('\n');
		const result = parseCustomAgentMarkdown(content);
		assert.strictEqual(result.name, 'Agent');
		assert.strictEqual(result.body, 'Body.');
		// None of the unsupported fields should appear on the result
		assert.strictEqual((result as unknown as Record<string, unknown>)['model'], undefined);
		assert.strictEqual((result as unknown as Record<string, unknown>)['skills'], undefined);
		assert.strictEqual((result as unknown as Record<string, unknown>)['mcpServers'], undefined);
	});

	// ---- malformed front matter ----------------------------------------

	test('no front matter fields returned when YAML is invalid', () => {
		const content = ['---', ': broken yaml :', '---', 'Body.'].join('\n');
		const result = parseCustomAgentMarkdown(content);
		assert.strictEqual(result.name, undefined);
		assert.strictEqual(result.description, undefined);
		assert.strictEqual(result.body, 'Body.');
	});

});
