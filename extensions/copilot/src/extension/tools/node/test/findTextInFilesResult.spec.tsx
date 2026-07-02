/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement, Raw, UserMessage } from '@vscode/prompt-tsx';
import { afterAll, beforeAll, expect, suite, test } from 'vitest';
import type * as vscode from 'vscode';
import { IEndpointProvider } from '../../../../platform/endpoint/common/endpointProvider';
import { ITestingServicesAccessor } from '../../../../platform/test/node/services';
import { URI } from '../../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { Range } from '../../../../vscodeTypes';
import { PromptRenderer } from '../../../prompts/node/base/promptRenderer';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { FindTextInFilesGrepResult, FindTextInFilesGrepResultProps, FindTextInFilesResult } from '../findTextInFilesTool';

suite('FindTextInFilesResult', () => {
	let services: ITestingServicesAccessor;

	beforeAll(() => {
		services = createExtensionUnitTestingServices().createTestingAccessor();
	});

	afterAll(() => {
		services.dispose();
	});

	async function toString(results: vscode.TextSearchResult2[]) {
		const clz = class extends PromptElement {
			render() {
				return <UserMessage>
					<FindTextInFilesResult textResults={results} maxResults={20} maxResultsCap={200} />
				</UserMessage>;
			}
		};

		const endpoint = await services.get(IEndpointProvider).getChatEndpoint('copilot-utility');
		const renderer = PromptRenderer.create(services.get(IInstantiationService), endpoint, clz, {});

		const r = await renderer.render();
		return r.messages
			.map(m => m.content
				.map(c => c.type === Raw.ChatCompletionContentPartKind.Text ? c.text : JSON.stringify(c)).join('')
			).join('\n').replace(/\\+/g, '/');
	}

	test('returns simple single line matches', async () => {
		expect(await toString([
			{
				lineNumber: 5,
				previewText: 'Line before\nThis is a test\nLine after',
				ranges: [
					{
						previewRange: new Range(1, 5, 1, 7),
						sourceRange: new Range(5, 5, 5, 7),
					}
				],
				uri: URI.file('/file.txt'),
			}
		])).toMatchInlineSnapshot(`
			"1 match
			<match path="/file.txt" line=6>
			Line before
			This is a test
			Line after
			</match>
			"
		`);
	});

	test('elides long single line content before match', async () => {
		expect(await toString([
			{
				lineNumber: 5,
				previewText: `Line ${'before'.repeat(1000)}\nThis is a test\nLine after`,
				ranges: [
					{
						previewRange: new Range(1, 5, 1, 7),
						sourceRange: new Range(5, 5, 5, 7),
					}
				],
				uri: URI.file('/file.txt'),
			}
		])).toMatchInlineSnapshot(`
			"1 match
			<match path="/file.txt" line=6>
			...rebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebeforebefore
			This is a test
			Line after
			</match>
			"
		`);
	});

	test('elides long single line content after match', async () => {
		expect(await toString([
			{
				lineNumber: 5,
				previewText: `Line before\nThis is a test\nLine ${'after'.repeat(1000)}`,
				ranges: [{
					previewRange: new Range(1, 5, 1, 7),
					sourceRange: new Range(5, 5, 5, 7),
				}],
				uri: URI.file('/file.txt'),
			}
		])).toMatchInlineSnapshot(`
			"1 match
			<match path="/file.txt" line=6>
			Line before
			This is a test
			Line afterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafterafteraf...
			</match>
			"
		`);
	});

	test('adjusts line number if prefix text is omitted', async () => {
		const prefix = ('Line before'.repeat(25) + '\n').repeat(3);
		expect(await toString([
			{
				lineNumber: 5,
				previewText: `${prefix}This is a test\nLine after`,
				ranges: [{
					previewRange: new Range(3, 5, 3, 7),
					sourceRange: new Range(5, 5, 5, 7),
				}],
				uri: URI.file('/file.txt'),
			}
		])).toMatchInlineSnapshot(`
			"1 match
			<match path="/file.txt" line=6>
			...ne beforeLine beforeLine beforeLine beforeLine beforeLine beforeLine beforeLine beforeLine beforeLine beforeLine beforeLine beforeLine beforeLine beforeLine beforeLine beforeLine beforeLine beforeLine beforeLine before
			Line beforeLine beforeLine beforeLine beforeLine beforeLine beforeLine beforeLine beforeLine beforeLine beforeLine beforeLine beforeLine beforeLine beforeLine beforeLine beforeLine beforeLine beforeLine beforeLine beforeLine beforeLine beforeLine beforeLine beforeLine before
			This is a test
			Line after
			</match>
			"
		`);
	});

	test('elides text on the same line as the match', async () => {
		expect(await toString([
			{
				lineNumber: 5,
				previewText: `${'x'.repeat(1000)}This is a test${'y'.repeat(1000)}`,
				ranges: [{
					previewRange: new Range(5, 1000 + 5, 5, 1000 + 7),
					sourceRange: new Range(5, 1000 + 5, 5, 1000 + 7),
				}],
				uri: URI.file('/file.txt'),
			}
		])).toMatchInlineSnapshot(`
			"1 match
			<match path="/file.txt" line=6>
			...xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxThis is a testyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy...
			</match>
			"
		`);
	});
});

suite('FindTextInFilesGrepResult', () => {
	let services: ITestingServicesAccessor;

	beforeAll(() => {
		services = createExtensionUnitTestingServices().createTestingAccessor();
	});

	afterAll(() => {
		services.dispose();
	});

	async function toGrepString(grouped: FindTextInFilesGrepResultProps['grouped'], query = 'test'): Promise<string> {
		const clz = class extends PromptElement {
			render() {
				return <UserMessage>
					<FindTextInFilesGrepResult grouped={grouped} query={query} />
				</UserMessage>;
			}
		};

		const endpoint = await services.get(IEndpointProvider).getChatEndpoint('copilot-utility');
		const renderer = PromptRenderer.create(services.get(IInstantiationService), endpoint, clz, {});

		const r = await renderer.render();
		return r.messages
			.map(m => m.content
				.map(c => c.type === Raw.ChatCompletionContentPartKind.Text ? c.text : JSON.stringify(c)).join('')
			).join('\n').replace(/\\+/g, '/');
	}

	function lineMatch(uri: URI, line: number, text: string) {
		return {
			uri,
			previewText: text,
			ranges: [{
				sourceRange: new Range(line - 1, 0, line - 1, text.length),
				previewRange: new Range(0, 0, 0, text.length),
			}]
		};
	}

	test('renders header, file path and line:text matches without tags', async () => {
		expect(await toGrepString({
			stats: { total: 2, elided: 0, filesElided: 0 },
			files: [
				{
					path: '/src/a.ts',
					matches: [lineMatch(URI.file('/src/a.ts'), 5, 'const a = 1;'), lineMatch(URI.file('/src/a.ts'), 9, 'const b = 2;')],
				},
			],
		}, 'const')).toMatchInlineSnapshot(`
			"Found 2 matches in 1 file for "const"

			/src/a.ts
			5:const a = 1;
			9:const b = 2;"
		`);
	});

	test('separates multiple files with blank lines and shows the elision note', async () => {
		expect(await toGrepString({
			stats: { total: 4, elided: 1, filesElided: 0 },
			files: [
				{
					path: '/src/a.ts',
					matches: [lineMatch(URI.file('/src/a.ts'), 5, 'alpha')],
				},
				{
					path: '/src/b.ts',
					matches: [lineMatch(URI.file('/src/b.ts'), 1, 'beta'), lineMatch(URI.file('/src/b.ts'), 3, 'gamma')],
					elidedMatches: 1,
				},
			],
		}, 'x')).toMatchInlineSnapshot(`
			"Found 4 matches in 2 files for "x" (showing 3 matches in 2 files)

			/src/a.ts
			5:alpha

			/src/b.ts
			1:beta
			3:gamma
			... (1 more match in this file)"
		`);
	});

	test('truncates an over-long line to a match-centered window with a position annotation', async () => {
		const before = 'a'.repeat(1000);
		const after = 'b'.repeat(1000);
		const previewText = `${before}NEEDLE${after}`;
		const uri = URI.file('/src/big.ts');
		const result = await toGrepString({
			stats: { total: 1, elided: 0, filesElided: 0 },
			files: [
				{
					path: '/src/big.ts',
					matches: [{
						uri,
						previewText,
						ranges: [{
							sourceRange: new Range(4, before.length, 4, before.length + 'NEEDLE'.length),
							previewRange: new Range(0, before.length, 0, before.length + 'NEEDLE'.length),
						}],
					}],
				},
			],
		}, 'NEEDLE');

		const matchLine = result.split('\n').find(l => l.startsWith('5:'))!;
		// Match-centered window (150 before + match + 105 after) far smaller than the 2006-char line.
		expect(matchLine).toContain('NEEDLE');
		expect(matchLine.length).toBeLessThan(400);
		expect(matchLine).toContain(`[match at col ${before.length + 1} \u00B7 line truncated, 2,006 chars]`);
	});

	test('elides the middle of an over-long match within a truncated line', async () => {
		const matchText = `HEAD${'x'.repeat(500)}TAIL`;
		const previewText = `${'a'.repeat(200)}${matchText}${'b'.repeat(200)}`;
		const uri = URI.file('/src/big.ts');
		const result = await toGrepString({
			stats: { total: 1, elided: 0, filesElided: 0 },
			files: [
				{
					path: '/src/big.ts',
					matches: [{
						uri,
						previewText,
						ranges: [{
							sourceRange: new Range(0, 200, 0, 200 + matchText.length),
							previewRange: new Range(0, 200, 0, 200 + matchText.length),
						}],
					}],
				},
			],
		}, 'x');

		const matchLine = result.split('\n').find(l => l.startsWith('1:'))!;
		// Both boundaries of the match stay visible; only its middle is elided.
		expect(matchLine).toContain('HEAD');
		expect(matchLine).toContain('TAIL');
		expect(matchLine).toContain('characters elided ...]');
		expect(matchLine).toContain('line truncated, 908 chars]');
		expect(matchLine.length).toBeLessThan(700);
	});
});
