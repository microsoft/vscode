/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { OutlineTarget } from '../../../../services/outline/browser/outline.js';
import { ChatOutline, getChatRequestLabel } from '../../browser/chatOutline.js';
import { ChatTreeItem, IChatWidget } from '../../browser/chat.js';
import { IChatRequestViewModel } from '../../common/model/chatViewModel.js';
import { IChatRequestVariableEntry } from '../../common/attachments/chatVariableEntries.js';

function req(message: object, variables: IChatRequestVariableEntry[] = []): IChatRequestViewModel {
	return { id: 'r', message, variables } as unknown as IChatRequestViewModel;
}

function reqVM(id: string, text: string): IChatRequestViewModel {
	return { id, message: { text, parts: [{ text }] }, variables: [] } as unknown as IChatRequestViewModel;
}

class TestViewModel {
	readonly onChange = new Emitter<null>();
	readonly onDidChange: Event<null> = this.onChange.event;
	readonly sessionResource = URI.parse('chat-session:/test');
	items: IChatRequestViewModel[] = [];
	getItems(): IChatRequestViewModel[] {
		return this.items;
	}
}

class TestWidget {
	readonly onChangeVM = new Emitter<void>();
	readonly onDidChangeViewModel: Event<void> = this.onChangeVM.event;
	focusItem: ChatTreeItem | undefined;
	readonly revealed: ChatTreeItem[] = [];
	readonly focused: ChatTreeItem[] = [];
	constructor(readonly viewModel: TestViewModel) { }
	getFocus(): ChatTreeItem | undefined {
		return this.focusItem;
	}
	reveal(item: ChatTreeItem): void {
		this.revealed.push(item);
	}
	focus(item: ChatTreeItem): void {
		this.focused.push(item);
	}
}

function setup(store: Pick<DisposableStore, 'add'>, items: IChatRequestViewModel[]) {
	const viewModel = new TestViewModel();
	viewModel.items = items;
	store.add(viewModel.onChange);
	const widget = new TestWidget(viewModel);
	store.add(widget.onChangeVM);
	const outline = store.add(new ChatOutline(widget as unknown as IChatWidget, OutlineTarget.QuickPick));
	return { viewModel, widget, outline };
}

suite('ChatOutline', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('getChatRequestLabel derives text, parts, followup, and attachment fallbacks', () => {
		const labels = [
			getChatRequestLabel(req({ text: 'hello world', parts: [{ text: 'hello world' }] }), 0),
			getChatRequestLabel(req({ text: '', parts: [{ text: 'what ' }, { text: 'is ' }, { text: 'this' }] }), 1),
			getChatRequestLabel(req({ kind: 'reply', message: 'do the thing', agentId: 'agent' }), 2),
			getChatRequestLabel(req({ text: '', parts: [] }, [{ kind: 'file' } as unknown as IChatRequestVariableEntry]), 3),
			getChatRequestLabel(req({ text: '', parts: [] }, [{ kind: 'image' } as unknown as IChatRequestVariableEntry]), 4),
			getChatRequestLabel(req({ text: '', parts: [] }), 5),
			getChatRequestLabel(req({ text: 'line1\n\nline2', parts: [{ text: 'line1\n\nline2' }] }), 6),
		];

		assert.deepStrictEqual(labels, [
			'hello world',
			'what is this',
			'do the thing',
			'Attached 1 file',
			'Attached 1 image',
			'Request 6',
			'line1 line2',
		]);
	});

	test('quick pick escapes codicon markup in request text', () => {
		const { outline } = setup(store, [reqVM('r1', '$(bug) fix')]);

		const [element] = outline.config.quickPickDataSource.getQuickPickElements();

		assert.ok(element.label.includes('\\$(bug)'), element.label);
		assert.strictEqual(element.ariaLabel, '$(bug) fix');
	});

	test('only fires onDidChange when request entries change', () => {
		const { viewModel, outline } = setup(store, [reqVM('r1', 'first'), reqVM('r2', 'second')]);

		let changes = 0;
		store.add(outline.onDidChange(() => changes++));

		// A response-only view-model update (same requests) must not refresh the outline.
		viewModel.onChange.fire(null);
		assert.strictEqual(changes, 0);

		// A new request must refresh the outline.
		viewModel.items = [...viewModel.items, reqVM('r3', 'third')];
		viewModel.onChange.fire(null);
		assert.strictEqual(changes, 1);

		assert.deepStrictEqual(outline.entries.map(entry => entry.label), ['first', 'second', 'third']);
	});

	test('reveal and preview navigate the chat widget', () => {
		const request = reqVM('r1', 'first');
		const { widget, outline } = setup(store, [request]);
		const entry = outline.entries[0];

		outline.reveal(entry, {}, false, false);
		assert.deepStrictEqual(widget.revealed, [request]);
		assert.deepStrictEqual(widget.focused, [request]);

		store.add(outline.preview(entry));
		assert.deepStrictEqual(widget.revealed, [request, request]);
	});
});
