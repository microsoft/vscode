/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../common/core/range.js';
import { DocumentColorProvider } from '../../../../common/languages.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';
import { ITestCodeEditor, withAsyncTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { createTextModel } from '../../../../test/common/testTextModel.js';
import { ColorDetector } from '../../browser/colorDetector.js';

suite('ColorDetector', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const widthProperty = '--vscode-colorPicker-colorDecoratorWidth';
	const marginProperty = '--vscode-colorPicker-colorDecoratorMargin';

	/**
	 * The test editor's container is not a real element, so give it one to observe style changes.
	 */
	function useStyledContainer(editor: ITestCodeEditor): CSSStyleDeclaration {
		const container = document.createElement('div');
		editor.getContainerDomNode = () => container;
		return container.style;
	}

	function colorProvider(colorCount: number, onProvide?: () => void): DocumentColorProvider {
		return {
			provideDocumentColors: () => {
				onProvide?.();
				return Array.from({ length: colorCount }, (_, i) => ({
					range: new Range(i + 1, 1, i + 1, 8),
					color: { red: 1, green: 0, blue: 0, alpha: 1 }
				}));
			},
			provideColorPresentations: () => []
		};
	}

	test('does not restyle the editor container when there are no color decorations', async () => {
		await withAsyncTestCodeEditor(['#ff0000', 'plain text'], {}, async (editor, _viewModel, instantiationService) => {
			const didProvide = new DeferredPromise<void>();
			store.add(instantiationService.get(ILanguageFeaturesService).colorProvider.register('*', colorProvider(0, () => didProvide.complete())));

			const style = useStyledContainer(editor);
			const detector = store.add(instantiationService.createInstance(ColorDetector, editor));
			await didProvide.p;
			await timeout(0);

			assert.deepStrictEqual(
				{ width: style.getPropertyValue(widthProperty), margin: style.getPropertyValue(marginProperty), decorations: detector.limitReporter.computed },
				{ width: '', margin: '', decorations: 0 }
			);
		});
	});

	test('sets the decorator size properties once color decorations are shown and removes them on dispose', async () => {
		await withAsyncTestCodeEditor(['#ff0000', '#00ff00'], {}, async (editor, _viewModel, instantiationService) => {
			store.add(instantiationService.get(ILanguageFeaturesService).colorProvider.register('*', colorProvider(2)));

			const style = useStyledContainer(editor);
			const detector = instantiationService.createInstance(ColorDetector, editor);
			await Event.toPromise(detector.limitReporter.onDidChange);

			const shown = { width: style.getPropertyValue(widthProperty), margin: style.getPropertyValue(marginProperty), decorations: detector.limitReporter.computed };
			detector.dispose();
			const disposed = { width: style.getPropertyValue(widthProperty), margin: style.getPropertyValue(marginProperty) };

			assert.deepStrictEqual(
				{ shown, disposed },
				{ shown: { width: '0.8em', margin: '0.2em', decorations: 2 }, disposed: { width: '', margin: '' } }
			);
		});
	});

	test('sets the decorator size properties when the editor switches to a model with colors', async () => {
		await withAsyncTestCodeEditor(['plain text'], {}, async (editor, _viewModel, instantiationService) => {
			const didProvide = new DeferredPromise<void>();
			store.add(instantiationService.get(ILanguageFeaturesService).colorProvider.register('*', {
				provideDocumentColors: model => {
					didProvide.complete();
					return model.getValue().startsWith('#') ? [{ range: new Range(1, 1, 1, 8), color: { red: 1, green: 0, blue: 0, alpha: 1 } }] : [];
				},
				provideColorPresentations: () => []
			}));

			const style = useStyledContainer(editor);
			const detector = store.add(instantiationService.createInstance(ColorDetector, editor));
			await didProvide.p;
			await timeout(0);

			const withoutColors = { width: style.getPropertyValue(widthProperty), margin: style.getPropertyValue(marginProperty) };
			const didShowColors = Event.toPromise(detector.limitReporter.onDidChange);
			editor.setModel(store.add(createTextModel('#ff0000')));
			await didShowColors;
			const withColors = { width: style.getPropertyValue(widthProperty), margin: style.getPropertyValue(marginProperty), decorations: detector.limitReporter.computed };

			assert.deepStrictEqual(
				{ withoutColors, withColors },
				{ withoutColors: { width: '', margin: '' }, withColors: { width: '0.8em', margin: '0.2em', decorations: 1 } }
			);
		});
	});
});
