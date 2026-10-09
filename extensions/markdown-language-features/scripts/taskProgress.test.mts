/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { EditorModel, ListItemAstNode, StringValue, type AstNode } from '@vscode/markdown-editor';
import { isTaskProgressMessage } from '../markdown-editor-src/taskProgress/taskProgressProtocol.ts';
import { buildTaskProgressHtml } from './buildTaskProgressHtml.mts';

const labels = { title: 'Task Progress', summary: '{0} of {1} tasks completed', language: 'en' };
const fence = '```widget:task-progress\n```\n';
const taskProgressDir = new URL('../markdown-editor-src/taskProgress/', import.meta.url);
const html = await buildTaskProgressHtml(fileURLToPath(taskProgressDir));
const { countTasks, createTaskProgressProvider, isTaskProgressLabels } = await loadTaskProgressProvider();

async function loadTaskProgressProvider() {
	const htmlUrl = new URL('taskProgress.html', taskProgressDir).href;
	const hooks = registerHooks({
		load(url, context, nextLoad) {
			return url === htmlUrl
				? { format: 'module', source: `export default ${JSON.stringify(html)};`, shortCircuit: true }
				: nextLoad(url, context);
		},
	});
	try {
		return await import('../markdown-editor-src/taskProgress/taskProgressProvider.ts');
	} finally {
		hooks.deregister();
	}
}

function setSource(model: EditorModel, source: string): void {
	model.replaceSourceText(new StringValue(source));
}

function findTask(node: AstNode): ListItemAstNode | undefined {
	if (node instanceof ListItemAstNode && node.checked !== undefined) {
		return node;
	}
	for (const child of node.children) {
		const task = findTask(child);
		if (task) {
			return task;
		}
	}
	return undefined;
}

describe('built-in task progress', () => {
	it('counts the complete parsed document, including nested, quoted and ordered tasks, but not code or ordinary items', () => {
		const model = new EditorModel();
		setSource(model, [
			fence,
			'- [x] Done',
			'- Ordinary',
			'  - [ ] Nested',
			'',
			'> - [X] Quoted',
			'',
			'1. [ ] Ordered',
			'2. [x] Done ordered',
			'',
			'```markdown',
			'- [x] Fenced code',
			'```',
			'',
			'    - [x] Indented code',
			'',
			'`- [x] Inline code`',
			'',
			'\\- [x] Escaped marker',
		].join('\n'));
		assert.deepEqual(countTasks(model.document.get()), { checked: 3, total: 5 });
	});

	it('uses an exact built-in selector and self-contained iframe descriptor', async () => {
		const provider = createTaskProgressProvider(new EditorModel(), labels);
		assert.deepEqual({
			id: provider.id,
			selector: provider.selector,
			descriptor: await provider.resolve('widget:task-progress'),
		}, {
			id: 'vscode.markdown.taskProgress',
			selector: { language: 'widget:task-progress' },
			descriptor: { html, runtimeKey: 'vscode.markdown.taskProgress', hostTransport: true, initialHeight: 88 },
		});
	});

	it('publishes the latest state after ready, reacts to checkbox and source edits, and never edits the fence', () => {
		const model = new EditorModel();
		setSource(model, `${fence}\n- [ ] Todo`);
		const provider = createTaskProgressProvider(model, labels);
		const transport = provider.createHostTransport!('runtime');
		const messages: unknown[] = [];
		const subscription = transport.onMessage(message => messages.push(message));
		try {
			setSource(model, `${fence}\n- [ ] Todo\n- [x] Added before ready`);
			assert.deepEqual(messages, []);
			transport.sendMessage({ type: 'ignored' });
			transport.sendMessage({ type: 'ready' });
			model.setTaskCheckboxChecked(findTask(model.document.get())!, true);
			const sourceAfterCheckbox = model.sourceText.get().value;
			setSource(model, `${fence}\n- [x] Todo\n- [x] Renamed`);
			setSource(model, fence);
			assert.deepEqual({ messages, sourceAfterCheckbox }, {
				messages: [
					{ type: 'taskProgress', checked: 1, total: 2, title: 'Task Progress', label: '1 of 2 tasks completed', language: 'en' },
					{ type: 'taskProgress', checked: 2, total: 2, title: 'Task Progress', label: '2 of 2 tasks completed', language: 'en' },
					{ type: 'taskProgress', checked: 0, total: 0, title: 'Task Progress', label: '0 of 0 tasks completed', language: 'en' },
				],
				sourceAfterCheckbox: `${fence}\n- [x] Todo\n- [x] Added before ready`,
			});
		} finally {
			subscription.dispose();
			transport.dispose();
		}
	});

	it('isolates runtime listeners, supports zero tasks and localized labels, and releases subscriptions on disposal', () => {
		const model = new EditorModel();
		const provider = createTaskProgressProvider(model, { title: 'Tâches', summary: '{0} tâches terminées sur {1}', language: 'fr' });
		const first = provider.createHostTransport!('first');
		const second = provider.createHostTransport!('second');
		const firstMessages: unknown[] = [];
		const secondMessages: unknown[] = [];
		const subscription = first.onMessage(message => firstMessages.push(message));
		second.onMessage(message => secondMessages.push(message));
		first.sendMessage({ type: 'ready' });
		second.sendMessage({ type: 'ready' });
		subscription.dispose();
		setSource(model, '- [x] Done');
		first.dispose();
		second.dispose();
		first.dispose();
		setSource(model, '- [ ] Todo');
		first.sendMessage({ type: 'ready' });
		assert.deepEqual({ firstMessages, secondMessages }, {
			firstMessages: [{ type: 'taskProgress', checked: 0, total: 0, title: 'Tâches', label: '0 tâches terminées sur 0', language: 'fr' }],
			secondMessages: [
				{ type: 'taskProgress', checked: 0, total: 0, title: 'Tâches', label: '0 tâches terminées sur 0', language: 'fr' },
				{ type: 'taskProgress', checked: 1, total: 1, title: 'Tâches', label: '1 tâches terminées sur 1', language: 'fr' },
			],
		});
	});

	it('rejects malformed guest messages', () => {
		const valid = { type: 'taskProgress', checked: 0, total: 0, title: 'Title', label: 'Label', language: 'en' };
		assert.deepEqual([
			valid, null, {}, { ...valid, checked: -1 }, { ...valid, total: -1 },
			{ ...valid, checked: 1 }, { ...valid, checked: NaN }, { ...valid, total: Infinity },
			{ ...valid, checked: 0.5 }, { ...valid, label: 123 },
		].map(isTaskProgressMessage), [true, false, false, false, false, false, false, false, false, false]);
	});

	it('validates localized labels at the provider boundary', () => {
		assert.deepEqual([
			labels, null, undefined, {}, { ...labels, title: 1 },
			{ ...labels, summary: null }, { ...labels, language: false },
		].map(isTaskProgressLabels), [true, false, false, false, false, false, false]);
	});

	it('bundles the guest as one HTML document without external scripts, styles or module imports', () => {
		assert.ok(html.includes('role="progressbar"'));
		assert.ok(html.includes('default-src \'none\''));
		assert.doesNotMatch(html, /<script[^>]*\bsrc=|<link\b|\bimport\s*\(/);
		assert.doesNotMatch(html, /taskProgressGuest\.ts/);
	});
});
