/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMenu, IMenuService } from '../../../../../platform/actions/common/actions.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { CodeEditorWidget } from '../../../../browser/widget/codeEditor/codeEditorWidget.js';
import { EditorOption } from '../../../../common/config/editorOptions.js';
import { CompletionItemKind, CompletionItemProvider } from '../../../../common/languages.js';
import { createCodeEditorServices } from '../../../../test/browser/testCodeEditor.js';
import { createTextModel } from '../../../../test/common/testTextModel.js';
import { CompletionModel } from '../../browser/completionModel.js';
import { CompletionItem } from '../../browser/suggest.js';
import { SuggestWidget } from '../../browser/suggestWidget.js';
import { WordDistance } from '../../browser/wordDistance.js';

suite('SuggestWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('measures suggestions in an auxiliary window', () => {
		const iframe = document.createElement('iframe');
		document.body.appendChild(iframe);
		store.add(toDisposable(() => iframe.remove()));

		const auxiliaryDocument = iframe.contentDocument!;
		const container = document.createElement('div');
		container.style.width = '500px';
		container.style.height = '300px';
		auxiliaryDocument.body.appendChild(container);

		const createElement = auxiliaryDocument.createElement;
		auxiliaryDocument.createElement = () => {
			throw new Error('Not allowed to create elements in child window JavaScript context.');
		};
		store.add(toDisposable(() => auxiliaryDocument.createElement = createElement));

		const services = new ServiceCollection(
			[IStorageService, store.add(new InMemoryStorageService())],
			[IMarkdownRendererService, new class extends mock<IMarkdownRendererService>() { }],
			[IMenuService, new class extends mock<IMenuService>() {
				override createMenu(): IMenu {
					return new class extends mock<IMenu>() {
						override readonly onDidChange = Event.None;
						override dispose(): void { }
					};
				}
			}],
		);
		const instantiationService = createCodeEditorServices(store, services);
		const editor = store.add(instantiationService.createInstance(
			CodeEditorWidget,
			container,
			{ suggest: { fitWidthToDetails: true } },
			{ contributions: [] },
		));
		const textModel = store.add(createTextModel('a'));
		editor.setModel(textModel);
		editor.layout({ width: 500, height: 300 });

		const position = { lineNumber: 1, column: 2 };
		const completion = {
			label: { label: 'agent', detail: ' with a detailed description' },
			insertText: 'agent',
			kind: CompletionItemKind.Function,
			range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 2 },
		};
		const completionList = { suggestions: [completion] };
		const provider: CompletionItemProvider = {
			_debugDisplayName: 'test',
			provideCompletionItems: () => completionList,
		};
		const completionModel = new CompletionModel(
			[new CompletionItem(position, completion, completionList, provider)],
			position.column,
			{ leadingLineContent: 'a', characterCountDelta: 0 },
			WordDistance.None,
			editor.getOption(EditorOption.suggest),
			editor.getOption(EditorOption.snippetSuggestions),
		);
		const widget = store.add(instantiationService.createInstance(SuggestWidget, editor));

		widget.showSuggestions(completionModel, 0, false, false, false);

		assert.deepStrictEqual({
			ownerDocument: widget.element.domNode.ownerDocument === auxiliaryDocument,
			mainRealmElement: widget.element.domNode instanceof HTMLElement,
			attached: auxiliaryDocument.body.contains(widget.element.domNode),
		}, {
			ownerDocument: true,
			mainRealmElement: true,
			attached: true,
		});
	});
});
