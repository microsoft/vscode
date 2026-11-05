/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { $, append, hide } from '../../../../../base/browser/dom.js';
import '../../../../../base/browser/ui/breadcrumbs/breadcrumbsWidget.css';
import '../../../../../base/browser/ui/codicons/codiconStyles.js';
import { IconLabel } from '../../../../../base/browser/ui/iconLabel/iconLabel.js';
import { DataTree } from '../../../../../base/browser/ui/tree/dataTree.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { FuzzyScore } from '../../../../../base/common/filters.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getIconsStyleSheet } from '../../../../../platform/theme/browser/iconsStyleSheet.js';
import { OutlineTarget } from '../../../../services/outline/browser/outline.js';
import { ChatOutline, ChatOutlineEntry, getChatRequestLabel } from '../../browser/chatOutline.js';
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

	teardown(() => sinon.restore());

	async function createContainer(selector: string) {
		const container = append(mainWindow.document.body, $(selector));
		store.add(toDisposable(() => container.remove()));
		container.style.setProperty('--vscode-spacing-size60', '6px');
		const iconStyles = append(container, $('style'));
		iconStyles.textContent = store.add(getIconsStyleSheet(undefined)).getCSS().toString();
		await mainWindow.document.fonts.load('16px codicon');
		return container;
	}

	async function renderOutline(items: IChatRequestViewModel[]) {
		const { outline } = setup(store, items);
		const container = await createContainer('.chat-outline-test');
		const { delegate, renderers, treeDataSource, options } = outline.config;
		const tree = store.add(new DataTree<ChatOutline, ChatOutlineEntry, FuzzyScore>('ChatOutline', container, delegate, renderers, treeDataSource, options));
		tree.layout(200, 600);
		tree.setInput(outline);
		return { container, tree };
	}

	test('renders labels beside their icons on one row and ellipsizes overflow when resized', async () => {
		const longPrompt = 'A long prompt that should remain readable on one line. '.repeat(8);
		const { container, tree } = await renderOutline([reqVM('r1', 'First request'), reqVM('r2', longPrompt)]);
		const layouts = [];

		for (const width of [600, 160]) {
			container.style.width = `${width}px`;
			tree.layout(200, width);
			layouts.push(Array.from(container.querySelectorAll<HTMLElement>('.monaco-list-row')).map(row => {
				const icon = row.querySelector<HTMLElement>('.codicon-comment-discussion')!;
				const label = row.querySelector<HTMLElement>('.label-name')!;
				const labelContainer = row.querySelector<HTMLElement>('.monaco-icon-label-container')!;
				const rowBounds = row.getBoundingClientRect();
				const iconBounds = icon.getBoundingClientRect();
				const labelBounds = label.getBoundingClientRect();
				return {
					text: label.textContent,
					visible: labelContainer.clientWidth > 0 && labelBounds.top >= rowBounds.top && labelBounds.bottom <= rowBounds.bottom,
					besideIcon: iconBounds.width > 0 && labelBounds.left >= iconBounds.right,
					centeredIcon: Math.abs(iconBounds.top + iconBounds.height / 2 - rowBounds.top - rowBounds.height / 2) < 0.5,
					overflowing: labelContainer.scrollWidth > labelContainer.clientWidth,
					textOverflow: mainWindow.getComputedStyle(labelContainer).textOverflow,
				};
			}));
		}

		const expected = [
			{ text: 'First request', visible: true, besideIcon: true, centeredIcon: true, overflowing: false, textOverflow: 'ellipsis' },
			{ text: longPrompt.trim(), visible: true, besideIcon: true, centeredIcon: true, overflowing: true, textOverflow: 'ellipsis' },
		];
		assert.deepStrictEqual(layouts, [expected, expected]);
	});

	test('provides full plain-text hover labels while preserving rendered and accessible request labels', async () => {
		const setLabel = sinon.spy(IconLabel.prototype, 'setLabel');
		const requests = [
			reqVM('r1', 'first line\n\tsecond line'),
			reqVM('r2', 'Keep $(bug) literal'),
			{ ...reqVM('r3', ''), variables: [{ kind: 'file', id: 'file', name: 'file.ts', value: URI.file('/file.ts') }] },
			{ ...reqVM('r4', ''), variables: [{ kind: 'image', id: 'image', name: 'image.png', value: new Uint8Array() }] },
			reqVM('r5', ''),
		] satisfies IChatRequestViewModel[];
		const { container } = await renderOutline(requests);
		const labels = ['first line second line', 'Keep $(bug) literal', 'Attached 1 file', 'Attached 1 image', 'Request 5'];
		const rows = Array.from(container.querySelectorAll<HTMLElement>('.monaco-list-row'));
		const hoverTitles = new Map(setLabel.getCalls().map(call => [call.args[0], call.args[2]?.title]));

		assert.deepStrictEqual({
			text: rows.map(row => row.querySelector('.label-name')?.textContent),
			hovers: labels.map(label => hoverTitles.get(label)),
			ariaLabels: rows.map(row => row.getAttribute('aria-label')),
			inlineIcons: container.querySelectorAll('.label-name .codicon').length,
			nativeTitles: container.querySelectorAll('.chat-outline-element [title]').length,
			labelTabStops: container.querySelectorAll('.chat-outline-element [tabindex]').length,
		}, {
			text: labels,
			hovers: labels,
			ariaLabels: labels,
			inlineIcons: 0,
			nativeTitles: 0,
			labelTabStops: 0,
		});
	});

	test('supports hiding breadcrumb icons without hiding request labels', async () => {
		const { outline } = setup(store, [reqVM('r1', 'First request')]);
		const container = await createContainer('.monaco-breadcrumbs');
		const breadcrumb = append(container, $('.monaco-breadcrumb-item'));
		const renderer = outline.config.renderers[0];
		const template = renderer.renderTemplate(breadcrumb);
		store.add(toDisposable(() => renderer.disposeTemplate(template)));
		renderer.renderElement({
			element: outline.entries[0],
			children: [],
			depth: 0,
			visibleChildrenCount: 0,
			visibleChildIndex: 0,
			collapsible: false,
			collapsed: false,
			visible: true,
			filterData: undefined,
		}, 0, template);

		const icon = breadcrumb.querySelector<HTMLElement>('.codicon-comment-discussion')!;
		const label = breadcrumb.querySelector<HTMLElement>('.label-name')!;
		const state = () => ({
			iconVisible: icon.getBoundingClientRect().width > 0,
			labelVisible: label.getBoundingClientRect().width > 0,
			label: label.textContent,
		});
		const before = state();

		// BreadcrumbsControl hides icons through the renderer template.
		hide(template.iconClass);

		assert.deepStrictEqual([before, state()], [
			{ iconVisible: true, labelVisible: true, label: 'First request' },
			{ iconVisible: false, labelVisible: true, label: 'First request' },
		]);
	});

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
