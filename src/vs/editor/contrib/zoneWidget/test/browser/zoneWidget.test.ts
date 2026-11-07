/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../common/core/range.js';
import { ViewEventHandler } from '../../../../common/viewEventHandler.js';
import { VerticalRevealType, ViewRevealRangeRequestEvent } from '../../../../common/viewEvents.js';
import { withTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { ZoneWidget } from '../../browser/zoneWidget.js';

suite('ZoneWidget', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	for (const lineNumber of [1, 2]) {
		test(`reveals a widget vertically without horizontal scrolling on line ${lineNumber}`, () => {
			withTestCodeEditor([' '.repeat(150) + 'target();', ' '.repeat(150) + 'target();'], {}, (editor, viewModel) => {
				const events: ViewRevealRangeRequestEvent[] = [];
				const handler = new class extends ViewEventHandler {
					override onRevealRangeRequest(event: ViewRevealRangeRequestEvent): boolean {
						events.push(event);
						return false;
					}
				};
				const widget = new class extends ZoneWidget {
					protected override _fillContainer(): void { }
				}(editor);
				viewModel.addViewEventHandler(handler);
				try {
					widget.create();
					widget.show(new Range(lineNumber, 151, lineNumber, 157), 5);

					assert.strictEqual(events.length, 1);
					assert.strictEqual(events[0].revealHorizontal, false);
					assert.deepStrictEqual(events[0].range, new Range(lineNumber, 1, 2, 1));
					assert.strictEqual(events[0].verticalType, lineNumber === 2 ? VerticalRevealType.NearTop : VerticalRevealType.Simple);
				} finally {
					widget.dispose();
					viewModel.removeViewEventHandler(handler);
					handler.dispose();
				}
			});
		});
	}
});
