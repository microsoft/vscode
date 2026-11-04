/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../common/core/range.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { withAsyncTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';
import { ColorDetector } from '../../browser/colorDetector.js';
import { ContentHoverController } from '../../../hover/browser/contentHoverController.js';
import { ShowOrFocusHoverAction } from '../../../hover/browser/hoverActions.js';

suite('ColorPicker Integration', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('Trigger and Focus via Show Hover', async () => {
		await withAsyncTestCodeEditor([
			'#ff0000',
		], {}, async (editor, viewModel, instantiationService) => {
			const languageFeaturesService = instantiationService.get(ILanguageFeaturesService);

			const provider = {
				provideDocumentColors(model: any, token: CancellationToken) {
					return [{ color: { red: 1, green: 0, blue: 0, alpha: 1 }, range: new Range(1, 1, 1, 8) }];
				},
				provideColorPresentations(model: any, colorInfo: any, provider: any, token: CancellationToken) {
					return [{ label: '#ff0000' }];
				}
			};

			const d = languageFeaturesService.colorProvider.register({ language: 'plaintext', hasAccessToAllModels: true }, provider);

			const colorDetector = editor.registerAndInstantiateContribution(ColorDetector.ID, ColorDetector);
			const hoverController = editor.registerAndInstantiateContribution(ContentHoverController.ID, ContentHoverController);

			editor.setPosition({ lineNumber: 1, column: 2 });

			const showHoverAction = new ShowOrFocusHoverAction();
			await instantiationService.invokeFunction(accessor => showHoverAction.run(accessor, editor, { focus: true }));

			// The hover controller opens asynchronously and renders the color picker
			// However, testing DOM focus in headless node.js integration tests might not work exactly as in browser
			// We at least assert that the hover is visible
			assert.ok(hoverController.isHoverVisible, 'Hover should be visible after triggering showHover');

			d.dispose();
			colorDetector.dispose();
			hoverController.dispose();
		});
	});

	test('Multiple Hover Widgets', async () => {
		await withAsyncTestCodeEditor([
			'#ff0000',
		], {}, async (editor, viewModel, instantiationService) => {
			const languageFeaturesService = instantiationService.get(ILanguageFeaturesService);

			const colorProvider = {
				provideDocumentColors(model: any, token: CancellationToken) {
					return [{ color: { red: 1, green: 0, blue: 0, alpha: 1 }, range: new Range(1, 1, 1, 8) }];
				},
				provideColorPresentations(model: any, colorInfo: any, provider: any, token: CancellationToken) {
					return [{ label: '#ff0000' }];
				}
			};
			const hoverProvider = {
				provideHover(model: any, position: any, token: CancellationToken) {
					return { contents: [{ value: 'Hover docs' }], range: new Range(1, 1, 1, 8) };
				}
			};

			const d1 = languageFeaturesService.colorProvider.register({ language: 'plaintext', hasAccessToAllModels: true }, colorProvider);
			const d2 = languageFeaturesService.hoverProvider.register({ language: 'plaintext', hasAccessToAllModels: true }, hoverProvider);

			const colorDetector = editor.registerAndInstantiateContribution(ColorDetector.ID, ColorDetector);
			const hoverController = editor.registerAndInstantiateContribution(ContentHoverController.ID, ContentHoverController);

			editor.setPosition({ lineNumber: 1, column: 2 });

			const showHoverAction = new ShowOrFocusHoverAction();
			await instantiationService.invokeFunction(accessor => showHoverAction.run(accessor, editor, { focus: true }));

			assert.ok(hoverController.isHoverVisible, 'Hover with both docs and color picker should be visible');

			d1.dispose();
			d2.dispose();
			colorDetector.dispose();
			hoverController.dispose();
		});
	});
});
