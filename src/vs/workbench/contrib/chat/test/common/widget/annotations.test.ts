/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { URI } from '../../../../../../base/common/uri.js';
import { assertSnapshot } from '../../../../../../base/test/common/snapshot.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IChatMarkdownContent, IChatResponseCodeblockUriPart } from '../../../common/chatService/chatService.js';
import { annotateSpecialMarkdownContent, extractCodeblockUrisFromText, extractSubAgentInvocationIdFromText, extractVulnerabilitiesFromText, isInsideCodeContext } from '../../../common/widget/annotations.js';

function content(str: string): IChatMarkdownContent {
	return { kind: 'markdownContent', content: new MarkdownString(str) };
}

suite('Annotations', function () {
	ensureNoDisposablesAreLeakedInTestSuite();

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
			const annotated = annotateSpecialMarkdownContent([content('code'), codeblockUriPart]);
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
			const annotated = annotateSpecialMarkdownContent([content('code'), codeblockUriPart]);
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
			const annotated = annotateSpecialMarkdownContent([content('code'), codeblockUriPart]);
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
			const annotated = annotateSpecialMarkdownContent([content('code'), codeblockUriPart]);
			const markdown = annotated[0] as IChatMarkdownContent;

			const result = extractCodeblockUrisFromText(markdown.content.value);
			assert.ok(result);
			assert.strictEqual(result.subAgentInvocationId, subAgentId);
			assert.strictEqual(result.uri.toString(), uri.toString());
			assert.strictEqual(result.isEdit, true);
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
			const annotated = annotateSpecialMarkdownContent([content('code'), codeblockUriPart]);
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
});
