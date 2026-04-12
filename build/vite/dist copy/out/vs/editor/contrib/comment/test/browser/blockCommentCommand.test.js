/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Selection } from '../../../../common/core/selection.js';
import { ILanguageService } from '../../../../common/languages/language.js';
import { ILanguageConfigurationService } from '../../../../common/languages/languageConfigurationRegistry.js';
import { BlockCommentCommand } from '../../browser/blockCommentCommand.js';
import { testCommand } from '../../../../test/browser/testCommand.js';
function _testCommentCommand(lines, selection, commandFactory, expectedLines, expectedSelection) {
    const languageId = 'commentMode';
    const prepare = (accessor, disposables) => {
        const languageConfigurationService = accessor.get(ILanguageConfigurationService);
        const languageService = accessor.get(ILanguageService);
        disposables.add(languageService.registerLanguage({ id: languageId }));
        disposables.add(languageConfigurationService.register(languageId, {
            comments: { lineComment: '!@#', blockComment: ['<0', '0>'] }
        }));
    };
    testCommand(lines, languageId, selection, commandFactory, expectedLines, expectedSelection, undefined, prepare);
}
function testBlockCommentCommand(lines, selection, expectedLines, expectedSelection) {
    _testCommentCommand(lines, selection, (accessor, sel) => new BlockCommentCommand(sel, true, accessor.get(ILanguageConfigurationService)), expectedLines, expectedSelection);
}
suite('Editor Contrib - Block Comment Command', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('empty selection wraps itself', function () {
        testBlockCommentCommand([
            'first',
            '\tsecond line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(1, 3, 1, 3), [
            'fi<0  0>rst',
            '\tsecond line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(1, 6, 1, 6));
    });
    test('invisible selection ignored', function () {
        testBlockCommentCommand([
            'first',
            '\tsecond line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(2, 1, 1, 1), [
            '<0 first',
            ' 0>\tsecond line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(1, 4, 2, 1));
    });
    test('bug9511', () => {
        testBlockCommentCommand([
            'first',
            '\tsecond line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(1, 6, 1, 1), [
            '<0 first 0>',
            '\tsecond line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(1, 4, 1, 9));
        testBlockCommentCommand([
            '<0first0>',
            '\tsecond line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(1, 8, 1, 3), [
            'first',
            '\tsecond line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(1, 1, 1, 6));
    });
    test('one line selection', function () {
        testBlockCommentCommand([
            'first',
            '\tsecond line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(1, 6, 1, 3), [
            'fi<0 rst 0>',
            '\tsecond line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(1, 6, 1, 9));
    });
    test('one line selection toggle', function () {
        testBlockCommentCommand([
            'first',
            '\tsecond line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(1, 6, 1, 3), [
            'fi<0 rst 0>',
            '\tsecond line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(1, 6, 1, 9));
        testBlockCommentCommand([
            'fi<0rst0>',
            '\tsecond line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(1, 8, 1, 5), [
            'first',
            '\tsecond line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(1, 3, 1, 6));
        testBlockCommentCommand([
            '<0 first 0>',
            '\tsecond line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(1, 10, 1, 1), [
            'first',
            '\tsecond line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(1, 1, 1, 6));
        testBlockCommentCommand([
            '<0 first0>',
            '\tsecond line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(1, 9, 1, 1), [
            'first',
            '\tsecond line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(1, 1, 1, 6));
        testBlockCommentCommand([
            '<0first 0>',
            '\tsecond line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(1, 9, 1, 1), [
            'first',
            '\tsecond line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(1, 1, 1, 6));
        testBlockCommentCommand([
            'fi<0rst0>',
            '\tsecond line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(1, 8, 1, 5), [
            'first',
            '\tsecond line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(1, 3, 1, 6));
    });
    test('multi line selection', function () {
        testBlockCommentCommand([
            'first',
            '\tsecond line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(2, 4, 1, 1), [
            '<0 first',
            '\tse 0>cond line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(1, 4, 2, 4));
    });
    test('multi line selection toggle', function () {
        testBlockCommentCommand([
            'first',
            '\tsecond line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(2, 4, 1, 1), [
            '<0 first',
            '\tse 0>cond line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(1, 4, 2, 4));
        testBlockCommentCommand([
            '<0first',
            '\tse0>cond line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(2, 4, 1, 3), [
            'first',
            '\tsecond line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(1, 1, 2, 4));
        testBlockCommentCommand([
            '<0 first',
            '\tse0>cond line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(2, 4, 1, 3), [
            'first',
            '\tsecond line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(1, 1, 2, 4));
        testBlockCommentCommand([
            '<0first',
            '\tse 0>cond line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(2, 4, 1, 3), [
            'first',
            '\tsecond line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(1, 1, 2, 4));
        testBlockCommentCommand([
            '<0 first',
            '\tse 0>cond line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(2, 4, 1, 3), [
            'first',
            '\tsecond line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(1, 1, 2, 4));
    });
    test('fuzzy removes', function () {
        testBlockCommentCommand([
            'asd <0 qwe',
            'asd 0> qwe'
        ], new Selection(2, 5, 1, 7), [
            'asd qwe',
            'asd qwe'
        ], new Selection(1, 5, 2, 4));
        testBlockCommentCommand([
            'asd <0 qwe',
            'asd 0> qwe'
        ], new Selection(2, 5, 1, 6), [
            'asd qwe',
            'asd qwe'
        ], new Selection(1, 5, 2, 4));
        testBlockCommentCommand([
            'asd <0 qwe',
            'asd 0> qwe'
        ], new Selection(2, 5, 1, 5), [
            'asd qwe',
            'asd qwe'
        ], new Selection(1, 5, 2, 4));
        testBlockCommentCommand([
            'asd <0 qwe',
            'asd 0> qwe'
        ], new Selection(2, 5, 1, 11), [
            'asd qwe',
            'asd qwe'
        ], new Selection(1, 5, 2, 4));
        testBlockCommentCommand([
            'asd <0 qwe',
            'asd 0> qwe'
        ], new Selection(2, 1, 1, 11), [
            'asd qwe',
            'asd qwe'
        ], new Selection(1, 5, 2, 4));
        testBlockCommentCommand([
            'asd <0 qwe',
            'asd 0> qwe'
        ], new Selection(2, 7, 1, 11), [
            'asd qwe',
            'asd qwe'
        ], new Selection(1, 5, 2, 4));
    });
    test('bug #30358', function () {
        testBlockCommentCommand([
            '<0 start 0> middle end',
        ], new Selection(1, 20, 1, 23), [
            '<0 start 0> middle <0 end 0>'
        ], new Selection(1, 23, 1, 26));
        testBlockCommentCommand([
            '<0 start 0> middle <0 end 0>'
        ], new Selection(1, 13, 1, 19), [
            '<0 start 0> <0 middle 0> <0 end 0>'
        ], new Selection(1, 16, 1, 22));
    });
    test('issue #34618', function () {
        testBlockCommentCommand([
            '<0  0> middle end',
        ], new Selection(1, 4, 1, 4), [
            ' middle end'
        ], new Selection(1, 1, 1, 1));
    });
    test('insertSpace false', () => {
        function testLineCommentCommand(lines, selection, expectedLines, expectedSelection) {
            _testCommentCommand(lines, selection, (accessor, sel) => new BlockCommentCommand(sel, false, accessor.get(ILanguageConfigurationService)), expectedLines, expectedSelection);
        }
        testLineCommentCommand([
            'some text'
        ], new Selection(1, 1, 1, 5), [
            '<0some0> text'
        ], new Selection(1, 3, 1, 7));
    });
    test('insertSpace false does not remove space', () => {
        function testLineCommentCommand(lines, selection, expectedLines, expectedSelection) {
            _testCommentCommand(lines, selection, (accessor, sel) => new BlockCommentCommand(sel, false, accessor.get(ILanguageConfigurationService)), expectedLines, expectedSelection);
        }
        testLineCommentCommand([
            '<0 some 0> text'
        ], new Selection(1, 4, 1, 8), [
            ' some  text'
        ], new Selection(1, 1, 1, 7));
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmxvY2tDb21tZW50Q29tbWFuZC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvY29tbWVudC90ZXN0L2Jyb3dzZXIvYmxvY2tDb21tZW50Q29tbWFuZC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUVqRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUM5RyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMzRSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFHdEUsU0FBUyxtQkFBbUIsQ0FBQyxLQUFlLEVBQUUsU0FBb0IsRUFBRSxjQUE4RSxFQUFFLGFBQXVCLEVBQUUsaUJBQTRCO0lBQ3hNLE1BQU0sVUFBVSxHQUFHLGFBQWEsQ0FBQztJQUNqQyxNQUFNLE9BQU8sR0FBRyxDQUFDLFFBQTBCLEVBQUUsV0FBNEIsRUFBRSxFQUFFO1FBQzVFLE1BQU0sNEJBQTRCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDO1FBQ2pGLE1BQU0sZUFBZSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUN2RCxXQUFXLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFLEVBQUUsRUFBRSxVQUFVLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDdEUsV0FBVyxDQUFDLEdBQUcsQ0FBQyw0QkFBNEIsQ0FBQyxRQUFRLENBQUMs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