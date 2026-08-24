/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { Dimension } from '../../../../base/browser/dom.js';
import { Event, ValueWithChangeEvent } from '../../../../base/common/event.js';
import { waitForState } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AccessibilitySupport } from '../../../../platform/accessibility/common/accessibility.js';
import { IAccessibilitySignalService } from '../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IActionViewItemService, NullActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { IMenu, IMenuService } from '../../../../platform/actions/common/actions.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IEditorProgressService } from '../../../../platform/progress/common/progress.js';
import { InMemoryStorageService, IStorageService } from '../../../../platform/storage/common/storage.js';
import { IDiffProviderFactoryService } from '../../../browser/widget/diffEditor/diffProviderFactoryService.js';
import { DiffEditorWidget } from '../../../browser/widget/diffEditor/diffEditorWidget.js';
import { RefCounted } from '../../../browser/widget/diffEditor/utils.js';
import { IDocumentDiffItem, IMultiDiffEditorModel } from '../../../browser/widget/multiDiffEditor/model.js';
import { MultiDiffEditorWidget } from '../../../browser/widget/multiDiffEditor/multiDiffEditorWidget.js';
import { IWorkbenchUIElementFactory } from '../../../browser/widget/multiDiffEditor/workbenchUIElementFactory.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { instantiateTextModel } from '../../common/testTextModel.js';
import { TestDiffProviderFactoryService } from '../diff/testDiffProviderFactoryService.js';
import { createCodeEditorServices } from '../testCodeEditor.js';

suite('MultiDiffEditorWidget', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => {
		sinon.restore();
	});

	test('applies document and responsive layout options before attaching the diff model', async () => {
		const services = new ServiceCollection();
		services.set(IAccessibilitySignalService, new class extends mock<IAccessibilitySignalService>() { }());
		services.set(IActionViewItemService, new NullActionViewItemService());
		services.set(IEditorProgressService, new class extends mock<IEditorProgressService>() { }());
		services.set(IDiffProviderFactoryService, new TestDiffProviderFactoryService());
		services.set(IStorageService, disposables.add(new InMemoryStorageService()));
		services.set(IMenuService, new class extends mock<IMenuService>() {
			override createMenu(): IMenu {
				return new class extends mock<IMenu>() {
					override readonly onDidChange = Event.None;
					override getActions() { return []; }
					override dispose(): void { }
				}();
			}
		}());
		const instantiationService = createCodeEditorServices(disposables, services);

		const originalUri = URI.parse('inmemory://original/test.js');
		const modifiedUri = URI.parse('inmemory://modified/test.js');
		const original = disposables.add(instantiateTextModel(instantiationService, 'const value = 1;', undefined, undefined, originalUri));
		const modified = disposables.add(instantiateTextModel(instantiationService, 'const value = 2;', undefined, undefined, modifiedUri));
		const documentItem = RefCounted.createOfNonDisposable<IDocumentDiffItem>({
			original,
			modified,
			options: { accessibilitySupport: 'off' },
		}, { dispose() { } });
		const model: IMultiDiffEditorModel = {
			documents: ValueWithChangeEvent.const([documentItem]),
		};

		const updateOptionsSpy = sinon.spy(DiffEditorWidget.prototype, 'updateOptions');
		const setDiffModelSpy = sinon.spy(DiffEditorWidget.prototype, 'setDiffModel');

		const container = document.createElement('div');
		const widget = instantiationService.createInstance(
			MultiDiffEditorWidget,
			container,
			{} satisfies IWorkbenchUIElementFactory,
			undefined,
		);
		widget.setRenderSideBySide(true, { useInlineViewWhenSpaceIsLimited: true });
		widget.layout(new Dimension(800, 600));
		const viewModel = widget.createViewModel(model);
		await waitForState(viewModel.items, items => items.length === 1);
		widget.setViewModel(viewModel);
		widget.reveal({ original: originalUri, modified: modifiedUri }, { highlight: false });

		try {
			const activeControl = widget.getActiveControl();
			const renderSideBySideWhenNarrow = activeControl?.renderSideBySide;
			widget.layout(new Dimension(1000, 600));
			assert.deepStrictEqual({
				configuredAccessibilitySupport: updateOptionsSpy.firstCall.args[0].accessibilitySupport,
				configuredRenderSideBySide: updateOptionsSpy.firstCall.args[0].renderSideBySide,
				configuredUseInlineViewWhenSpaceIsLimited: updateOptionsSpy.firstCall.args[0].useInlineViewWhenSpaceIsLimited,
				renderSideBySideWhenNarrow,
				renderSideBySideWhenWide: activeControl?.renderSideBySide,
				optionsAppliedBeforeModel: updateOptionsSpy.calledBefore(setDiffModelSpy),
				effectiveAccessibilitySupport: activeControl?.getModifiedEditor().getOption(EditorOption.accessibilitySupport),
			}, {
				configuredAccessibilitySupport: 'off',
				configuredRenderSideBySide: true,
				configuredUseInlineViewWhenSpaceIsLimited: true,
				renderSideBySideWhenNarrow: false,
				renderSideBySideWhenWide: true,
				optionsAppliedBeforeModel: true,
				effectiveAccessibilitySupport: AccessibilitySupport.Disabled,
			});
		} finally {
			widget.setViewModel(undefined);
			viewModel.dispose();
			widget.dispose();
			documentItem.dispose();
		}
	});
});
