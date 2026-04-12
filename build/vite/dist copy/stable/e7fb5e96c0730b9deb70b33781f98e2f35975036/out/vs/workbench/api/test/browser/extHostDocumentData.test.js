/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ExtHostDocumentData } from '../../common/extHostDocumentData.js';
import { Position } from '../../common/extHostTypes.js';
import { Range } from '../../../../editor/common/core/range.js';
import { mock } from '../../../../base/test/common/mock.js';
import * as perfData from './extHostDocumentData.test.perf-data.js';
import { setDefaultGetWordAtTextConfig } from '../../../../editor/common/core/wordHelper.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
suite('ExtHostDocumentData', () => {
    let data;
    function assertPositionAt(offset, line, character) {
        const position = data.document.positionAt(offset);
        assert.strictEqual(position.line, line);
        assert.strictEqual(position.character, character);
    }
    function assertOffsetAt(line, character, offset) {
        const pos = new Position(line, character);
        const actual = data.document.offsetAt(pos);
        assert.strictEqual(actual, offset);
    }
    setup(function () {
        data = new ExtHostDocumentData(undefined, URI.file(''), [
            'This is line one', //16
            'and this is line number two', //27
            'it is followed by #3', //20
            'and finished with the fourth.', //29
        ], '\n', 1, 'text', false, 'utf8');
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('readonly-ness', () => {
        // eslint-disable-next-line local/code-no-any-casts
        assert.throws(() => data.document.uri = null);
        // eslint-disable-next-line local/code-no-any-casts
        assert.throws(() => data.document.fileName = 'foofile');
        // eslint-disable-next-line local/code-no-any-casts
        assert.throws(() => data.document.isDirty = false);
        // eslint-disable-next-line local/code-no-any-casts
        assert.throws(() => data.document.isUntitled = false);
        // eslint-disable-next-line local/code-no-any-casts
        assert.throws(() => data.document.languageId = 'dddd');
        // eslint-disable-next-line local/code-no-any-casts
        assert.throws(() => data.document.lineCount = 9);
    });
    test('save, when disposed', function () {
        let saved;
        const data = new ExtHostDocumentData(new class extends mock() {
            $trySaveDocument(uri) {
                assert.ok(!saved);
                saved = uri;
                return Promise.resolve(true);
            }
        }, URI.parse('foo:bar'), [], '\n', 1, 'text', true, 'utf8');
        return data.document.save().then(() => {
            assert.strictEqual(saved.toString(), 'foo:bar');
            data.dispose();
            return data.document.save().then(() => {
                assert.ok(false, 'expected failure');
            }, err => {
                assert.ok(err);
            });
        });
    });
    test('read, when disposed', function () {
        data.dispose();
        const { document } = data;
        assert.strictEqual(document.lineCount, 4);
        assert.strictEqual(document.lineAt(0).text, 'This is line one');
    });
    test('lines', () => {
        assert.strictEqual(data.document.lineCount, 4);
        assert.throws(() => data.document.lineAt(-1));
        assert.throws(() => data.document.lineAt(data.document.lineCount));
        assert.throws(() => data.document.lineAt(Number.MAX_VALUE));
        assert.throws(() => data.document.lineAt(Number.MIN_VALUE));
        assert.throws(() => data.document.lineAt(0.8));
        let line = data.document.lineAt(0);
        assert.strictEqual(line.lineNumber, 0);
        assert.strictEqual(line.text.length, 16);
        assert.strictEqual(line.text, 'This is line one');
        assert.strictEqual(line.isEmptyOrWhitespace, false);
        assert.strictEqual(line.firstNonWhitespaceCharacterIndex, 0);
        data.onEvents({
            changes: [{
                    range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
                    rangeOffset: undefined,
                    rangeLength: undefined,
                    text: '\t '
                }],
            eol: undefined,
            versionId: undefined,
            isRedoing: false,
            isUndoing: false,
        });
        // line didn't change
        assert.strictEqual(line.text, 'This is line one');
        assert.strictEqual(line.firstNonWhitespaceCharacterIndex, 0);
        // fetch line again
        line = data.document.lineAt(0);
        assert.strictEqual(line.text, '\t This is line one');
        assert.strictEqual(line.firstNonWhitespaceCharacterIndex, 2);
    });
    test('line, issue #5704', function () {
        let line = data.document.lineAt(0);
        let { range, rangeIncludingLineBreak } = line;
        assert.strictEqual(range.end.line, 0);
        assert.strictEqual(range.end.character, 16);
        assert.strictEqual(rangeIncludingLineBreak.end.line, 1);
        assert.strictEqual(rangeIncludingLineBreak.end.character, 0);
        line = data.document.lineAt(data.document.lineCount - 1);
        range = line.range;
        rangeIncludingLineBreak = line.rangeIncludingLineBreak;
        assert.strictEqual(range.end.line, 3);
        assert.strictEqual(range.end.character, 29);
        assert.strictEqual(rangeIncludingLineBreak.end.line, 3);
        assert.strictEqual(rangeIncludingLineBreak.end.character, 29);
    });
    test('offsetAt', () => {
        assertOffsetAt(0, 0, 0);
        assertOffsetAt(0, 1, 1);
        assertOffsetAt(0, 16, 16);
        assertOffsetAt(1, 0, 17);
        assertOffsetAt(1, 3, 20);
        assertOffsetAt(2, 0, 45);
        assertOffsetAt(4, 29, 95);
        assertOffsetAt(4, 30, 95);
        assertOffsetAt(4, Number.MAX_VALUE, 95);
        assertOffsetAt(5, 29, 95);
        assertOffsetAt(Number.MAX_VALUE, 29, 95);
        assertOffsetAt(Number.MAX_VALUE, Number.MAX_VALUE, 95);
    });
    test('offsetAt, after remove', function () {
        data.onEvents({
            changes: [{
                    range: { startLineNumber: 1, startColumn: 3, endLineNumber: 1, endColumn: 6 },
                    rangeOffset: undefined,
                    rangeLength: undefined,
                    text: ''
                }],
            eol: undefined,
            versionId: undefined,
            isRedoing: false,
            isUndoing: false,
        });
        assertOffsetAt(0, 1, 1);
        assertOffsetAt(0, 13, 13);
        assertOffsetAt(1, 0, 14);
    });
    test('offsetAt, after replace', function () {
        data.onEvents({
            changes: [{
                    range: { startLineNumber: 1, startColumn: 3, endLineNumber: 1, endColumn: 6 },
                    rangeOffset: undefined,
                    rangeLength: undefined,
                    text: 'is could be'
                }],
            eol: undefined,
            versionId: undefined,
            isRedoing: false,
            isUndoing: false,
        });
        assertOffsetAt(0, 1, 1);
        assertOffsetAt(0, 24, 24);
        assertOffsetAt(1, 0, 25);
    });
    test('offsetAt, after insert line', function () {
        data.onEvents({
            changes: [{
                    range: { startLineNumber: 1, startColumn: 3, endLineNumber: 1, endColumn: 6 },
                    rangeOffset: undefined,
                    rangeLength: undefined,
                    text: 'is could be\na line with number'
                }],
            eol: undefined,
            versionId: undefined,
            isRedoing: false,
            isUndoing: false,
        });
        assertOffsetAt(0, 1, 1);
        assertOffsetAt(0, 13, 13);
        assertOffsetAt(1, 0, 14);
        assertOffsetAt(1, 18, 13 + 1 + 18);
        assertOffsetAt(1, 29, 13 + 1 + 29);
        assertOffsetAt(2, 0, 13 + 1 + 29 + 1);
    });
    test('offsetAt, after remove line', function () {
        data.onEvents({
            changes: [{
                    range: { startLineNumber: 1, startColumn: 3, endLineNumber: 2, endColumn: 6 },
                    rangeOffset: undefined,
                    rangeLength: undefined,
                    text: ''
                }],
            eol: undefined,
            versionId: undefined,
            isRedoing: false,
            isUndoing: false,
        });
        assertOffsetAt(0, 1, 1);
        assertOffsetAt(0, 2, 2);
        assertOffsetAt(1, 0, 25);
    });
    test('positionAt', () => {
        assertPositionAt(0, 0, 0);
        assertPositionAt(Number.MIN_VALUE, 0, 0);
        assertPositionAt(1, 0, 1);
        assertPositionAt(16, 0, 16);
        assertPositionAt(17, 1, 0);
        assertPositionAt(20, 1, 3);
        assertPositionAt(45, 2, 0);
        assertPositionAt(95, 3, 29);
        assertPositionAt(96, 3, 29);
        assertPositionAt(99, 3, 29);
        assertPositionAt(Number.MAX_VALUE, 3, 29);
    });
    test('getWordRangeAtPosition', () => {
        data = new ExtHostDocumentData(undefined, URI.file(''), [
            'aaaa bbbb+cccc abc'
        ], '\n', 1, 'text', false, 'utf8');
        let range = data.document.getWordRangeAtPosition(new Position(0, 2));
        assert.strictEqual(range.start.line, 0);
        assert.strictEqual(range.start.character, 0);
        assert.strictEqual(range.end.line, 0);
        assert.strictEqual(range.end.character, 4);
        // ignore bad regular expresson /.*/
        assert.throws(() => data.document.getWordRangeAtPosition(new Position(0, 2), /.*/));
        range = data.document.getWordRangeAtPosition(new Position(0, 5), /[a-z+]+/);
        assert.strictEqual(range.start.line, 0);
        assert.strictEqual(range.start.character, 5);
        assert.strictEqual(range.end.line, 0);
        assert.strictEqual(range.end.character, 14);
        range = data.document.getWordRangeAtPosition(new Position(0, 17), /[a-z+]+/);
        assert.strictEqual(range.start.line, 0);
        assert.strictEqual(range.start.character, 15);
        assert.strictEqual(range.end.line, 0);
        assert.strictEqual(range.end.character, 18);
        range = data.document.getWordRangeAtPosition(new Position(0, 11), /yy/);
        assert.strictEqual(range, undefined);
    });
    test('getWordRangeAtPosition doesn\'t quite use the regex as expected, #29102', function () {
        data = new ExtHostDocumentData(undefined, URI.file(''), [
            'some text here',
            '/** foo bar */',
            'function() {',
            '	"far boo"',
            '}'
        ], '\n', 1, 'text', false, 'utf8');
        let range = data.document.getWordRangeAtPosition(new Position(0, 0), /\/\*.+\*\//);
        assert.strictEqual(range, undefined);
        range = data.document.getWordRangeAtPosition(new Position(1, 0), /\/\*.+\*\//);
        assert.strictEqual(range.start.line, 1);
        assert.strictEqual(range.start.character, 0);
        assert.strictEqual(range.end.line, 1);
        assert.strictEqual(range.end.character, 14);
        range = data.document.getWordRangeAtPosition(new Position(3, 0), /("|').*\1/);
        assert.strictEqual(range, undefined);
        range = data.document.getWordRangeAtPosition(new Position(3, 1), /("|').*\1/);
        assert.strictEqual(range.start.line, 3);
        assert.strictEqual(range.start.character, 1);
        assert.strictEqual(range.end.line, 3);
        assert.strictEqual(range.end.character, 10);
    });
    test('getWordRangeAtPosition can freeze the extension host #95319', function () {
        const regex = /(https?:\/\/github\.com\/(([^\s]+)\/([^\s]+))\/([^\s]+\/)?(issues|pull)\/([0-9]+))|(([^\s]+)\/([^\s]+))?#([1-9][0-9]*)($|[\s\:\;\-\(\=])/;
        data = new ExtHostDocumentData(undefined, URI.file(''), [
            perfData._$_$_expensive
        ], '\n', 1, 'text', false, 'utf8');
        // this test only ensures that we eventually give and timeout (when searching "funny" words and long lines)
        // for the sake of speedy tests we lower the timeBudget here
        const config = setDefaultGetWordAtTextConfig({ maxLen: 1000, windowSize: 15, timeBudget: 30 });
        try {
            let range = data.document.getWordRangeAtPosition(new Position(0, 1_177_170), regex);
            assert.strictEqual(range, undefined);
            const pos = new Position(0, 1177170);
            range = data.document.getWordRangeAtPosition(pos);
            assert.ok(range);
            assert.ok(range.contains(pos));
            assert.strictEqual(data.document.getText(range), 'TaskDefinition');
        }
        finally {
            config.dispose();
        }
    });
    test('Rename popup sometimes populates with text on the left side omitted #96013', function () {
        const regex = /(-?\d*\.\d\w*)|([^\`\~\!\@\#\$\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g;
        const line = 'int abcdefhijklmnopqwvrstxyz;';
        data = new ExtHostDocumentData(undefined, URI.file(''), [
            line
        ], '\n', 1, 'text', false, 'utf8');
        const range = data.document.getWordRangeAtPosition(new Position(0, 27), regex);
        assert.strictEqual(range.start.line, 0);
        assert.strictEqual(range.end.line, 0);
        assert.strictEqual(range.start.character, 4);
        assert.strictEqual(range.end.character, 28);
    });
    test('Custom snippet $TM_SELECTED_TEXT not show suggestion #108892', function () {
        data = new ExtHostDocumentData(undefined, URI.file(''), [
            `        <p><span xml:lang="en">Sheldon</span>, soprannominato "<span xml:lang="en">Shelly</span> dalla madre e dalla sorella, è nato a <span xml:lang="en">Galveston</span>, in <span xml:lang="en">Texas</span>, il 26 febbraio 1980 in un supermercato. È stato un bambino prodigio, come testimoniato dal suo quoziente d'intelligenza (187, di molto superiore alla norma) e dalla sua rapida carriera scolastica: si è diplomato all'eta di 11 anni approdando alla stessa età alla formazione universitaria e all'età di 16 anni ha ottenuto il suo primo dottorato di ricerca. All'inizio della serie e per gran parte di essa vive con il coinquilino Leonard nell'appartamento 4A al 2311 <span xml:lang="en">North Los Robles Avenue</span> di <span xml:lang="en">Pasadena</span>, per poi trasferirsi nell'appartamento di <span xml:lang="en">Penny</span> con <span xml:lang="en">Amy</span> nella decima stagione. Come più volte afferma lui stesso possiede una memoria eidetica e un orecchio assoluto. È stato educato da una madre estremamente religiosa e, in più occasioni, questo aspetto contrasta con il rigore scientifico di <span xml:lang="en">Sheldon</span>; tuttavia la donna sembra essere l'unica persona in grado di comandarlo a bacchetta.</p>`
        ], '\n', 1, 'text', false, 'utf8');
        const pos = new Position(0, 55);
        const range = data.document.getWordRangeAtPosition(pos);
        assert.strictEqual(range.start.line, 0);
        assert.strictEqual(range.end.line, 0);
        assert.strictEqual(range.start.character, 47);
        assert.strictEqual(range.end.character, 61);
        assert.strictEqual(data.document.getText(range), 'soprannominato');
    });
});
var AssertDocumentLineMappingDirection;
(function (AssertDocumentLineMappingDirection) {
    AssertDocumentLineMappingDirection[AssertDocumentLineMappingDirection["OffsetToPosition"] = 0] = "OffsetToPosition";
    AssertDocumentLineMappingDirection[AssertDocumentLineMappingDirection["PositionToOffset"] = 1] = "PositionToOffset";
})(AssertDocumentLineMappingDirection || (AssertDocumentLineMappingDirection = {}));
suite('ExtHostDocumentData updates line mapping', () => {
    function positionToStr(position) {
        return '(' + position.line + ',' + position.character + ')';
    }
    function assertDocumentLineMapping(doc, direction) {
        const allText = doc.getText();
        let line = 0, character = 0, previousIsCarriageReturn = false;
        for (let offset = 0; offset <= allText.length; offset++) {
            // The position coordinate system cannot express the position between \r and \n
            const position = new Position(line, character + (previousIsCarriageReturn ? -1 : 0));
            if (direction === AssertDocumentLineMappingDirection.OffsetToPosition) {
                const actualPosition = doc.document.positionAt(offset);
                assert.strictEqual(positionToStr(actualPosition), positionToStr(position), 'positionAt mismatch for offset ' + offset);
            }
            else {
                // The position coordinate system cannot express the position between \r and \n
                const expectedOffset = offset + (previousIsCarriageReturn ? -1 : 0);
                const actualOffset = doc.document.offsetAt(position);
                assert.strictEqual(actualOffset, expectedOffset, 'offsetAt mismatch for position ' + positionToStr(position));
            }
            if (allText.charAt(offset) === '\n') {
                line++;
                character = 0;
            }
            else {
                character++;
            }
            previousIsCarriageReturn = (allText.charAt(offset) === '\r');
        }
    }
    function createChangeEvent(range, text, eol) {
        return {
            changes: [{
                    range: range,
                    rangeOffset: undefined,
                    rangeLength: undefined,
                    text: text
                }],
            eol: eol,
            versionId: undefined,
            isRedoing: false,
            isUndoing: false,
        };
    }
    function testLineMappingDirectionAfterEvents(lines, eol, direction, e) {
        const myDocument = new ExtHostDocumentData(undefined, URI.file(''), lines.slice(0), eol, 1, 'text', false, 'utf8');
        assertDocumentLineMapping(myDocument, direction);
        myDocument.onEvents(e);
        assertDocumentLineMapping(myDocument, direction);
    }
    function testLineMappingAfterEvents(lines, e) {
        testLineMappingDirectionAfterEvents(lines, '\n', AssertDocumentLineMappingDirection.PositionToOffset, e);
        testLineMappingDirectionAfterEvents(lines, '\n', AssertDocumentLineMappingDirection.OffsetToPosition, e);
        testLineMappingDirectionAfterEvents(lines, '\r\n', AssertDocumentLineMappingDirection.PositionToOffset, e);
        testLineMappingDirectionAfterEvents(lines, '\r\n', AssertDocumentLineMappingDirection.OffsetToPosition, e);
    }
    ensureNoDisposablesAreLeakedInTestSuite();
    test('line mapping', () => {
        testLineMappingAfterEvents([
            'This is line one',
            'and this is line number two',
            'it is followed by #3',
            'and finished with the fourth.',
        ], { changes: [], eol: undefined, versionId: 7, isRedoing: false, isUndoing: false });
    });
    test('after remove', () => {
        testLineMappingAfterEvents([
            'This is line one',
            'and this is line number two',
            'it is followed by #3',
            'and finished with the fourth.',
        ], createChangeEvent(new Range(1, 3, 1, 6), ''));
    });
    test('after replace', () => {
        testLineMappingAfterEvents([
            'This is line one',
            'and this is line number two',
            'it is followed by #3',
            'and finished with the fourth.',
        ], createChangeEvent(new Range(1, 3, 1, 6), 'is could be'));
    });
    test('after insert line', () => {
        testLineMappingAfterEvents([
            'This is line one',
            'and this is line number two',
            'it is followed by #3',
            'and finished with the fourth.',
        ], createChangeEvent(new Range(1, 3, 1, 6), 'is could be\na line with number'));
    });
    test('after insert two lines', () => {
        testLineMappingAfterEvents([
            'This is line one',
            'and this is line number two',
            'it is followed by #3',
            'and finished with the fourth.',
        ], createChangeEvent(new Range(1, 3, 1, 6), 'is could be\na line with number\nyet another line'));
    });
    test('after remove line', () => {
        testLineMappingAfterEvents([
            'This is line one',
            'and this is line number two',
            'it is followed by #3',
            'and finished with the fourth.',
        ], createChangeEvent(new Range(1, 3, 2, 6), ''));
    });
    test('after remove two lines', () => {
        testLineMappingAfterEvents([
            'This is line one',
            'and this is line number two',
            'it is followed by #3',
            'and finished with the fourth.',
        ], createChangeEvent(new Range(1, 3, 3, 6), ''));
    });
    test('after deleting entire content', () => {
        testLineMappingAfterEvents([
            'This is line one',
            'and this is line number two',
            'it is followed by #3',
            'and finished with the fourth.',
        ], createChangeEvent(new Range(1, 3, 4, 30), ''));
    });
    test('after replacing entire content', () => {
        testLineMappingAfterEvents([
            'This is line one',
            'and this is line number two',
            'it is followed by #3',
            'and finished with the fourth.',
        ], createChangeEvent(new Range(1, 3, 4, 30), 'some new text\nthat\nspans multiple lines'));
    });
    test('after changing EOL to CRLF', () => {
        testLineMappingAfterEvents([
            'This is line one',
            'and this is line number two',
            'it is followed by #3',
            'and finished with the fourth.',
        ], createChangeEvent(new Range(1, 1, 1, 1), '', '\r\n'));
    });
    test('after changing EOL to LF', () => {
        testLineMappingAfterEvents([
            'This is line one',
            'and this is line number two',
            'it is followed by #3',
            'and finished with the fourth.',
        ], createChangeEvent(new Range(1, 1, 1, 1), '', '\n'));
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdERvY3VtZW50RGF0YS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS90ZXN0L2Jyb3dzZXIvZXh0SG9zdERvY3VtZW50RGF0YS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDMUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3hELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUdoRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDNUQsT0FBTyxLQUFLLFFBQVEsTUFBTSx5Q0FBeUMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUM3RixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUVoRyxLQUFLLENBQUMscUJBQXFCLEVBQUUsR0FBRyxFQUFFO0lBRWpDLElBQUksSUFBeUIsQ0FBQztJQUU5QixTQUFTLGdCQUFnQixDQUFDLE1BQWMsRUFBRSxJQUFZLEVBQUUsU0FBaUI7UUFDeEUsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDbEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3hDLE1BQU0sQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztJQUNuRCxDQUFDO0lB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LENBQUM7UUFDdEMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUUzQyxvQ0FBb0M7UUFDcEMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLHNCQUFzQixDQUFDLElBQUksUUFBUSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUUsQ0FBQyxDQUFDO1FBRXJGLEtBQUssR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLHNCQUFzQixDQUFDLElBQUksUUFBUSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxTQUFTLENBQUUsQ0FBQztRQUM3RSxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3hDLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDN0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN0QyxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRTVDLEtBQUssR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLHNCQUFzQixDQUFDLElBQUksUUFBUSxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxTQUFTLENBQUUsQ0FBQztRQUM5RSxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3hDLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxTQUFTLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDOUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFD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