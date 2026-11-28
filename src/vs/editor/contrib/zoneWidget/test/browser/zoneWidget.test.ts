/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { withTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { ZoneWidget } from '../../browser/zoneWidget.js';

suite('ZoneWidget', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('getHorizontalSashTop returns valid number before height is set (#349102)', () => {
		withTestCodeEditor('text', {}, (editor) => {
			class TestZoneWidget extends ZoneWidget {
				protected override _fillContainer(_container: HTMLElement): void { }

				public getDecoratingElementsHeight(): number {
					return this._decoratingElementsHeight();
				}
			}

			const widget = new TestZoneWidget(editor);
			const initialTop = widget.getHorizontalSashTop();
			assert.strictEqual(Number.isNaN(initialTop), false);
			assert.strictEqual(
				initialTop,
				-(widget.getDecoratingElementsHeight() / 2),
			);

			widget.domNode.style.height = '120px';
			assert.strictEqual(
				widget.getHorizontalSashTop(),
				120 - widget.getDecoratingElementsHeight() / 2,
			);

			widget.dispose();
		});
	});
});
