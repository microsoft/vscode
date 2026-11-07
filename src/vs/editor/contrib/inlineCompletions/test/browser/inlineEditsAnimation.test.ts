/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { observableCodeEditor } from '../../../../browser/observableCodeEditor.js';
import { withAsyncTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { InlineEditsGutterIndicator } from '../../browser/view/inlineEdits/components/gutterIndicatorView.js';
import { InlineEditTabAction } from '../../browser/view/inlineEdits/inlineEditsViewInterface.js';
import { InlineEditsCollapsedView } from '../../browser/view/inlineEdits/inlineEditsViews/inlineEditsCollapsedView.js';

suite('Inline Edits Animation', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	async function settles(promise: Promise<unknown>): Promise<boolean> {
		let settled = false;
		promise.then(() => settled = true, () => settled = true);
		await timeout(0);
		return settled;
	}

	test('gutter indicator triggerAnimation settles when motion is reduced', async () => {
		await withAsyncTestCodeEditor('foo', {}, async (editor, _viewModel, instantiationService) => {
			assert.strictEqual(instantiationService.invokeFunction(accessor => accessor.get(IAccessibilityService).isMotionReduced()), true);

			const indicator = instantiationService.createInstance(
				InlineEditsGutterIndicator,
				observableCodeEditor(editor),
				constObservable(undefined),
				constObservable(InlineEditTabAction.Inactive),
				constObservable(0),
				constObservable(false),
				observableValue('focusIsInMenu', false),
			);

			try {
				assert.strictEqual(await settles(indicator.triggerAnimation()), true);
			} finally {
				indicator.dispose();
			}
		});
	});

	test('collapsed view triggerAnimation settles when motion is reduced', async () => {
		await withAsyncTestCodeEditor('foo', {}, async (editor, _viewModel, instantiationService) => {
			assert.strictEqual(instantiationService.invokeFunction(accessor => accessor.get(IAccessibilityService).isMotionReduced()), true);

			const view = instantiationService.createInstance(
				InlineEditsCollapsedView,
				editor,
				constObservable(undefined),
			);

			try {
				assert.strictEqual(await settles(view.triggerAnimation()), true);
			} finally {
				view.dispose();
			}
		});
	});
});
