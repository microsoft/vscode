/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { URI } from '../../../../../../base/common/uri.js';
import { assertSnapshot } from '../../../../../../base/test/common/snapshot.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IChatMarkdownContent, IChatResponseCodeblockUriPart, IChatToolInvocationSerialized } from '../../../common/chatService/chatService.js';
import { annotateSpecialMarkdownContent, extractCodeblockUrisFromText, extractEditCodeblockUrisFromText, extractSubAgentInvocationIdFromText, extractVulnerabilitiesFromText, hasEditCodeblockUriTag, isInsideCodeContext } from '../../../common/widget/annotations.js';

function content(str: string): IChatMarkdownContent {
	return { kind: 'markdownContent', content: new MarkdownString(str) };
}

suite('Annotations', function () {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('standalone subagent metadata does not interrupt parent code or introduce marker text', () => {
		const reference: IChatResponseCodeblockUriPart = { kind: 'codeblockUri', uri: URI.file('/workspace/child.ts'), isEdit: true, isStandalone: true, subAgentInvocationId: 'agent/" & %' };
		const result = annotateSpecialMarkdownContent([
			content('```ts\nconst value = '),
			reference,
			content('1;\n```'),
		]);
		assert.deepStrictEqual(result.map(part => part.kind === 'markdownContent' ? { text: part.content.value, metadata: part.codeblockUri } : undefined), [
			{ text: '```ts\nconst value = 1;\n```', metadata: undefined },
			{ text: '```\n\n```', metadata: reference },
		]);
	});

	test('restored merged empty fences become independently attributed file blocks', () => {
		const references: IChatResponseCodeblockUriPart[] = ['agent/one', 'agent-two', 'agent/one'].map((subAgentInvocationId, index) => ({
			kind: 'codeblockUri', uri: URI.file(`/workspace/${index}.ts`), isEdit: true, subAgentInvocationId,
		}));
		const result = annotateSpecialMarkdownContent([content('```\n```\n\n```\n\n```\n'), ...references]);
		assert.deepStrictEqual(result, references.map(codeblockUri => ({ ...content('```\n\n```'), codeblockUri })));
	});

	test('legacy scaffolding starts a new Markdown block after non-Markdown content', () => {
		const references: IChatResponseCodeblockUriPart[] = [1, 2].map(index => ({
			kind: 'codeblockUri', uri: URI.file(`/workspace/${index}.ts`), isEdit: true, subAgentInvocationId: 'agent',
		}));
		const result = annotateSpecialMarkdownContent([
			content('I will delegate.'),
			{ kind: 'progressMessage', content: new MarkdownString('Delegating') },
			content('```\n'),
			...references,
			content('\n```\n\n'),
		]);
		assert.deepStrictEqual(result.filter(part => part.kind === 'markdownContent').map(part => ({ text: part.content.value, uri: part.codeblockUri?.uri.toString() })), [
			{ text: 'I will delegate.', uri: undefined },
			{ text: '```\n\n```', uri: 'file:///workspace/1.ts' },
			{ text: '```\n\n```', uri: 'file:///workspace/2.ts' },
		]);
	});

	test('legacy scaffolding spans nested tool calls without consuming trailing parent prose', () => {
		const parentTool: IChatToolInvocationSerialized = {
			kind: 'toolInvocationSerialized', toolId: 'task', toolCallId: 'agent', invocationMessage: 'Delegating',
			presentation: undefined, originMessage: undefined, pastTenseMessage: undefined, source: undefined, isConfirmed: true, isComplete: true,
		};
		const references: IChatResponseCodeblockUriPart[] = [1, 2].map(index => ({
			kind: 'codeblockUri', uri: URI.file(`/workspace/${index}.ts`), isEdit: true, subAgentInvocationId: 'agent',
		}));
		const result = annotateSpecialMarkdownContent([
			content('Go.'), parentTool,
			{ ...parentTool, toolId: 'edit', toolCallId: 'edit1', subAgentInvocationId: 'agent' },
			content('```\n'),
			{ kind: 'undoStop', id: 'edit1' }, references[0],
			{ kind: 'textEditGroup', uri: references[0].uri, edits: [], state: undefined, done: true },
			{ ...parentTool, toolId: 'edit', toolCallId: 'edit2', subAgentInvocationId: 'agent' },
			{ kind: 'undoStop', id: 'edit2' }, references[1],
			{ kind: 'notebookEditGroup', uri: references[1].uri, edits: [], state: undefined, done: true },
			content('\n```\n\nDone.'),
		]);
		assert.deepStrictEqual(result.filter(part => part.kind === 'markdownContent').map(part => ({ text: part.content.value, uri: part.codeblockUri?.uri.toString() })), [
			{ text: 'Go.', uri: undefined },
			{ text: '```\n\n```', uri: 'file:///workspace/1.ts' },
			{ text: '```\n\n```', uri: 'file:///workspace/2.ts' },
			{ text: '\n\nDone.', uri: undefined },
		]);
	});

	for (const realContent of [
		{ kind: 'markdownVuln' as const, content: new MarkdownString('const actual = 42;'), vulnerabilities: [{ title: 'Test', description: 'Test vulnerability' }] },
		{ kind: 'inlineReference' as const, inlineReference: URI.file('/workspace/actual.ts') },
	]) {
		test(`legacy scaffolding preserves structured ${realContent.kind} inside real code`, () => {
			const child: IChatResponseCodeblockUriPart = { kind: 'codeblockUri', uri: URI.file('/workspace/child.ts'), isEdit: true, subAgentInvocationId: 'agent' };
			const result = annotateSpecialMarkdownContent([content('```\n'), realContent, content('\n```\n\n```\n'), child]);
			const code = result.find(part => part.kind === 'markdownContent' && !part.codeblockUri);
			assert.ok(code?.kind === 'markdownContent');
			assert.deepStrictEqual({
				code: extractVulnerabilitiesFromText(code.content.value).newText.trim(),
				child: result.filter(part => part.kind === 'markdownContent' && part.codeblockUri).map(part => part.kind === 'markdownContent' ? part.codeblockUri : undefined),
			}, { code: `\`\`\`\n${realContent.kind === 'markdownVuln' ? 'const actual = 42;' : 'actual.ts'}\n\`\`\``, child: [child] });
		});
	}

	test('legacy annotations preserve nonempty code and literal marker examples', () => {
		const reference: IChatResponseCodeblockUriPart = { kind: 'codeblockUri', uri: URI.file('/workspace/child.ts'), isEdit: true, subAgentInvocationId: 'agent' };
		const literal = '```html\n<vscode_codeblock_uri isEdit subAgentInvocationId="example">file:///example.ts</vscode_codeblock_uri>\n```';
		const result = annotateSpecialMarkdownContent([content('```\n'), reference, content('\nconst value = 1;\n```')]);
		assert.deepStrictEqual({
			code: result.map(part => part.kind === 'markdownContent' ? part.content.value : ''),
			literal: annotateSpecialMarkdownContent([content(literal)]),
		}, {
			code: ['```\n<vscode_codeblock_uri isEdit subAgentInvocationId="agent">file:///workspace/child.ts</vscode_codeblock_uri>\nconst value = 1;\n```'],
			literal: [content(literal)],
		});
	});

	for (const parentFirst of [true, false]) {
		for (const newline of ['\n', '\r\n']) {
			test(`legacy scaffolding preserves adjacent real code fences (parentFirst=${parentFirst}, newline=${JSON.stringify(newline)})`, () => {
				const parent: IChatResponseCodeblockUriPart = { kind: 'codeblockUri', uri: URI.file('/workspace/parent.ts') };
				const child: IChatResponseCodeblockUriPart = { kind: 'codeblockUri', uri: URI.file('/workspace/child.ts'), isEdit: true, subAgentInvocationId: 'agent' };
				const markdown = (value: string) => content(value.replace(/\n/g, newline));
				const result = annotateSpecialMarkdownContent(parentFirst
					? [markdown('```ts\nconst real = 1;\n'), parent, markdown('\n```\n\n```\n'), child]
					: [markdown('```\n'), child, markdown('\n```\n\n```\n'), parent, markdown('\nconst real = 1;\n```')]);
				const code = result.find(part => part.kind === 'markdownContent' && !part.codeblockUri);
				assert.ok(code?.kind === 'markdownContent');
				const extracted = extractCodeblockUrisFromText(code.content.value);
				assert.deepStrictEqual({
					resource: extracted?.uri.toString(),
					code: extracted?.textWithoutResult.replace(/\r\n/g, '\n').trim(),
					child: result.filter(part => part.kind === 'markdownContent' && part.codeblockUri).map(part => part.kind === 'markdownContent' ? part.codeblockUri : undefined),
				}, {
					resource: parent.uri.toString(),
					code: parentFirst ? '```ts\nconst real = 1;\n\n```' : '```\n\nconst real = 1;\n```',
					child: [child],
				});
			});
		}
	}

	test('extracts every edit resource without counting non-edit codeblocks', () => {
		const first = URI.file('/workspace/First.ts');
		const second = URI.file('/workspace/Second.ts');
		const text = `<vscode_codeblock_uri isEdit>${first}</vscode_codeblock_uri>\n\`\`\`ts\nfirst\n\`\`\`\n<vscode_codeblock_uri>${URI.file('/workspace/Example.ts')}</vscode_codeblock_uri>\n<vscode_codeblock_uri isEdit>${second}</vscode_codeblock_uri>`;
		assert.deepStrictEqual(extractEditCodeblockUrisFromText(text).map(uri => uri.toString()), [first, second].map(uri => uri.toString()));
	});

	test('voice progress is not renderable', () => {
		assert.deepStrictEqual(
			annotateSpecialMarkdownContent([
				{ kind: 'voiceProgress', id: 'investigating', value: 'Investigating the relevant code.' },
				content('Visible response'),
			]),
			[content('Visible response')]
		);
	});

	suite('extractVulnerabilitiesFromText', () => {
		test('single line', async () => {
			const before = 'some code ';
			const vulnContent = 'content with vuln';
			const after = ' after';
			const annotatedResult = annotateSpecialMarkdownContent([content(before), { kind: 'markdownVuln', content: new MarkdownString(vulnContent), vulnerabilities: [{ title: 'title', description: 'vuln' }] }, content(after)]);
			await assertSnapshot(annotatedResult);

			const markdown = annotatedResult[0] as IChatMarkdownContent;
			const result = extractVulnerabilitiesFromText(markdown.content.value);
			await assertSnapshot(result);
		});

		test('multiline', async () => {
			const before = 'some code\nover\nmultiple lines ';
			const vulnContent = 'content with vuln\nand\nnewlines';
			const after = 'more code\nwith newline';
			const annotatedResult = annotateSpecialMarkdownContent([content(before), { kind: 'markdownVuln', content: new MarkdownString(vulnContent), vulnerabilities: [{ title: 'title', description: 'vuln' }] }, content(after)]);
			await assertSnapshot(annotatedResult);

			const markdown = annotatedResult[0] as IChatMarkdownContent;
			const result = extractVulnerabilitiesFromText(markdown.content.value);
			await assertSnapshot(result);
		});

		test('multiple vulns', async () => {
			const before = 'some code\nover\nmultiple lines ';
			const vulnContent = 'content with vuln\nand\nnewlines';
			const after = 'more code\nwith newline';
			const annotatedResult = annotateSpecialMarkdownContent([
				content(before),
				{ kind: 'markdownVuln', content: new MarkdownString(vulnContent), vulnerabilities: [{ title: 'title', description: 'vuln' }] },
				content(after),
				{ kind: 'markdownVuln', content: new MarkdownString(vulnContent), vulnerabilities: [{ title: 'title', description: 'vuln' }] },
			]);
			await assertSnapshot(annotatedResult);

			const markdown = annotatedResult[0] as IChatMarkdownContent;
			const result = extractVulnerabilitiesFromText(markdown.content.value);
			await assertSnapshot(result);
		});
	});

	suite('extractSubAgentInvocationIdFromText', () => {
		test('extracts subAgentInvocationId from codeblock uri tag', () => {
			const subAgentId = 'test-agent-123';
			const uri = URI.parse('file:///test.ts');
			const codeblockUriPart: IChatResponseCodeblockUriPart = {
				kind: 'codeblockUri',
				uri,
				isEdit: true,
				subAgentInvocationId: subAgentId
			};
			const annotated = annotateSpecialMarkdownContent([content('```ts\nconst code = 1;\n'), codeblockUriPart]);
			const markdown = annotated[0] as IChatMarkdownContent;

			const result = extractSubAgentInvocationIdFromText(markdown.content.value);
			assert.strictEqual(result, subAgentId);
		});

		test('returns undefined when no subAgentInvocationId', () => {
			const uri = URI.parse('file:///test.ts');
			const codeblockUriPart: IChatResponseCodeblockUriPart = {
				kind: 'codeblockUri',
				uri,
				isEdit: true
			};
			const annotated = annotateSpecialMarkdownContent([content('```ts\nconst code = 1;\n'), codeblockUriPart]);
			const markdown = annotated[0] as IChatMarkdownContent;

			const result = extractSubAgentInvocationIdFromText(markdown.content.value);
			assert.strictEqual(result, undefined);
		});

		test('returns undefined for text without codeblock uri tag', () => {
			const result = extractSubAgentInvocationIdFromText('some random text');
			assert.strictEqual(result, undefined);
		});

		test('handles special characters in subAgentInvocationId via URL encoding', () => {
			const subAgentId = 'agent-with-special&chars=value';
			const uri = URI.parse('file:///test.ts');
			const codeblockUriPart: IChatResponseCodeblockUriPart = {
				kind: 'codeblockUri',
				uri,
				isEdit: true,
				subAgentInvocationId: subAgentId
			};
			const annotated = annotateSpecialMarkdownContent([content('```ts\nconst code = 1;\n'), codeblockUriPart]);
			const markdown = annotated[0] as IChatMarkdownContent;

			const result = extractSubAgentInvocationIdFromText(markdown.content.value);
			assert.strictEqual(result, subAgentId);
		});

		test('handles malformed URL encoding gracefully', () => {
			// Manually construct a malformed tag with invalid URL encoding
			const malformedTag = '<vscode_codeblock_uri isEdit subAgentInvocationId="%ZZ">file:///test.ts</vscode_codeblock_uri>';
			const result = extractSubAgentInvocationIdFromText(malformedTag);
			// Should return the raw value when decoding fails
			assert.strictEqual(result, '%ZZ');
		});
	});

	suite('extractCodeblockUrisFromText with subAgentInvocationId', () => {
		test('extracts subAgentInvocationId from codeblock uri', () => {
			const subAgentId = 'test-subagent-456';
			const uri = URI.parse('file:///example.ts');
			const codeblockUriPart: IChatResponseCodeblockUriPart = {
				kind: 'codeblockUri',
				uri,
				isEdit: true,
				subAgentInvocationId: subAgentId
			};
			const annotated = annotateSpecialMarkdownContent([content('```ts\nconst code = 1;\n'), codeblockUriPart]);
			const markdown = annotated[0] as IChatMarkdownContent;

			const result = extractCodeblockUrisFromText(markdown.content.value);
			assert.ok(result);
			assert.strictEqual(result.subAgentInvocationId, subAgentId);
			assert.strictEqual(result.uri.toString(), uri.toString());
			assert.strictEqual(result.isEdit, true);
		});

		test('returns undefined for invalid URI content inside codeblock uri tag', () => {
			// When content contains backticks and a colon, URI.parse extracts
			// the text before the colon as the scheme. Backticks are illegal
			// scheme characters, causing URI.parse to throw.
			const invalidTag = '<vscode_codeblock_uri>```typescript\nconst uri: string\n```</vscode_codeblock_uri>';
			const result = extractCodeblockUrisFromText(invalidTag);
			assert.strictEqual(result, undefined);
		});

		test('round-trip encoding/decoding with special characters', () => {
			const subAgentId = 'agent/with spaces&special=chars?more';
			const uri = URI.parse('file:///path/to/file.ts');
			const codeblockUriPart: IChatResponseCodeblockUriPart = {
				kind: 'codeblockUri',
				uri,
				isEdit: true,
				subAgentInvocationId: subAgentId
			};
			const annotated = annotateSpecialMarkdownContent([content('```ts\nconst code = 1;\n'), codeblockUriPart]);
			const markdown = annotated[0] as IChatMarkdownContent;

			const extracted = extractCodeblockUrisFromText(markdown.content.value);
			assert.ok(extracted);
			assert.strictEqual(extracted.subAgentInvocationId, subAgentId);
		});
	});

	suite('isInsideCodeContext', () => {
		test('not inside code for plain text', () => {
			assert.strictEqual(isInsideCodeContext('hello world'), false);
		});

		test('not inside code after closed inline code', () => {
			assert.strictEqual(isInsideCodeContext('run `code` and'), false);
		});

		test('inside unclosed single backtick', () => {
			assert.strictEqual(isInsideCodeContext('run `npx tsx '), true);
		});

		test('inside unclosed double backtick', () => {
			assert.strictEqual(isInsideCodeContext('run ``npx tsx '), true);
		});

		test('not inside code after closed double backtick', () => {
			assert.strictEqual(isInsideCodeContext('run ``code`` and'), false);
		});

		test('inside fenced code block', () => {
			assert.strictEqual(isInsideCodeContext('text\n```bash\nnpx tsx '), true);
		});

		test('not inside closed fenced code block', () => {
			assert.strictEqual(isInsideCodeContext('text\n```bash\ncode\n```\nafter'), false);
		});

		test('inside fenced code block with tildes', () => {
			assert.strictEqual(isInsideCodeContext('text\n~~~\ncode'), true);
		});

		test('empty string', () => {
			assert.strictEqual(isInsideCodeContext(''), false);
		});
	});

	suite('annotateSpecialMarkdownContent - inline references in code blocks', () => {
		test('inline reference inside backtick code span uses plain text', () => {
			const result = annotateSpecialMarkdownContent([
				content('Run `npx tsx '),
				{ kind: 'inlineReference', inlineReference: URI.parse('file:///index.ts'), name: 'index.ts' },
				content(' eval '),
				{ kind: 'inlineReference', inlineReference: URI.parse('file:///primer.eval.json'), name: 'primer.eval.json' },
				content(' --repo .`'),
			]);

			assert.strictEqual(result.length, 1);
			const md = result[0] as IChatMarkdownContent;
			assert.strictEqual(md.content.value, 'Run `npx tsx index.ts eval primer.eval.json --repo .`');
			assert.strictEqual(md.inlineReferences, undefined);
		});

		test('inline reference outside code span uses content ref link', () => {
			const result = annotateSpecialMarkdownContent([
				content('See '),
				{ kind: 'inlineReference', inlineReference: URI.parse('file:///index.ts'), name: 'index.ts' },
				content(' for details'),
			]);

			assert.strictEqual(result.length, 1);
			const md = result[0] as IChatMarkdownContent;
			assert.ok(md.content.value.includes('[index.ts]'));
			assert.ok(md.content.value.includes('_vscodecontentref_'));
			assert.ok(md.inlineReferences);
		});

		test('inline reference inside fenced code block uses plain text', () => {
			const result = annotateSpecialMarkdownContent([
				content('Example:\n```bash\nnpx tsx '),
				{ kind: 'inlineReference', inlineReference: URI.parse('file:///index.ts'), name: 'index.ts' },
			]);

			assert.strictEqual(result.length, 1);
			const md = result[0] as IChatMarkdownContent;
			assert.ok(!md.content.value.includes('_vscodecontentref_'));
			assert.ok(md.content.value.endsWith('index.ts'));
		});

		test('inline reference at start of block merges with following markdown', () => {
			const result = annotateSpecialMarkdownContent([
				{ kind: 'inlineReference', inlineReference: URI.parse('file:///index.ts'), name: 'index.ts' },
				{ kind: 'markdownContent', content: new MarkdownString(' is the entry point', { isTrusted: true, supportThemeIcons: true }) },
			]);

			assert.strictEqual(result.length, 1);
			const md = result[0] as IChatMarkdownContent;
			assert.ok(md.content.value.includes('[index.ts]'));
			assert.ok(md.content.value.includes('_vscodecontentref_'));
			assert.ok(md.content.value.endsWith(' is the entry point'));
			assert.ok(md.inlineReferences);
			assert.strictEqual(md.content.isTrusted, true);
			assert.strictEqual(md.content.supportThemeIcons, true);
		});

		test('inline reference after regular text does not force-merge incompatible markdown', () => {
			const result = annotateSpecialMarkdownContent([
				content('See '),
				{ kind: 'inlineReference', inlineReference: URI.parse('file:///index.ts'), name: 'index.ts' },
				{ kind: 'markdownContent', content: new MarkdownString(' more info', { isTrusted: true, supportThemeIcons: true }) },
			]);

			// The first item has "See [index.ts](...)" with default markdown properties,
			// the second item has different properties - they must stay separate.
			assert.strictEqual(result.length, 2);
			const first = result[0] as IChatMarkdownContent;
			assert.ok(first.content.value.startsWith('See '));
			assert.ok(first.inlineReferences);
			const second = result[1] as IChatMarkdownContent;
			assert.strictEqual(second.content.value, ' more info');
			assert.strictEqual(second.content.isTrusted, true);
		});
	});

	suite('hasEditCodeblockUriTag', () => {
		test('returns true for edit codeblock URI tags', () => {
			const editTag = '<vscode_codeblock_uri isEdit>file:///test.ts</vscode_codeblock_uri>';
			assert.strictEqual(hasEditCodeblockUriTag(editTag), true);
		});

		test('returns false for non-edit codeblock URI tags', () => {
			const nonEditTag = '<vscode_codeblock_uri>file:///test.ts</vscode_codeblock_uri>';
			assert.strictEqual(hasEditCodeblockUriTag(nonEditTag), false);
		});

		test('returns true for edit codeblock URI tags with subAgentInvocationId', () => {
			const editTagWithSubAgent = '<vscode_codeblock_uri isEdit subAgentInvocationId="agent-123">file:///test.ts</vscode_codeblock_uri>';
			assert.strictEqual(hasEditCodeblockUriTag(editTagWithSubAgent), true);
		});

		test('returns false for non-edit codeblock URI tags with subAgentInvocationId', () => {
			const nonEditTagWithSubAgent = '<vscode_codeblock_uri subAgentInvocationId="agent-123">file:///test.ts</vscode_codeblock_uri>';
			assert.strictEqual(hasEditCodeblockUriTag(nonEditTagWithSubAgent), false);
		});

		test('returns false for text without codeblock URI tags', () => {
			assert.strictEqual(hasEditCodeblockUriTag('some plain text'), false);
		});

		test('returns false for text with only partial tag prefix', () => {
			assert.strictEqual(hasEditCodeblockUriTag('<vscode_codebloc'), false);
		});

		test('returns true for text containing multiple edit codeblock URI tags', () => {
			const multipleEditTags = 'some text <vscode_codeblock_uri isEdit>file:///test.ts</vscode_codeblock_uri> more <vscode_codeblock_uri isEdit>file:///other.ts</vscode_codeblock_uri>';
			assert.strictEqual(hasEditCodeblockUriTag(multipleEditTags), true);
		});

		test('returns false for text containing only non-edit codeblock URI tags', () => {
			const multipleNonEditTags = 'some text <vscode_codeblock_uri>file:///test.ts</vscode_codeblock_uri> more <vscode_codeblock_uri>file:///other.ts</vscode_codeblock_uri>';
			assert.strictEqual(hasEditCodeblockUriTag(multipleNonEditTags), false);
		});

	});
});
