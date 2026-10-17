/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Dimension } from '../../../../../base/browser/dom.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditorExtensionsRegistry } from '../../../../../editor/browser/editorExtensions.js';
import { IDiffProviderFactoryService } from '../../../../../editor/browser/widget/diffEditor/diffProviderFactoryService.js';
import { DiffEditorWidget } from '../../../../../editor/browser/widget/diffEditor/diffEditorWidget.js';
import { RefCounted } from '../../../../../editor/browser/widget/diffEditor/utils.js';
import { TestDiffProviderFactoryService } from '../../../../../editor/test/browser/diff/testDiffProviderFactoryService.js';
import { createCodeEditorServices } from '../../../../../editor/test/browser/testCodeEditor.js';
import { instantiateTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { emptyProgressRunner, IEditorProgressService } from '../../../../../platform/progress/common/progress.js';
import '../../browser/toggleWordWrap.js';

suite('Toggle Word Wrap', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createDiffEditor(wordWrap: 'on' | 'off') {
		const services = new ServiceCollection();
		services.set(IAccessibilitySignalService, new class extends mock<IAccessibilitySignalService>() { }());
		services.set(IEditorProgressService, new class extends mock<IEditorProgressService>() {
			override show() { return emptyProgressRunner; }
		}());
		services.set(IDiffProviderFactoryService, new TestDiffProviderFactoryService());
		const instantiationService = createCodeEditorServices(disposables, services);
		const container = document.createElement('div');
		document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));
		const contributions = EditorExtensionsRegistry.getSomeEditorContributions(['editor.contrib.toggleWordWrapController']);
		const widget = disposables.add(instantiationService.createInstance(DiffEditorWidget, container, {
			renderGutterMenu: false,
			wordWrap,
			useInlineViewWhenSpaceIsLimited: true,
			renderSideBySideInlineBreakpoint: 900,
		}, {
			originalEditor: { contributions },
			modifiedEditor: { contributions },
		}));
		const lines = Array.from({ length: 10 }, (_, i) => `const value${i} = '${'x'.repeat(300)}';`);
		const original = disposables.add(instantiateTextModel(instantiationService, lines.join('\n')));
		lines[5] = 'const value5 = 5;';
		const modified = disposables.add(instantiateTextModel(instantiationService, lines.join('\n')));
		widget.setDiffModel(disposables.add(RefCounted.create(widget.createViewModel({ original, modified }))));
		const toggleWordWrapAction = [...EditorExtensionsRegistry.getEditorActions()].find(a => a.id === 'editor.action.toggleWordWrap')!;
		return {
			widget,
			toggleWordWrap: () => instantiationService.invokeFunction(accessor => toggleWordWrapAction.runEditorCommand(accessor, widget.getModifiedEditor(), undefined)),
			isWrapping: () => ({
				original: widget.getOriginalEditor().getLayoutInfo().isViewportWrapping,
				modified: widget.getModifiedEditor().getLayoutInfo().isViewportWrapping,
			}),
		};
	}

	test('toggling word wrap while a diff editor is rendered inline applies to its original editor once it is shown again', async () => {
		const { widget, toggleWordWrap, isWrapping } = createDiffEditor('off');
		try {
			widget.layout(new Dimension(800, 500));
			await toggleWordWrap();
			widget.layout(new Dimension(1200, 500));

			assert.deepStrictEqual(isWrapping(), { original: true, modified: true });
		} finally {
			widget.setDiffModel(null);
		}
	});

	test('toggling word wrap back while a diff editor is rendered inline applies to its original editor once it is shown again', async () => {
		const { widget, toggleWordWrap, isWrapping } = createDiffEditor('on');
		try {
			widget.layout(new Dimension(1200, 500));
			await toggleWordWrap();
			widget.layout(new Dimension(800, 500));
			await toggleWordWrap();
			widget.layout(new Dimension(1200, 500));

			assert.deepStrictEqual(isWrapping(), { original: true, modified: true });
		} finally {
			widget.setDiffModel(null);
		}
	});
});
