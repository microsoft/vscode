/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CodeCellLayout } from '../../../browser/view/cellParts/codeCell.js';
suite('CellPart', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('CodeCellLayout editor visibility states', () => {
        /**
         * We construct a very small mock around the parts that `CodeCellLayout` touches. The goal
         * is to validate the branching logic that sets `_editorVisibility` without mutating any
         * production code. Each scenario sets up geometry & scroll values then invokes
         * `layoutEditor()` and asserts the resulting visibility classification.
         */
        const DEFAULT_ELEMENT_TOP = 100; // absolute top of the cell in notebook coordinates
        const DEFAULT_ELEMENT_HEIGHT = 900; // arbitrary, large enough not to constrain
        const STATUSBAR = 22;
        const TOP_MARGIN = 6; // mirrors layoutInfo.topMargin usage
        const OUTLINE = 1;
        const scenarios = [
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
            const editorScrollState = { scrollTop: 0 };
            const stubEditor = {
                layoutCalls: [],
                _lastScrollTopSet: -1,
                getLayoutInfo: () => ({ width: 600, height: s.editorHeight }),
                getContentHeight: () => s.editorContentHeight,
                layout: (dim) => {
                    stubEditor.layoutCalls.push(dim);
                },
                setScrollTop: (v) => {
                    editorScrollState.scrollTop = v;
                    stubEditor._lastScrollTopSet = v;
                },
                hasModel: () => true,
            };
            const editorPart = { style: { top: '' } };
            const template = {
                editor: stubEditor,
                editorPart: editorPart,
            };
            // viewCell stub with only needed pieces
            const viewCell = {
                isInputCollapsed: false,
                layoutInfo: {
                    // values referenced in layout logic
                    statusBarHeight: STATUSBAR,
                    topMargin: TOP_MARGIN,
                    outlineWidth: OUTLINE,
                    editorHeight: s.editorHeight,
                    outputContainerOffset: s.outputContainerOffset,
                },
            };
            // notebook editor stub
            let scrollBottom = s.scrollTop + s.viewportHeight;
            const notebookEditor = {
                scrollTop: s.scrollTop,
                get scrollBottom() {
                    return scrollBottom;
                },
                setScrollTop: (v) => {
                    notebookEditor.scrollTop = v;
                    scrollBottom = v + s.viewportHeight;
                },
                getLayoutInfo: () => ({
                    fontInfo: { lineHeight: 21 },
                    height: s.viewportHeight,
                    stickyHeight: 0,
                }),
                getAbsoluteTopOfElement: () => s.elementTop,
                getAbsoluteBottomOfElement: () => s.elementTop + s.outputContainerOffset,
                getHeightOfElement: () => s.elementHeight,
                notebookOptions: {
                    getLayoutConfiguration: () => ({ editorTopPadding: 6 }),
                },
            };
            const layout = new CodeCellLayout(
            /* enabled */ true, notebookEditor, viewCell, template, {
                debug: () => {
                    /* no-op */
                },
            }, { width: 600, height: s.editorHeight });
            layout.layoutEditor('init');
            assert.strictEqual(layout.editorVisibility, s.expected, `Scenario '${s.name}' (scrollTop=${s.scrollTop}) expected visibility ${s.expected} but got ${layout.editorVisibility}`);
            const actualTop = parseInt((editorPart.style.top || '0').replace(/px$/, '')); // style.top always like 'NNNpx'
            assert.strictEqual(actualTop, s.expectedTop, `Scenario '${s.name}' (scrollTop=${s.scrollTop}) expected top ${s.expectedTop}px but got ${editorPart.style.top}`);
            assert.strictEqual(stubEditor._lastScrollTopSet, s.expectedEditorScrollTop, `Scenario '${s.name}' (scrollTop=${s.scrollTop}) expected editor.setScrollTop(${s.expectedEditorScrollTop}) but got ${stubEditor._lastScrollTopSet}`);
            // Basic sanity: style.top should always be set when visible states other than Full (handled) or Invisible.
            if (s.expected !== 'Invisible') {
                assert.notStrictEqual(editorPart.style.top, '', `Scenario '${s.name}' should set a top style value`);
            }
            else {
                // Invisible still sets a top; just ensure layout ran
                assert.ok(editorPart.style.top !== undefined, 'Invisible scenario still performs a layout');
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
        function clamp(v, min, max) {
            return Math.min(Math.max(v, min), max);
        }
        function computeExpected(scrollTop) {
            const scrollBottom = scrollTop + VIEWPORT_HEIGHT;
            const viewportHeight = VIEWPORT_HEIGHT;
            const editorBottom = ELEMENT_TOP + OUTPUT_CONTAINER_OFFSET;
            let top = Math.max(0, scrollTop - ELEMENT_TOP - CELL_TOP_MARGIN - CELL_OUTLINE_WIDTH);
            const possibleEditorHeight = EDITOR_HEIGHT - top;
            if (possibleEditorHeight < LINE_HEIGHT) {
                top = top - (LINE_HEIGHT - possibleEditorHeight) - CELL_OUTLINE_WIDTH;
            }
            let height = EDITOR_CONTENT_HEIGHT;
            let visibility = 'Full';
            let editorScrollTop = 0;
            if (scrollTop <= ELEMENT_TOP + CELL_TOP_MARGIN) {
                const minimumEditorHeight = LINE_HEIGHT + 6; // editorTopPadding from configuration stub (6)
                if (scrollBottom >= editorBottom) {
                    height = clamp(EDITOR_CONTENT_HEIGHT, minimumEditorHeight, EDITOR_CONTENT_HEIGHT);
                    visibility = 'Full';
                }
                else {
                    height =
                        clamp(scrollBottom - (ELEMENT_TOP + CELL_TOP_MARGIN) - STATUSBAR_HEIGHT, minimumEditorHeight, EDITOR_CONTENT_HEIGHT) +
                            2 * CELL_OUTLINE_WIDTH;
                    visibility = 'Bottom Clipped';
                    editorScrollTop = 0;
                }
            }
            else {
                if (viewportHeight <= EDITOR_CONTENT_HEIGHT &&
                    scrollBottom <= editorBottom) {
                    const minimumEditorHeight = LINE_HEIGHT + 6; // editorTopPadding
                    height =
                        clamp(viewportHeight - STATUSBAR_HEIGHT, minimumEditorHeight, EDITOR_CONTENT_HEIGHT - STATUSBAR_HEIGHT) +
                            2 * CELL_OUTLINE_WIDTH;
                    visibility = 'Full (Small Viewport)';
                    editorScrollTop = top;
                }
                else {
                    const minimumEditorHeight = LINE_HEIGHT;
                    height = clamp(EDITOR_CONTENT_HEIGHT -
                        (scrollTop - (ELEMENT_TOP + CELL_TOP_MARGIN)), minimumEditorHeight, EDITOR_CONTENT_HEIGHT);
                    if (scrollTop > editorBottom) {
                        visibility = 'Invisible';
                    }
                    else {
                        visibility = 'Top Clipped';
                    }
                    editorScrollTop = EDITOR_CONTENT_HEIGHT - height;
                }
            }
            return { top, visibility, editorScrollTop };
        }
        // Shared stubs (we'll mutate scrollTop each iteration) – we re-create layout each iteration to reset internal state changes
        for (let scrollTop = 0; scrollTop <= VIEWPORT_HEIGHT + OUTPUT_CONTAINER_OFFSET + 20; scrollTop++) {
            const expected = computeExpected(scrollTop);
            const scrollBottom = scrollTop + VIEWPORT_HEIGHT;
            const stubEditor = {
                _lastScrollTopSet: -1,
                getLayoutInfo: () => ({ width: 600, height: EDITOR_HEIGHT }),
                getContentHeight: () => EDITOR_CONTENT_HEIGHT,
                layout: () => {
                    /* no-op */
                },
                setScrollTop: (v) => {
                    stubEditor._lastScrollTopSet = v;
                },
                hasModel: () => true,
            };
            const editorPart = { style: { top: '' } };
            const template = {
                editor: stubEditor,
                editorPart: editorPart,
            };
            const viewCell = {
                isInputCollapsed: false,
                layoutInfo: {
                    statusBarHeight: STATUSBAR_HEIGHT,
                    topMargin: CELL_TOP_MARGIN,
                    outlineWidth: CELL_OUTLINE_WIDTH,
                    editorHeight: EDITOR_HEIGHT,
                    outputContainerOffset: OUTPUT_CONTAINER_OFFSET,
                },
            };
            const notebookEditor = {
                scrollTop,
                get scrollBottom() {
                    return scrollBottom;
                },
                setScrollTop: (v) => {
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
            const layout = new CodeCellLayout(true, notebookEditor, viewCell, template, { debug: () => { } }, { width: 600, height: EDITOR_HEIGHT });
            layout.layoutEditor('nbDidScroll');
            const actualTop = parseInt((editorPart.style.top || '0').replace(/px$/, ''));
            assert.strictEqual(actualTop, expected.top, `scrollTop=${scrollTop}: expected top ${expected.top}, got ${actualTop}`);
            assert.strictEqual(layout.editorVisibility, expected.visibility, `scrollTop=${scrollTop}: expected visibility ${expected.visibility}, got ${layout.editorVisibility}`);
            assert.strictEqual(stubEditor._lastScrollTopSet, expected.editorScrollTop, `scrollTop=${scrollTop}: expected editorScrollTop ${expected.editorScrollTop}, got ${stubEditor._lastScrollTopSet}`);
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
            layoutCalls: [],
            _lastScrollTopSet: -1,
            getLayoutInfo: () => ({ width: 600, height: EDITOR_HEIGHT }),
            getContentHeight: () => contentHeight,
            layout: (dim) => {
                stubEditor.layoutCalls.push(dim);
            },
            setScrollTop: (v) => {
                stubEditor._lastScrollTopSet = v;
            },
            hasModel: () => true,
        };
        const editorPart = { style: { top: '' } };
        const template = {
            editor: stubEditor,
            editorPart: editorPart,
        };
        const viewCell = {
            isInputCollapsed: false,
            layoutInfo: {
                statusBarHeight: STATUSBAR_HEIGHT,
                topMargin: CELL_TOP_MARGIN,
                outlineWidth: CELL_OUTLINE_WIDTH,
                editorHeight: EDITOR_HEIGHT,
                outputContainerOffset: OUTPUT_CONTAINER_OFFSET,
                editorWidth: 600,
            },
        };
        const notebookEditor = {
            scrollTop: 0,
            get scrollBottom() {
                return VIEWPORT_HEIGHT;
            },
            setScrollTop: (v) => {
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
        const layout = new CodeCellLayout(true, notebookEditor, viewCell, template, { debug: () => { } }, { width: 600, height: EDITOR_HEIGHT });
        layout.layoutEditor('init');
        assert.strictEqual(layout.editorVisibility, 'Full');
        assert.strictEqual(stubEditor.layoutCalls.at(-1)?.height, 800);
        // Simulate Monaco reporting a transient smaller content height on scroll.
        contentHeight = 200;
        layout.layoutEditor('nbDidScroll');
        assert.strictEqual(layout.editorVisibility, 'Full');
        assert.strictEqual(stubEditor.layoutCalls.at(-1)?.height, 800, 'nbDidScroll should reuse the established content height');
        layout.layoutEditor('onDidContentSizeChange');
        assert.strictEqual(layout.editorVisibility, 'Full');
        assert.strictEqual(stubEditor.layoutCalls.at(-1)?.height, 200, 'onDidContentSizeChange should refresh the content height');
    });
    test('CodeCellLayout refreshes content height on viewCellLayoutChange', () => {
        const LINE_HEIGHT = 21;
        const CELL_TOP_MARGIN = 6;
        const CELL_OUTLINE_WIDTH = 1;
        const STATUSBAR_HEIGHT = 22;
        const VIEWPORT_HEIGHT = 1000;
        const ELEMENT_TOP = 100;
        const ELEMENT_HEIGHT = 1200;
        const INITIAL_CONTENT_HEIGHT = 37;
        const OUTPUT_CONTAINER_OFFSET = 300;
        const UPDATED_CONTENT_HEIGHT = 200;
        let contentHeight = INITIAL_CONTENT_HEIGHT;
        const stubEditor = {
            layoutCalls: [],
            _lastScrollTopSet: -1,
            getLayoutInfo: () => ({ width: 600, height: INITIAL_CONTENT_HEIGHT }),
            getContentHeight: () => contentHeight,
            layout: (dim) => {
                stubEditor.layoutCalls.push(dim);
            },
            setScrollTop: (v) => {
                stubEditor._lastScrollTopSet = v;
            },
            hasModel: () => true,
        };
        const editorPart = { style: { top: '' } };
        const template = {
            editor: stubEditor,
            editorPart: editorPart,
        };
        const viewCell = {
            isInputCollapsed: false,
            layoutInfo: {
                statusBarHeight: STATUSBAR_HEIGHT,
                topMargin: CELL_TOP_MARGIN,
                outlineWidth: CELL_OUTLINE_WIDTH,
                editorHeight: INITIAL_CONTENT_HEIGHT,
                outputContainerOffset: OUTPUT_CONTAINER_OFFSET,
                editorWidth: 600,
            },
        };
        const notebookEditor = {
            scrollTop: 0,
            get scrollBottom() {
                return VIEWPORT_HEIGHT;
            },
            setScrollTop: (v) => {
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
        const layout = new CodeCellLayout(true, notebookEditor, viewCell, template, { debug: () => { } }, { width: 600, height: INITIAL_CONTENT_HEIGHT });
        layout.layoutEditor('init');
        assert.strictEqual(stubEditor.layoutCalls.at(-1)?.height, INITIAL_CONTENT_HEIGHT);
        // Simulate wrapping-driven height increase after width/layout settles.
        contentHeight = UPDATED_CONTENT_HEIGHT;
        layout.layoutEditor('viewCellLayoutChange');
        assert.strictEqual(stubEditor.layoutCalls.at(-1)?.height, UPDATED_CONTENT_HEIGHT, 'viewCellLayoutChange should refresh the content height');
        // Ensure subsequent scrolls still reuse the established (larger) height.
        contentHeight = 50;
        layout.layoutEditor('nbDidScroll');
        assert.strictEqual(stubEditor.layoutCalls.at(-1)?.height, UPDATED_CONTENT_HEIGHT, 'nbDidScroll should reuse the refreshed content height');
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
            layoutCalls: [],
            _lastScrollTopSet: -1,
            getLayoutInfo: () => ({ width: 600, height: INITIAL_EDITOR_HEIGHT }),
            getContentHeight: () => contentHeight,
            layout: (dim) => {
                stubEditor.layoutCalls.push(dim);
            },
            setScrollTop: (v) => {
                stubEditor._lastScrollTopSet = v;
            },
            hasModel: () => true,
        };
        const editorPart = { style: { top: '' } };
        const template = {
            editor: stubEditor,
            editorPart: editorPart,
        };
        const layoutInfo = {
            statusBarHeight: STATUSBAR_HEIGHT,
            topMargin: CELL_TOP_MARGIN,
            outlineWidth: CELL_OUTLINE_WIDTH,
            editorHeight: INITIAL_EDITOR_HEIGHT,
            outputContainerOffset: OUTPUT_CONTAINER_OFFSET,
            editorWidth: 600,
        };
        const viewCell = {
            isInputCollapsed: false,
            layoutInfo: layoutInfo,
        };
        const notebookEditor = {
            scrollTop: 0,
            get scrollBottom() {
                return notebookEditor.scrollTop + VIEWPORT_HEIGHT;
            },
            setScrollTop: (v) => {
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
        const layout = new CodeCellLayout(true, notebookEditor, viewCell, template, { debug: () => { } }, { width: 600, height: INITIAL_EDITOR_HEIGHT });
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
        assert.notStrictEqual(finalHeight, 39, 'Should not use Monaco\'s transient value (39px)');
        // Verify the layout doesn't shrink back to the initial 37px value
        assert.notStrictEqual(finalHeight, 37, 'Should not use initial content height (37px)');
        // The layout should be based on the established 679px content height
        // The exact height will be calculated based on viewport, scroll position, etc.
        // but should be significantly larger than 39px or 37px
        assert.ok(finalHeight && finalHeight > 100, `Layout height (${finalHeight}px) should be calculated from established 679px content, not transient 39px or initial 37px`);
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
            setScrollTop: (v) => {
                stubEditor._lastScrollTopSet = v;
            },
            hasModel: () => true,
        };
        const editorPart = { style: { top: '' } };
        const template = {
            editor: stubEditor,
            editorPart: editorPart,
        };
        const viewCell = {
            isInputCollapsed: false,
            layoutInfo: {
                statusBarHeight: STATUSBAR_HEIGHT,
                topMargin: CELL_TOP_MARGIN,
                outlineWidth: CELL_OUTLINE_WIDTH,
                editorHeight: EDITOR_HEIGHT,
                outputContainerOffset: OUTPUT_CONTAINER_OFFSET,
            },
        };
        const notebookEditor = {
            scrollTop,
            get scrollBottom() {
                return scrollBottom;
            },
            setScrollTop: (v) => {
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
        const layout = new CodeCellLayout(true, notebookEditor, viewCell, template, { debug: () => { } }, { width: 600, height: EDITOR_HEIGHT });
        layout.layoutEditor('init');
        stubEditor._lastScrollTopSet = -1;
        layout.setPointerDown(true);
        layout.layoutEditor('nbDidScroll');
        assert.strictEqual(layout.editorVisibility, 'Full (Small Viewport)');
        assert.strictEqual(stubEditor._lastScrollTopSet, -1, 'Expected no programmatic editor.setScrollTop while pointer is down');
        layout.setPointerDown(false);
        layout.layoutEditor('nbDidScroll');
        assert.strictEqual(layout.editorVisibility, 'Full (Small Viewport)');
        assert.notStrictEqual(stubEditor._lastScrollTopSet, -1, 'Expected editor.setScrollTop to resume once pointer is released');
    });
    test('CodeCellLayout init ignores stale pooled editor content height', () => {
        /**
         * Regression guard for fast-scroll overlap when editors are pooled.
         *
         * A Monaco editor instance can be reused between cells. If we trusted the pooled
         * editor's `getContentHeight()` during the first layout of a new cell, a short
         * cell might inherit a previous tall cell's content height and render with an
         * oversized editor, visually overlapping the next cell. The layout should instead
         * seed its initial content height from the cell's own initial editor dimension.
         */
        const LINE_HEIGHT = 21;
        const CELL_TOP_MARGIN = 6;
        const CELL_OUTLINE_WIDTH = 1;
        const STATUSBAR_HEIGHT = 22;
        const VIEWPORT_HEIGHT = 400;
        const ELEMENT_TOP = 100;
        const ELEMENT_HEIGHT = 500;
        const OUTPUT_CONTAINER_OFFSET = 200;
        let pooledContentHeight = 200; // tall previous cell
        const pooledEditor = {
            layoutCalls: [],
            _lastScrollTopSet: -1,
            getLayoutInfo: () => ({ width: 600, height: pooledContentHeight }),
            getContentHeight: () => pooledContentHeight,
            layout: (dim) => {
                pooledEditor.layoutCalls.push(dim);
            },
            setScrollTop: (v) => {
                pooledEditor._lastScrollTopSet = v;
            },
            hasModel: () => true,
        };
        const editorPart = { style: { top: '' } };
        const template = {
            editor: pooledEditor,
            editorPart: editorPart,
        };
        // First, layout a tall cell to establish a large content height on the pooled editor.
        const tallViewCell = {
            isInputCollapsed: false,
            layoutInfo: {
                statusBarHeight: STATUSBAR_HEIGHT,
                topMargin: CELL_TOP_MARGIN,
                outlineWidth: CELL_OUTLINE_WIDTH,
                editorHeight: 200,
                outputContainerOffset: OUTPUT_CONTAINER_OFFSET,
                editorWidth: 600,
            },
        };
        const tallNotebookEditor = {
            scrollTop: 0,
            get scrollBottom() {
                return VIEWPORT_HEIGHT;
            },
            setScrollTop: (_v) => {
                /* no-op for this test */
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
        const tallLayout = new CodeCellLayout(true, tallNotebookEditor, tallViewCell, template, { debug: () => { } }, { width: 600, height: 200 });
        tallLayout.layoutEditor('init');
        assert.strictEqual(pooledEditor.layoutCalls.at(-1)?.height, 200, 'Expected tall cell to lay out using its own height');
        // Now reuse the same editor for a short cell while leaving the pooled content height large.
        pooledContentHeight = 200; // simulate stale value from previous cell
        const shortViewCell = {
            isInputCollapsed: false,
            layoutInfo: {
                statusBarHeight: STATUSBAR_HEIGHT,
                topMargin: CELL_TOP_MARGIN,
                outlineWidth: CELL_OUTLINE_WIDTH,
                editorHeight: 37,
                outputContainerOffset: OUTPUT_CONTAINER_OFFSET,
                editorWidth: 600,
            },
        };
        const shortNotebookEditor = {
            scrollTop: 0,
            get scrollBottom() {
                return VIEWPORT_HEIGHT;
            },
            setScrollTop: (_v) => {
                /* no-op for this test */
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
        const shortLayout = new CodeCellLayout(true, shortNotebookEditor, shortViewCell, template, { debug: () => { } }, { width: 600, height: 37 });
        shortLayout.layoutEditor('init');
        assert.strictEqual(pooledEditor.layoutCalls.at(-1)?.height, 37, 'Init layout for a short cell should use the cell\'s initial height, not the pooled editor\'s stale content height');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2VsbFBhcnQudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL3Rlc3QvYnJvd3Nlci92aWV3L2NlbGxQYXJ0LnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBR3RHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUk3RSxLQUFLLENBQUMsVUFBVSxFQUFFLEdBQUcsRUFBRTtJQUN0Qix1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLElBQUksQ0FBQyx5Q0FBeUMsRUFBRSxHQUFHLEVBQUU7UUFDcEQ7Ozs7O1dBS0c7UUFpQkgsTUFBTSxtQkFBbUIsR0FBRyxHQUFHLENBQUMsQ0FBQyxtREFBbUQ7UUFDcEYsTUFBTSxzQkFBc0IsR0FBRyxHQUFHLENBQUMsQ0FBQywyQ0FBMkM7UUFDL0UsTUFBTSxTQUFTLEdBQUcsRUFBRSxDQUFDO1FBQ3JCLE1BQU0sVUFBVSxHQUFHLENBQUMsQ0FBQyxDQUFDLHFDQUFxQztRQUMzRCxNQUFNLE9BQU8sR0FBRyxDQUFDLENBQUM7UUFFbEIsTUFBTSxTQUFTLEdBQW1CO1lBQ2pDO2dCQUNDLElBQUksRUFBRSxNQUFNO2dCQUNaLFNBQVMsRUFBRSxDQUFDO2dCQUNaLGNBQWMsRUFBRSxHQUFHO2dCQUNuQixtQkFBbUIsRUFBRSxHQUFHO2dCQUN4QixZQUFZLEVBQUUsR0FBRztnQkFDakIscUJBQXFCLEVBQUUsR0FBRyxFQUFFLDJFQUEyRTtnQkFDdkcsUUFBUSxFQUFFLE1BQU07Z0JBQ2hCLFVBQVUsRUFBRSxtQkFBbUI7Z0JBQy9CLGFBQWEsRUFBRSxzQkFBc0I7Z0JBQ3JDLFdBQVcsRUFBRSxDQUFD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