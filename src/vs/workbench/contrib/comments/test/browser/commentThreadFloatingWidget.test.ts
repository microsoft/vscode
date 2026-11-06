/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { computeFloatingWidgetPlacement, FloatingWidgetSizeModel, getCenteredTop, getConnectorPoints, getRowsOutlinePath, IFloatingWidgetPlacementRequest, IRect } from '../../browser/commentThreadFloatingWidgetLayout.js';

suite('Comment thread floating widget', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('getConnectorPoints', () => {
		const code: IRect[] = [{ top: 100, left: 50, width: 200, height: 20 }];

		test('connects the closest point of the code to the anchor', () => {
			assert.deepStrictEqual({
				aboveRight: getConnectorPoints(code, { x: 400, y: 40 }),
				right: getConnectorPoints(code, { x: 400, y: 110 }),
				belowRight: getConnectorPoints(code, { x: 400, y: 300 }),
				below: getConnectorPoints(code, { x: 120, y: 160 }),
				aboveLeft: getConnectorPoints(code, { x: 10, y: 10 }),
			}, {
				aboveRight: { from: { x: 250, y: 100 }, to: { x: 400, y: 40 } },
				right: { from: { x: 250, y: 110 }, to: { x: 400, y: 110 } },
				belowRight: { from: { x: 250, y: 120 }, to: { x: 400, y: 300 } },
				below: { from: { x: 120, y: 120 }, to: { x: 120, y: 160 } },
				aboveLeft: { from: { x: 50, y: 100 }, to: { x: 10, y: 10 } },
			});
		});

		test('connects the closest line of code that spans several lines', () => {
			const lines: IRect[] = [...code, { top: 120, left: 50, width: 80, height: 20 }];
			assert.deepStrictEqual({
				besideShorterLine: getConnectorPoints(lines, { x: 200, y: 135 }),
				belowShorterLine: getConnectorPoints(lines, { x: 100, y: 160 }),
				insideShorterLine: getConnectorPoints(lines, { x: 100, y: 130 }),
			}, {
				besideShorterLine: { from: { x: 200, y: 120 }, to: { x: 200, y: 135 } },
				belowShorterLine: { from: { x: 100, y: 140 }, to: { x: 100, y: 160 } },
				insideShorterLine: undefined,
			});
		});

		test('does not connect an anchor within or on the code', () => {
			assert.deepStrictEqual({
				inside: getConnectorPoints(code, { x: 100, y: 110 }),
				onEdge: getConnectorPoints(code, { x: 250, y: 105 }),
				noCode: getConnectorPoints([], { x: 100, y: 110 }),
			}, {
				inside: undefined,
				onEdge: undefined,
				noCode: undefined,
			});
		});
	});

	suite('getRowsOutlinePath', () => {
		test('outlines the end of each row', () => {
			const rows: IRect[] = [
				{ top: 0, left: 0, width: 100, height: 20 },
				{ top: 20, left: 0, width: 60, height: 20 },
				{ top: 40, left: 0, width: 60, height: 20 },
			];
			assert.deepStrictEqual({
				noRows: getRowsOutlinePath([], 4),
				sharpCorners: getRowsOutlinePath(rows, 0),
				roundedCorners: getRowsOutlinePath(rows.slice(0, 1), 4),
			}, {
				noRows: '',
				sharpCorners: 'M 100 0 L 100 20 L 60 20 L 60 60 L 0 60 L 0 0 Z',
				roundedCorners: 'M 96 0 Q 100 0 100 4 L 100 16 Q 100 20 96 20 L 4 20 Q 0 20 0 16 L 0 4 Q 0 0 4 0 Z',
			});
		});
	});

	suite('getCenteredTop', () => {
		test('centers on the code without going above the document', () => {
			assert.deepStrictEqual({
				shorterThanCode: getCenteredTop(500, 700, 100),
				tallerThanCode: getCenteredTop(500, 520, 200),
				nearDocumentStart: getCenteredTop(20, 40, 200),
			}, {
				shorterThanCode: 550,
				tallerThanCode: 410,
				nearDocumentStart: 0,
			});
		});
	});

	suite('computeFloatingWidgetPlacement', () => {
		const request: IFloatingWidgetPlacementRequest = {
			minLeft: 60,
			maxRight: 1000,
			width: 400,
			height: 200,
			code: { top: 500, left: 60, width: 300, height: 40 },
			obstacles: []
		};

		test('centers the widget vertically on the code at the right edge of the editor', () => {
			assert.deepStrictEqual(computeFloatingWidgetPlacement(request), { top: 420, left: 592, centered: true });
		});

		test('places the widget below the code when there is no room next to it', () => {
			assert.deepStrictEqual({
				longCode: computeFloatingWidgetPlacement({ ...request, code: { top: 500, left: 60, width: 560, height: 40 } }),
				indentedCode: computeFloatingWidgetPlacement({ ...request, code: { top: 500, left: 700, width: 280, height: 20 } }),
				narrowEditor: computeFloatingWidgetPlacement({ ...request, maxRight: 500 }),
			}, {
				longCode: { top: 548, left: 60, centered: false },
				indentedCode: { top: 528, left: 592, centered: false },
				narrowEditor: { top: 548, left: 60, centered: false },
			});
		});

		test('places the widget at the top of the document for file comments', () => {
			assert.deepStrictEqual(computeFloatingWidgetPlacement({ ...request, code: undefined }), { top: 0, left: 592, centered: true });
		});

		test('moves the widget below the widgets it would cover', () => {
			assert.deepStrictEqual(computeFloatingWidgetPlacement({
				...request,
				obstacles: [
					{ top: 300, left: 600, width: 300, height: 150 },
					{ top: 460, left: 500, width: 300, height: 100 },
					{ top: 0, left: 600, width: 300, height: 100 },
				]
			}), { top: 568, left: 592, centered: false });
		});
	});

	suite('FloatingWidgetSizeModel', () => {
		const code = { top: 1000, bottom: 1020 };
		const collapsedReply = { fixed: 100, comments: 2000 };
		const expandedReply = { fixed: 180, comments: 2000 };

		function createModel(): FloatingWidgetSizeModel {
			const model = new FloatingWidgetSizeModel();
			model.captureEditorSize({ width: 1000, height: 600 });
			return model;
		}

		test('is as wide as its content needs and fills, unless something is being edited', () => {
			const model = createModel();
			assert.deepStrictEqual({
				narrowContent: model.getWidthRange({ minimum: 100, natural: 180 }, false),
				wideContent: model.getWidthRange({ minimum: 300, natural: 700 }, false),
				widerThanEditor: model.getWidthRange({ minimum: 300, natural: 1400 }, false),
				editing: model.getWidthRange({ minimum: 300, natural: 400 }, true),
			}, {
				narrowContent: { min: 240, max: 240 },
				wideContent: { min: 300, max: 700 },
				widerThanEditor: { min: 300, max: 1000 },
				editing: { min: 300, max: 1000 },
			});
		});

		test('shows the title, reply and some comments, and is no taller than its content or the editor', () => {
			const model = createModel();
			assert.deepStrictEqual({
				fewComments: model.getHeightRange({ fixed: 100, comments: 30 }),
				manyComments: model.getHeightRange({ fixed: 100, comments: 300 }),
				tallerThanEditor: model.getHeightRange(collapsedReply),
			}, {
				fewComments: { min: 130, max: 130 },
				manyComments: { min: 140, max: 400 },
				tallerThanEditor: { min: 140, max: 584 },
			});
		});

		test('sizes itself to its content, up to part of the editor, unless the user chose a height', () => {
			const model = createModel();
			model.updateGrowth(collapsedReply);
			assert.deepStrictEqual({
				auto: model.getHeight(collapsedReply, undefined),
				autoFewComments: model.getHeight({ fixed: 100, comments: 100 }, undefined),
				chosen: model.getHeight(collapsedReply, 500),
				chosenTallerThanEditor: model.getHeight(collapsedReply, 900),
			}, {
				auto: 360,
				autoFewComments: 200,
				chosen: 500,
				chosenTallerThanEditor: 584,
			});
		});

		test('grows down by as much as its reply grows', () => {
			const model = createModel();
			model.updateGrowth(collapsedReply);
			const collapsedHeight = model.getHeight(collapsedReply, undefined);
			const collapsed = { height: collapsedHeight, top: model.getTop(undefined, code, collapsedHeight) };
			const growthChanged = model.updateGrowth(expandedReply);
			const expandedHeight = model.getHeight(expandedReply, undefined);
			const expanded = { growthChanged, height: expandedHeight, top: model.getTop(undefined, code, expandedHeight), chosenHeight: model.getHeight(expandedReply, 300) };
			// A height chosen while the reply is expanded includes the reply.
			model.resetGrowth();
			model.updateGrowth(expandedReply);
			assert.deepStrictEqual({ collapsed, expanded, chosenWhileExpanded: model.getHeight(expandedReply, 300) }, {
				collapsed: { height: 360, top: 830 },
				expanded: { growthChanged: true, height: 440, top: 830, chosenHeight: 380 },
				chosenWhileExpanded: 300,
			});
		});

		test('moves up to keep its grown reply within the editor until the reply is no longer grown', () => {
			const model = createModel();
			model.updateGrowth(collapsedReply);
			model.updateGrowth(expandedReply);
			const shifts: number[] = [];
			// The widget's top is 400px below the top of the editor, so the expanded reply extends past its bottom.
			model.updateUpwardShift(0, code, 440, 600, 600);
			shifts.push(model.upwardShift);
			const shiftedTop = model.getTop(0, code, 440);
			// The widget doesn't move back down while its reply is grown, such as when the editor scrolls.
			model.updateUpwardShift(0, code, 440, 900, 600);
			shifts.push(model.upwardShift);
			model.updateGrowth(collapsedReply);
			model.updateUpwardShift(0, code, 360, 600, 600);
			shifts.push(model.upwardShift);
			assert.deepStrictEqual({ shifts, shiftedTop }, { shifts: [248, 248, 0], shiftedTop: 752 });
		});

		test('does not move up past the top of the editor', () => {
			const model = createModel();
			model.updateGrowth(collapsedReply);
			model.updateGrowth(expandedReply);
			// The editor became shorter than the widget after the widget was shown. Its top is 100px below the editor's top.
			model.updateUpwardShift(0, code, 440, 900, 400);
			assert.strictEqual(model.upwardShift, 92);
		});

		test('is limited by the editor size it captured, rather than the current one', () => {
			const model = createModel();
			const maxSize = () => ({ width: model.getWidthRange({ minimum: 300, natural: 1400 }, false).max, height: model.getHeightRange(collapsedReply).max });
			const captured = maxSize();
			model.growEditorSize({ width: 800, height: 900 });
			const grown = maxSize();
			model.captureEditorSize({ width: 800, height: 400 });
			assert.deepStrictEqual({ captured, grown, recaptured: maxSize() }, {
				captured: { width: 1000, height: 584 },
				grown: { width: 1000, height: 884 },
				recaptured: { width: 800, height: 384 },
			});
		});
	});
});
