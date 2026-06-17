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
					<FindTextInFilesResult textResults={results} maxResults={20} />
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

	test('elides the middle of an over-long match while keeping its head and tail', async () => {
		const matchText = `HEAD${'x'.repeat(9992)}TAIL`; // 10000 chars, entirely matched
		const result = await toString([
			{
				lineNumber: 1,
				previewText: matchText,
				ranges: [{
					previewRange: new Range(0, 0, 0, matchText.length),
					sourceRange: new Range(0, 0, 0, matchText.length),
				}],
				uri: URI.file('/file.txt'),
			}
		]);

		// The matched characters at both boundaries stay visible; only the middle is elided,
		// so a single greedy match cannot contribute an unbounded amount of text.
		expect(result).toContain('HEAD');
		expect(result).toContain('TAIL');
		expect(result).toContain('[... 8000 characters elided ...]');
		expect(result.length).toBeLessThan(3000);
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

	function lineMatch(line: number, text: string) {
		return { line, text, range: new Range(line - 1, 0, line - 1, text.length) };
	}

	test('renders header, file path and line:text matches without tags', async () => {
		expect(await toGrepString({
			stats: { total: 2, elided: 0, filesElided: 0 },
			files: [
				{
					path: '/src/a.ts',
					uri: URI.file('/src/a.ts'),
					matches: [lineMatch(5, 'const a = 1;'), lineMatch(9, 'const b = 2;')],
				},
			],
		}, 'const')).toMatchInlineSnapshot();
	});

	test('separates multiple files with blank lines and shows the elision note', async () => {
		expect(await toGrepString({
			stats: { total: 4, elided: 1, filesElided: 0 },
			files: [
				{
					path: '/src/a.ts',
					uri: URI.file('/src/a.ts'),
					matches: [lineMatch(5, 'alpha')],
				},
				{
					path: '/src/b.ts',
					uri: URI.file('/src/b.ts'),
					matches: [lineMatch(1, 'beta'), lineMatch(3, 'gamma')],
					elidedMatches: 1,
				},
			],
		}, 'x')).toMatchInlineSnapshot();
	});
});
