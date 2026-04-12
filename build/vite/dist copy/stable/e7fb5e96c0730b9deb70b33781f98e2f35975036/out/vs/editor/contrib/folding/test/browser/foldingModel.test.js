/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { escapeRegExpCharacters } from '../../../../../base/common/strings.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditOperation } from '../../../../common/core/editOperation.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { Selection } from '../../../../common/core/selection.js';
import { ModelDecorationOptions } from '../../../../common/model/textModel.js';
import { toSelectedLines } from '../../browser/folding.js';
import { FoldingModel, getNextFoldLine, getParentFoldLine, getPreviousFoldLine, setCollapseStateAtLevel, setCollapseStateForMatchingLines, setCollapseStateForRest, setCollapseStateLevelsDown, setCollapseStateLevelsUp, setCollapseStateUp } from '../../browser/foldingModel.js';
import { computeRanges } from '../../browser/indentRangeProvider.js';
import { createTextModel } from '../../../../test/common/testTextModel.js';
export class TestDecorationProvider {
    static { this.collapsedDecoration = ModelDecorationOptions.register({
        description: 'test',
        stickiness: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */,
        linesDecorationsClassName: 'folding'
    }); }
    static { this.expandedDecoration = ModelDecorationOptions.register({
        description: 'test',
        stickiness: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */,
        linesDecorationsClassName: 'folding'
    }); }
    static { this.hiddenDecoration = ModelDecorationOptions.register({
        description: 'test',
        stickiness: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */,
        linesDecorationsClassName: 'folding'
    }); }
    constructor(model) {
        this.model = model;
    }
    getDecorationOption(isCollapsed, isHidden) {
        if (isHidden) {
            return TestDecorationProvider.hiddenDecoration;
        }
        if (isCollapsed) {
            return TestDecorationProvider.collapsedDecoration;
        }
        return TestDecorationProvider.expandedDecoration;
    }
    changeDecorations(callback) {
        return this.model.changeDecorations(callback);
    }
    removeDecorations(decorationIds) {
        this.model.changeDecorations((changeAccessor) => {
            changeAccessor.deltaDecorations(decorationIds, []);
        });
    }
    getDecorations() {
        const decorations = this.model.getAllDecorations();
        const res = [];
        for (const decoration of decorations) {
            if (decoration.options === TestDecorationProvider.hiddenDecoration) {
                res.push({ line: decoration.range.startLineNumber, type: 'hidden' });
            }
            else if (decoration.options === TestDecorationProvider.collapsedDecoration) {
                res.push({ line: decoration.range.startLineNumber, type: 'collapsed' });
            }
            else if (decoration.options === TestDecorationProvider.expandedDecoration) {
                res.push({ line: decoration.range.startLineNumber, type: 'expanded' });
            }
        }
        return res;
    }
}
suite('Folding Model', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function r(startLineNumber, endLineNumber, isCollapsed = false) {
        return { startLineNumber, endLineNumber, isCollapsed };
    }
    function d(line, type) {
        return { line, type };
    }
    function assertRegion(actual, expected, message) {
        assert.strictEqual(!!actual, !!expected, message);
        if (actual && expected) {
            assert.strictEqual(actual.startLineNumber, expected.startLineNumber, message);
            assert.strictEqual(actual.endLineNumber, expected.endLineNumber, message);
            assert.strictEqual(actual.isCollapsed, expected.isCollapsed, message);
        }
    }
    function assertFoldedRanges(foldingModel, expectedRegions, message) {
        const actualRanges = [];
        const actual = foldingModel.regions;
        for (let i = 0; i < actual.length; i++) {
            if (actual.isCollapsed(i)) {
                actualRanges.push(r(actual.getStartLineNumber(i), actual.getEndLineNumber(i)));
            }
        }
        assert.deepStrictEqual(actualRanges, expectedRegions, message);
    }
    function assertRanges(foldingModel, expectedRegions, message) {
        const actualRanges = [];
        const actual = foldingModel.regions;
        for (let i = 0; i < actual.length; i++) {
            actualRanges.push(r(actual.getStartLineNumber(i), actual.getEndLineNumber(i), actual.isCollapsed(i)));
        }
        assert.deepStrictEqual(actualRanges, expectedRegions, message);
    }
    function assertDecorations(foldingModel, expectedDecoration, message) {
        const decorationProvider = foldingModel.decorationProvider;
        assert.deepStrictEqual(decorationProvider.getDecorations(), expectedDecoration, message);
    }
    function assertRegions(actual, expectedRegions, message) {
        assert.deepStrictEqual(actual.map(r => ({ startLineNumber: r.startLineNumber, endLineNumber: r.endLineNumber, isCollapsed: r.isCollapsed })), expectedRegions, message);
    }
    test('getRegionAtLine', () => {
        const lines = [
            /* 1*/ '/**',
            /* 2*/ ' * Comment',
            /* 3*/ ' */',
            /* 4*/ 'class A {',
            /* 5*/ '  void foo() {',
            /* 6*/ '    // comment {',
            /* 7*/ '  }',
            /* 8*/ '}'
        ];
        const textModel = createTextModel(lines.join('\n'));
        try {
            const foldingModel = new FoldingModel(textModel, new TestDecorationProvider(textModel));
            const ranges = computeRanges(textModel, false, undefined);
            foldingModel.update(ranges);
            const r1 = r(1, 3, false);
            const r2 = r(4, 7, false);
            const r3 = r(5, 6, false);
            assertRanges(foldingModel, [r1, r2, r3]);
            assertRegion(foldingModel.getRegionAtLine(1), r1, '1');
            assertRegion(foldingModel.getRegionAtLine(2), r1, '2');
            assertRegion(foldingModel.getRegionAtLine(3), r1, '3');
            assertRegion(foldingModel.getRegionAtLine(4), r2, '4');
            assertRegion(foldingModel.getRegionAtLine(5), r3, '5');
            assertRegion(foldingModel.getRegionAtLine(6), r3, '5');
            assertRegion(foldingModel.getRegionAtLine(7), r2, '6');
            assertRegion(foldingModel.getRegionAtLine(8), null, '7');
        }
        finally {
            textModel.dispose();
        }
    });
    test('collapse', () => {
        const lines = [
            /* 1*/ '/**',
            /* 2*/ ' * Comment',
            /* 3*/ ' */',
            /* 4*/ 'class A {',
            /* 5*/ '  void foo() {',
            /* 6*/ '    // comment {',
            /* 7*/ '  }',
            /* 8*/ '}'
        ];
        const textModel = createTextModel(lines.join('\n'));
        try {
            const foldingModel = new FoldingModel(textModel, new TestDecorationProvider(textModel));
            const ranges = computeRanges(textModel, false, undefined);
            foldingModel.update(ranges);
            const r1 = r(1, 3, false);
            const r2 = r(4, 7, false);
            const r3 = r(5, 6, false);
            assertRanges(foldingModel, [r1, r2, r3]);
            foldingModel.toggleCollapseState([foldingModel.getRegionAtLine(1)]);
            foldingModel.update(ranges);
            assertRanges(foldingModel, [r(1, 3, true), r2, r3]);
            foldingModel.toggleCollapseState([foldingModel.getRegionAtLine(5)]);
            foldingModel.update(ranges);
            assertRanges(foldingModel, [r(1, 3, true), r2, r(5, 6, true)]);
            foldingModel.toggleCollapseState([foldingModel.getRegionAtLine(7)]);
            foldingModel.update(ranges);
            assertRanges(foldingModel, [r(1, 3, true), r(4, 7, true), r(5, 6, true)]);
            textModel.dispose();
        }
        finally {
            textModel.dispose();
        }
    });
    test('update', () => {
        const lines = [
            /* 1*/ '/**',
            /* 2*/ ' * Comment',
            /* 3*/ ' */',
            /* 4*/ 'class A {',
            /* 5*/ '  void foo() {',
            /* 6*/ '    // comment {',
            /* 7*/ '  }',
            /* 8*/ '}'
        ];
        const textModel = createTextModel(lines.join('\n'));
        try {
            const foldingModel = new FoldingModel(textModel, new TestDecorationProvider(textModel));
            const ranges = computeRanges(textModel, false, undefined);
            foldingModel.update(ranges);
            const r1 = r(1, 3, false);
            const r2 = r(4, 7, false);
            const r3 = r(5, 6, false);
            assertRanges(foldingModel, [r1, r2, r3]);
            foldingModel.toggleCollapseState([foldingModel.getRegionAtLine(2), foldingModel.getRegionAtLine(5)]);
            textModel.applyEdits([EditOperation.insert(new Position(4, 1), '//hello\n')]);
            foldingModel.update(computeRanges(textModel, false, undefined));
            assertRanges(foldingModel, [r(1, 3, true), r(5, 8, false), r(6, 7, true)]);
        }
        finally {
            textModel.dispose();
        }
    });
    test('delete', () => {
        const lines = [
            /* 1*/ 'function foo() {',
            /* 2*/ '  switch (x) {',
            /* 3*/ '    case 1:',
            /* 4*/ '      //hello1',
            /* 5*/ '      break;',
            /* 6*/ '    case 2:',
            /* 7*/ '      //hello2',
            /* 8*/ '      break;',
            /* 9*/ '    case 3:',
            /* 10*/ '      //hello3',
            /* 11*/ '      break;',
            /* 12*/ '  }',
            /* 13*/ '}'
        ];
        const textModel = createTextModel(lines.join('\n'));
        try {
            const foldingModel = new FoldingModel(textModel, new TestDecorationProvider(textModel));
            const ranges = computeRanges(textModel, false, undefined);
            foldingModel.update(ranges);
            const r1 = r(1, 12, false);
            const r2 = r(2, 11, false);
            const r3 = r(3, 5, false);
            const r4 = r(6, 8, false);
            const r5 = r(9, 11, false);
            assertRanges(foldingModel, [r1, r2, r3, r4, r5]);
            foldingModel.toggleCollapseState([foldingModel.getRegionAtLine(6)]);
            textModel.applyEdits([EditOperation.delete(new Range(6, 11, 9, 0))]);
            foldingModel.update(computeRanges(textModel, true, undefined), toSelectedLines([new Selection(7, 1, 7, 1)]));
            assertRanges(foldingModel, [r(1, 9, false), r(2, 8, false), r(3, 5, false), r(6, 8, false)]);
        }
        finally {
            textModel.dispose();
        }
    });
    test('getRegionsInside', () => {
        const lines = [
            /* 1*/ '/**',
            /* 2*/ ' * Comment',
            /* 3*/ ' */',
            /* 4*/ 'class A {',
            /* 5*/ '  void foo() {',
            /* 6*/ '    // comment {',
            /* 7*/ '  }',
            /* 8*/ '}'
        ];
        const textModel = createTextModel(lines.join('\n'));
        try {
            const foldingModel = new FoldingModel(textModel, new TestDecorationProvider(textModel));
            const ranges = computeRanges(textModel, false, undefined);
            foldingModel.update(ranges);
            const r1 = r(1, 3, false);
            const r2 = r(4, 7, false);
            const r3 = r(5, 6, false);
            assertRanges(foldingModel, [r1, r2, r3]);
            const region1 = foldingModel.getRegionAtLine(r1.startLineNumber);
            const region2 = foldingModel.getRegionAtLine(r2.startLineNumber);
            const region3 = foldingModel.getRegionAtLine(r3.startLineNumber);
            assertRegions(foldingModel.getRegionsInside(null), [r1, r2, r3], '1');
            assertRegions(foldingModel.getRegionsInside(region1), [], '2');
            assertRegions(foldingModel.getRegionsInside(region2), [r3], '3');
            assertRegions(foldingModel.getRegionsInside(region3), [], '4');
        }
        finally {
            textModel.dispose();
        }
    });
    test('getRegionsInsideWithLevel', () => {
        const lines = [
            /* 1*/ '//#region',
            /* 2*/ '//#endregion',
            /* 3*/ 'class A {',
            /* 4*/ '  void foo() {',
            /* 5*/ '    if (true) {',
            /* 6*/ '        return;',
            /* 7*/ '    }',
            /* 8*/ '    if (true) {',
            /* 9*/ '      return;',
            /* 10*/ '    }',
            /* 11*/ '  }',
            /* 12*/ '}'
        ];
        const textModel = createTextModel(lines.join('\n'));
        try {
            const foldingModel = new FoldingModel(textModel, new TestDecorationProvider(textModel));
            const ranges = computeRanges(textModel, false, { start: /^\/\/#region$/, end: /^\/\/#endregion$/ });
            foldingModel.update(ranges);
            const r1 = r(1, 2, false);
            const r2 = r(3, 11, false);
            const r3 = r(4, 10, false);
            const r4 = r(5, 6, false);
            const r5 = r(8, 9, false);
            const region1 = foldingModel.getRegionAtLine(r1.startLineNumber);
            const region2 = foldingModel.getRegionAtLine(r2.startLineNumber);
            const region3 = foldingModel.getRegionAtLine(r3.startLineNumber);
            assertRanges(foldingModel, [r1, r2, r3, r4, r5]);
            assertRegions(foldingModel.getRegionsInside(null, (r, level) => level === 1), [r1, r2], '1');
            assertRegions(foldingModel.getRegionsInside(null, (r, level) => level === 2), [r3], '2');
            assertRegions(foldingModel.getRegionsInside(null, (r, level) => level === 3), [r4, r5], '3');
            assertRegions(foldingModel.getRegionsInside(region2, (r, level) => level === 1), [r3], '4');
            assertRegions(foldingModel.getRegionsInside(region2, (r, level) => level === 2), [r4, r5], '5');
            assertRegions(foldingModel.getRegionsInside(region3, (r, level) => level === 1), [r4, r5], '6');
            assertRegions(foldingModel.getRegionsInside(region2, (r, level) => r.hidesLine(9)), [r3, r5], '7');
            assertRegions(foldingModel.getRegionsInside(region1, (r, level) => level === 1), [], '8');
        }
        finally {
            textModel.dispose();
        }
    });
    test('getRegionAtLine2', () => {
        const lines = [
            /* 1*/ '//#region',
            /* 2*/ 'class A {',
            /* 3*/ '  void foo() {',
            /* 4*/ '    if (true) {',
            /* 5*/ '      //hello',
            /* 6*/ '    }',
            /* 7*/ '',
            /* 8*/ '  }',
            /* 9*/ '}',
            /* 10*/ '//#endregion',
            /* 11*/ ''
        ];
        const textModel = createTextModel(lines.join('\n'));
        try {
            const foldingModel = new FoldingModel(textModel, new TestDecorationProvider(textModel));
            const ranges = computeRanges(textModel, false, { start: /^\/\/#region$/, end: /^\/\/#endregion$/ });
            foldingModel.update(ranges);
            const r1 = r(1, 10, false);
            const r2 = r(2, 8, false);
            const r3 = r(3, 7, false);
            const r4 = r(4, 5, false);
            assertRanges(foldingModel, [r1, r2, r3, r4]);
            assertRegions(foldingModel.getAllRegionsAtLine(1), [r1], '1');
            assertRegions(foldingModel.getAllRegionsAtLine(2), [r1, r2].reverse(), '2');
            assertRegions(foldingModel.getAllRegionsAtLine(3), [r1, r2, r3].reverse(), '3');
            assertRegions(foldingModel.getAllRegionsAtLine(4), [r1, r2, r3, r4].reverse(), '4');
            assertRegions(foldingModel.getAllRegionsAtLine(5), [r1, r2, r3, r4].reverse(), '5');
            assertRegions(foldingModel.getAllRegionsAtLine(6), [r1, r2, r3].reverse(), '6');
            assertRegions(foldingModel.getAllRegionsAtLine(7), [r1, r2, r3].reverse(), '7');
            assertRegions(foldingModel.getAllRegionsAtLine(8), [r1, r2].reverse(), '8');
            assertRegions(foldingModel.getAllRegionsAtLine(9), [r1], '9');
            assertRegions(foldingModel.getAllRegionsAtLine(10), [r1], '10');
            assertRegions(foldingModel.getAllRegionsAtLine(11), [], '10');
        }
        finally {
            textModel.dispose();
        }
    });
    test('setCollapseStateRecursivly', () => {
        const lines = [
            /* 1*/ '//#region',
            /* 2*/ '//#endregion',
            /* 3*/ 'class A {',
            /* 4*/ '  void foo() {',
            /* 5*/ '    if (true) {',
            /* 6*/ '        return;',
            /* 7*/ '    }',
            /* 8*/ '',
            /* 9*/ '    if (true) {',
            /* 10*/ '      return;',
            /* 11*/ '    }',
            /* 12*/ '  }',
            /* 13*/ '}'
        ];
        const textModel = createTextModel(lines.join('\n'));
        try {
            const foldingModel = new FoldingModel(textModel, new TestDecorationProvider(textModel));
            const ranges = computeRanges(textModel, false, { start: /^\/\/#region$/, end: /^\/\/#endregion$/ });
            foldingModel.update(ranges);
            const r1 = r(1, 2, false);
            const r2 = r(3, 12, false);
            const r3 = r(4, 11, false);
            const r4 = r(5, 6, false);
            const r5 = r(9, 10, false);
            assertRanges(foldingModel, [r1, r2, r3, r4, r5]);
            setCollapseStateLevelsDown(foldingModel, true, Number.MAX_VALUE, [4]);
            assertFoldedRanges(foldingModel, [r3, r4, r5], '1');
            setCollapseStateLevelsDown(foldingModel, false, Number.MAX_VALUE, [8]);
            assertFoldedRanges(foldingModel, [], '2');
            setCollapseStateLevelsDown(foldingModel, true, Number.MAX_VALUE, [12]);
            assertFoldedRanges(foldingModel, [r2, r3, r4, r5], '1');
            setCollapseStateLevelsDown(foldingModel, false, Number.MAX_VALUE, [7]);
            assertFoldedRanges(foldingModel, [r2], '1');
            setCollapseStateLevelsDown(foldingModel, false);
            assertFoldedRanges(foldingModel, [], '1');
            setCollapseStateLevelsDown(foldingModel, true);
            assertFoldedRanges(foldingModel, [r1, r2, r3, r4, r5], '1');
        }
        finally {
            textModel.dispose();
        }
    });
    test('setCollapseStateAtLevel', () => {
        const lines = [
            /* 1*/ '//#region',
            /* 2*/ '//#endregion',
            /* 3*/ 'class A {',
            /* 4*/ '  void foo() {',
            /* 5*/ '    if (true) {',
            /* 6*/ '        return;',
            /* 7*/ '    }',
            /* 8*/ '',
            /* 9*/ '    if (true) {',
            /* 10*/ '      return;',
            /* 11*/ '    }',
            /* 12*/ '  }',
            /* 13*/ '  //#region',
            /* 14*/ '  const bar = 9;',
            /* 15*/ '  //#endregion',
            /* 16*/ '}'
        ];
        const textModel = createTextModel(lines.join('\n'));
        try {
            const foldingModel = new FoldingModel(textModel, new TestDecorationProvider(textModel));
            const ranges = computeRanges(textModel, false, { start: /^\s*\/\/#region$/, end: /^\s*\/\/#endregion$/ });
            foldingModel.update(ranges);
            const r1 = r(1, 2, false);
            const r2 = r(3, 15, false);
            const r3 = r(4, 11, false);
            const r4 = r(5, 6, false);
            const r5 = r(9, 10, false);
            const r6 = r(13, 15, false);
            assertRanges(foldingModel, [r1, r2, r3, r4, r5, r6]);
            setCollapseStateAtLevel(foldingModel, 1, true, []);
            assertFoldedRanges(foldingModel, [r1, r2], '1');
            setCollapseStateAtLevel(foldingModel, 1, false, [5]);
            assertFoldedRanges(foldingModel, [r2], '2');
            setCollapseStateAtLevel(foldingModel, 1, false, [1]);
            assertFoldedRanges(foldingModel, [], '3');
            setCollapseStateAtLevel(foldingModel, 2, true, []);
            assertFoldedRanges(foldingModel, [r3, r6], '4');
            setCollapseStateAtLevel(foldingModel, 2, false, [5, 6]);
            assertFoldedRanges(foldingModel, [r3], '5');
            setCollapseStateAtLevel(foldingModel, 3, true, [4, 9]);
            assertFoldedRanges(foldingModel, [r3, r4], '6');
            setCollapseStateAtLevel(foldingModel, 3, false, [4, 9]);
            assertFoldedRanges(foldingModel, [r3], '7');
        }
        finally {
            textModel.dispose();
        }
    });
    test('setCollapseStateLevelsDown', () => {
        const lines = [
            /* 1*/ '//#region',
            /* 2*/ '//#endregion',
            /* 3*/ 'class A {',
            /* 4*/ '  void foo() {',
            /* 5*/ '    if (true) {',
            /* 6*/ '        return;',
            /* 7*/ '    }',
            /* 8*/ '',
            /* 9*/ '    if (true) {',
            /* 10*/ '      return;',
            /* 11*/ '    }',
            /* 12*/ '  }',
            /* 13*/ '}'
        ];
        const textModel = createTextModel(lines.join('\n'));
        try {
            const foldingModel = new FoldingModel(textModel, new TestDecorationProvider(textModel));
            const ranges = computeRanges(textModel, false, { start: /^\/\/#region$/, end: /^\/\/#endregion$/ });
            foldingModel.update(ranges);
            const r1 = r(1, 2, false);
            const r2 = r(3, 12, false);
            const r3 = r(4, 11, false);
            const r4 = r(5, 6, false);
            const r5 = r(9, 10, false);
            assertRanges(foldingModel, [r1, r2, r3, r4, r5]);
            setCollapseStateLevelsDown(foldingModel, true, 1, [4]);
            assertFoldedRanges(foldingModel, [r3], '1');
            setCollapseStateLevelsDown(foldingModel, true, 2, [4]);
            assertFoldedRanges(foldingModel, [r3, r4, r5], '2');
            setCollapseStateLevelsDown(foldingModel, false, 2, [3]);
            assertFoldedRanges(foldingModel, [r4, r5], '3');
            setCollapseStateLevelsDown(foldingModel, false, 2, [2]);
            assertFoldedRanges(foldingModel, [r4, r5], '4');
            setCollapseStateLevelsDown(foldingModel, true, 4, [2]);
            assertFoldedRanges(foldingModel, [r1, r4, r5], '5');
            setCollapseStateLevelsDown(foldingModel, false, 4, [2, 3]);
            assertFoldedRanges(foldingModel, [], '6');
        }
        finally {
            textModel.dispose();
        }
    });
    test('setCollapseStateLevelsUp', () => {
        const lines = [
            /* 1*/ '//#region',
            /* 2*/ '//#endregion',
            /* 3*/ 'class A {',
            /* 4*/ '  void foo() {',
            /* 5*/ '    if (true) {',
            /* 6*/ '        return;',
            /* 7*/ '    }',
            /* 8*/ '',
            /* 9*/ '    if (true) {',
            /* 10*/ '      return;',
            /* 11*/ '    }',
            /* 12*/ '  }',
            /* 13*/ '}'
        ];
        const textModel = createTextModel(lines.join('\n'));
        try {
            const foldingModel = new FoldingModel(textModel, new TestDecorationProvider(textModel));
            const ranges = computeRanges(textModel, false, { start: /^\/\/#region$/, end: /^\/\/#endregion$/ });
            foldingModel.update(ranges);
            const r1 = r(1, 2, false);
            const r2 = r(3, 12, false);
            const r3 = r(4, 11, false);
            const r4 = r(5, 6, false);
            const r5 = r(9, 10, false);
            assertRanges(foldingModel, [r1, r2, r3, r4, r5]);
            setCollapseStateLevelsUp(foldingModel, true, 1, [4]);
            assertFoldedRanges(foldingModel, [r3], '1');
            setCollapseStateLevelsUp(foldingModel, true, 2, [4]);
            assertFoldedRanges(foldingModel, [r2, r3], '2');
            setCollapseStateLevelsUp(foldingModel, false, 4, [1, 3, 4]);
            assertFoldedRanges(foldingModel, [], '3');
            setCollapseStateLevelsUp(foldingModel, true, 2, [10]);
            assertFoldedRanges(foldingModel, [r3, r5], '4');
        }
        finally {
            textModel.dispose();
        }
    });
    test('setCollapseStateUp', () => {
        const lines = [
            /* 1*/ '//#region',
            /* 2*/ '//#endregion',
            /* 3*/ 'class A {',
            /* 4*/ '  void foo() {',
            /* 5*/ '    if (true) {',
            /* 6*/ '        return;',
            /* 7*/ '    }',
            /* 8*/ '',
            /* 9*/ '    if (true) {',
            /* 10*/ '      return;',
            /* 11*/ '    }',
            /* 12*/ '  }',
            /* 13*/ '}'
        ];
        const textModel = createTextModel(lines.join('\n'));
        try {
            const foldingModel = new FoldingModel(textModel, new TestDecorationProvider(textModel));
            const ranges = computeRanges(textModel, false, { start: /^\/\/#region$/, end: /^\/\/#endregion$/ });
            foldingModel.update(ranges);
            const r1 = r(1, 2, false);
            const r2 = r(3, 12, false);
            const r3 = r(4, 11, false);
            const r4 = r(5, 6, false);
            const r5 = r(9, 10, false);
            assertRanges(foldingModel, [r1, r2, r3, r4, r5]);
            setCollapseStateUp(foldingModel, true, [5]);
            assertFoldedRanges(foldingModel, [r4], '1');
            setCollapseStateUp(foldingModel, true, [5]);
            assertFoldedRanges(foldingModel, [r3, r4], '2');
            setCollapseStateUp(foldingModel, true, [4]);
            assertFoldedRanges(foldingModel, [r2, r3, r4], '2');
        }
        finally {
            textModel.dispose();
        }
    });
    test('setCollapseStateForMatchingLines', () => {
        const lines = [
            /* 1*/ '/**',
            /* 2*/ ' * the class',
            /* 3*/ ' */',
            /* 4*/ 'class A {',
            /* 5*/ '  /**',
            /* 6*/ '   * the foo',
            /* 7*/ '   */',
            /* 8*/ '  void foo() {',
            /* 9*/ '    /*',
            /* 10*/ '     * the comment',
            /* 11*/ '     */',
            /* 12*/ '  }',
            /* 13*/ '}'
        ];
        const textModel = createTextModel(lines.join('\n'));
        try {
            const foldingModel = new FoldingModel(textModel, new TestDecorationProvider(textModel));
            const ranges = computeRanges(textModel, false, { start: /^\/\/#region$/, end: /^\/\/#endregion$/ });
            foldingModel.update(ranges);
            const r1 = r(1, 3, false);
            const r2 = r(4, 12, false);
            const r3 = r(5, 7, false);
            const r4 = r(8, 11, false);
            const r5 = r(9, 11, false);
            assertRanges(foldingModel, [r1, r2, r3, r4, r5]);
            const regExp = new RegExp('^\\s*' + escapeRegExpCharacters('/*'));
            setCollapseStateForMatchingLines(foldingModel, regExp, true);
            assertFoldedRanges(foldingModel, [r1, r3, r5], '1');
        }
        finally {
            textModel.dispose();
        }
    });
    test('setCollapseStateForRest', () => {
        const lines = [
            /* 1*/ '//#region',
            /* 2*/ '//#endregion',
            /* 3*/ 'class A {',
            /* 4*/ '  void foo() {',
            /* 5*/ '    if (true) {',
            /* 6*/ '        return;',
            /* 7*/ '    }',
            /* 8*/ '',
            /* 9*/ '    if (true) {',
            /* 10*/ '      return;',
            /* 11*/ '    }',
            /* 12*/ '  }',
            /* 13*/ '}'
        ];
        const textModel = createTextModel(lines.join('\n'));
        try {
            const foldingModel = new FoldingModel(textModel, new TestDecorationProvider(textModel));
            const ranges = computeRanges(textModel, false, { start: /^\/\/#region$/, end: /^\/\/#endregion$/ });
            foldingModel.update(ranges);
            const r1 = r(1, 2, false);
            const r2 = r(3, 12, false);
            const r3 = r(4, 11, false);
            const r4 = r(5, 6, false);
            const r5 = r(9, 10, false);
            assertRanges(foldingModel, [r1, r2, r3, r4, r5]);
            setCollapseStateForRest(foldingModel, true, [5]);
            assertFoldedRanges(foldingModel, [r1, r5], '1');
            setCollapseStateForRest(foldingModel, false, [5]);
            assertFoldedRanges(foldingModel, [], '2');
            setCollapseStateForRest(foldingModel, true, [1]);
            assertFoldedRanges(foldingModel, [r2, r3, r4, r5], '3');
            setCollapseStateForRest(foldingModel, true, [3]);
            assertFoldedRanges(foldingModel, [r1, r2, r3, r4, r5], '3');
        }
        finally {
            textModel.dispose();
        }
    });
    test('folding decoration', () => {
        const lines = [
            /* 1*/ 'class A {',
            /* 2*/ '  void foo() {',
            /* 3*/ '    if (true) {',
            /* 4*/ '      hoo();',
            /* 5*/ '    }',
            /* 6*/ '  }',
            /* 7*/ '}'
        ];
        const textModel = createTextModel(lines.join('\n'));
        try {
            const foldingModel = new FoldingModel(textModel, new TestDecorationProvider(textModel));
            const ranges = computeRanges(textModel, false, undefined);
            foldingModel.update(ranges);
            const r1 = r(1, 6, false);
            const r2 = r(2, 5, false);
            const r3 = r(3, 4, false);
            assertRanges(foldingModel, [r1, r2, r3]);
            assertDecorations(foldingModel, [d(1, 'expanded'), d(2, 'expanded'), d(3, 'expanded')]);
            foldingModel.toggleCollapseState([foldingModel.getRegionAtLine(2)]);
            assertRanges(foldingModel, [r1, r(2, 5, true), r3]);
            assertDecorations(foldingModel, [d(1, 'expanded'), d(2, 'collapsed'), d(3, 'hidden')]);
            foldingModel.update(ranges);
            assertRanges(foldingModel, [r1, r(2, 5, true), r3]);
            assertDecorations(foldingModel, [d(1, 'expanded'), d(2, 'collapsed'), d(3, 'hidden')]);
            foldingModel.toggleCollapseState([foldingModel.getRegionAtLine(1)]);
            assertRanges(foldingModel, [r(1, 6, true), r(2, 5, true), r3]);
            assertDecorations(foldingModel, [d(1, 'collapsed'), d(2, 'hidden'), d(3, 'hidden')]);
            foldingModel.update(ranges);
            assertRanges(foldingModel, [r(1, 6, true), r(2, 5, true), r3]);
            assertDecorations(foldingModel, [d(1, 'collapsed'), d(2, 'hidden'), d(3, 'hidden')]);
            foldingModel.toggleCollapseState([foldingModel.getRegionAtLine(1), foldingModel.getRegionAtLine(3)]);
            assertRanges(foldingModel, [r1, r(2, 5, true), r(3, 4, true)]);
            assertDecorations(foldingModel, [d(1, 'expanded'), d(2, 'collapsed'), d(3, 'hidden')]);
            foldingModel.update(ranges);
            assertRanges(foldingModel, [r1, r(2, 5, true), r(3, 4, true)]);
            assertDecorations(foldingModel, [d(1, 'expanded'), d(2, 'collapsed'), d(3, 'hidden')]);
            textModel.dispose();
        }
        finally {
            textModel.dispose();
        }
    });
    test('fold jumping', () => {
        const lines = [
            /* 1*/ 'class A {',
            /* 2*/ '  void foo() {',
            /* 3*/ '    if (1) {',
            /* 4*/ '      a();',
            /* 5*/ '    } else if (2) {',
            /* 6*/ '      if (true) {',
            /* 7*/ '        b();',
            /* 8*/ '      }',
            /* 9*/ '    } else {',
            /* 10*/ '      c();',
            /* 11*/ '    }',
            /* 12*/ '  }',
            /* 13*/ '}'
        ];
        const textModel = createTextModel(lines.join('\n'));
        try {
            const foldingModel = new FoldingModel(textModel, new TestDecorationProvider(textModel));
            const ranges = computeRanges(textModel, false, undefined);
            foldingModel.update(ranges);
            const r1 = r(1, 12, false);
            const r2 = r(2, 11, false);
            const r3 = r(3, 4, false);
            const r4 = r(5, 8, false);
            const r5 = r(6, 7, false);
            const r6 = r(9, 10, false);
            assertRanges(foldingModel, [r1, r2, r3, r4, r5, r6]);
            // Test jump to parent.
            assert.strictEqual(getParentFoldLine(7, foldingModel), 6);
            assert.strictEqual(getParentFoldLine(6, foldingModel), 5);
            assert.strictEqual(getParentFoldLine(5, foldingModel), 2);
            assert.strictEqual(getParentFoldLine(2, foldingModel), 1);
            assert.strictEqual(getParentFoldLine(1, foldingModel), null);
            // Test jump to previous.
            assert.strictEqual(getPreviousFoldLine(10, foldingModel), 9);
            assert.strictEqual(getPreviousFoldLine(9, foldingModel), 5);
            assert.strictEqual(getPreviousFoldLine(5, foldingModel), 3);
            assert.strictEqual(getPreviousFoldLine(3, foldingModel), null);
            // Test when not on a folding region start line.
            assert.strictEqual(getPreviousFoldLine(4, foldingModel), 3);
            assert.strictEqual(getPreviousFoldLine(7, foldingModel), 6);
            assert.strictEqual(getPreviousFoldLine(8, foldingModel), 6);
            // Test jump to next.
            assert.strictEqual(getNextFoldLine(3, foldingModel), 5);
            assert.strictEqual(getNextFoldLine(5, foldingModel), 9);
            assert.strictEqual(getNextFoldLine(9, foldingModel), null);
            // Test when not on a folding region start line.
            assert.strictEqual(getNextFoldLine(4, foldingModel), 5);
            assert.strictEqual(getNextFoldLine(7, foldingModel), 9);
            assert.strictEqual(getNextFoldLine(8, foldingModel), 9);
        }
        finally {
            textModel.dispose();
        }
    });
    test('fold jumping issue #129503', () => {
        const lines = [
            /* 1*/ '',
            /* 2*/ 'if True:',
            /* 3*/ '  print(1)',
            /* 4*/ 'if True:',
            /* 5*/ '  print(1)',
            /* 6*/ ''
        ];
        const textModel = createTextModel(lines.join('\n'));
        try {
            const foldingModel = new FoldingModel(textModel, new TestDecorationProvider(textModel));
            const ranges = computeRanges(textModel, false, undefined);
            foldingModel.update(ranges);
            const r1 = r(2, 3, false);
            const r2 = r(4, 6, false);
            assertRanges(foldingModel, [r1, r2]);
            // Test jump to next.
            assert.strictEqual(getNextFoldLine(1, foldingModel), 2);
            assert.strictEqual(getNextFoldLine(2, foldingModel), 4);
            assert.strictEqual(getNextFoldLine(3, foldingModel), 4);
            assert.strictEqual(getNextFoldLine(4, foldingModel), null);
            assert.strictEqual(getNextFoldLine(5, foldingModel), null);
            assert.strictEqual(getNextFoldLine(6, foldingModel), null);
            // Test jump to previous.
            assert.strictEqual(getPreviousFoldLine(1, foldingModel), null);
            assert.strictEqual(getPreviousFoldLine(2, foldingModel), null);
            assert.strictEqual(getPreviousFoldLine(3, foldingModel), 2);
            assert.strictEqual(getPreviousFoldLine(4, foldingModel), 2);
            assert.strictEqual(getPreviousFoldLine(5, foldingModel), 4);
            assert.strictEqual(getPreviousFoldLine(6, foldingModel), 4);
        }
        finally {
            textModel.dispose();
        }
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZm9sZGluZ01vZGVsLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9mb2xkaW5nL3Rlc3QvYnJvd3Nlci9mb2xkaW5nTW9kZWwudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUNoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDL0UsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRWpFLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUMzRCxPQUFPLEVBQUUsWUFBWSxFQUFFLGVBQWUsRUFBRSxpQkFBaUIsRUFBRSxtQkFBbUIsRUFBRSx1QkFBdUIsRUFBRSxnQ0FBZ0MsRUFBRSx1QkFBdUIsRUFBRSwwQkFBMEIsRUFBRSx3QkFBd0IsRUFBRSxrQkFBa0IsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBRXBSLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFjM0UsTUFBTSxPQUFPLHNCQUFzQjthQUVWLHdCQUFtQixHQUFHLHNCQUFzQixDQUFDLFFBQVEsQ0FBQztRQUM3RSxXQUFXLEVB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QUFHLElBQUksWUFBWSxDQUFDLFNBQVMsRUFBRSxJQUFJLHNCQUFzQixDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7WUFFeEYsTUFBTSxNQUFNLEdBQUcsYUFBYSxDQUFDLFNBQVMsRUFBRSxLQUFLLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDMUQsWUFBWSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUU1QixNQUFNLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUMxQixNQUFNLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUMxQixNQUFNLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUUxQixZQUFZLENBQUMsWUFBWSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBRXpDLFlBQVksQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLFlBQVksQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3JFLFlBQVksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7WUFFNUIsWUFBWSxDQUFDLFlBQVksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBRXBELFlBQVksQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLFlBQVksQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3JFLFlBQVksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7WUFFNUIsWUFBWSxDQUFDLFlBQVksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFB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LE1BQU0sTUFBTSxHQUFHLGFBQWEsQ0FBQyxTQUFTLEVBQUUsS0FBSyxFQUFFLEVBQUUsS0FBSyxFQUFFLGVBQWUsRUFBRSxHQUFHLEVBQUUsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDO1lBQ3BHLFlBQVksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7WUFFNUIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDMUIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDM0IsTUFBTSxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDM0IsTUFBTSxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDMUIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFFMUIsTUFBTSxPQUFPLEdBQUcsWUFBWSxDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUMsZUFBZSxDQUFDLENBQUM7WUFDakUsTUFBTSxPQUFPLEdBQUcsWUFBWSxDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUMsZUFBZSxDQUFDLENBQUM7WUFDakUsTUFBTSxPQUFPLEdBQUcsWUFBWSxDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUMsZUFBZSxDQUFDLENBQUM7WUFFakUsWUFBWSxDQUFDLFlBQVksRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBRWpELGFBQWEsQ0FBQyxZQUFZLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsS0FBSyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFF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LENBQUMsQ0FBQyxDQUFDLEVBQUUsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFckYsWUFBWSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUU1QixZQUFZLENBQUMsWUFBWSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUMvRCxpQkFBaUIsQ0FBQyxZQUFZLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLFdBQVcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFckYsWUFBWSxDQUFDLG1CQUFtQixDQUFDLENBQUMsWUFBWSxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUUsRUFBRSxZQUFZLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBRSxDQUFDLENBQUMsQ0FBQztZQUV2RyxZQUFZLENBQUMsWUFBWSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMvRCxpQkFBaUIsQ0FBQyxZQUFZLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLFVBQVUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsV0FBVyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFdkYsWUFBWSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUU1QixZQUFZLENBQUMsWUFBWSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMvRCxpQkFBaUIsQ0FBQyxZQUFZLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLFVBQVUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsV0FBVyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFdkYsU0FBUyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ3JCLENBQUM7Z0JBQVMsQ0FBQztZQUNWLFNBQVMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNyQixDQUFDO0lBRUYsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsY0FBYyxFQUFFLEdBQUcsRUFBRTtRQUN6QixNQUFNLEtBQUssR0FBRztZQUNiLE1BQU0sQ0FBQyxXQUFXO1lBQ2xCLE1BQU0sQ0FBQyxnQkFBZ0I7WUFDdkIsTUFBTSxDQUFDLGNBQWM7WUFDckIsTUFBTSxDQUFDLFlBQVk7WUFDbkIsTUFBTSxDQUFDLHFCQUFxQjtZQUM1QixNQUFNLENBQUMsbUJBQW1CO1lBQzFCLE1BQU0sQ0FBQyxjQUFjO1lBQ3JCLE1BQU0sQ0FBQyxTQUFTO1lBQ2hCLE1BQU0sQ0FBQyxjQUFjO1lBQ3JCLE9BQU8sQ0FBQyxZQUFZO1lBQ3BCLE9BQU8sQ0FBQyxPQUFPO1lBQ2YsT0FBTyxDQUFDLEtBQUs7WUFDYixPQUFPLENBQUMsR0FBRztTQUNYLENBQUM7UUFFRixNQUFNLFNBQVMsR0FBRyxlQUFlLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ3BELElBQUksQ0FBQztZQUNKLE1BQU0sWUFBWSxHQUFHLElBQUksWUFBWSxDQUFDLFNBQVMsRUFBRSxJQUFJLHNCQUFzQixDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7WUFFeEYsTUFBTSxNQUFNLEdBQUcsYUFBYSxDQUFDLFNBQVMsRUFBRSxLQUFLLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDMUQsWUFBWSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUU1QixNQUFNLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUMzQixNQUFNLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUMzQixNQUFNLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUMxQixNQUFNLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUMxQixNQUFNLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUMxQixNQUFNLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUMzQixZQUFZLENBQUMsWUFBWSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBRXJELHVCQUF1QjtZQUN2QixNQUFNLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLENBQUMsRUFBRSxZQUFZLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUMxRCxNQUFNLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLENBQUMsRUFBRSxZQUFZLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUMxRCxNQUFNLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLENBQUMsRUFBRSxZQUFZLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUMxRCxNQUFNLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLENBQUMsRUFBRSxZQUFZLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUMxRCxNQUFNLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLENBQUMsRUFBRSxZQUFZLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUU3RCx5QkFBeUI7WUFDekIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxtQkFBbUIsQ0FBQyxFQUFFLEVBQUUsWUFBWSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDN0QsTUFBTSxDQUFDLFdBQVcsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLEVBQUUsWUFBWSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDNUQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLEVBQUUsWUFBWSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDNUQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLEVBQUUsWUFBWSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDL0QsZ0RBQWdEO1lBQ2hELE1BQU0sQ0FBQyxXQUFXLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxFQUFFLFlBQVksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzVELE1BQU0sQ0FBQyxXQUFXLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxFQUFFLFlBQVksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzVELE1BQU0sQ0FBQyxXQUFXLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxFQUFFLFlBQVksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBRTVELHFCQUFxQjtZQUNyQixNQUFNLENBQUMsV0FBVyxDQUFDLGVBQWUsQ0FBQyxDQUFDLEVBQUUsWUFBWSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDeEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxlQUFlLENBQUMsQ0FBQyxFQUFFLFlBQVksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3hELE1BQU0sQ0FBQyxXQUFXLENBQUMsZUFBZSxDQUFDLENBQUMsRUFBRSxZQUFZLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUMzRCxnREFBZ0Q7WUFDaEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxlQUFlLENBQUMsQ0FBQyxFQUFFLFlBQVksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3hELE1BQU0sQ0FBQyxXQUFXLENBQUMsZUFBZSxDQUFDLENBQUMsRUFBRSxZQUFZLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUN4RCxNQUFNLENBQUMsV0FBVyxDQUFDLGVBQWUsQ0FBQyxDQUFDLEVBQUUsWUFBWSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFekQsQ0FBQztnQkFBUyxDQUFDO1lBQ1YsU0FBUyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ3JCLENBQUM7SUFFRixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw0QkFBNEIsRUFBRSxHQUFHLEVBQUU7UUFDdkMsTUFBTSxLQUFLLEdBQUc7WUFDYixNQUFNLENBQUMsRUFBRTtZQUNULE1BQU0sQ0FBQyxVQUFVO1lBQ2pCLE1BQU0sQ0FBQyxZQUFZO1lBQ25CLE1BQU0sQ0FBQyxVQUFVO1lBQ2pCLE1BQU0sQ0FBQyxZQUFZO1lBQ25CLE1BQU0sQ0FBQyxFQUFFO1NBQ1QsQ0FBQztRQUVGLE1BQU0sU0FBUyxHQUFHLGVBQWUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDcEQsSUFBSSxDQUFDO1lBQ0osTUFBTSxZQUFZLEdBQUcsSUFBSSxZQUFZLENBQUMsU0FBUyxFQUFFLElBQUksc0JBQXNCLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztZQUV4RixNQUFNLE1BQU0sR0FBRyxhQUFhLENBQUMsU0FBUyxFQUFFLEtBQUssRUFBRSxTQUFTLENBQUMsQ0FBQztZQUMxRCxZQUFZLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBRTVCLE1BQU0sRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzFCLE1BQU0sRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzFCLFlBQVksQ0FBQyxZQUFZLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUVyQyxxQkFBcUI7WUFDckIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxlQUFlLENBQUMsQ0FBQyxFQUFFLFlBQVksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3hELE1BQU0sQ0FBQyxXQUFXLENBQUMsZUFBZSxDQUFDLENBQUMsRUFBRSxZQUFZLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUN4RCxNQUFNLENBQUMsV0FBVyxDQUFDLGVBQWUsQ0FBQyxDQUFDLEVBQUUsWUFBWSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDeEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxlQUFlLENBQUMsQ0FBQyxFQUFFLFlBQVksQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQzNELE1BQU0sQ0FBQyxXQUFXLENBQUMsZUFBZSxDQUFDLENBQUMsRUFBRSxZQUFZLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUMzRCxNQUFNLENBQUMsV0FBVyxDQUFDLGVBQWUsQ0FBQyxDQUFDLEVBQUUsWUFBWSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFFM0QseUJBQXlCO1lBQ3pCLE1BQU0sQ0FBQyxXQUFXLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxFQUFFLFlBQVksQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQy9ELE1BQU0sQ0FBQyxXQUFXLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxFQUFFLFlBQVksQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQy9ELE1BQU0sQ0FBQyxXQUFXLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxFQUFFLFlBQVksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzVELE1BQU0sQ0FBQyxXQUFXLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxFQUFFLFlBQVksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzVELE1BQU0sQ0FBQyxXQUFXLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxFQUFFLFlBQVksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzVELE1BQU0sQ0FBQyxXQUFXLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxFQUFFLFlBQVksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzdELENBQUM7Z0JBQVMsQ0FBQztZQUNWLFNBQVMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNyQixDQUFDO0lBQ0YsQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQyJ9