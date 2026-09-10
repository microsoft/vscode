/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { createNewMarkdownEngine } from './engine';

suite('markdown.tasklist', () => {

	async function renderHtml(markdown: string): Promise<string> {
		return (await createNewMarkdownEngine().render(markdown)).html;
	}

	suite('checkbox rendering', () => {

		test('Renders unchecked task list item as a disabled checkbox', async () => {
			const html = await renderHtml('- [ ] todo item');
			assert.ok(
				html.includes('<input class="task-list-item-checkbox" type="checkbox" disabled>'),
				`Expected unchecked disabled checkbox. Got:\n${html}`
			);
		});

		test('Renders checked task list item (lowercase x) as a checked disabled checkbox', async () => {
			const html = await renderHtml('- [x] done item');
			assert.ok(
				html.includes('<input class="task-list-item-checkbox" type="checkbox" disabled checked>'),
				`Expected checked disabled checkbox for [x]. Got:\n${html}`
			);
		});

		test('Renders checked task list item (uppercase X) as a checked disabled checkbox', async () => {
			const html = await renderHtml('- [X] Done item');
			assert.ok(
				html.includes('<input class="task-list-item-checkbox" type="checkbox" disabled checked>'),
				`Expected checked disabled checkbox for [X]. Got:\n${html}`
			);
		});

	});

	suite('class attributes', () => {

		test('Adds contains-task-list class to the parent list', async () => {
			const html = await renderHtml('- [ ] item');
			assert.ok(
				html.includes('contains-task-list'),
				`Expected contains-task-list class on parent list. Got:\n${html}`
			);
		});

		test('Adds task-list-item class to the list item', async () => {
			const html = await renderHtml('- [ ] item');
			assert.ok(
				html.includes('task-list-item'),
				`Expected task-list-item class on list item. Got:\n${html}`
			);
		});

	});

	suite('reproduction case — issue #332127', () => {

		test('Renders the full mixed task list from the bug report correctly', async () => {
			const input = [
				'- [x] Review the code changes',
				'- [ ] Update the documentation',
				'- [ ] Deploy to production',
			].join('\n');

			const html = await renderHtml(input);

			assert.ok(html.includes('contains-task-list'),
				`Expected contains-task-list class. Got:\n${html}`);
			assert.ok(html.includes('task-list-item'),
				`Expected task-list-item class. Got:\n${html}`);
			assert.ok(html.includes('type="checkbox" disabled checked'),
				`Expected one checked checkbox for [x] item. Got:\n${html}`);
			// Two unchecked checkboxes — verify at least one unchecked is present.
			assert.ok(html.includes('type="checkbox" disabled>'),
				`Expected at least one unchecked checkbox. Got:\n${html}`);
			// The literal bracket text must NOT appear in output.
			assert.ok(!html.includes('[ ]'),
				`Literal [ ] must not appear in rendered output. Got:\n${html}`);
			assert.ok(!html.includes('[x]'),
				`Literal [x] must not appear in rendered output. Got:\n${html}`);
		});

	});

	suite('non-task-list cases (no regression)', () => {

		test('Does not add a checkbox to a regular list item', async () => {
			const html = await renderHtml('- regular item');
			assert.ok(
				!html.includes('task-list-item-checkbox'),
				`Expected no checkbox for regular list item. Got:\n${html}`
			);
		});

		test('Does not add a checkbox when [x] appears outside a list', async () => {
			const html = await renderHtml('Inline text with [x] marker');
			assert.ok(
				!html.includes('task-list-item-checkbox'),
				`Expected no checkbox for inline [x] outside a list. Got:\n${html}`
			);
		});

	});

	suite('edge cases — nested and mixed lists', () => {

		test('Nested task list: inner list items get checkboxes independently', async () => {
			const input = [
				'- [ ] outer item',
				'  - [x] inner item',
			].join('\n');
			const html = await renderHtml(input);
			// Both levels must produce checkboxes
			const checkboxCount = (html.match(/task-list-item-checkbox/g) ?? []).length;
			assert.strictEqual(checkboxCount, 2,
				`Expected 2 checkboxes (one per nesting level). Got:\n${html}`);
			// Inner list must not steal the outer list's contains-task-list class
			assert.ok(html.includes('contains-task-list'),
				`Expected contains-task-list class. Got:\n${html}`);
		});

		test('Ordered task list produces checkboxes', async () => {
			const html = await renderHtml('1. [x] first\n2. [ ] second');
			assert.ok(
				html.includes('task-list-item-checkbox'),
				`Expected checkbox in ordered task list. Got:\n${html}`
			);
			assert.ok(
				html.includes('contains-task-list'),
				`Expected contains-task-list on ordered list. Got:\n${html}`
			);
		});

		test('Mixed list: task items and regular items in the same list', async () => {
			// The parent list gets contains-task-list; non-task items are unaffected
			const input = '- [ ] task\n- regular item\n- [x] another task';
			const html = await renderHtml(input);
			assert.ok(html.includes('contains-task-list'),
				`Expected contains-task-list. Got:\n${html}`);
			// Two task items → two checkboxes
			const checkboxCount = (html.match(/task-list-item-checkbox/g) ?? []).length;
			assert.strictEqual(checkboxCount, 2,
				`Expected exactly 2 checkboxes. Got:\n${html}`);
		});

		test('Escaped brackets \\[x\\] must not produce a checkbox', async () => {
			// token.content is the RAW markdown string; \[x\] does not start with "[x] "
			const html = await renderHtml('- \\[x\\] escaped brackets');
			assert.ok(
				!html.includes('task-list-item-checkbox'),
				`Escaped brackets must not trigger checkbox rendering. Got:\n${html}`
			);
		});

	});

});
