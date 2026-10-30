/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { stub } from 'sinon';
import { Barrier, timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { ICodeEditorViewState } from '../../../../../editor/common/editorCommon.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { Selection } from '../../../../../editor/common/core/selection.js';
import { DocumentSymbol, SymbolKind } from '../../../../../editor/common/languages.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { IMarkerDecorationsService } from '../../../../../editor/common/services/markerDecorations.js';
import { ITextResourceConfigurationService } from '../../../../../editor/common/services/textResourceConfiguration.js';
import { IOutlineModelService, OutlineElement, OutlineModelService } from '../../../../../editor/contrib/documentSymbols/browser/outlineModel.js';
import { TextEditorSelectionRevealType } from '../../../../../platform/editor/common/editor.js';
import { withAsyncTestCodeEditor } from '../../../../../editor/test/browser/testCodeEditor.js';
import { createModelServices, instantiateTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { ICustomTextEditorNavigation } from '../../../customEditor/common/customTextEditorNavigation.js';
import { OutlineTarget } from '../../../../services/outline/browser/outline.js';
import { IEditorService, SIDE_GROUP } from '../../../../services/editor/common/editorService.js';
import { codeEditorDocumentSymbolAdapter, customTextEditorDocumentSymbolAdapter } from '../../browser/outline/documentSymbolEditor.js';
import { DocumentSymbolsOutline } from '../../browser/outline/documentSymbolsOutline.js';

suite('DocumentSymbolsOutline adapters', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setupOutline() {
		const instantiation = createModelServices(store.add(new DisposableStore()));
		const features = instantiation.get(ILanguageFeaturesService);
		const model = store.add(instantiateTextModel(instantiation, '# Parent\n## Child\nbody\n# Other', 'plaintext'));
		let providerCalls = 0;
		store.add(features.documentSymbolProvider.register('*', {
			provideDocumentSymbols(model): DocumentSymbol[] {
				providerCalls++;
				return [
					{
						name: model.getLineContent(1), detail: '', kind: SymbolKind.String, tags: [],
						range: new Range(1, 1, 3, 5), selectionRange: new Range(1, 1, 1, 9),
						children: [{ name: 'Child', detail: '', kind: SymbolKind.String, tags: [], range: new Range(2, 1, 3, 5), selectionRange: new Range(2, 1, 2, 9) }]
					},
					{ name: 'Other', detail: '', kind: SymbolKind.String, tags: [], range: new Range(4, 1, 4, 8), selectionRange: new Range(4, 1, 4, 8) }
				];
			}
		}));
		const outlineService = store.add(instantiation.createInstance(OutlineModelService));
		instantiation.stub(IOutlineModelService, outlineService);
		instantiation.stub(IMarkerDecorationsService, { onDidChangeMarker: Event.None, getLiveMarkers: () => [] });
		instantiation.stub(ITextResourceConfigurationService, new class extends mock<ITextResourceConfigurationService>() {
			override getValue<T>(): T { return true as T; }
		});
		const calls: unknown[] = [];
		const opened: unknown[][] = [];
		const editorService = new class extends mock<IEditorService>() {
			override async openEditor(input: unknown, group?: unknown) {
				opened.push([input, group]);
				return undefined;
			}
		};
		async function create(handle: string, selection: Selection | undefined, target = OutlineTarget.OutlinePane) {
			const navigation = store.add(new class extends Disposable implements ICustomTextEditorNavigation {
				private readonly _onDidChangeSelection = this._register(new Emitter<void>());
				readonly onDidChangeSelection = this._onDidChangeSelection.event;
				private readonly _onDidDispose = this._register(new Emitter<void>());
				readonly onDidDispose = this._onDidDispose.event;
				readonly model = model;
				selection = selection;
				updateSelection(value: Selection | undefined): void {
					this.selection = value;
					this._onDidChangeSelection.fire();
				}
				async revealRange(range: Range, selection: Selection | undefined, preserveFocus: boolean): Promise<void> {
					calls.push({ handle, range, selection, preserveFocus });
				}
				captureViewState() { return Disposable.None; }
				override dispose(): void {
					this._onDidDispose.fire();
					super.dispose();
				}
			});
			const barrier = new Barrier();
			const outline = store.add(instantiation.createInstance(DocumentSymbolsOutline, customTextEditorDocumentSymbolAdapter(navigation, 'test.richMarkdown', editorService), target, barrier));
			await barrier.wait();
			return { navigation, outline };
		}
		return { create, model, calls, opened, providerCalls: () => providerCalls };
	}

	test('reuses symbol providers and cached text-model outline across split instances', async () => {
		const fixture = setupOutline();
		const first = await fixture.create('first', new Selection(2, 1, 2, 1));
		const second = await fixture.create('second', new Selection(4, 1, 4, 1), OutlineTarget.Breadcrumbs);
		assert.strictEqual(fixture.providerCalls(), 1);
		assert.strictEqual((first.outline.activeElement as OutlineElement).symbol.name, 'Child');
		assert.strictEqual((second.outline.activeElement as OutlineElement).symbol.name, 'Other');
		await first.outline.reveal(first.outline.activeElement!, { preserveFocus: true }, false, false);
		await second.outline.reveal(second.outline.activeElement!, {}, false, true);
		assert.deepStrictEqual(fixture.calls, [
			{ handle: 'first', range: new Range(2, 1, 3, 5), selection: new Selection(2, 1, 2, 1), preserveFocus: true },
			{ handle: 'second', range: new Range(4, 1, 4, 8), selection: new Selection(4, 1, 4, 8), preserveFocus: false }
		]);
	});

	test('opening a symbol to the side preserves the rich editor, selection, and editor options', async () => {
		const fixture = setupOutline();
		const { outline } = await fixture.create('panel', new Selection(2, 1, 2, 1));
		await outline.reveal(outline.activeElement!, { preserveFocus: true, pinned: true }, true, false);
		assert.deepStrictEqual({
			inPlaceReveals: fixture.calls,
			opened: fixture.opened
		}, {
			inPlaceReveals: [],
			opened: [[{
				resource: fixture.model.uri,
				options: {
					preserveFocus: true, pinned: true, override: 'test.richMarkdown',
					selection: new Range(2, 1, 2, 1),
					selectionRevealType: TextEditorSelectionRevealType.NearTopIfOutsideViewport
				}
			}, SIDE_GROUP]]
		});
	});

	test('selection drives breadcrumb ancestry and clearing does not remove symbols', async () => {
		const fixture = setupOutline();
		const { navigation, outline } = await fixture.create('panel', undefined, OutlineTarget.Breadcrumbs);
		assert.strictEqual(outline.isEmpty, false);
		assert.deepStrictEqual(outline.config.breadcrumbsDataSource.getBreadcrumbElements(), []);
		let activeChanges = 0;
		store.add(outline.onDidChange(event => { if (event.affectOnlyActiveElement) { activeChanges++; } }));
		navigation.updateSelection(new Selection(3, 1, 3, 1));
		await timeout(200);
		assert.deepStrictEqual(outline.config.breadcrumbsDataSource.getBreadcrumbElements().map(item => item.label), ['# Parent', 'Child']);
		navigation.updateSelection(undefined);
		await timeout(200);
		assert.strictEqual(outline.activeElement, undefined);
		assert.strictEqual(outline.isEmpty, false);
		assert.deepStrictEqual(outline.config.breadcrumbsDataSource.getBreadcrumbElements(), []);
		assert.strictEqual(activeChanges, 2);
	});

	test('live text edits refresh the shared outline without a hidden code editor', async () => {
		const fixture = setupOutline();
		const { outline } = await fixture.create('panel', new Selection(1, 1, 1, 1));
		const updated = Event.toPromise(Event.filter(outline.onDidChange, event => !event.affectOnlyActiveElement));
		fixture.model.applyEdits([{ range: new Range(1, 1, 1, 9), text: '# Renamed' }]);
		await updated;
		assert.strictEqual((outline.activeElement as OutlineElement).symbol.name, '# Renamed');
		assert.strictEqual(fixture.providerCalls(), 2);
	});

	test('preview scrolls without changing selection and disposal cancels cursor listeners', async () => {
		const fixture = setupOutline();
		const { navigation, outline } = await fixture.create('panel', new Selection(2, 1, 2, 1));
		const preview = outline.preview(outline.activeElement!);
		preview.dispose();
		assert.deepStrictEqual(fixture.calls, [{ handle: 'panel', range: new Range(2, 1, 3, 5), selection: undefined, preserveFocus: true }]);
		let changes = 0;
		store.add(outline.onDidChange(() => changes++));
		navigation.dispose();
		fixture.model.applyEdits([{ range: new Range(1, 1, 1, 1), text: 'x' }]);
		outline.dispose();
		await timeout(400);
		assert.strictEqual(changes, 0);
	});

	test('ordinary code editor navigation retains openCodeEditor selection, focus and side-by-side options', async () => {
		await withAsyncTestCodeEditor('first\nsecond', {}, async editor => {
			const calls: unknown[] = [];
			const codeService = new class extends mock<ICodeEditorService>() {
				override async openCodeEditor(input: unknown, source: unknown, sideBySide?: boolean) { calls.push({ input, source, sideBySide }); return editor; }
			};
			const adapter = codeEditorDocumentSymbolAdapter(editor, codeService);
			const range = new Range(2, 1, 2, 4);
			await adapter.reveal(editor.getModel().uri, range, range, { preserveFocus: true, pinned: true }, true);
			assert.deepStrictEqual(calls, [{
				input: { resource: editor.getModel().uri, options: { preserveFocus: true, pinned: true, selection: range, selectionRevealType: TextEditorSelectionRevealType.NearTopIfOutsideViewport } },
				source: editor, sideBySide: true
			}]);
			const saved = new class extends mock<ICodeEditorViewState>() { };
			const save = stub(editor, 'saveViewState').returns(saved);
			const restore = stub(editor, 'restoreViewState');
			const state = adapter.captureViewState();
			state.dispose();
			assert.strictEqual(save.calledOnce, true);
			assert.strictEqual(restore.calledOnceWithExactly(saved), true);
			save.restore();
			restore.restore();
			const preview = adapter.preview(range);
			assert.strictEqual(editor.getModel().getAllDecorations().some(decoration => decoration.options.description === 'document-symbols-outline-range-highlight'), true);
			preview.dispose();
			assert.strictEqual(editor.getModel().getAllDecorations().some(decoration => decoration.options.description === 'document-symbols-outline-range-highlight'), false);
		});
	});
});
