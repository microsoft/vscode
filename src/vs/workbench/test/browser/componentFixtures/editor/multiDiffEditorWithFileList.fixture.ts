/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from '../../../../../base/browser/dom.js';
import { ValueWithChangeEvent } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { TestDiffProviderFactoryService } from '../../../../../editor/test/browser/diff/testDiffProviderFactoryService.js';
import { MultiDiffEditorWithFileListWidget } from '../../../../contrib/multiDiffEditor/browser/multiDiffEditorWithFileListWidget.js';
import { MultiDiffEditorFileListPosition, MultiDiffEditorFileListViewMode } from '../../../../contrib/multiDiffEditor/common/multiDiffEditor.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { createMultiDiffEditorFixtureDocument, createMultiDiffEditorFixtureServices, FixtureWorkbenchUIElementFactory } from './multiDiffEditorFixtureUtils.js';

async function renderMultiDiffEditorWithFileListWidget(context: ComponentFixtureContext, width: number, viewMode: MultiDiffEditorFileListViewMode = 'list', position: MultiDiffEditorFileListPosition = 'right'): Promise<void> {
	const { container, disposableStore, disposableStackStore, theme } = context;
	const height = 480;
	container.style.width = `${width}px`;
	container.style.height = `${height}px`;

	const instantiationService = createMultiDiffEditorFixtureServices(disposableStore, theme, new TestDiffProviderFactoryService());
	const textModels = disposableStackStore.add(new DisposableStore());
	const document = (original: string | undefined, modified: string | undefined, originalText = 'export const value = 1;\n', modifiedText = 'export const value = 2;\n') => createMultiDiffEditorFixtureDocument(instantiationService, textModels, {
		original: original ? { uri: `inmemory://original/${original}`, text: originalText } : undefined,
		modified: modified ? { uri: `inmemory://modified/${modified}`, text: modifiedText } : undefined,
	});
	const documents = [
		document('src/server/greet.ts', 'src/server/greet.ts'),
		document(undefined, 'src/server/routes.ts', undefined, 'export const routes = [];\n'),
		document('src/legacy/config.ts', undefined, 'export const config = {};\n'),
		document('src/util/strings.ts', 'src/common/strings.ts'),
		document('test/server.test.ts', 'test/server.test.ts'),
	];

	const fileListVisible = observableValue('fileListVisible', true);
	const composite = disposableStackStore.add(instantiationService.createInstance(
		MultiDiffEditorWithFileListWidget,
		container,
		instantiationService.createInstance(FixtureWorkbenchUIElementFactory),
		{ variant: 'noCards' },
		fileListVisible,
		constObservable(viewMode),
		constObservable(position),
	));
	const widget = composite.multiDiffEditorWidget;
	const viewModel = disposableStackStore.add(widget.createViewModel({ documents: ValueWithChangeEvent.const(documents) }));
	widget.setViewModel(viewModel, { preserveFocus: true });
	// Like an editor pane, clear the view model before the widget is disposed. Hide the
	// file list first so its tree is not disposed with an update still pending.
	disposableStackStore.add(toDisposable(() => {
		fileListVisible.set(false, undefined);
		widget.setViewModel(undefined);
	}));
	composite.layout(new Dimension(width, height));
	await viewModel.waitForDiffOr1s();
}

export default defineThemedFixtureGroup({ path: 'editor/multiDiffEditor' }, {
	withFileList: defineThemedFixtureGroup({
		WithFileList: defineComponentFixture({
			themes: ['dark', 'light'],
			additionalThemes: ['darkHighContrast', 'lightHighContrast'],
			labels: { kind: 'screenshot' },
			expectedVisualDescriptions: ['Multi-file diffs on the left and a list of the five changed files docked on the right, with modified, added, deleted and renamed status letters; the first file is selected.'],
			render: context => renderMultiDiffEditorWithFileListWidget(context, 1000),
		}),
		WithFileListTree: defineComponentFixture({
			themes: ['dark', 'light'],
			labels: { kind: 'screenshot' },
			expectedVisualDescriptions: ['The same five changed files shown as a tree: a "src" folder with "server", "legacy" and "common" subfolders, and a "test" folder; files keep their status letters and hide their folder paths.'],
			render: context => renderMultiDiffEditorWithFileListWidget(context, 1000, 'tree'),
		}),
		WithFileListOnLeft: defineComponentFixture({
			themes: ['dark', 'light'],
			labels: { kind: 'screenshot' },
			expectedVisualDescriptions: ['A list of five changed files docked on the left of the multi-file diffs, with the first file selected.'],
			render: context => renderMultiDiffEditorWithFileListWidget(context, 1000, 'list', 'left'),
		}),
		NarrowHidesFileList: defineComponentFixture({
			themes: ['dark'],
			labels: { kind: 'screenshot' },
			expectedVisualDescriptions: ['A narrow multi diff editor where the file list is hidden so the diffs use the full width.'],
			render: context => renderMultiDiffEditorWithFileListWidget(context, 520),
		}),
	}),
});
