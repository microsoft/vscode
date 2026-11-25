/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ViewEventHandler } from '../../../../common/viewEventHandler.js';
import { VerticalRevealType, ViewRevealRangeRequestEvent } from '../../../../common/viewEvents.js';
import { createCodeEditorServices, instantiateTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { instantiateTextModel } from '../../../../test/common/testTextModel.js';
import { SelectionAnchorController } from '../../browser/anchorSelect.js';

suite('SelectionAnchorController', () => {

	let disposables: DisposableStore;

	setup(() => {
		disposables = new DisposableStore();
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('Go to Selection Anchor reveals the anchor', () => {
		const instantiationService = createCodeEditorServices(disposables);
		const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`);
		const model = disposables.add(instantiateTextModel(instantiationService, lines.join('\n')));
		const editor = disposables.add(instantiateTestCodeEditor(instantiationService, model));
		const controller = editor.registerAndInstantiateContribution(SelectionAnchorController.ID, SelectionAnchorController);

		editor.setPosition({ lineNumber: 1, column: 1 });
		controller.setSelectionAnchor();
		editor.setPosition({ lineNumber: 50, column: 1 });

		const reveals: { range: string | undefined; verticalType: VerticalRevealType }[] = [];
		const viewModel = editor.getViewModel()!;
		const eventHandler = new class extends ViewEventHandler {
			override onRevealRangeRequest(e: ViewRevealRangeRequestEvent): boolean {
				reveals.push({ range: e.range?.toString(), verticalType: e.verticalType });
				return false;
			}
		};
		viewModel.addViewEventHandler(eventHandler);

		controller.goToSelectionAnchor();

		viewModel.removeViewEventHandler(eventHandler);
		eventHandler.dispose();

		assert.deepStrictEqual({ position: editor.getPosition()?.toString(), reveals }, {
			position: '(1,1)',
			reveals: [{ range: '[1,1 -> 1,1]', verticalType: VerticalRevealType.CenterIfOutsideViewport }]
		});
	});
});
