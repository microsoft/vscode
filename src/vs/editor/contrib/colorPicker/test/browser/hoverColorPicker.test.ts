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
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ICodeEditor, IPartialEditorMouseEvent } from '../../../../browser/editorBrowser.js';
import { ViewUserInputEvents } from '../../../../browser/view/viewUserInputEvents.js';
import { Range } from '../../../../common/core/range.js';
import { DocumentColorProvider } from '../../../../common/languages.js';
import { PositionAffinity } from '../../../../common/model.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';
import { withAsyncTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { EditorHoverStatusBar } from '../../../hover/browser/contentHoverStatusBar.js';
import { ColorDetector } from '../../browser/colorDetector.js';
import { createColorHover } from '../../browser/colorPickerParticipantUtils.js';
import { isOnColorDecoratorOf } from '../../browser/hoverColorPicker/hoverColorPicker.js';
import { ColorHover, HoverColorPickerParticipant } from '../../browser/hoverColorPicker/hoverColorPickerParticipant.js';

suite('Hover color picker', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function renderColorPicker(editor: ICodeEditor, instantiationService: IInstantiationService, participant: HoverColorPickerParticipant, range: Range, provider: DocumentColorProvider) {
		const colorHover = ColorHover.fromBaseColor(participant, await createColorHover(editor.getModel()!, { range, color: { red: 1, green: 1, blue: 1, alpha: 1 } }, provider));
		store.add(colorHover.model);
		const renderedParts = participant.renderHoverParts({
			fragment: mainWindow.document.createDocumentFragment(),
			statusBar: store.add(instantiationService.createInstance(EditorHoverStatusBar)),
			onContentsChanged: () => { },
			setMinimumDimensions: () => { },
			hide: () => { },
			focus: () => { }
		}, [colorHover]);
		return { model: colorHover.model, renderedParts };
	}

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

	test('moves the color range of the shown picker when its edits move the color', async () => {
		await withAsyncTestCodeEditor('color: white;', {}, async (editor, _viewModel, instantiationService) => {
			// Like a presentation that adds an import, every picker edit inserts a line before the color
			const provider: DocumentColorProvider = {
				provideDocumentColors: () => [],
				provideColorPresentations: (_model, colorInfo) => [{
					label: 'red',
					textEdit: { range: colorInfo.range, text: 'red' },
					additionalTextEdits: [{ range: new Range(1, 1, 1, 1), text: '// import\n' }]
				}]
			};
			const participant = instantiationService.createInstance(HoverColorPickerParticipant, editor);
			const { model, renderedParts } = await renderColorPicker(editor, instantiationService, participant, new Range(1, 8, 1, 13), provider);
			store.add(renderedParts);
			const flush = () => {
				const edited = Event.toPromise(editor.onDidChangeModelContent);
				model.flushColor();
				return edited;
			};

			await flush();
			const whileShown = participant.getColorPickerRange();
			// Hide the picker while its next edit waits for the color presentations
			const edited = flush();
			participant.handleHide();
			await edited;

			assert.deepStrictEqual({
				text: editor.getModel()!.getValue(),
				whileShown,
				afterHide: participant.getColorPickerRange()
			}, {
				text: '// import\n// import\ncolor: red;',
				whileShown: new Range(2, 8, 2, 11),
				afterHide: undefined
			});
		});
	});

	test('forgets the picker when the hover drops it, but not a newer picker', async () => {
		await withAsyncTestCodeEditor('color: white; background: black;', {}, async (editor, _viewModel, instantiationService) => {
			const provider: DocumentColorProvider = { provideDocumentColors: () => [], provideColorPresentations: () => [] };
			const participant = instantiationService.createInstance(HoverColorPickerParticipant, editor);
			const state = () => ({ visible: participant.isColorPickerVisible(), range: participant.getColorPickerRange() });

			const first = await renderColorPicker(editor, instantiationService, participant, new Range(1, 8, 1, 13), provider);
			// Like moving to another swatch: the hover renders the new picker before it disposes the old one
			const second = await renderColorPicker(editor, instantiationService, participant, new Range(1, 27, 1, 32), provider);
			first.renderedParts.dispose();
			const replaced = state();
			// Like moving to other text on the line: the hover drops the picker without hiding
			second.renderedParts.dispose();

			assert.deepStrictEqual({ replaced, dropped: state() }, {
				replaced: { visible: true, range: new Range(1, 27, 1, 32) },
				dropped: { visible: false, range: undefined }
			});
		});
	});
});
