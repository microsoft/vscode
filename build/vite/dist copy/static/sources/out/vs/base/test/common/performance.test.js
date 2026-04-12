/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { clearMarks, getMarks, mark } from '../../common/performance.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
function marksFor(prefix) {
    return getMarks().filter(m => m.name.startsWith(prefix));
}
// Each test uses a unique prefix via a counter to avoid singleton state leaking between tests.
let testCounter = 0;
function uniquePrefix() {
    return `test/perf/${testCounter++}/`;
}
suite('clearMarks', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    let prefix;
    setup(() => {
        prefix = uniquePrefix();
    });
    test('clears all marks with matching prefix', () => {
        mark(`${prefix}a`);
        mark(`${prefix}b`);
        mark(`${prefix}c`);
        clearMarks(prefix);
        assert.strictEqual(marksFor(prefix).length, 0);
    });
    test('does not clear marks with a different prefix', () => {
        const otherPrefix = uniquePrefix();
        mark(`${prefix}a`);
        mark(`${otherPrefix}b`);
        clearMarks(prefix);
        assert.strictEqual(marksFor(prefix).length, 0);
        assert.strictEqual(marksFor(otherPrefix).length, 1);
        clearMarks(otherPrefix);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGVyZm9ybWFuY2UudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvdGVzdC9jb21tb24vcGVyZm9ybWFuY2UudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUNoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLFVBQVUsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDekUsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBRXJFLFNBQVMsUUFBUSxDQUFDLE1BQWM7SUFDL0IsT0FBTyxRQUFRLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0FBQzFELENBQUM7QUFFRCwrRkFBK0Y7QUFDL0YsSUFBSSxXQUFXLEdBQUcsQ0FBQyxDQUFDO0FBQ3BCLFNBQVMsWUFBWTtJQUNwQixPQUFPLGFBQWEsV0FBVyxFQUFFLEdBQUcsQ0FBQztBQUN0QyxDQUFDO0FBRUQsS0FBSyxDQUFDLFlBQVksRUFBRSxHQUFHLEVBQUU7SUFFeEIsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxJQUFJLE1BQWMsQ0FBQztJQUVuQixLQUFLLENBQUMsR0FBRyxFQUFFO1FBQ1YsTUFBTSxHQUFHLFlBQVksRUFBRSxDQUFDO0lBQ3pCLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHVDQUF1QyxFQUFFLEdBQUcsRUFBRTtRQUNsRCxJQUFJLENBQUMsR0FBRyxNQUFNLEdBQUcsQ0FBQyxDQUFDO1FBQ25CLElBQUksQ0FBQyxHQUFHLE1BQU0sR0FBRyxDQUFDLENBQUM7UUFDbkIsSUFBSSxDQUFDLEdBQUcsTUFBTSxHQUFHLENBQUMsQ0FBQztRQUVuQixVQUFVLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDbkIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ2hELENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDhDQUE4QyxFQUFFLEdBQUcsRUFBRTtRQUN6RCxNQUFNLFdBQVcsR0FBRyxZQUFZLEVBQUUsQ0FBQztRQUNuQyxJQUFJLENBQUMsR0FBRyxNQUFNLEdBQUcsQ0FBQyxDQUFDO1FBQ25CLElBQUksQ0FBQyxHQUFHLFdBQVcsR0FBRyxDQUFDLENBQUM7UUFFeEIsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRW5CLE1BQU0sQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMvQyxNQUFNLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFcEQsVUFBVSxDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBQ3pCLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUMifQ==