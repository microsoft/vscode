/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { marked } from '../../../../../../base/common/marked/marked.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAccessibleViewService } from '../../../../../../platform/accessibility/browser/accessibleView.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ChatAccessibilityProvider } from '../../../browser/accessibility/chatAccessibilityProvider.js';
import { Response } from '../../../common/model/chatModel.js';
import { IChatResponseViewModel } from '../../../common/model/chatViewModel.js';

suite('ChatAccessibilityProvider', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const hint = 'Open Accessible View';
	const table = '| Heading |\n| --- |\n| Value |';
	const code = '```ts\nconst answer = 42;\n```';
	const mixed = `${table}\n\n${code}`;
	const multiple = `${mixed}\n\n${mixed}`;
	const nested = `> ${mixed.replaceAll('\n', '\n> ')}`;
	const inline = '`value` and **emphasis** with [a link](https://example.com)';
	let accessibleViewHint: string;
	let provider: ChatAccessibilityProvider;

	setup(() => {
		accessibleViewHint = '';
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IAccessibleViewService, { getOpenAriaHint: () => accessibleViewHint });
		provider = instantiationService.createInstance(ChatAccessibilityProvider);
	});

	teardown(() => {
		sinon.restore();
	});

	function createViewModel(response: Response): IChatResponseViewModel {
		return upcastPartial<IChatResponseViewModel>({ response, setVote: () => { } });
	}

	for (const { name, content, labels } of [
		{ name: 'empty response', content: '', labels: [' ', ` ${hint}`] },
		{ name: 'plain text', content: 'Hello', labels: [' Hello', `Hello ${hint}`] },
		{ name: 'inline Markdown', content: inline, labels: [` ${inline}`, `${inline} ${hint}`] },
		{ name: 'one table', content: table, labels: [`1 table  ${table}`, `1 table ${table} ${hint}`] },
		{ name: 'multiple tables', content: `${table}\n\n${table}`, labels: [`2 tables  ${table}\n\n${table}`, `2 tables ${table}\n\n${table} ${hint}`] },
		{ name: 'one code block', content: code, labels: [`1 code block:  ${code}`, `1 code block:  ${code}${hint}`] },
		{ name: 'multiple code blocks', content: `${code}\n\n${code}`, labels: [`2 code blocks:  ${code}\n\n${code}`, ` code blocks: 2${code}\n\n${code} ${hint}`] },
		{ name: 'one table and code block', content: mixed, labels: [`1 code block: 1 table  ${mixed}`, `1 code block: 1 table  ${mixed}${hint}`] },
		{ name: 'multiple tables and code blocks', content: multiple, labels: [`2 code blocks: 2 tables  ${multiple}`, `2 tables  code blocks: 2${multiple} ${hint}`] },
		{ name: 'nested table and code block', content: nested, labels: [` ${nested}`, `${nested} ${hint}`] },
		{ name: 'table inside a code block', content: `\`\`\`md\n${table}\n\`\`\``, labels: [`1 code block:  \`\`\`md\n${table}\n\`\`\``, `1 code block:  \`\`\`md\n${table}\n\`\`\`${hint}`] },
		{ name: 'unfinished code block', content: '```ts\nconst answer', labels: ['1 code block:  ```ts\nconst answer', `1 code block:  \`\`\`ts\nconst answer${hint}`] },
		{ name: 'indented code block', content: '    const answer = 42;', labels: ['1 code block:      const answer = 42;', `1 code block:      const answer = 42;${hint}`] },
	]) {
		test(`preserves labels for ${name} with and without the accessibility hint`, () => {
			const response = store.add(new Response(new MarkdownString(content)));
			const element = createViewModel(response);
			const withoutHint = provider.getAriaLabel(element);
			accessibleViewHint = hint;

			assert.deepStrictEqual([withoutHint, provider.getAriaLabel(element)], labels);
		});
	}

	test('updates labels when the response content and accessibility hint change', () => {
		const response = store.add(new Response(new MarkdownString(table)));
		const element = createViewModel(response);
		const labels = [provider.getAriaLabel(element)];

		response.updateContent({ kind: 'markdownContent', content: new MarkdownString(`\n\n${code}`) });
		labels.push(provider.getAriaLabel(element));
		accessibleViewHint = hint;
		labels.push(provider.getAriaLabel(element));
		response.clear();
		labels.push(provider.getAriaLabel(element));

		assert.deepStrictEqual(labels, [
			`1 table  ${table}`,
			`1 code block: 1 table  ${mixed}`,
			`1 code block: 1 table  ${mixed}${hint}`,
			` ${hint}`,
		]);
	});

	test('serializes and lexes the response once per label', () => {
		const response = store.add(new Response(new MarkdownString(multiple)));
		const toStringSpy = sinon.spy(response, 'toString');
		const lexerSpy = sinon.spy(marked, 'lexer');

		provider.getAriaLabel(createViewModel(response));

		assert.deepStrictEqual({
			responseReads: toStringSpy.callCount,
			lexerInputs: lexerSpy.getCalls().map(call => call.args[0]),
		}, {
			responseReads: 1,
			lexerInputs: [multiple],
		});
	});
});
