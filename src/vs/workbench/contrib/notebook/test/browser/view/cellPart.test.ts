/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CodeCellRenderTemplate } from '../../../browser/view/notebookRenderingCommon.js';
import { CodeCellViewModel } from '../../../browser/viewModel/codeCellViewModel.js';
import { CodeCellLayout } from '../../../browser/view/cellParts/codeCell.js';
import { ICodeEditor } from '../../../../../../editor/browser/editorBrowser.js';
import { CodeCellLayoutInfo, IActiveNotebookEditorDelegate } from '../../../browser/notebookBrowser.js';

suite('CellPart', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('CodeCellLayout editor visibility states', () => {
		/**
		 * We construct a very small mock around the parts that `CodeCellLayout` touches. The goal
		 * is to validate the branching logic that sets `_editorVisibility` without mutating any
		 * production code. Each scenario sets up geometry & scroll values then invokes
		 * `layoutEditor()` and asserts the resulting visibility classification.
		 */

		interface TestScenario {
			name: string;
			scrollTop: number;
			viewportHeight: number;
			editorContentHeight: number;
			editorHeight: number; // viewCell.layoutInfo.editorHeight
			outputContainerOffset: number; // elementTop + this offset => editorBottom
			expected: string; // CodeCellLayout.editorVisibility
			postScrollTop?: number; // expected editor scrollTop written into stub editor
			elementTop: number; // now scenario-specific for clarity
			elementHeight: number; // scenario-specific container height
			expectedTop: number; // expected computed CSS top (numeric px)
			expectedEditorScrollTop: number; // expected argument passed to editor.setScrollTop
		}

		const DEFAULT_ELEMENT_TOP = 100; // absolute top of the cell in notebook coordinates
		const DEFAULT_ELEMENT_HEIGHT = 900; // arbitrary, large enough not to constrain
		const STATUSBAR = 22;
		const TOP_MARGIN = 6; // mirrors layoutInfo.topMargin usage
		const OUTLINE = 1;

		const scenarios: TestScenario[] = [
			{
				name: 'Full',
				scrollTop: 0,
				viewportHeight: 400,
				editorContentHeight: 300,
				editorHeight: 300,
				outputContainerOffset: 300, // editorBottom = 100 + 300 = 400, fully inside viewport (scrollBottom=400)
				expected: 'Full',
				elementTop: DEFAULT_ELEMENT_TOP,
				elementHeight: DEFAULT_ELEMENT_HEIGHT,
				expectedTop: 0,
				expectedEditorScrollTop: 0,
			},
			{
				name: 'Bottom Clipped',
				scrollTop: 0,
				viewportHeight: 350, // scrollBottom=350 < editorBottom(400)
				editorContentHeight: 300,
				editorHeight: 300,
				outputContainerOffset: 300,
				expected: 'Bottom Clipped',
				elementTop: DEFAULT_ELEMENT_TOP,
				elementHeight: DEFAULT_ELEMENT_HEIGHT,
				expectedTop: 0,
				expectedEditorScrollTop: 0,
			},
			{
				name: 'Full (Small Viewport)',
				scrollTop: DEFAULT_ELEMENT_TOP + TOP_MARGIN + 20, // scrolled into the cell body
				viewportHeight: 220, // small vs content
				editorContentHeight: 500, // larger than viewport so we clamp
				editorHeight: 500,
				outputContainerOffset: 600, // editorBottom=700 > scrollBottom
				expected: 'Full (Small Viewport)',
				elementTop: DEFAULT_ELEMENT_TOP,
				elementHeight: DEFAULT_ELEMENT_HEIGHT,
				expectedTop: 19, // (scrollTop - elementTop - topMargin - outlineWidth) = (100+6+20 -100 -6 -1)
				expectedEditorScrollTop: 19,
			},
			{
				name: 'Top Clipped',
				scrollTop: DEFAULT_ELEMENT_TOP + TOP_MARGIN + 40, // scrolled further down but not past bottom
				viewportHeight: 600, // larger than content height below (forces branch for Top Clipped)
				editorContentHeight: 200,
				editorHeight: 200,
				outputContainerOffset: 450, // editorBottom=550; scrollBottom= scrollTop+viewportHeight = > 550?  (540+600=1140) but we only need scrollTop < editorBottom
				expected: 'Top Clipped',
				elementTop: DEFAULT_ELEMENT_TOP,
				elementHeight: DEFAULT_ELEMENT_HEIGHT,
				expectedTop: 39, // (100+6+40 -100 -6 -1)
				expectedEditorScrollTop: 40, // contentHeight(200) - computed height(160)
			},
			{
				name: 'Invisible',
				scrollTop: DEFAULT_ELEMENT_TOP + 1000, // well below editor bottom
				viewportHeight: 400,
				editorContentHeight: 300,
				editorHeight: 300,
				outputContainerOffset: 300, // editorBottom=400 < scrollTop
				expected: 'Invisible',
				elementTop: DEFAULT_ELEMENT_TOP,
				elementHeight: DEFAULT_ELEMENT_HEIGHT,
				expectedTop: 278, // adjusted after ensuring minimum line height when possibleEditorHeight < LINE_HEIGHT
				expectedEditorScrollTop: 279, // contentHeight(300) - clamped height(21)
			},
		];

		for (const s of scenarios) {
			// Fresh stub objects per scenario
			const editorScrollState: { scrollTop: number } = { scrollTop: 0 };
			const stubEditor = {
				layoutCalls: [] as { width: number; height: number }[],
				_lastScrollTopSet: -1,
				getLayoutInfo: () => ({ width: 600, height: s.editorHeight }),
				getContentHeight: () => s.editorContentHeight,
				layout: (dim: { width: number; height: number }) => {
					stubEditor.layoutCalls.push(dim);
				},
				setScrollTop: (v: number) => {
					editorScrollState.scrollTop = v;
					stubEditor._lastScrollTopSet = v;
				},
				hasModel: () => true,
			};

			const editorPart = { style: { top: '' } };
			const template: Partial<CodeCellRenderTemplate> = {
				editor: stubEditor as unknown as ICodeEditor,
				editorPart: editorPart as unknown as HTMLElement,
			};

			// viewCell stub with only needed pieces
			const viewCell: Partial<CodeCellViewModel> = {
				isInputCollapsed: false,
				layoutInfo: {
					// values referenced in layout logic
					statusBarHeight: STATUSBAR,
					topMargin: TOP_MARGIN,
					outlineWidth: OUTLINE,
					editorHeight: s.editorHeight,
					outputContainerOffset: s.outputContainerOffset,
				} as unknown as CodeCellLayoutInfo,
			};

			// notebook editor stub
			let scrollBottom = s.scrollTop + s.viewportHeight;
			const notebookEditor = {
				scrollTop: s.scrollTop,
				get scrollBottom() {
					return scrollBottom;
				},
				setScrollTop: (v: number) => {
					notebookEditor.scrollTop = v;
					scrollBottom = v + s.viewportHeight;
				},
				getLayoutInfo: () => ({
					fontInfo: { lineHeight: 21 },
					height: s.viewportHeight,
					stickyHeight: 0,
				}),
				getAbsoluteTopOfElement: () => s.elementTop,
				getAbsoluteBottomOfElement: () =>
					s.elementTop + s.outputContainerOffset,
				getHeightOfElement: () => s.elementHeight,
				notebookOptions: {
					getLayoutConfiguration: () => ({ editorTopPadding: 6 }),
				},
			};

			const layout = new CodeCellLayout(
				/* enabled */ true,
				notebookEditor as unknown as IActiveNotebookEditorDelegate,
				viewCell as CodeCellViewModel,
				template as CodeCellRenderTemplate,
				{
					debug: () => {
						/* no-op */
					},
				},
				{ width: 600, height: s.editorHeight }
			);

			layout.layoutEditor('init');
			assert.strictEqual(
				layout.editorVisibility,
				s.expected,
				`Scenario '${s.name}' (scrollTop=${s.scrollTop}) expected visibility ${s.expected} but got ${layout.editorVisibility}`
			);
			const actualTop = parseInt(
				(editorPart.style.top || '0').replace(/px$/, '')
			); // style.top always like 'NNNpx'
			assert.strictEqual(
				actualTop,
				s.expectedTop,
				`Scenario '${s.name}' (scrollTop=${s.scrollTop}) expected top ${s.expectedTop}px but got ${editorPart.style.top}`
			);
			assert.strictEqual(
				stubEditor._lastScrollTopSet,
				s.expectedEditorScrollTop,
				`Scenario '${s.name}' (scrollTop=${s.scrollTop}) expected editor.setScrollTop(${s.expectedEditorScrollTop}) but got ${stubEditor._lastScrollTopSet}`
			);

			// Basic sanity: style.top should always be set when visible states other than Full (handled) or Invisible.
			if (s.expected !== 'Invisible') {
				assert.notStrictEqual(
					editorPart.style.top,
					'',
					`Scenario '${s.name}' should set a top style value`
				);
			} else {
				// Invisible still sets a top; just ensure layout ran
				assert.ok(
					editorPart.style.top !== undefined,
					'Invisible scenario still performs a layout'
				);
			}
		}
	});

	test('Scrolling', () => {
		/**
		 * Pixel-by-pixel scroll test to validate `CodeCellLayout` calculations for:
		 *  - editorPart.style.top
		 *  - editorVisibility classification
		 *  - editor internal scrollTop passed to setScrollTop
		 *
		 * We intentionally mirror the production math in a helper (duplication acceptable in test) so
		 * that any divergence is caught. Constants chosen to exercise all state transitions.
		 */
		const LINE_HEIGHT = 21; // from getLayoutInfo().fontInfo.lineHeight in stubs
		const CELL_TOP_MARGIN = 6;
		const CELL_OUTLINE_WIDTH = 1;
		const STATUSBAR_HEIGHT = 22;
		const VIEWPORT_HEIGHT = 300; // notebook viewport height
		const ELEMENT_TOP = 100; // absolute top
		const EDITOR_CONTENT_HEIGHT = 800; // tall content so we get clipping and small viewport states
		const EDITOR_HEIGHT = EDITOR_CONTENT_HEIGHT; // initial layoutInfo.editorHeight
		const OUTPUT_CONTAINER_OFFSET = 800; // bottom of editor region relative to elementTop
		const ELEMENT_HEIGHT = 1200; // large container

		function clamp(v: number, min: number, max: number) {
			return Math.min(Math.max(v, min), max);
		}

		function computeExpected(scrollTop: number) {
			const scrollBottom = scrollTop + VIEWPORT_HEIGHT;
			const viewportHeight = VIEWPORT_HEIGHT;
			const editorBottom = ELEMENT_TOP + OUTPUT_CONTAINER_OFFSET;
			let top = Math.max(
				0,
				scrollTop - ELEMENT_TOP - CELL_TOP_MARGIN - CELL_OUTLINE_WIDTH
			);
			const possibleEditorHeight = EDITOR_HEIGHT - top;
			if (possibleEditorHeight < LINE_HEIGHT) {
				top = top - (LINE_HEIGHT - possibleEditorHeight) - CELL_OUTLINE_WIDTH;
			}
			let height = EDITOR_CONTENT_HEIGHT;
			let visibility: string = 'Full';
			let editorScrollTop = 0;
			if (scrollTop <= ELEMENT_TOP + CELL_TOP_MARGIN) {
				const minimumEditorHeight = LINE_HEIGHT + 6; // editorTopPadding from configuration stub (6)
				if (scrollBottom >= editorBottom) {
					height = clamp(
						EDITOR_CONTENT_HEIGHT,
						minimumEditorHeight,
						EDITOR_CONTENT_HEIGHT
					);
					visibility = 'Full';
				} else {
					height =
						clamp(
							scrollBottom - (ELEMENT_TOP + CELL_TOP_MARGIN) - STATUSBAR_HEIGHT,
							minimumEditorHeight,
							EDITOR_CONTENT_HEIGHT
						) +
						2 * CELL_OUTLINE_WIDTH;
					visibility = 'Bottom Clipped';
					editorScrollTop = 0;
				}
			} else {
				if (
					viewportHeight <= EDITOR_CONTENT_HEIGHT &&
					scrollBottom <= editorBottom
				) {
					const minimumEditorHeight = LINE_HEIGHT + 6; // editorTopPadding
					height =
						clamp(
							viewportHeight - STATUSBAR_HEIGHT,
							minimumEditorHeight,
							EDITOR_CONTENT_HEIGHT - STATUSBAR_HEIGHT
						) +
						2 * CELL_OUTLINE_WIDTH;
					visibility = 'Full (Small Viewport)';
					editorScrollTop = top;
				} else {
					const minimumEditorHeight = LINE_HEIGHT;
					height = clamp(
						EDITOR_CONTENT_HEIGHT -
						(scrollTop - (ELEMENT_TOP + CELL_TOP_MARGIN)),
						minimumEditorHeight,
						EDITOR_CONTENT_HEIGHT
					);
					if (scrollTop > editorBottom) {
						visibility = 'Invisible';
					} else {
						visibility = 'Top Clipped';
					}
					editorScrollTop = EDITOR_CONTENT_HEIGHT - height;
				}
			}
			return { top, visibility, editorScrollTop };
		}

		// Shared stubs (we'll mutate scrollTop each iteration) – we re-create layout each iteration to reset internal state changes
		for (
			let scrollTop = 0;
			scrollTop <= VIEWPORT_HEIGHT + OUTPUT_CONTAINER_OFFSET + 20;
			scrollTop++
		) {
			const expected = computeExpected(scrollTop);
			const scrollBottom = scrollTop + VIEWPORT_HEIGHT;
			const stubEditor = {
				_lastScrollTopSet: -1,
				getLayoutInfo: () => ({ width: 600, height: EDITOR_HEIGHT }),
				getContentHeight: () => EDITOR_CONTENT_HEIGHT,
				layout: () => {
					/* no-op */
				},
				setScrollTop: (v: number) => {
					stubEditor._lastScrollTopSet = v;
				},
				hasModel: () => true,
			};
			const editorPart = { style: { top: '' } };
			const template: Partial<CodeCellRenderTemplate> = {
				editor: stubEditor as unknown as ICodeEditor,
				editorPart: editorPart as unknown as HTMLElement,
			};
			const viewCell: Partial<CodeCellViewModel> = {
				isInputCollapsed: false,
				layoutInfo: {
					statusBarHeight: STATUSBAR_HEIGHT,
					topMargin: CELL_TOP_MARGIN,
					outlineWidth: CELL_OUTLINE_WIDTH,
					editorHeight: EDITOR_HEIGHT,
					outputContainerOffset: OUTPUT_CONTAINER_OFFSET,
				} as unknown as CodeCellLayoutInfo,
			};
			const notebookEditor = {
				scrollTop,
				get scrollBottom() {
					return scrollBottom;
				},
				setScrollTop: (v: number) => {
					/* notebook scroll changes are not the focus here */
				},
				getLayoutInfo: () => ({
					fontInfo: { lineHeight: LINE_HEIGHT },
					height: VIEWPORT_HEIGHT,
					stickyHeight: 0,
				}),
				getAbsoluteTopOfElement: () => ELEMENT_TOP,
				getAbsoluteBottomOfElement: () => ELEMENT_TOP + OUTPUT_CONTAINER_OFFSET,
				getHeightOfElement: () => ELEMENT_HEIGHT,
				notebookOptions: {
					getLayoutConfiguration: () => ({ editorTopPadding: 6 }),
				},
			};
			const layout = new CodeCellLayout(
				true,
				notebookEditor as unknown as IActiveNotebookEditorDelegate,
				viewCell as CodeCellViewModel,
				template as CodeCellRenderTemplate,
				{ debug: () => { } },
				{ width: 600, height: EDITOR_HEIGHT }
			);
			layout.layoutEditor('nbDidScroll');
			const actualTop = parseInt(
				(editorPart.style.top || '0').replace(/px$/, '')
			);
			assert.strictEqual(
				actualTop,
				expected.top,
				`scrollTop=${scrollTop}: expected top ${expected.top}, got ${actualTop}`
			);
			assert.strictEqual(
				layout.editorVisibility,
				expected.visibility,
				`scrollTop=${scrollTop}: expected visibility ${expected.visibility}, got ${layout.editorVisibility}`
			);
			assert.strictEqual(
				stubEditor._lastScrollTopSet,
				expected.editorScrollTop,
				`scrollTop=${scrollTop}: expected editorScrollTop ${expected.editorScrollTop}, got ${stubEditor._lastScrollTopSet}`
			);
		}
	});

	test('CodeCellLayout reuses content height after init', () => {
		const LINE_HEIGHT = 21;
		const STATUSBAR_HEIGHT = 22;
		const CELL_TOP_MARGIN = 6;
		const CELL_OUTLINE_WIDTH = 1;
		const VIEWPORT_HEIGHT = 1000;
		const ELEMENT_TOP = 100;
		const ELEMENT_HEIGHT = 1200;
		const OUTPUT_CONTAINER_OFFSET = 300;
		const EDITOR_HEIGHT = 800;

		let contentHeight = 800;
		const stubEditor = {
			layoutCalls: [] as { width: number; height: number }[],
			_lastScrollTopSet: -1,
			getLayoutInfo: () => ({ width: 600, height: EDITOR_HEIGHT }),
			getContentHeight: () => contentHeight,
			layout: (dim: { width: number; height: number }) => {
				stubEditor.layoutCalls.push(dim);
			},
			setScrollTop: (v: number) => {
				stubEditor._lastScrollTopSet = v;
			},
			hasModel: () => true,
		};
		const editorPart = { style: { top: '' } };
		const template: Partial<CodeCellRenderTemplate> = {
			editor: stubEditor as unknown as ICodeEditor,
			editorPart: editorPart as unknown as HTMLElement,
		};
		const viewCell: Partial<CodeCellViewModel> = {
			isInputCollapsed: false,
			layoutInfo: {
				statusBarHeight: STATUSBAR_HEIGHT,
				topMargin: CELL_TOP_MARGIN,
				outlineWidth: CELL_OUTLINE_WIDTH,
				editorHeight: EDITOR_HEIGHT,
				outputContainerOffset: OUTPUT_CONTAINER_OFFSET,
				editorWidth: 600,
			} as unknown as CodeCellLayoutInfo,
		};
		const notebookEditor = {
			scrollTop: 0,
			get scrollBottom() {
				return VIEWPORT_HEIGHT;
			},
			setScrollTop: (v: number) => {
				/* no-op */
			},
			getLayoutInfo: () => ({
				fontInfo: { lineHeight: LINE_HEIGHT },
				height: VIEWPORT_HEIGHT,
				stickyHeight: 0,
			}),
			getAbsoluteTopOfElement: () => ELEMENT_TOP,
			getAbsoluteBottomOfElement: () => ELEMENT_TOP + OUTPUT_CONTAINER_OFFSET,
			getHeightOfElement: () => ELEMENT_HEIGHT,
			notebookOptions: {
				getLayoutConfiguration: () => ({ editorTopPadding: 6 }),
			},
		};

		const layout = new CodeCellLayout(
			true,
			notebookEditor as unknown as IActiveNotebookEditorDelegate,
			viewCell as CodeCellViewModel,
			template as CodeCellRenderTemplate,
			{ debug: () => { } },
			{ width: 600, height: EDITOR_HEIGHT }
		);

		layout.layoutEditor('init');
		assert.strictEqual(layout.editorVisibility, 'Full');
		assert.strictEqual(stubEditor.layoutCalls.at(-1)?.height, 800);

		// Simulate Monaco reporting a transient smaller content height on scroll.
		contentHeight = 200;
		layout.layoutEditor('nbDidScroll');
		assert.strictEqual(layout.editorVisibility, 'Full');
		assert.strictEqual(
			stubEditor.layoutCalls.at(-1)?.height,
			800,
			'nbDidScroll should reuse the established content height'
		);

		layout.layoutEditor('onDidContentSizeChange');
		assert.strictEqual(layout.editorVisibility, 'Full');
		assert.strictEqual(
			stubEditor.layoutCalls.at(-1)?.height,
			200,
			'onDidContentSizeChange should refresh the content height'
		);
	});

	test('CodeCellLayout maintains content height after paste when scrolling', () => {
		/**
		 * Regression test for https://github.com/microsoft/vscode/issues/284524
		 *
		 * Scenario: Cell starts with 1 line (37px), user pastes text (grows to 679px),
		 * then scrolls. During scroll, Monaco may report a transient smaller height (39px)
		 * due to the clipped layout. The fix uses _establishedContentHeight to maintain
		 * the actual content height (679px) instead of using the transient or initial values.
		 */
		const LINE_HEIGHT = 21;
		const CELL_TOP_MARGIN = 6;
		const CELL_OUTLINE_WIDTH = 1;
		const STATUSBAR_HEIGHT = 22;
		const VIEWPORT_HEIGHT = 1000;
		const ELEMENT_TOP = 100;
		const ELEMENT_HEIGHT = 1200;
		const INITIAL_CONTENT_HEIGHT = 37; // 1 line
		const INITIAL_EDITOR_HEIGHT = INITIAL_CONTENT_HEIGHT;
		const OUTPUT_CONTAINER_OFFSET = 300;
		const PASTED_CONTENT_HEIGHT = 679;

		let contentHeight = INITIAL_CONTENT_HEIGHT;
		const stubEditor = {
			layoutCalls: [] as { width: number; height: number }[],
			_lastScrollTopSet: -1,
			getLayoutInfo: () => ({ width: 600, height: INITIAL_EDITOR_HEIGHT }),
			getContentHeight: () => contentHeight,
			layout: (dim: { width: number; height: number }) => {
				stubEditor.layoutCalls.push(dim);
			},
			setScrollTop: (v: number) => {
				stubEditor._lastScrollTopSet = v;
			},
			hasModel: () => true,
		};
		const editorPart = { style: { top: '' } };
		const template: Partial<CodeCellRenderTemplate> = {
			editor: stubEditor as unknown as ICodeEditor,
			editorPart: editorPart as unknown as HTMLElement,
		};
		const layoutInfo = {
			statusBarHeight: STATUSBAR_HEIGHT,
			topMargin: CELL_TOP_MARGIN,
			outlineWidth: CELL_OUTLINE_WIDTH,
			editorHeight: INITIAL_EDITOR_HEIGHT,
			outputContainerOffset: OUTPUT_CONTAINER_OFFSET,
			editorWidth: 600,
		};
		const viewCell: Partial<CodeCellViewModel> = {
			isInputCollapsed: false,
			layoutInfo: layoutInfo as unknown as CodeCellLayoutInfo,
		};
		const notebookEditor = {
			scrollTop: 0,
			get scrollBottom() {
				return notebookEditor.scrollTop + VIEWPORT_HEIGHT;
			},
			setScrollTop: (v: number) => {
				notebookEditor.scrollTop = v;
			},
			getLayoutInfo: () => ({
				fontInfo: { lineHeight: LINE_HEIGHT },
				height: VIEWPORT_HEIGHT,
				stickyHeight: 0,
			}),
			getAbsoluteTopOfElement: () => ELEMENT_TOP,
			getAbsoluteBottomOfElement: () => ELEMENT_TOP + OUTPUT_CONTAINER_OFFSET,
			getHeightOfElement: () => ELEMENT_HEIGHT,
			notebookOptions: {
				getLayoutConfiguration: () => ({ editorTopPadding: 6 }),
			},
		};

		const layout = new CodeCellLayout(
			true,
			notebookEditor as unknown as IActiveNotebookEditorDelegate,
			viewCell as CodeCellViewModel,
			template as CodeCellRenderTemplate,
			{ debug: () => { } },
			{ width: 600, height: INITIAL_EDITOR_HEIGHT }
		);

		// Initial layout
		layout.layoutEditor('init');

		// Simulate pasting content - content grows to 679px
		contentHeight = PASTED_CONTENT_HEIGHT;
		layoutInfo.editorHeight = PASTED_CONTENT_HEIGHT;
		layout.layoutEditor('onDidContentSizeChange');

		// Now scroll and Monaco reports transient smaller height (39px)
		// The fix should use the established 679px, not the transient 39px or initial 37px
		contentHeight = 39;
		notebookEditor.scrollTop = 200;
		layout.layoutEditor('nbDidScroll');

		const finalHeight = stubEditor.layoutCalls.at(-1)?.height;

		// Verify the layout doesn't use the transient 39px value from Monaco
		assert.notStrictEqual(
			finalHeight,
			39,
			'Should not use Monaco\'s transient value (39px)'
		);

		// Verify the layout doesn't shrink back to the initial 37px value
		assert.notStrictEqual(
			finalHeight,
			37,
			'Should not use initial content height (37px)'
		);

		// The layout should be based on the established 679px content height
		// The exact height will be calculated based on viewport, scroll position, etc.
		// but should be significantly larger than 39px or 37px
		assert.ok(
			finalHeight && finalHeight > 100,
			`Layout height (${finalHeight}px) should be calculated from established 679px content, not transient 39px or initial 37px`
		);
	});

	test('CodeCellLayout does not programmatically scroll editor while pointer down', () => {
		const LINE_HEIGHT = 21;
		const CELL_TOP_MARGIN = 6;
		const CELL_OUTLINE_WIDTH = 1;
		const STATUSBAR_HEIGHT = 22;
		const VIEWPORT_HEIGHT = 220;
		const ELEMENT_TOP = 100;
		const EDITOR_CONTENT_HEIGHT = 500;
		const EDITOR_HEIGHT = EDITOR_CONTENT_HEIGHT;
		const OUTPUT_CONTAINER_OFFSET = 600;
		const ELEMENT_HEIGHT = 900;
		const scrollTop = ELEMENT_TOP + CELL_TOP_MARGIN + 20;
		const scrollBottom = scrollTop + VIEWPORT_HEIGHT;

		const stubEditor = {
			_lastScrollTopSet: -1,
			getLayoutInfo: () => ({ width: 600, height: EDITOR_HEIGHT }),
			getContentHeight: () => EDITOR_CONTENT_HEIGHT,
			layout: () => {
				/* no-op */
			},
			setScrollTop: (v: number) => {
				stubEditor._lastScrollTopSet = v;
			},
			hasModel: () => true,
		};
		const editorPart = { style: { top: '' } };
		const template: Partial<CodeCellRenderTemplate> = {
			editor: stubEditor as unknown as ICodeEditor,
			editorPart: editorPart as unknown as HTMLElement,
		};
		const viewCell: Partial<CodeCellViewModel> = {
			isInputCollapsed: false,
			layoutInfo: {
				statusBarHeight: STATUSBAR_HEIGHT,
				topMargin: CELL_TOP_MARGIN,
				outlineWidth: CELL_OUTLINE_WIDTH,
				editorHeight: EDITOR_HEIGHT,
				outputContainerOffset: OUTPUT_CONTAINER_OFFSET,
			} as unknown as CodeCellLayoutInfo,
		};
		const notebookEditor = {
			scrollTop,
			get scrollBottom() {
				return scrollBottom;
			},
			setScrollTop: (v: number) => {
				/* no-op */
			},
			getLayoutInfo: () => ({
				fontInfo: { lineHeight: LINE_HEIGHT },
				height: VIEWPORT_HEIGHT,
				stickyHeight: 0,
			}),
			getAbsoluteTopOfElement: () => ELEMENT_TOP,
			getAbsoluteBottomOfElement: () => ELEMENT_TOP + OUTPUT_CONTAINER_OFFSET,
			getHeightOfElement: () => ELEMENT_HEIGHT,
			notebookOptions: {
				getLayoutConfiguration: () => ({ editorTopPadding: 6 }),
			},
		};

		const layout = new CodeCellLayout(
			true,
			notebookEditor as unknown as IActiveNotebookEditorDelegate,
			viewCell as CodeCellViewModel,
			template as CodeCellRenderTemplate,
			{ debug: () => { } },
			{ width: 600, height: EDITOR_HEIGHT }
		);

		layout.layoutEditor('init');
		stubEditor._lastScrollTopSet = -1;

		layout.setPointerDown(true);
		layout.layoutEditor('nbDidScroll');
		assert.strictEqual(layout.editorVisibility, 'Full (Small Viewport)');
		assert.strictEqual(
			stubEditor._lastScrollTopSet,
			-1,
			'Expected no programmatic editor.setScrollTop while pointer is down'
		);

		layout.setPointerDown(false);
		layout.layoutEditor('nbDidScroll');
		assert.strictEqual(layout.editorVisibility, 'Full (Small Viewport)');
		assert.notStrictEqual(
			stubEditor._lastScrollTopSet,
			-1,
			'Expected editor.setScrollTop to resume once pointer is released'
		);
	});
});
