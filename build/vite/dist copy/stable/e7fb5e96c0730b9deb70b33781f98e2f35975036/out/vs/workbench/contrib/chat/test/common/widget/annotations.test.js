/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { URI } from '../../../../../../base/common/uri.js';
import { assertSnapshot } from '../../../../../../base/test/common/snapshot.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { annotateSpecialMarkdownContent, extractCodeblockUrisFromText, extractSubAgentInvocationIdFromText, extractVulnerabilitiesFromText, hasEditCodeblockUriTag, isInsideCodeContext } from '../../../common/widget/annotations.js';
function content(str) {
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
            const markdown = annotatedResult[0];
            const result = extractVulnerabilitiesFromText(markdown.content.value);
            await assertSnapshot(result);
        });
        test('multiline', async () => {
            const before = 'some code\nover\nmultiple lines ';
            const vulnContent = 'content with vuln\nand\nnewlines';
            const after = 'more code\nwith newline';
            const annotatedResult = annotateSpecialMarkdownContent([content(before), { kind: 'markdownVuln', content: new MarkdownString(vulnContent), vulnerabilities: [{ title: 'title', description: 'vuln' }] }, content(after)]);
            await assertSnapshot(annotatedResult);
            const markdown = annotatedResult[0];
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
            const markdown = annotatedResult[0];
            const result = extractVulnerabilitiesFromText(markdown.content.value);
            await assertSnapshot(result);
        });
    });
    suite('extractSubAgentInvocationIdFromText', () => {
        test('extracts subAgentInvocationId from codeblock uri tag', () => {
            const subAgentId = 'test-agent-123';
            const uri = URI.parse('file:///test.ts');
            const codeblockUriPart = {
                kind: 'codeblockUri',
                uri,
                isEdit: true,
                subAgentInvocationId: subAgentId
            };
            const annotated = annotateSpecialMarkdownContent([content('code'), codeblockUriPart]);
            const markdown = annotated[0];
            const result = extractSubAgentInvocationIdFromText(markdown.content.value);
            assert.strictEqual(result, subAgentId);
        });
        test('returns undefined when no subAgentInvocationId', () => {
            const uri = URI.parse('file:///test.ts');
            const codeblockUriPart = {
                kind: 'codeblockUri',
                uri,
                isEdit: true
            };
            const annotated = annotateSpecialMarkdownContent([content('code'), codeblockUriPart]);
            const markdown = annotated[0];
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
            const codeblockUriPart = {
                kind: 'codeblockUri',
                uri,
                isEdit: true,
                subAgentInvocationId: subAgentId
            };
            const annotated = annotateSpecialMarkdownContent([content('code'), codeblockUriPart]);
            const markdown = annotated[0];
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
            const codeblockUriPart = {
                kind: 'codeblockUri',
                uri,
                isEdit: true,
                subAgentInvocationId: subAgentId
            };
            const annotated = annotateSpecialMarkdownContent([content('code'), codeblockUriPart]);
            const markdown = annotated[0];
            const result = extractCodeblockUrisFromText(markdown.content.value);
            assert.ok(result);
            assert.strictEqual(result.subAgentInvocationId, subAgentId);
            assert.strictEqual(result.uri.toString(), uri.toString());
            assert.strictEqual(result.isEdit, true);
        });
        test('round-trip encoding/decoding with special characters', () => {
            const subAgentId = 'agent/with spaces&special=chars?more';
            const uri = URI.parse('file:///path/to/file.ts');
            const codeblockUriPart = {
                kind: 'codeblockUri',
                uri,
                isEdit: true,
                subAgentInvocationId: subAgentId
            };
            const annotated = annotateSpecialMarkdownContent([content('code'), codeblockUriPart]);
            const markdown = annotated[0];
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
            const md = result[0];
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
            const md = result[0];
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
            const md = result[0];
            assert.ok(!md.content.value.includes('_vscodecontentref_'));
            assert.ok(md.content.value.endsWith('index.ts'));
        });
        test('inline reference at start of block merges with following markdown', () => {
            const result = annotateSpecialMarkdownContent([
                { kind: 'inlineReference', inlineReference: URI.parse('file:///index.ts'), name: 'index.ts' },
                { kind: 'markdownContent', content: new MarkdownString(' is the entry point', { isTrusted: true, supportThemeIcons: true }) },
            ]);
            assert.strictEqual(result.length, 1);
            const md = result[0];
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
            const first = result[0];
            assert.ok(first.content.value.startsWith('See '));
            assert.ok(first.inlineReferences);
            const second = result[1];
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYW5ub3RhdGlvbnMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vd2lkZ2V0L2Fubm90YXRpb25zLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDM0QsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2hGLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRXRHLE9BQU8sRUFBRSw4QkFBOEIsRUFBRSw0QkFBNEIsRUFBRSxtQ0FBbUMsRUFBRSw4QkFBOEIsRUFBRSxzQkFBc0IsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRXZPLFNBQVMsT0FBTyxDQUFDLEdBQVc7SUFDM0IsT0FBTyxFQUFFLElBQUksRUFBRSxpQkFBaUIsRUFBRSxPQUFPLEVBQUUsSUFBSSxjQUFjLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztBQUN0RSxDQUFDO0FBRUQsS0FBSyxDQUFDLGFBQWEsRUFBRTtJQUNwQix1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLEtBQUssQ0FBQyxnQ0FBZ0MsRUFBRSxHQUFHLEVBQUU7UUFDNUMsSUFBSSxDQUFDLGFBQWEsRUFBRSxLQUFLLElBQUksRUFBRTtZQUM5QixNQUFNLE1BQU0sR0FBRyxZQUFZLENBQUM7WUFDNUIsTUFBTSxXQUFXLEdBQUcsbUJBQW1CLENBQUM7WUFDeEMsTUFBTSxLQUFLLEdBQUcsUUFBUSxDQUFDO1lBQ3ZCLE1BQU0sZUFBZSxHQUFHLDhCQUE4QixDQUFDLENB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