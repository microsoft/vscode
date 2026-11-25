/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { StandardMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Event } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MouseTarget } from '../../../../browser/controller/mouseTarget.js';
import { IPartialEditorMouseEvent } from '../../../../browser/editorBrowser.js';
import { ViewUserInputEvents } from '../../../../browser/view/viewUserInputEvents.js';
import { Range } from '../../../../common/core/range.js';
import { PositionAffinity } from '../../../../common/model.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';
import { withAsyncTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { ColorDetector } from '../../browser/colorDetector.js';
import { isOnColorDecoratorOf } from '../../browser/hoverColorPicker/hoverColorPicker.js';

suite('Hover color picker', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('recognizes the mouse on the decorator of the color the picker shows', async () => {
		await withAsyncTestCodeEditor('color: white; background: black;', {}, async (editor, viewModel, instantiationService) => {
			const white = new Range(1, 8, 1, 13);
			const black = new Range(1, 27, 1, 32);
			store.add(instantiationService.get(ILanguageFeaturesService).colorProvider.register('*', {
				provideDocumentColors: () => [
					{ range: white, color: { red: 1, green: 1, blue: 1, alpha: 1 } },
					{ range: black, color: { red: 0, green: 0, blue: 0, alpha: 1 } }
				],
				provideColorPresentations: () => []
			}));
			// The detector sizes its decorators on the editor container, which the test editor doesn't have
			const container = mainWindow.document.createElement('div');
			editor.getContainerDomNode = () => container;
			const detector = store.add(instantiationService.createInstance(ColorDetector, editor));
			await Event.toPromise(detector.limitReporter.onDidChange);

			// Like the mouse handler: target the decorator's injected text in the view, then convert the target to the model
			const mouseOnDecoratorOf = (color: Range): IPartialEditorMouseEvent => {
				const start = color.getStartPosition();
				const before = viewModel.coordinatesConverter.convertModelPositionToViewPosition(start);
				const after = viewModel.coordinatesConverter.convertModelPositionToViewPosition(start, PositionAffinity.Right);
				const viewTarget = MouseTarget.createContentText(null, before.column, before, Range.fromPositions(before, after), { mightBeForeignElement: true, injectedText: viewModel.getInjectedTextAt(before) });
				return {
					event: new StandardMouseEvent(mainWindow, new MouseEvent('mousemove', { view: mainWindow })),
					target: ViewUserInputEvents.convertViewToModelMouseTarget(viewTarget, viewModel.coordinatesConverter)
				};
			};
			const onWhite = mouseOnDecoratorOf(white);

			assert.deepStrictEqual({
				targetRange: onWhite.target?.range,
				onWhite: isOnColorDecoratorOf(onWhite, white),
				onBlack: isOnColorDecoratorOf(mouseOnDecoratorOf(black), white)
			}, {
				targetRange: new Range(1, 8, 1, 8),
				onWhite: true,
				onBlack: false
			});
		});
	});
});
