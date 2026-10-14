/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append, Dimension } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Event, ValueWithChangeEvent } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { waitForState } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { RefCounted } from '../../../../../editor/browser/widget/diffEditor/utils.js';
import { IDiffProviderFactoryService } from '../../../../../editor/browser/widget/diffEditor/diffProviderFactoryService.js';
import { DiffItemSource, IDocumentDiffItem } from '../../../../../editor/browser/widget/multiDiffEditor/model.js';
import { MultiDiffEditorWidget } from '../../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidget.js';
import { IWorkbenchUIElementFactory } from '../../../../../editor/browser/widget/multiDiffEditor/workbenchUIElementFactory.js';
import { TestDiffProviderFactoryService } from '../../../../../editor/test/browser/diff/testDiffProviderFactoryService.js';
import { createCodeEditorServices } from '../../../../../editor/test/browser/testCodeEditor.js';
import { instantiateTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IActionViewItemService, NullActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { IMenu, IMenuService } from '../../../../../platform/actions/common/actions.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IEditorProgressService } from '../../../../../platform/progress/common/progress.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import '../../../../../editor/browser/widget/multiDiffEditor/style.css';
import '../../browser/media/sessionChangesEditor.css';

suite('SessionChangesEditor spacing', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('only the leading Changes card drops its outer gutter while later cards and other editors retain theirs', () => {
		const root = append(mainWindow.document.body, $('.monaco-workbench'));
		root.style.cssText = '--vscode-spacing-size40: 4px; --vscode-spacing-size80: 8px; --vscode-spacing-size320: 32px; --vscode-strokeThickness: 1px;';
		store.add(toDisposable(() => root.remove()));
		const results = [];
		for (const theme of ['vs', 'vs-dark', 'hc-black', 'hc-light']) {
			root.classList.add(theme);
			for (const changesEditor of [true, false]) {
				const body = append(root, $(changesEditor ? '.session-changes-editor-body' : '.other-editor-body'));
				for (const cards of [true, false]) {
					const widget = append(body, $('.monaco-component.multiDiffEditor.multiDiffEditor-compact'));
					widget.classList.toggle('multiDiffEditor-card', cards);
					for (const first of [true, false]) {
						const entry = append(widget, $('.multiDiffEntry'));
						entry.classList.toggle('first-diff-entry', first);
						const header = append(entry, $('.header'));
						header.setAttribute('aria-expanded', 'true');
						const content = append(header, $('.header-content'));
						for (const sticky of [false, true]) {
							header.classList.toggle('shadow', sticky);
							results.push({
								theme, changesEditor, cards, first, sticky,
								topMargin: mainWindow.getComputedStyle(content).marginTop,
							});
						}
					}
				}
				body.remove();
			}
			root.classList.remove(theme);
		}
		assert.deepStrictEqual(results, results.map(result => ({
			...result,
			topMargin: result.cards && !result.sticky && !(result.changesEditor && result.first) ? '4px' : '0px',
		})));
	});

	test('the leading card keeps the diff body at the same offset when its header becomes sticky', async () => {
		const services = new ServiceCollection();
		services.set(IAccessibilitySignalService, new class extends mock<IAccessibilitySignalService>() { }());
		services.set(IActionViewItemService, new NullActionViewItemService());
		services.set(IEditorProgressService, new class extends mock<IEditorProgressService>() { }());
		services.set(IDiffProviderFactoryService, new TestDiffProviderFactoryService());
		services.set(IStorageService, store.add(new InMemoryStorageService()));
		services.set(IMenuService, new class extends mock<IMenuService>() {
			override createMenu(): IMenu {
				return new class extends mock<IMenu>() {
					override readonly onDidChange = Event.None;
					override getActions() { return []; }
					override dispose(): void { }
				}();
			}
		}());
		const instantiationService = createCodeEditorServices(store, services);
		const container = append(mainWindow.document.body, $('.session-changes-editor-body'));
		container.style.cssText = '--vscode-spacing-size40: 4px; --vscode-spacing-size80: 8px; --vscode-spacing-size320: 32px; --vscode-strokeThickness: 1px;';
		store.add(toDisposable(() => container.remove()));
		const originalUri = URI.parse('inmemory://original/sticky-card.js');
		const modifiedUri = URI.parse('inmemory://modified/sticky-card.js');
		const text = Array.from({ length: 80 }, (_, index) => `const value${index} = ${index};`).join('\n');
		const original = instantiateTextModel(instantiationService, text, undefined, undefined, originalUri);
		const modified = instantiateTextModel(instantiationService, `// changed\n${text}`, undefined, undefined, modifiedUri);
		const documentItem = RefCounted.createOfNonDisposable<IDocumentDiffItem>({
			original: new DiffItemSource(originalUri, original),
			modified: new DiffItemSource(modifiedUri, modified),
		}, { dispose() { } });
		const widget = instantiationService.createInstance(MultiDiffEditorWidget, container, {} satisfies IWorkbenchUIElementFactory, { variant: 'cards' });
		widget.setRenderSideBySide(false);
		widget.layout(new Dimension(800, 120));
		const viewModel = widget.createViewModel({ documents: ValueWithChangeEvent.const([documentItem]) });
		store.add(toDisposable(() => {
			widget.dispose();
			viewModel.dispose();
			original.dispose();
			modified.dispose();
		}));
		await waitForState(viewModel.items, items => items.length === 1);
		await waitForState(viewModel.items.get()[0].diffEditorViewModel.isDiffUpToDate, value => value);
		widget.setViewModel(viewModel, { preserveFocus: true });
		await waitForState(widget.getLayoutDebugState(), state => state.items[0]?.hasTemplate === true);
		const results = [];
		for (const top of [0, 10, 0]) {
			widget.setViewState({ scrollState: { top, left: 0 } });
			const entry = container.querySelector<HTMLElement>('.first-diff-entry')!;
			const header = entry.querySelector<HTMLElement>('.header')!;
			const content = header.querySelector<HTMLElement>('.header-content')!;
			results.push({
				top,
				sticky: header.classList.contains('shadow'),
				headerFlowHeight: content.offsetHeight + Number.parseFloat(mainWindow.getComputedStyle(content).marginTop),
				bodyOffset: entry.querySelector<HTMLElement>('.editorParent')!.getBoundingClientRect().top - entry.getBoundingClientRect().top,
			});
		}
		assert.deepStrictEqual(results, [0, 10, 0].map(top => ({
			top, sticky: top > 0, headerFlowHeight: 36, bodyOffset: 36,
		})));
		widget.setViewModel(undefined);
	});
});
