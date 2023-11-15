/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IMarkdownString, MarkdownString, isMarkdownString } from 'vs/base/common/htmlContent';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { annotateSpecialMarkdownContent, extractVulnerabilitiesFromText } from 'vs/workbench/contrib/chat/browser/chatMarkdownDecorationsRenderer';

suite('ChatMarkdownDecorationsRenderer', function () {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('annotateSpecialMarkdownContent/extractVulnerabilitiesFromText', async () => {
		const before = 'some code ';
		const vulnContent = 'content with vuln';
		const after = ' after';
		const annotatedResult = annotateSpecialMarkdownContent([new MarkdownString(before), { kind: 'vulnerability', content: vulnContent, description: 'vuln' }, new MarkdownString(after)]);
		assert.strictEqual(annotatedResult.content.length, 1);
		const markdown = annotatedResult.content[0] as IMarkdownString;
		assert.ok(isMarkdownString(markdown));
		assert.ok(markdown.value.includes('<vscode_annotation'), markdown.value);

		const result = extractVulnerabilitiesFromText(markdown.value);
		assert.ok(!result.newText.includes('<vscode_annotation'), result.newText);
		assert.strictEqual(result.vulnerabilities.length, 1);
		assert.deepStrictEqual(result.vulnerabilities[0], { description: 'vuln', range: { startLineNumber: 1, startColumn: before.length + 1, endLineNumber: 1, endColumn: before.length + vulnContent.length + 1 } });
	});
});
