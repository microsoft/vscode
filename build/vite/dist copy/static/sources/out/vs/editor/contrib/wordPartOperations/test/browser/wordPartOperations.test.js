/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Position } from '../../../../common/core/position.js';
import { ILanguageConfigurationService } from '../../../../common/languages/languageConfigurationRegistry.js';
import { deserializePipePositions, serializePipePositions, testRepeatedActionAndExtractPositions } from '../../../wordOperations/test/browser/wordTestUtils.js';
import { CursorWordPartLeft, CursorWordPartLeftSelect, CursorWordPartRight, CursorWordPartRightSelect, DeleteWordPartLeft, DeleteWordPartRight } from '../../browser/wordPartOperations.js';
import { StaticServiceAccessor } from './utils.js';
import { TestLanguageConfigurationService } from '../../../../test/common/modes/testLanguageConfigurationService.js';
suite('WordPartOperations', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    const _deleteWordPartLeft = new DeleteWordPartLeft();
    const _deleteWordPartRight = new DeleteWordPartRight();
    const _cursorWordPartLeft = new CursorWordPartLeft();
    const _cursorWordPartLeftSelect = new CursorWordPartLeftSelect();
    const _cursorWordPartRight = new CursorWordPartRight();
    const _cursorWordPartRightSelect = new CursorWordPartRightSelect();
    const serviceAccessor = new StaticServiceAccessor().withService(ILanguageConfigurationService, new TestLanguageConfigurationService());
    function runEditorCommand(editor, command) {
        command.runEditorCommand(serviceAccessor, editor, null);
    }
    function cursorWordPartLeft(editor, inSelectionmode = false) {
        runEditorCommand(editor, inSelectionmode ? _cursorWordPartLeftSelect : _cursorWordPartLeft);
    }
    function cursorWordPartRight(editor, inSelectionmode = false) {
        runEditorCommand(editor, inSelectionmode ? _cursorWordPartRightSelect : _cursorWordPartRight);
    }
    function deleteWordPartLeft(editor) {
        runEditorCommand(editor, _deleteWordPartLeft);
    }
    function deleteWordPartRight(editor) {
        runEditorCommand(editor, _deleteWordPartRight);
    }
    test('cursorWordPartLeft - basic', () => {
        const EXPECTED = [
            '|start| |line|',
            '|this|Is|A|Camel|Case|Var|  |this_|is_|a_|snake_|case_|var| |THIS_|IS_|CAPS_|SNAKE| |this_|IS|Mixed|Use|',
            '|end| |line'
        ].join('\n');
        const [text,] = deserializePipePositions(EXPECTED);
        const actualStops = testRepeatedActionAndExtractPositions(text, new Position(1000, 1000), ed => cursorWordPartLeft(ed), ed => ed.getPosition(), ed => ed.getPosition().equals(new Position(1, 1)));
        const actual = serializePipePositions(text, actualStops);
        assert.deepStrictEqual(actual, EXPECTED);
    });
    test('cursorWordPartLeft - issue #53899: whitespace', () => {
        const EXPECTED = '|myvar| |=| |\'|demonstration|     |of| |selection| |with| |space|\'';
        const [text,] = deserializePipePositions(EXPECTED);
        const actualStops = testRepeatedActionAndExtractPositions(text, new Position(1000, 1000), ed => cursorWordPartLeft(ed), ed => ed.getPosition(), ed => ed.getPosition().equals(new Position(1, 1)));
        const actual = serializePipePositions(text, actualStops);
        assert.deepStrictEqual(actual, EXPECTED);
    });
    test('cursorWordPartLeft - issue #53899: underscores', () => {
        const EXPECTED = '|myvar| |=| |\'|demonstration_____|of| |selection| |with| |space|\'';
        const [text,] = deserializePipePositions(EXPECTED);
        const actualStops = testRepeatedActionAndExtractPositions(text, new Position(1000, 1000), ed => cursorWordPartLeft(ed), ed => ed.getPosition(), ed => ed.getPosition().equals(new Position(1, 1)));
        const actual = serializePipePositions(text, actualStops);
        assert.deepStrictEqual(actual, EXPECTED);
    });
    test('cursorWordPartRight - basic', () => {
        const EXPECTED = [
            'start| |line|',
            '|this|Is|A|Camel|Case|Var|  |this|_is|_a|_snake|_case|_var| |THIS|_IS|_CAPS|_SNAKE| |this|_IS|Mixed|Use|',
            '|end| |line|'
        ].join('\n');
        const [text,] = deserializePipePositions(EXPECTED);
        const actualStops = testRepeatedActionAndExtractPositions(text, new Position(1, 1), ed => cursorWordPartRight(ed), ed => ed.getPosition(), ed => ed.getPosition().equals(new Position(3, 9)));
        const actual = serializePipePositions(text, actualStops);
        assert.deepStrictEqual(actual, EXPECTED);
    });
    test('cursorWordPartRight - issue #53899: whitespace', () => {
        const EXPECTED = 'myvar| |=| |\'|demonstration|     |of| |selection| |with| |space|\'|';
        const [text,] = deserializePipePositions(EXPECTED);
        const actualStops = testRepeatedActionAndExtractPositions(text, new Position(1, 1), ed => cursorWordPartRight(ed), ed => ed.getPosition(), ed => ed.getPosition().equals(new Position(1, 52)));
        const actual = serializePipePositions(text, actualStops);
        assert.deepStrictEqual(actual, EXPECTED);
    });
    test('cursorWordPartRight - issue #53899: underscores', () => {
        const EXPECTED = 'myvar| |=| |\'|demonstration|_____of| |selection| |with| |space|\'|';
        const [text,] = deserializePipePositions(EXPECTED);
        const actualStops = testRepeatedActionAndExtractPositions(text, new Position(1, 1), ed => cursorWordPartRight(ed), ed => ed.getPosition(), ed => ed.getPosition().equals(new Position(1, 52)));
        const actual = serializePipePositions(text, actualStops);
        assert.deepStrictEqual(actual, EXPECTED);
    });
    test('cursorWordPartRight - issue #53899: second case', () => {
        const EXPECTED = [
            ';| |--| |1|',
            '|;|        |--| |2|',
            '|;|    |#|3|',
            '|;|   |#|4|'
        ].join('\n');
        const [text,] = deserializePipePositions(EXPECTED);
        const actualStops = testRepeatedActionAndExtractPositions(text, new Position(1, 1), ed => cursorWordPartRight(ed), ed => ed.getPosition(), ed => ed.getPosition().equals(new Position(4, 7)));
        const actual = serializePipePositions(text, actualStops);
        assert.deepStrictEqual(actual, EXPECTED);
    });
    test('issue #93239 - cursorWordPartRight', () => {
        const EXPECTED = [
            'foo|_bar|',
        ].join('\n');
        const [text,] = deserializePipePositions(EXPECTED);
        const actualStops = testRepeatedActionAndExtractPositions(text, new Position(1, 1), ed => cursorWordPartRight(ed), ed => ed.getPosition(), ed => ed.getPosition().equals(new Position(1, 8)));
        const actual = serializePipePositions(text, actualStops);
        assert.deepStrictEqual(actual, EXPECTED);
    });
    test('issue #93239 - cursorWordPartLeft', () => {
        const EXPECTED = [
            '|foo_|bar',
        ].join('\n');
        const [text,] = deserializePipePositions(EXPECTED);
        const actualStops = testRepeatedActionAndExtractPositions(text, new Position(1, 8), ed => cursorWordPartLeft(ed), ed => ed.getPosition(), ed => ed.getPosition().equals(new Position(1, 1)));
        const actual = serializePipePositions(text, actualStops);
        assert.deepStrictEqual(actual, EXPECTED);
    });
    test('deleteWordPartLeft - basic', () => {
        const EXPECTED = '|   |/*| |Just| |some| |text| |a|+=| |3| |+|5|-|3| |*/|  |this|Is|A|Camel|Case|Var|  |this_|is_|a_|snake_|case_|var| |THIS_|IS_|CAPS_|SNAKE| |this_|IS|Mixed|Use';
        const [text,] = deserializePipePositions(EXPECTED);
        const actualStops = testRepeatedActionAndExtractPositions(text, new Position(1, 1000), ed => deleteWordPartLeft(ed), ed => ed.getPosition(), ed => ed.getValue().length === 0);
        const actual = serializePipePositions(text, actualStops);
        assert.deepStrictEqual(actual, EXPECTED);
    });
    test('deleteWordPartRight - basic', () => {
        const EXPECTED = '   |/*| |Just| |some| |text| |a|+=| |3| |+|5|-|3| |*/|  |this|Is|A|Camel|Case|Var|  |this|_is|_a|_snake|_case|_var| |THIS|_IS|_CAPS|_SNAKE| |this|_IS|Mixed|Use|';
        const [text,] = deserializePipePositions(EXPECTED);
        const actualStops = testRepeatedActionAndExtractPositions(text, new Position(1, 1), ed => deleteWordPartRight(ed), ed => new Position(1, text.length - ed.getValue().length + 1), ed => ed.getValue().length === 0);
        const actual = serializePipePositions(text, actualStops);
        assert.deepStrictEqual(actual, EXPECTED);
    });
    test('issue #158667: cursorWordPartLeft stops at "-" even when "-" is not in word separators', () => {
        const EXPECTED = [
            '|this-|is-|a-|kebab-|case-|var| |THIS-|IS-|CAPS-|KEBAB| |this-|IS|Mixed|Use',
        ].join('\n');
        const [text,] = deserializePipePositions(EXPECTED);
        const actualStops = testRepeatedActionAndExtractPositions(text, new Position(1000, 1000), ed => cursorWordPartLeft(ed), ed => ed.getPosition(), ed => ed.getPosition().equals(new Position(1, 1)), { wordSeparators: '!"#&\'()*+,./:;<=>?@[\\]^`{|}·' } // default characters sans '$-%~' plus '·'
        );
        const actual = serializePipePositions(text, actualStops);
        assert.deepStrictEqual(actual, EXPECTED);
    });
    test('issue #158667: cursorWordPartRight stops at "-" even when "-" is not in word separators', () => {
        const EXPECTED = [
            'this|-is|-a|-kebab|-case|-var| |THIS|-IS|-CAPS|-KEBAB| |this|-IS|Mixed|Use|',
        ].join('\n');
        const [text,] = deserializePipePositions(EXPECTED);
        const actualStops = testRepeatedActionAndExtractPositions(text, new Position(1, 1), ed => cursorWordPartRight(ed), ed => ed.getPosition(), ed => ed.getPosition().equals(new Position(1, 60)), { wordSeparators: '!"#&\'()*+,./:;<=>?@[\\]^`{|}·' } // default characters sans '$-%~' plus '·'
        );
        const actual = serializePipePositions(text, actualStops);
        assert.deepStrictEqual(actual, EXPECTED);
    });
    test('issue #158667: deleteWordPartLeft stops at "-" even when "-" is not in word separators', () => {
        const EXPECTED = [
            '|this-|is-|a-|kebab-|case-|var| |THIS-|IS-|CAPS-|KEBAB| |this-|IS|Mixed|Use',
        ].join(' ');
        const [text,] = deserializePipePositions(EXPECTED);
        const actualStops = testRepeatedActionAndExtractPositions(text, new Position(1000, 1000), ed => deleteWordPartLeft(ed), ed => ed.getPosition(), ed => ed.getValue().length === 0, { wordSeparators: '!"#&\'()*+,./:;<=>?@[\\]^`{|}·' } // default characters sans '$-%~' plus '·'
        );
        const actual = serializePipePositions(text, actualStops);
        assert.deepStrictEqual(actual, EXPECTED);
    });
    test('issue #158667: deleteWordPartRight stops at "-" even when "-" is not in word separators', () => {
        const EXPECTED = [
            'this|-is|-a|-kebab|-case|-var| |THIS|-IS|-CAPS|-KEBAB| |this|-IS|Mixed|Use|',
        ].join(' ');
        const [text,] = deserializePipePositions(EXPECTED);
        const actualStops = testRepeatedActionAndExtractPositions(text, new Position(1, 1), ed => deleteWordPartRight(ed), ed => new Position(1, text.length - ed.getValue().length + 1), ed => ed.getValue().length === 0, { wordSeparators: '!"#&\'()*+,./:;<=>?@[\\]^`{|}·' } // default characters sans '$-%~' plus '·'
        );
        const actual = serializePipePositions(text, actualStops);
        assert.deepStrictEqual(actual, EXPECTED);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29yZFBhcnRPcGVyYXRpb25zLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi93b3JkUGFydE9wZXJhdGlvbnMvdGVzdC9icm93c2VyL3dvcmRQYXJ0T3BlcmF0aW9ucy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUduRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDL0QsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDOUcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLHNCQUFzQixFQUFFLHFDQUFxQyxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDaEssT0FBTyxFQUFFLGtCQUFrQixFQUFFLHdCQUF3QixFQUFFLG1CQUFtQixFQUFFLHlCQUF5QixFQUFFLGtCQUFrQixFQUFFLG1CQUFtQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDNUwsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQ25ELE9BQU8sRUFBRSxnQ0FBZ0MsRUFBRSxNQUFNLG1FQUFtRSxDQUFDO0FBRXJILEtBQUssQ0FBQyxvQkFBb0IsRUFBRSxHQUFHLEVBQUU7SUFFaEMsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxNQUFNLG1CQUFtQixHQUFHLElBQUksa0JBQWtCLEVBQUUsQ0FBQztJQUNyRCxNQUFNLG9CQUFvQixHQUFHLElBQUksbUJBQW1CLEVBQUUsQ0FBQztJQUN2RCxNQUFNLG1CQUFtQixHQUFHLElBQUksa0JBQWtCLEVBQUUsQ0FBQztJQUNyRCxNQUFNLHlCQUF5QixHQUFHLElBQUksd0JBQXdCLEVBQUUsQ0FBQztJ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