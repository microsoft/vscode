/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Dimension, mainWindow } from '../../../../../base/browser/dom.js';
import { ValueWithChangeEvent } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDiffProviderFactoryService } from '../../../../../editor/browser/widget/diffEditor/diffProviderFactoryService.js';
import { RefCounted } from '../../../../../editor/browser/widget/diffEditor/utils.js';
import { IDocumentDiffItem } from '../../../../../editor/browser/widget/multiDiffEditor/model.js';
import { MultiDiffEditorWidget } from '../../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidget.js';
import { IWorkbenchUIElementFactory } from '../../../../../editor/browser/widget/multiDiffEditor/workbenchUIElementFactory.js';
import { TestDiffProviderFactoryService } from '../../../../../editor/test/browser/diff/testDiffProviderFactoryService.js';
import { createEditorServices, createTextModel, registerWorkbenchServices } from '../../../../test/browser/componentFixtures/fixtureUtils.js';

suite('MultiDiffEditorWidget', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('delegates handled entry header middle-clicks', async () => {
		const instantiationService = createEditorServices(disposables, {
			additionalServices: registration => {
				registerWorkbenchServices(registration);
				registration.defineInstance(IDiffProviderFactoryService, new TestDiffProviderFactoryService());
			},
		});

		const container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));

		const originalResource = URI.file('/workspace/original.ts');
		const modifiedResource = URI.file('/workspace/modified.ts');
		const original = disposables.add(createTextModel(instantiationService, 'before', originalResource));
		const modified = disposables.add(createTextModel(instantiationService, 'after', modifiedResource));
		const item = disposables.add(RefCounted.createOfNonDisposable<IDocumentDiffItem>({ original, modified }, { dispose() { } }));

		let shouldHandle = false;
		const handledResources: string[] = [];
		const factory: IWorkbenchUIElementFactory = {
			handleHeaderMiddleClick: resource => {
				handledResources.push(resource.toString());
				return shouldHandle;
			},
		};
		const widget = disposables.add(instantiationService.createInstance(MultiDiffEditorWidget, container, factory, undefined));
		widget.layout(new Dimension(800, 600));
		const viewModel = disposables.add(widget.createViewModel({
			documents: ValueWithChangeEvent.const([item]),
		}));
		widget.setViewModel(viewModel);
		disposables.add(toDisposable(() => widget.setViewModel(undefined)));
		await viewModel.waitForDiffOr1s();

		const header = container.querySelector<HTMLElement>('.multiDiffEntry .header');
		if (!header) {
			throw new Error('Expected a rendered multi-diff entry header');
		}

		const leftClick = new MouseEvent('auxclick', { bubbles: true, button: 0, cancelable: true });
		header.dispatchEvent(leftClick);
		const unhandledMiddleClick = new MouseEvent('auxclick', { bubbles: true, button: 1, cancelable: true });
		header.dispatchEvent(unhandledMiddleClick);
		shouldHandle = true;
		const handledMiddleClick = new MouseEvent('auxclick', { bubbles: true, button: 1, cancelable: true });
		header.dispatchEvent(handledMiddleClick);

		assert.deepStrictEqual({
			handledResources,
			defaultPrevented: [
				leftClick.defaultPrevented,
				unhandledMiddleClick.defaultPrevented,
				handledMiddleClick.defaultPrevented,
			],
		}, {
			handledResources: [
				modifiedResource.toString(),
				modifiedResource.toString(),
			],
			defaultPrevented: [false, false, true],
		});
	});
});
