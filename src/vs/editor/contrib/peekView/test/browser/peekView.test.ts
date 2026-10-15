/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DEFAULT_UI_TYPOGRAPHY, setUITypography } from '../../../../../base/browser/fonts.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditorOption } from '../../../../common/config/editorOptions.js';
import { withTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { PeekViewWidget } from '../../browser/peekView.js';

class TestPeekViewWidget extends PeekViewWidget {

	get headHeight(): string | undefined {
		return this._headElement?.style.height;
	}

	protected _fillBody(): void { }
}

suite('PeekViewWidget', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('relayouts the head of an open peek when the UI typography changes', () => {
		withTestCodeEditor('line', {}, (editor, _viewModel, instantiationService) => {
			const widget = instantiationService.createInstance(TestPeekViewWidget, editor, {});
			try {
				widget.create();
				widget.show({ lineNumber: 1, column: 1 }, 10);

				const initial = widget.headHeight;
				setUITypography({ fontSize: 26, fontFamily: undefined });
				const scaled = widget.headHeight;
				setUITypography(DEFAULT_UI_TYPOGRAPHY);

				// The head grows by as much as a standard list row: 22px at 13px, 44px at 26px
				const headHeight = Math.ceil(editor.getOption(EditorOption.lineHeight) * 1.2);
				assert.deepStrictEqual({ initial, scaled, restored: widget.headHeight }, {
					initial: `${headHeight}px`,
					scaled: `${headHeight + 22}px`,
					restored: `${headHeight}px`,
				});
			} finally {
				setUITypography(DEFAULT_UI_TYPOGRAPHY);
				widget.dispose();
			}
		});
	});
});
