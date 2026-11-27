/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { withTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { ZoneWidget } from '../../browser/zoneWidget.js';

class TestZoneWidget extends ZoneWidget {
	protected _fillContainer(container: HTMLElement): void { }
}

suite('ZoneWidget', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('issue #343610: sash top is a number before the widget is shown', () => {
		withTestCodeEditor('hello', {}, editor => {
			const widget = new TestZoneWidget(editor, { showFrame: true, isResizeable: true });
			widget.create();
			const sashTop = widget.domNode.querySelector<HTMLElement>('.monaco-sash')?.style.top;
			const result = { horizontalSashTopIsNaN: Number.isNaN(widget.getHorizontalSashTop()), sashTopIsSet: !!sashTop && sashTop.endsWith('px') };
			widget.dispose();
			assert.deepStrictEqual(result, { horizontalSashTopIsNaN: false, sashTopIsSet: true });
		});
	});
});
