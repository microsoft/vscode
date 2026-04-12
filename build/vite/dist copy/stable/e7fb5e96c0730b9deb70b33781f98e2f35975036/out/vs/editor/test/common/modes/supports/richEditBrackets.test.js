/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { BracketsUtils } from '../../../../common/languages/supports/richEditBrackets.js';
suite('richEditBrackets', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function findPrevBracketInRange(reversedBracketRegex, lineText, currentTokenStart, currentTokenEnd) {
        return BracketsUtils.findPrevBracketInRange(reversedBracketRegex, 1, lineText, currentTokenStart, currentTokenEnd);
    }
    function findNextBracketInRange(forwardBracketRegex, lineText, currentTokenStart, currentTokenEnd) {
        return BracketsUtils.findNextBracketInRange(forwardBracketRegex, 1, lineText, currentTokenStart, currentTokenEnd);
    }
    test('findPrevBracketInToken one char 1', () => {
        const result = findPrevBracketInRange(/(\{)|(\})/i, '{', 0, 1);
        assert.strictEqual(result.startColumn, 1);
        assert.strictEqual(result.endColumn, 2);
    });
    test('findPrevBracketInToken one char 2', () => {
        const result = findPrevBracketInRange(/(\{)|(\})/i, '{{', 0, 1);
        assert.strictEqual(result.startColumn, 1);
        assert.strictEqual(result.endColumn, 2);
    });
    test('findPrevBracketInToken one char 3', () => {
        const result = findPrevBracketInRange(/(\{)|(\})/i, '{hello world!', 0, 13);
        assert.strictEqual(result.startColumn, 1);
        assert.strictEqual(result.endColumn, 2);
    });
    test('findPrevBracketInToken more chars 1', () => {
        const result = findPrevBracketInRange(/(olleh)/i, 'hello world!', 0, 12);
        assert.strictEqual(result.startColumn, 1);
        assert.strictEqual(result.endColumn, 6);
    });
    test('findPrevBracketInToken more chars 2', () => {
        const result = findPrevBracketInRange(/(olleh)/i, 'hello world!', 0, 5);
        assert.strictEqual(result.startColumn, 1);
        assert.strictEqual(result.endColumn, 6);
    });
    test('findPrevBracketInToken more chars 3', () => {
        const result = findPrevBracketInRange(/(olleh)/i, ' hello world!', 0, 6);
        assert.strictEqual(result.startColumn, 2);
        assert.strictEqual(result.endColumn, 7);
    });
    test('findNextBracketInToken one char', () => {
        const result = findNextBracketInRange(/(\{)|(\})/i, '{', 0, 1);
        assert.strictEqual(result.startColumn, 1);
        assert.strictEqual(result.endColumn, 2);
    });
    test('findNextBracketInToken more chars', () => {
        const result = findNextBracketInRange(/(world)/i, 'hello world!', 0, 12);
        assert.strictEqual(result.startColumn, 7);
        assert.strictEqual(result.endColumn, 12);
    });
    test('findNextBracketInToken with emoty result', () => {
        const result = findNextBracketInRange(/(\{)|(\})/i, '', 0, 0);
        assert.strictEqual(result, null);
    });
    test('issue #3894: [Handlebars] Curly braces edit issues', () => {
        const result = findPrevBracketInRange(/(\-\-!<)|(>\-\-)|(\{\{)|(\}\})/i, '{{asd}}', 0, 2);
        assert.strictEqual(result.startColumn, 1);
        assert.strictEqual(result.endColumn, 3);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmljaEVkaXRCcmFja2V0cy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL3Rlc3QvY29tbW9uL21vZGVzL3N1cHBvcnRzL3JpY2hFZGl0QnJhY2tldHMudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFFbkcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBRTFGLEtBQUssQ0FBQyxrQkFBa0IsRUFBRSxHQUFHLEVBQUU7SUFFOUIsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxTQUFTLHNCQUFzQixDQUFDLG9CQUE0QixFQUFFLFFBQWdCLEVBQUUsaUJBQXlCLEVBQUUsZUFBdUI7UUFDakksT0FBTyxhQUFhLENBQUMsc0JBQXNCLENBQUMsb0JBQW9CLEVBQUUsQ0FBQyxFQUFFLFFBQVEsRUFBRSxpQkFBaUIsRUFBRSxlQUFlLENBQUMsQ0FBQztJQUNwSCxDQUFDO0lBRUQsU0FBUyxzQkFBc0IsQ0FBQyxtQkFBMkIsRUFBRSxRQUFnQixFQUFFLGlCQUF5QixFQUFFLGVBQXVCO1FBQ2hJLE9BQU8sYUFBYSxDQUFDLHNCQUFzQixDQUFDLG1CQUFtQixFQUFFLENBQUMsRUFBRSxRQUFRLEVBQUUsaUJBQWlCLEVBQUUsZUFBZSxDQUFDLENBQUM7SUFDbkgsQ0FBQztJQUVELElBQUksQ0FBQyxtQ0FBbUMsRUFBRSxHQUFHLEVBQUU7UUFDOUMsTUFBTSxNQUFNLEdBQUcsc0JBQXNCLENBQUMsWUFBWSxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDL0QsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFPLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzNDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTyxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUMxQyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxtQ0FBbUMsRUFBRSxHQUFHLEVBQUU7UUFDOUMsTUFBTSxNQUFNLEdBQUcsc0JBQXNCLENBQUMsWUFBWSxFQUFFLElBQUksRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDaEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFPLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzNDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTyxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUMxQyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxtQ0FBbUMsRUFBRSxHQUFHLEVBQUU7UUFDOUMsTUFBTSxNQUFNLEdBQUcsc0JBQXNCLENBQUMsWUFBWSxFQUFFLGVBQWUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDNUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFPLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzNDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTyxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUMxQyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxxQ0FBcUMsRUFBRSxHQUFHLEVBQUU7UUFDaEQsTUFBTSxNQUFNLEdBQUcsc0JBQXNCLENBQUMsVUFBVSxFQUFFLGNBQWMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDekUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFPLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzNDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTyxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUMxQyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxxQ0FBcUMsRUFBRSxHQUFHLEVBQUU7UUFDaEQsTUFBTSxNQUFNLEdBQUcsc0JBQXNCLENBQUMsVUFBVSxFQUFFLGNBQWMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDeEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFPLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzNDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTyxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUMxQyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxxQ0FBcUMsRUFBRSxHQUFHLEVBQUU7UUFDaEQsTUFBTSxNQUFNLEdBQUcsc0JBQXNCLENBQUMsVUFBVSxFQUFFLGVBQWUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDekUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFPLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzNDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTyxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUMxQyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxpQ0FBaUMsRUFBRSxHQUFHLEVBQUU7UUFDNUMsTUFBTSxNQUFNLEdBQUcsc0JBQXNCLENBQUMsWUFBWSxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDL0QsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFPLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzNDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTyxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUMxQyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxtQ0FBbUMsRUFBRSxHQUFHLEVBQUU7UUFDOUMsTUFBTSxNQUFNLEdBQUcsc0JBQXNCLENBQUMsVUFBVSxFQUFFLGNBQWMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDekUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFPLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzNDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTyxDQUFDLFNBQVMsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUMzQyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQywwQ0FBMEMsRUFBRSxHQUFHLEVBQUU7UUFDckQsTUFBTSxNQUFNLEdBQUcsc0JBQXNCLENBQUMsWUFBWSxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDOUQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDbEMsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsb0RBQW9ELEVBQUUsR0FBRyxFQUFFO1FBQy9ELE1BQU0sTUFBTSxHQUFHLHNCQUFzQixDQUFDLGlDQUFpQyxFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDMUYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFPLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzNDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTyxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUMxQyxDQUFDLENBQUMsQ0FBQztBQUVKLENBQUMsQ0FBQyxDQUFDIn0=