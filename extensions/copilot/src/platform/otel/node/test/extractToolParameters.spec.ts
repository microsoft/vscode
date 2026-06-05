/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { GitHubCopilotAttr, TOOL_PARAM_COMMAND_MAX_LEN } from '../../common/genAiAttributes';
import { extractToolParameters } from '../extractToolParameters';

describe('extractToolParameters', () => {
	it('returns empty attrs for non-object input', () => {
		expect(extractToolParameters('bash', undefined).attrs).toEqual({});
		expect(extractToolParameters('bash', null).gatedAttrs).toEqual({});
	});

	it('gates shell command behind captureContent and truncates to 256 chars', () => {
		const long = 'echo ' + 'x'.repeat(500);
		const { attrs, gatedAttrs } = extractToolParameters('bash', { command: long });
		expect(attrs).toEqual({});
		expect(gatedAttrs[GitHubCopilotAttr.TOOL_PARAM_COMMAND]).toBeDefined();
		expect(gatedAttrs[GitHubCopilotAttr.TOOL_PARAM_COMMAND].length).toBe(TOOL_PARAM_COMMAND_MAX_LEN);
	});

	it('emits MCP server hash unconditionally and raw name gated', () => {
		const { attrs, gatedAttrs } = extractToolParameters('mcp_github_search_issues', {});
		expect(attrs[GitHubCopilotAttr.TOOL_PARAM_MCP_SERVER_NAME_HASH]).toMatch(/^[a-f0-9]{64}$/);
		expect(attrs[GitHubCopilotAttr.TOOL_PARAM_MCP_TOOL_NAME]).toBe('search_issues');
		expect(gatedAttrs[GitHubCopilotAttr.TOOL_PARAM_MCP_SERVER_NAME]).toBe('github');
	});

	it('also handles Anthropic-style mcp__server__tool double-underscore format', () => {
		const { attrs, gatedAttrs } = extractToolParameters('mcp__github__list_issues', {});
		expect(attrs[GitHubCopilotAttr.TOOL_PARAM_MCP_SERVER_NAME_HASH]).toMatch(/^[a-f0-9]{64}$/);
		expect(attrs[GitHubCopilotAttr.TOOL_PARAM_MCP_TOOL_NAME]).toBe('list_issues');
		expect(gatedAttrs[GitHubCopilotAttr.TOOL_PARAM_MCP_SERVER_NAME]).toBe('github');
	});

	it('classifies file edit operations and gates file_path', () => {
		const { attrs, gatedAttrs } = extractToolParameters('str_replace', {
			file_path: '/src/app.ts',
			old_str: 'foo',
		});
		expect(attrs[GitHubCopilotAttr.TOOL_PARAM_EDIT_TYPE]).toBe('str_replace');
		expect(gatedAttrs[GitHubCopilotAttr.TOOL_PARAM_FILE_PATH]).toBe('/src/app.ts');
	});

	it('returns nothing for tools that do not match any extractor', () => {
		const { attrs, gatedAttrs } = extractToolParameters('unknown_tool', { foo: 'bar' });
		expect(attrs).toEqual({});
		expect(gatedAttrs).toEqual({});
	});

	it('classifies VS Code snake_case edit tool names', () => {
		expect(extractToolParameters('create_file', { filePath: '/a.ts' }).attrs[GitHubCopilotAttr.TOOL_PARAM_EDIT_TYPE]).toBe('create');
		expect(extractToolParameters('replace_string_in_file', { filePath: '/a.ts' }).attrs[GitHubCopilotAttr.TOOL_PARAM_EDIT_TYPE]).toBe('str_replace');
		expect(extractToolParameters('multi_replace_string_in_file', { filePath: '/a.ts' }).attrs[GitHubCopilotAttr.TOOL_PARAM_EDIT_TYPE]).toBe('str_replace');
		expect(extractToolParameters('apply_patch', { filePath: '/a.ts' }).attrs[GitHubCopilotAttr.TOOL_PARAM_EDIT_TYPE]).toBe('update');
		expect(extractToolParameters('insert_edit_into_file', { filePath: '/a.ts' }).attrs[GitHubCopilotAttr.TOOL_PARAM_EDIT_TYPE]).toBe('update');
		expect(extractToolParameters('edit_notebook_file', { filePath: '/a.ipynb' }).attrs[GitHubCopilotAttr.TOOL_PARAM_EDIT_TYPE]).toBe('update');
		expect(extractToolParameters('read_file', { filePath: '/a.ts' }).attrs[GitHubCopilotAttr.TOOL_PARAM_EDIT_TYPE]).toBeUndefined();
	});

	it('classifies Claude (capitalized) tool names', () => {
		expect(extractToolParameters('Write', { file_path: '/a.ts' }).attrs[GitHubCopilotAttr.TOOL_PARAM_EDIT_TYPE]).toBe('create');
		expect(extractToolParameters('Edit', { file_path: '/a.ts' }).attrs[GitHubCopilotAttr.TOOL_PARAM_EDIT_TYPE]).toBe('str_replace');
		expect(extractToolParameters('MultiEdit', { file_path: '/a.ts' }).attrs[GitHubCopilotAttr.TOOL_PARAM_EDIT_TYPE]).toBe('str_replace');
		expect(extractToolParameters('NotebookEdit', { file_path: '/a.ipynb' }).attrs[GitHubCopilotAttr.TOOL_PARAM_EDIT_TYPE]).toBe('update');
		expect(extractToolParameters('Read', { file_path: '/a.ts' }).attrs[GitHubCopilotAttr.TOOL_PARAM_EDIT_TYPE]).toBeUndefined();
		const bash = extractToolParameters('Bash', { command: 'ls' });
		expect(bash.gatedAttrs[GitHubCopilotAttr.TOOL_PARAM_COMMAND]).toBe('ls');
	});
});
