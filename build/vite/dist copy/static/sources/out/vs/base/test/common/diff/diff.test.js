/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { LcsDiff, StringDiffSequence } from '../../../common/diff/diff.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../utils.js';
function createArray(length, value) {
    const r = [];
    for (let i = 0; i < length; i++) {
        r[i] = value;
    }
    return r;
}
function maskBasedSubstring(str, mask) {
    let r = '';
    for (let i = 0; i < str.length; i++) {
        if (mask[i]) {
            r += str.charAt(i);
        }
    }
    return r;
}
function assertAnswer(originalStr, modifiedStr, changes, answerStr, onlyLength = false) {
    const originalMask = createArray(originalStr.length, true);
    const modifiedMask = createArray(modifiedStr.length, true);
    let i, j, change;
    for (i = 0; i < changes.length; i++) {
        change = changes[i];
        if (change.originalLength) {
            for (j = 0; j < change.originalLength; j++) {
                originalMask[change.originalStart + j] = false;
            }
        }
        if (change.modifiedLength) {
            for (j = 0; j < change.modifiedLength; j++) {
                modifiedMask[change.modifiedStart + j] = false;
            }
        }
    }
    const originalAnswer = maskBasedSubstring(originalStr, originalMask);
    const modifiedAnswer = maskBasedSubstring(modifiedStr, modifiedMask);
    if (onlyLength) {
        assert.strictEqual(originalAnswer.length, answerStr.length);
        assert.strictEqual(modifiedAnswer.length, answerStr.length);
    }
    else {
        assert.strictEqual(originalAnswer, answerStr);
        assert.strictEqual(modifiedAnswer, answerStr);
    }
}
function lcsInnerTest(originalStr, modifiedStr, answerStr, onlyLength = false) {
    const diff = new LcsDiff(new StringDiffSequence(originalStr), new StringDiffSequence(modifiedStr));
    const changes = diff.ComputeDiff(false).changes;
    assertAnswer(originalStr, modifiedStr, changes, answerStr, onlyLength);
}
function stringPower(str, power) {
    let r = str;
    for (let i = 0; i < power; i++) {
        r += r;
    }
    return r;
}
function lcsTest(originalStr, modifiedStr, answerStr) {
    lcsInnerTest(originalStr, modifiedStr, answerStr);
    for (let i = 2; i <= 5; i++) {
        lcsInnerTest(stringPower(originalStr, i), stringPower(modifiedStr, i), stringPower(answerStr, i), true);
    }
}
suite('Diff', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('LcsDiff - different strings tests', function () {
        this.timeout(10000);
        lcsTest('heLLo world', 'hello orlando', 'heo orld');
        lcsTest('abcde', 'acd', 'acd'); // simple
        lcsTest('abcdbce', 'bcede', 'bcde'); // skip
        lcsTest('abcdefgabcdefg', 'bcehafg', 'bceafg'); // long
        lcsTest('abcde', 'fgh', ''); // no match
        lcsTest('abcfabc', 'fabc', 'fabc');
        lcsTest('0azby0', '9axbzby9', 'azby');
        lcsTest('0abc00000', '9a1b2c399999', 'abc');
        lcsTest('fooBar', 'myfooBar', 'fooBar'); // all insertions
        lcsTest('fooBar', 'fooMyBar', 'fooBar'); // all insertions
        lcsTest('fooBar', 'fooBar', 'fooBar'); // identical sequences
    });
});
suite('Diff - Ported from VS', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('using continue processing predicate to quit early', function () {
        const left = 'abcdef';
        const right = 'abxxcyyydzzzzezzzzzzzzzzzzzzzzzzzzf';
        // We use a long non-matching portion at the end of the right-side string, so the backwards tracking logic
        // doesn't get there first.
        let predicateCallCount = 0;
        let diff = new LcsDiff(new StringDiffSequence(left), new StringDiffSequence(right), function (leftIndex, longestMatchSoFar) {
            assert.strictEqual(predicateCallCount, 0);
            predicateCallCount++;
            assert.strictEqual(leftIndex, 1);
            // cancel processing
            return false;
        });
        let changes = diff.ComputeDiff(true).changes;
        assert.strictEqual(predicateCallCount, 1);
        // Doesn't include 'c', 'd', or 'e', since we quit on the first request
        assertAnswer(left, right, changes, 'abf');
        // Cancel after the first match ('c')
        diff = new LcsDiff(new StringDiffSequence(left), new StringDiffSequence(right), function (leftIndex, longestMatchSoFar) {
            assert(longestMatchSoFar <= 1); // We never see a match of length > 1
            // Continue processing as long as there hasn't been a match made.
            return longestMatchSoFar < 1;
        });
        changes = diff.ComputeDiff(true).changes;
        assertAnswer(left, right, changes, 'abcf');
        // Cancel after the second match ('d')
        diff = new LcsDiff(new StringDiffSequence(left), new StringDiffSequence(right), function (leftIndex, longestMatchSoFar) {
            assert(longestMatchSoFar <= 2); // We never see a match of length > 2
            // Continue processing as long as there hasn't been a match made.
            return longestMatchSoFar < 2;
        });
        changes = diff.ComputeDiff(true).changes;
        assertAnswer(left, right, changes, 'abcdf');
        // Cancel *one iteration* after the second match ('d')
        let hitSecondMatch = false;
        diff = new LcsDiff(new StringDiffSequence(left), new StringDiffSequence(right), function (leftIndex, longestMatchSoFar) {
            assert(longestMatchSoFar <= 2); // We never see a match of length > 2
            const hitYet = hitSecondMatch;
            hitSecondMatch = longestMatchSoFar > 1;
            // Continue processing as long as there hasn't been a match made.
            return !hitYet;
        });
        changes = diff.ComputeDiff(true).changes;
        assertAnswer(left, right, changes, 'abcdf');
        // Cancel after the third and final match ('e')
        diff = new LcsDiff(new StringDiffSequence(left), new StringDiffSequence(right), function (leftIndex, longestMatchSoFar) {
            assert(longestMatchSoFar <= 3); // We never see a match of length > 3
            // Continue processing as long as there hasn't been a match made.
            return longestMatchSoFar < 3;
        });
        changes = diff.ComputeDiff(true).changes;
        assertAnswer(left, right, changes, 'abcdef');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGlmZi50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS90ZXN0L2NvbW1vbi9kaWZmL2RpZmYudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFlLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3hGLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLGFBQWEsQ0FBQztBQUV0RSxTQUFTLFdBQVcsQ0FBSSxNQUFjLEVBQUUsS0FBUTtJQUMvQyxNQUFNLENBQUMsR0FBUSxFQUFFLENBQUM7SUFDbEIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQ2pDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBQ0QsT0FBTyxDQUFDLENBQUM7QUFDVixDQUFDO0FBRUQsU0FBUyxrQkFBa0IsQ0FBQyxHQUFXLEVBQUUsSUFBZTtJQUN2RCxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7SUFDWCxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQ3JDLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDYixDQUFDLElBQUksR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNwQixDQUFDO0lBQ0YsQ0FBQztJQUNELE9BQU8sQ0FBQyxDQUFDO0FBQ1YsQ0FBQztBQUVELFNBQVMsWUFBWSxDQUFDLFdBQW1CLEVBQUUsV0FBbUIsRUFBRSxPQUFzQixFQUFFLFNBQWlCLEVBQUUsYUFBc0IsS0FBSztJQUNySSxNQUFNLFlBQVksR0FBRyxXQUFXLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQztJQUMzRCxNQUFNLFlBQVksR0FBRyxXQUFXLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQztJQUUzRCxJQUFJLENBQUMsRUFBRSxDQUFDLEVBQUUsTUFBTSxDQUFDO0lBQ2pCLEtBQUssQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQ3JDLE1BQU0sR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFcEIsSUFBSSxNQUFNLENBQUMsY0FBYyxFQUFFLENBQUM7WUFDM0IsS0FBSyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxNQUFNLENBQUMsY0FBYyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7Z0JBQzVDLFlBQVksQ0FBQyxNQUFNLENBQUMsYUFBYSxHQUFHLENBQUMsQ0FBQyxHQUFHLEtBQUssQ0FBQztZQUNoRCxDQUFDO1FBQ0YsQ0FBQztRQUVELElBQUksTUFBTSxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQzNCLEtBQUssQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsTUFBTSxDQUFDLGNBQWMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO2dCQUM1QyxZQUFZLENBQUMsTUFBTSxDQUFDLGFBQWEsR0FBRyxDQUFDLENBQUMsR0FBRyxLQUFLLENBQUM7WUFDaEQsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBRUQsTUFBTSxjQUFjLEdBQUcsa0JBQWtCLENBQUMsV0FBVyxFQUFFLFlBQVksQ0FBQyxDQUFDO0lBQ3JFLE1BQU0sY0FBYyxHQUFHLGtCQUFrQixDQUFDLFdBQVcsRUFBRSxZQUFZLENBQUMsQ0FBQztJQUVyRSxJQUFJLFVBQVUsRUFBRSxDQUFDO1FBQ2hCLE1BQU0sQ0FBQyxXQUFXLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDNUQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxjQUFjLENBQUMsTUFBTSxFQUFFLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUM3RCxDQUFDO1NBQU0sQ0FBQztRQUNQLE1BQU0sQ0FBQyxXQUFXLENBQUMsY0FBYyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQzlDLE1BQU0sQ0FBQyxXQUFXLENBQUMsY0FBYyxFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBQy9DLENBQUM7QUFDRixDQUFDO0FBRUQsU0FBUyxZQUFZLENBQUMsV0FBbUIsRUFBRSxXQUFtQixFQUFFLFNBQWlCLEVBQUUsYUFBc0IsS0FBSztJQUM3RyxNQUFNLElBQUksR0FBRyxJQUFJLE9BQU8sQ0FBQyxJQUFJLGtCQUFrQixDQUFDLFdBQVcsQ0FBQyxFQUFFLElBQUksa0JBQWtCLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztJQUNuRyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDLE9BQU8sQ0FBQztJQUNoRCxZQUFZLENBQUMsV0FBVyxFQUFFLFdBQVcsRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFVBQVUsQ0FBQyxDQUFDO0FBQ3hFLENBQUM7QUFFRCxTQUFTLFdBQVcsQ0FBQyxHQUFXLEVBQUUsS0FBYTtJQUM5QyxJQUFJLENBQUMsR0FBRyxHQUFHLENBQUM7SUFDWixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsS0FBSyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDaEMsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNSLENBQUM7SUFDRCxPQUFPLENBQUMsQ0FBQztBQUNWLENBQUM7QUFFRCxTQUFTLE9BQU8sQ0FBQyxXQUFtQixFQUFFLFdBQW1CLEVBQUUsU0FBaUI7SUFDM0UsWUFBWSxDQUFDLFdBQVcsRUFBRSxXQUFXLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFDbEQsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQzdCLFlBQVksQ0FBQyxXQUFXLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxFQUFFLFdBQVcsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDLEVBQUUsV0FBVyxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUN6RyxDQUFDO0FBQ0YsQ0FBQztBQUVELEtBQUssQ0FBQyxNQUFNLEVBQUUsR0FBRyxFQUFFO0lBQ2xCLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsSUFBSSxDQUFDLG1DQUFtQyxFQUFFO1FBQ3pDLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDcEIsT0FBTyxDQUFDLGFBQWEsRUFBRSxlQUFlLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDcEQsT0FBTyxDQUFDLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxTQUFTO1FBQ3pDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsT0FBTyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsT0FBTztRQUM1QyxPQUFPLENBQUMsZ0JBQWdCLEVBQUUsU0FBUyxFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUMsT0FBTztRQUN2RCxPQUFPLENBQUMsT0FBTyxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLFdBQVc7UUFDeEMsT0FBTyxDQUFDLFNBQVMsRUFBRSxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDbkMsT0FBTyxDQUFDLFFBQVEsRUFBRSxVQUFVLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDdEMsT0FBTyxDQUFDLFdBQVcsRUFBRSxjQUFjLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFNUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxVQUFVLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQyxpQkFBaUI7UUFDMUQsT0FBTyxDQUFDLFFBQVEsRUFBRSxVQUFVLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQyxpQkFBaUI7UUFDMUQsT0FBTyxDQUFDLFFBQVEsRUFBRSxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQyxzQkFBc0I7SUFDOUQsQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQztBQUVILEtBQUssQ0FBQyx1QkFBdUIsRUFBRSxHQUFHLEVBQUU7SUFDbkMsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxJQUFJLENBQUMsbURBQW1ELEVBQUU7UUFDekQsTUFBTSxJQUFJLEdBQUcsUUFBUSxDQUFDO1FBQ3RCLE1BQU0sS0FBSyxHQUFHLHFDQUFxQyxDQUFDO1FBRXBELDBHQUEwRztRQUMxRywyQkFBMkI7UUFDM0IsSUFBSSxrQkFBa0IsR0FBRyxDQUFDLENBQUM7UUFFM0IsSUFBSSxJQUFJLEdBQUcsSUFBSSxPQUFPLENBQUMsSUFBSSxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLGtCQUFrQixDQUFDLEtBQUssQ0FBQyxFQUFFLFVBQVUsU0FBUyxFQUFFLGlCQUFpQjtZQUN6SCxNQUFNLENBQUMsV0FBVyxDQUFDLGtCQUFrQixFQUFFLENBQUMsQ0FBQyxDQUFDO1lBRTFDLGtCQUFrQixFQUFFLENBQUM7WUFFckIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFFakMsb0JBQW9CO1lBQ3BCLE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQyxDQUFDLENBQUM7UUFDSCxJQUFJLE9BQU8sR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQztRQUU3QyxNQUFNLENBQUMsV0FBVyxDQUFDLGtCQUFrQixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRTFDLHVFQUF1RTtRQUN2RSxZQUFZLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFJMUMscUNBQXFDO1FBQ3JDLElBQUksR0FBRyxJQUFJLE9BQU8sQ0FBQyxJQUFJLGtCQUFrQixDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksa0JBQWtCLENBQUMsS0FBSyxDQUFDLEVBQUUsVUFBVSxTQUFTLEVBQUUsaUJBQWlCO1lBQ3JILE1BQU0sQ0FBQyxpQkFBaUIsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLHFDQUFxQztZQUVyRSxpRUFBaUU7WUFDakUsT0FBTyxpQkFBaUIsR0FBRyxDQUFDLENBQUM7UUFDOUIsQ0FBQyxDQUFDLENBQUM7UUFDSCxPQUFPLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUM7UUFFekMsWUFBWSxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBSTNDLHNDQUFzQztRQUN0QyxJQUFJLEdBQUcsSUFBSSxPQUFPLENBQUMsSUFBSSxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLGtCQUFrQixDQUFDLEtBQUssQ0FBQyxFQUFFLFVBQVUsU0FBUyxFQUFFLGlCQUFpQjtZQUNySCxNQUFNLENBQUMsaUJBQWlCLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxxQ0FBcUM7WUFFckUsaUVBQWlFO1lBQ2pFLE9BQU8saUJBQWlCLEdBQUcsQ0FBQyxDQUFDO1FBQzlCLENBQUMsQ0FBQyxDQUFDO1FBQ0gsT0FBTyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDO1FBRXpDLFlBQVksQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztRQUk1QyxzREFBc0Q7UUFDdEQsSUFBSSxjQUFjLEdBQUcsS0FBSyxDQUFDO1FBQzNCLElBQUksR0FBRyxJQUFJLE9BQU8sQ0FBQyxJQUFJLGtCQUFrQixDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksa0JBQWtCLENBQUMsS0FBSyxDQUFDLEVBQUUsVUFBVSxTQUFTLEVBQUUsaUJBQWlCO1lBQ3JILE1BQU0sQ0FBQyxpQkFBaUIsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLHFDQUFxQztZQUVyRSxNQUFNLE1BQU0sR0FBRyxjQUFjLENBQUM7WUFDOUIsY0FBYyxHQUFHLGlCQUFpQixHQUFHLENBQUMsQ0FBQztZQUN2QyxpRUFBaUU7WUFDakUsT0FBTyxDQUFDLE1BQU0sQ0FBQztRQUNoQixDQUFDLENBQUMsQ0FBQztRQUNILE9BQU8sR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQztRQUV6QyxZQUFZLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFJNUMsK0NBQStDO1FBQy9DLElBQUksR0FBRyxJQUFJLE9BQU8sQ0FBQyxJQUFJLGtCQUFrQixDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksa0JBQWtCLENBQUMsS0FBSyxDQUFDLEVBQUUsVUFBVSxTQUFTLEVBQUUsaUJBQWlCO1lBQ3JILE1BQU0sQ0FBQyxpQkFBaUIsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLHFDQUFxQztZQUVyRSxpRUFBaUU7WUFDakUsT0FBTyxpQkFBaUIsR0FBRyxDQUFDLENBQUM7UUFDOUIsQ0FBQyxDQUFDLENBQUM7UUFDSCxPQUFPLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUM7UUFFekMsWUFBWSxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQzlDLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUMifQ==