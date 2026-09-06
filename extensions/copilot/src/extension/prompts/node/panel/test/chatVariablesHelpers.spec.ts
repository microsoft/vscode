/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test } from 'vitest';
import { URI } from '../../../../../util/vs/base/common/uri';
import { ChatVariablesCollection, getPromptFileSlashCommandId, parseSlashCommand, PromptFileIdPrefix, type PromptVariable } from '../../../../prompt/common/chatVariablesCollection';
import { buildSlashCommandUserMessage } from '../chatVariables';

function makePromptVariable(name: string, value: PromptVariable['value']): PromptVariable {
	return {
		reference: { id: name, name, value },
		originalName: name,
		uniqueName: name,
		value,
		isMarkedReadonly: undefined,
	};
}

describe('getPromptFileSlashCommandId', () => {
	test('prompt file uses filename without .prompt.md extension', () => {
		expect(getPromptFileSlashCommandId(
			makePromptVariable('prompt:yell-foo.prompt.md', URI.file('/workspace/.github/prompts/yell-foo.prompt.md'))
		)).toEqual({ name: 'prompt:yell-foo.prompt.md', id: 'yell-foo' });
	});

	test('skill file uses parent folder name', () => {
		expect(getPromptFileSlashCommandId(
			makePromptVariable('code-review', URI.file('/workspace/.github/skills/code-review/SKILL.md'))
		)).toEqual({ name: 'code-review', id: 'code-review' });
	});

	test('skill file is case-insensitive for SKILL.md', () => {
		expect(getPromptFileSlashCommandId(
			makePromptVariable('my-skill', URI.file('/workspace/.github/skills/my-skill/skill.md'))
		)).toEqual({ name: 'my-skill', id: 'my-skill' });
	});

	test('non-prompt, non-skill file falls back to reference name', () => {
		expect(getPromptFileSlashCommandId(
			makePromptVariable('some-instructions.instructions.md', URI.file('/workspace/.github/instructions/some-instructions.instructions.md'))
		)).toEqual({ name: 'some-instructions.instructions.md', id: 'some-instructions.instructions.md' });
	});

	test('non-URI value falls back to reference name', () => {
		expect(getPromptFileSlashCommandId(
			makePromptVariable('inline-ref', 'some string value')
		)).toEqual({ name: 'inline-ref', id: 'inline-ref' });
	});

	test('prompt file with nested path', () => {
		expect(getPromptFileSlashCommandId(
			makePromptVariable('prompt:deeply-nested.prompt.md', URI.file('/a/b/c/d/deeply-nested.prompt.md'))
		)).toEqual({ name: 'prompt:deeply-nested.prompt.md', id: 'deeply-nested' });
	});
});

describe('buildSlashCommandUserMessage', () => {
	function makeCollection(entries: { name: string; uri: ReturnType<typeof URI.file> }[]): ChatVariablesCollection {
		return new ChatVariablesCollection(entries.map(e => ({
			id: `${PromptFileIdPrefix}:${e.name}`,
			name: e.name,
			value: e.uri,
		})));
	}

	const chatVariables = makeCollection([
		{ name: 'prompt:code-review.prompt.md', uri: URI.file('/workspace/.github/prompts/code-review.prompt.md') },
		{ name: 'my-skill', uri: URI.file('/workspace/.github/skills/my-skill/SKILL.md') },
	]);

	test('returns follow instruction for matching slash command without args', () => {
		expect(buildSlashCommandUserMessage('/code-review', chatVariables))
			.toBe('Follow instructions in #prompt:code-review.prompt.md');
	});

	test('returns follow instruction with arguments when provided', () => {
		expect(buildSlashCommandUserMessage('/code-review some-file.ts', chatVariables))
			.toBe('Follow instructions in #prompt:code-review.prompt.md with these arguments: some-file.ts');
	});

	test('passes multi-word arguments', () => {
		expect(buildSlashCommandUserMessage('/code-review file1.ts file2.ts --strict', chatVariables))
			.toBe('Follow instructions in #prompt:code-review.prompt.md with these arguments: file1.ts file2.ts --strict');
	});

	test('matches skill slash commands', () => {
		expect(buildSlashCommandUserMessage('/my-skill do something', chatVariables))
			.toBe('Follow instructions in #my-skill with these arguments: do something');
	});

	test('returns original query when no slash command', () => {
		expect(buildSlashCommandUserMessage('just a normal question', chatVariables))
			.toBe('just a normal question');
	});

	test('returns original query when slash command does not match any prompt file', () => {
		expect(buildSlashCommandUserMessage('/unknown-command arg1', chatVariables))
			.toBe('/unknown-command arg1');
	});

	test('handles leading whitespace in query', () => {
		expect(buildSlashCommandUserMessage('  /code-review', chatVariables))
			.toBe('Follow instructions in #prompt:code-review.prompt.md');
	});

	test('trims trailing whitespace from arguments', () => {
		expect(buildSlashCommandUserMessage('/code-review  some-file.ts  ', chatVariables))
			.toBe('Follow instructions in #prompt:code-review.prompt.md with these arguments: some-file.ts');
	});

	test('handles empty prompt file list', () => {
		expect(buildSlashCommandUserMessage('/code-review', new ChatVariablesCollection([])))
			.toBe('/code-review');
	});

	test('handles multiline arguments', () => {
		expect(buildSlashCommandUserMessage('/code-review line1\nline2', chatVariables))
			.toBe('Follow instructions in #prompt:code-review.prompt.md with these arguments: line1\nline2');
	});
});

describe('parseSlashCommand', () => {
	function makeCollection(entries: { name: string; uri: ReturnType<typeof URI.file> }[]): ChatVariablesCollection {
		return new ChatVariablesCollection(entries.map(e => ({
			id: `${PromptFileIdPrefix}:${e.name}`,
			name: e.name,
			value: e.uri,
		})));
	}

	const chatVariables = makeCollection([
		{ name: 'prompt:code-review.prompt.md', uri: URI.file('/workspace/.github/prompts/code-review.prompt.md') },
		{ name: 'my-skill', uri: URI.file('/workspace/.github/skills/my-skill/SKILL.md') },
	]);

	test('returns undefined for plain text query', () => {
		expect(parseSlashCommand('just a question', chatVariables)).toBeUndefined();
	});

	test('returns undefined when slash command does not match any prompt file', () => {
		expect(parseSlashCommand('/unknown arg', chatVariables)).toBeUndefined();
	});

	test('returns undefined for empty query', () => {
		expect(parseSlashCommand('', chatVariables)).toBeUndefined();
	});

	test('matches prompt file and returns command and empty args', () => {
		const result = parseSlashCommand('/code-review', chatVariables);
		expect(result).toBeDefined();
		expect(result!.command).toBe('code-review');
		expect(result!.args).toBe('');
		expect(result!.promptFile).toEqual({ name: 'prompt:code-review.prompt.md', id: 'code-review' });
	});

	test('matches prompt file and returns parsed args', () => {
		const result = parseSlashCommand('/code-review src/foo.ts --strict', chatVariables);
		expect(result).toBeDefined();
		expect(result!.command).toBe('code-review');
		expect(result!.args).toBe('src/foo.ts --strict');
	});

	test('matches skill file', () => {
		const result = parseSlashCommand('/my-skill do something', chatVariables);
		expect(result).toBeDefined();
		expect(result!.command).toBe('my-skill');
		expect(result!.promptFile).toEqual({ name: 'my-skill', id: 'my-skill' });
		expect(result!.args).toBe('do something');
	});

	test('returns the matched variable', () => {
		const result = parseSlashCommand('/code-review', chatVariables);
		expect(result).toBeDefined();
		expect(URI.isUri(result!.variable.value)).toBe(true);
		expect(result!.variable.reference.name).toBe('prompt:code-review.prompt.md');
	});

	test('handles leading whitespace', () => {
		const result = parseSlashCommand('  /code-review', chatVariables);
		expect(result).toBeDefined();
		expect(result!.command).toBe('code-review');
	});

	test('trims trailing whitespace from args', () => {
		const result = parseSlashCommand('/code-review  arg  ', chatVariables);
		expect(result!.args).toBe('arg');
	});

	test('skips non-prompt-file references', () => {
		const mixed = new ChatVariablesCollection([
			{ id: 'vscode.instructions.file:inst', name: 'inst', value: URI.file('/workspace/inst.md') },
			{ id: `${PromptFileIdPrefix}:prompt:review.prompt.md`, name: 'prompt:review.prompt.md', value: URI.file('/workspace/review.prompt.md') },
		]);
		const result = parseSlashCommand('/review', mixed);
		expect(result).toBeDefined();
		expect(result!.command).toBe('review');
	});

	test('returns undefined with empty collection', () => {
		expect(parseSlashCommand('/code-review', new ChatVariablesCollection([]))).toBeUndefined();
	});
});
