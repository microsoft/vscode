/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { computeFloatingWidgetPlacement, FloatingWidgetSizeModel, getCenteredTop, getConnectorPoints, getPlacementBesideLines, getRevealScrollTop, getRowsOutlinePath, getWidthBesideCode, IFloatingWidgetPlacementRequest, IRect } from '../../browser/commentThreadFloatingWidgetLayout.js';

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
			obstacles: [],
			scrollableHeight: 5000
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

		test('places a new comment right after the end of the code when there is room', () => {
			assert.deepStrictEqual({
				room: computeFloatingWidgetPlacement({ ...request, besideCode: true }),
				noRoom: computeFloatingWidgetPlacement({ ...request, besideCode: true, code: { top: 500, left: 60, width: 560, height: 40 } }),
				besideOtherWidget: computeFloatingWidgetPlacement({ ...request, besideCode: true, obstacles: [{ top: 480, left: 400, width: 300, height: 100 }] }),
			}, {
				room: { top: 500, left: 384, centered: false },
				noRoom: { top: 548, left: 60, centered: false },
				besideOtherWidget: { top: 588, left: 384, centered: false },
			});
		});

		test('places an existing comment right after the end of the lines next to the code when there is room', () => {
			assert.deepStrictEqual({
				afterLines: computeFloatingWidgetPlacement({ ...request, linesRight: 400 }),
				linesShorterThanCode: computeFloatingWidgetPlacement({ ...request, linesRight: 200 }),
				noRoomAfterLines: computeFloatingWidgetPlacement({ ...request, linesRight: 700 }),
			}, {
				afterLines: { top: 420, left: 424, centered: true },
				linesShorterThanCode: { top: 420, left: 384, centered: true },
				noRoomAfterLines: { top: 420, left: 592, centered: true },
			});
		});

		test('moves the widget to the closest free position above or below the widgets it would cover', () => {
			assert.deepStrictEqual({
				closerAbove: computeFloatingWidgetPlacement({ ...request, obstacles: [{ top: 380, left: 600, width: 300, height: 300 }] }),
				// The document ends at 1000 and can't be scrolled further, so there is no room below the other widget.
				belowOutOfReach: computeFloatingWidgetPlacement({
					...request,
					height: 360,
					code: { top: 940, left: 60, width: 300, height: 20 },
					obstacles: [{ top: 632, left: 592, width: 400, height: 360 }],
					scrollableHeight: 1000
				}),
				noFreePosition: computeFloatingWidgetPlacement({ ...request, obstacles: [{ top: 0, left: 600, width: 300, height: 400 }], scrollableHeight: 400 }),
			}, {
				closerAbove: { top: 172, left: 592, centered: false },
				belowOutOfReach: { top: 264, left: 592, centered: false },
				noFreePosition: { top: 192, left: 592, centered: false },
			});
		});
	});

	suite('getWidthBesideCode', () => {
		test('is as wide as preferred, or as wide as there is room for after the end of the code', () => {
			const code = { top: 500, left: 60, width: 300, height: 20 };
			assert.deepStrictEqual({
				room: getWidthBesideCode(code, 200, 400, 240, 1000, []),
				lessRoom: getWidthBesideCode({ ...code, width: 500 }, 200, 560, 240, 1000, []),
				narrowEditor: getWidthBesideCode({ ...code, width: 100 }, 200, 280, 240, 500, []),
				tooLittleRoom: getWidthBesideCode({ ...code, width: 700 }, 200, 400, 240, 1000, []),
				narrowerThanContent: getWidthBesideCode({ ...code, width: 500 }, 200, 560, 450, 1000, []),
			}, {
				room: 400,
				lessRoom: 408,
				narrowEditor: 280,
				tooLittleRoom: undefined,
				narrowerThanContent: undefined,
			});
		});

		test('leaves room for the widgets beside the code', () => {
			const code = { top: 500, left: 60, width: 300, height: 20 };
			assert.deepStrictEqual({
				besideWidget: getWidthBesideCode(code, 200, 400, 240, 1000, [{ top: 400, left: 750, width: 240, height: 150 }]),
				tooCloseToWidget: getWidthBesideCode(code, 200, 400, 240, 1000, [{ top: 650, left: 650, width: 340, height: 100 }]),
				aboveAndBelowWidgets: getWidthBesideCode(code, 200, 400, 240, 1000, [{ top: 300, left: 400, width: 300, height: 200 }, { top: 700, left: 400, width: 300, height: 100 }]),
				widgetOverCode: getWidthBesideCode(code, 200, 400, 240, 1000, [{ top: 500, left: 300, width: 200, height: 100 }]),
			}, {
				besideWidget: 358,
				tooCloseToWidget: undefined,
				aboveAndBelowWidgets: 400,
				widgetOverCode: undefined,
			});
		});
	});

	suite('getPlacementBesideLines', () => {
		test('goes after the lines that leave it room, and is as wide as its content fills, up to a readable width', () => {
			assert.deepStrictEqual({
				shortLines: placeBesideLines([100, 300, 200]),
				contentWiderThanRoom: placeBesideLines([100, 400, 200], { naturalWidth: 900 }),
				readableWidth: placeBesideLines([100, 300], { maxRight: 1400, naturalWidth: 900 }),
				codeEndsAfterLines: placeBesideLines([100, 300], { codeRight: 400 }),
				longLineWithRoomAfterIt: placeBesideLines([100, 600, 200]),
				lineNotNextToWidget: placeBesideLines([100, 300, 200, 700], { bottom: 60 }),
			}, {
				shortLines: { linesRight: 300, width: 450 },
				contentWiderThanRoom: { linesRight: 400, width: 568 },
				readableWidth: { linesRight: 300, width: 640 },
				codeEndsAfterLines: { linesRight: 400, width: 450 },
				longLineWithRoomAfterIt: { linesRight: 600, width: 368 },
				lineNotNextToWidget: { linesRight: 300, width: 450 },
			});
		});

		test('hides a couple of lines that leave it no room after them, at its default width', () => {
			assert.deepStrictEqual({
				lineEndingInTheMiddle: placeBesideLines([100, 700, 200]),
				twoLongLines: placeBesideLines([100, 700, 300, 1400]),
				threeLongLines: placeBesideLines([700, 1400, 300, 800]),
				codeLeavesNoRoom: placeBesideLines([100, 300], { codeRight: 700 }),
			}, {
				lineEndingInTheMiddle: { linesRight: 200, width: 300 },
				twoLongLines: { linesRight: 300, width: 300 },
				threeLongLines: undefined,
				codeLeavesNoRoom: undefined,
			});
		});

		function placeBesideLines(rights: number[], { bottom = rights.length * 20, codeRight = 60, maxRight = 1000, naturalWidth = 450 } = {}) {
			const lines = rights.map((right, i) => ({ top: i * 20, left: 60, width: right - 60, height: 20 }));
			return getPlacementBesideLines(lines, 0, bottom, codeRight, maxRight, 300, naturalWidth);
		}
	});

	suite('getRevealScrollTop', () => {
		const viewportHeight = 600;

		test('scrolls only when the code or the widget is out of view', () => {
			const code = { top: 1000, bottom: 1020 };
			const widget = { top: 830, bottom: 1190 };
			assert.deepStrictEqual({
				inView: getRevealScrollTop(code, widget, 700, viewportHeight),
				belowView: getRevealScrollTop(code, widget, 0, viewportHeight),
			}, {
				inView: undefined,
				belowView: 710,
			});
		});

		test('shows the whole widget when it does not fit in the viewport together with the code', () => {
			// The widget is centered on code that is taller than the viewport.
			const tallCode = { top: 1000, bottom: 3000 };
			const centeredWidget = { top: 1820, bottom: 2180 };
			assert.deepStrictEqual({
				centeredOnTallCode: getRevealScrollTop(tallCode, centeredWidget, 0, viewportHeight),
				widgetAlreadyInView: getRevealScrollTop(tallCode, centeredWidget, 1700, viewportHeight),
				farBelowCode: getRevealScrollTop({ top: 1000, bottom: 1020 }, { top: 2000, bottom: 2360 }, 0, viewportHeight),
				tallerThanViewport: getRevealScrollTop(tallCode, { top: 1500, bottom: 2200 }, 0, viewportHeight),
			}, {
				centeredOnTallCode: 1588,
				widgetAlreadyInView: undefined,
				farBelowCode: 1768,
				tallerThanViewport: 1492,
			});
		});
	});

	suite('FloatingWidgetSizeModel', () => {
		const code = { top: 1000, bottom: 1020 };
		const collapsedReply = { fixed: 100, comments: 2000 };
		const expandedReply = { fixed: 180, comments: 2000 };
		const scrollableHeight = 5000;

		function createModel(): FloatingWidgetSizeModel {
			const model = new FloatingWidgetSizeModel();
			model.captureEditorSize({ width: 1000, height: 600 });
			return model;
		}

		test('can be as wide as the editor, and is shown as wide as its content fills, unless something is being written', () => {
			const model = createModel();
			assert.deepStrictEqual({
				narrowContent: model.getWidthRange({ minimum: 100, natural: 180 }),
				wideContent: model.getWidthRange({ minimum: 300, natural: 700 }),
				defaultForNarrowContent: model.getDefaultWidth({ minimum: 100, natural: 180 }, 400, false),
				defaultForWideContent: model.getDefaultWidth({ minimum: 300, natural: 700 }, 400, false),
				defaultWhileEditing: model.getDefaultWidth({ minimum: 100, natural: 180 }, 400, true),
				defaultWiderThanEditor: model.getDefaultWidth({ minimum: 300, natural: 1400 }, 1200, false),
			}, {
				narrowContent: { min: 240, max: 1000 },
				wideContent: { min: 300, max: 1000 },
				defaultForNarrowContent: 240,
				defaultForWideContent: 400,
				defaultWhileEditing: 400,
				defaultWiderThanEditor: 1000,
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

		test('keeps some of the comments when the widget is too short for the rest of its content', () => {
			const model = createModel();
			assert.deepStrictEqual({
				fits: model.getCommentsHeight(collapsedReply, 360),
				tooShortForReply: model.getCommentsHeight({ fixed: 180, comments: 2000 }, 134),
				tooShortWithFewComments: model.getCommentsHeight({ fixed: 180, comments: 20 }, 134),
			}, {
				fits: 260,
				tooShortForReply: 40,
				tooShortWithFewComments: 20,
			});
		});

		test('grows down by as much as its reply grows', () => {
			const model = createModel();
			model.updateGrowth(collapsedReply);
			const collapsedHeight = model.getHeight(collapsedReply, undefined);
			const collapsed = { height: collapsedHeight, top: model.getTop(undefined, code, collapsedHeight, scrollableHeight) };
			const growthChanged = model.updateGrowth(expandedReply);
			const expandedHeight = model.getHeight(expandedReply, undefined);
			const expanded = { growthChanged, height: expandedHeight, top: model.getTop(undefined, code, expandedHeight, scrollableHeight), chosenHeight: model.getHeight(expandedReply, 300) };
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
			const shiftedTop = model.getTop(0, code, 440, scrollableHeight);
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

		test('stays within the area that the editor can scroll through', () => {
			const model = createModel();
			model.updateGrowth(collapsedReply);
			// The commented code is the last line of a document that can't be scrolled beyond its last line.
			assert.deepStrictEqual({
				belowLastLine: model.getTop(28, code, 360, 1020),
				centeredOnLastLine: model.getTop(undefined, code, 360, 1020),
				documentShorterThanWidget: model.getTop(28, code, 360, 300),
			}, {
				belowLastLine: 652,
				centeredOnLastLine: 652,
				documentShorterThanWidget: 0,
			});
		});

		test('is limited by the editor size it captured, rather than the current one', () => {
			const model = createModel();
			const maxSize = () => ({ width: model.getWidthRange({ minimum: 300, natural: 1400 }).max, height: model.getHeightRange(collapsedReply).max });
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
