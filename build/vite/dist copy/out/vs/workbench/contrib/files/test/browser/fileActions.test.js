/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { incrementFileName } from '../../browser/fileActions.js';
suite('Files - Increment file name simple', () => {
    test('Increment file name without any version', function () {
        const name = 'test.js';
        const result = incrementFileName(name, false, 'simple');
        assert.strictEqual(result, 'test copy.js');
    });
    test('Increment file name with suffix version', function () {
        const name = 'test copy.js';
        const result = incrementFileName(name, false, 'simple');
        assert.strictEqual(result, 'test copy 2.js');
    });
    test('Increment file name with suffix version with leading zeros', function () {
        const name = 'test copy 005.js';
        const result = incrementFileName(name, false, 'simple');
        assert.strictEqual(result, 'test copy 6.js');
    });
    test('Increment file name with suffix version, too big number', function () {
        const name = 'test copy 9007199254740992.js';
        const result = incrementFileName(name, false, 'simple');
        assert.strictEqual(result, 'test copy 9007199254740992 copy.js');
    });
    test('Increment file name with just version in name', function () {
        const name = 'copy.js';
        const result = incrementFileName(name, false, 'simple');
        assert.strictEqual(result, 'copy copy.js');
    });
    test('Increment file name with just version in name, v2', function () {
        const name = 'copy 2.js';
        const result = incrementFileName(name, false, 'simple');
        assert.strictEqual(result, 'copy 2 copy.js');
    });
    test('Increment file name without any extension or version', function () {
        const name = 'test';
        const result = incrementFileName(name, false, 'simple');
        assert.strictEqual(result, 'test copy');
    });
    test('Increment file name without any extension or version, trailing dot', function () {
        const name = 'test.';
        const result = incrementFileName(name, false, 'simple');
        assert.strictEqual(result, 'test copy.');
    });
    test('Increment file name without any extension or version, leading dot', function () {
        const name = '.test';
        const result = incrementFileName(name, false, 'simple');
        assert.strictEqual(result, '.test copy');
    });
    test('Increment file name without any extension or version, leading dot v2', function () {
        const name = '..test';
        const result = incrementFileName(name, false, 'simple');
        assert.strictEqual(result, '. copy.test');
    });
    test('Increment file name without any extension but with suffix version', function () {
        const name = 'test copy 5';
        const result = incrementFileName(name, false, 'simple');
        assert.strictEqual(result, 'test copy 6');
    });
    test('Increment folder name without any version', function () {
        const name = 'test';
        const result = incrementFileName(name, true, 'simple');
        assert.strictEqual(result, 'test copy');
    });
    test('Increment folder name with suffix version', function () {
        const name = 'test copy';
        const result = incrementFileName(name, true, 'simple');
        assert.strictEqual(result, 'test copy 2');
    });
    test('Increment folder name with suffix version, leading zeros', function () {
        const name = 'test copy 005';
        const result = incrementFileName(name, true, 'simple');
        assert.strictEqual(result, 'test copy 6');
    });
    test('Increment folder name with suffix version, too big number', function () {
        const name = 'test copy 9007199254740992';
        const result = incrementFileName(name, true, 'simple');
        assert.strictEqual(result, 'test copy 9007199254740992 copy');
    });
    test('Increment folder name with just version in name', function () {
        const name = 'copy';
        const result = incrementFileName(name, true, 'simple');
        assert.strictEqual(result, 'copy copy');
    });
    test('Increment folder name with just version in name, v2', function () {
        const name = 'copy 2';
        const result = incrementFileName(name, true, 'simple');
        assert.strictEqual(result, 'copy 2 copy');
    });
    test('Increment folder name "with extension" but without any version', function () {
        const name = 'test.js';
        const result = incrementFileName(name, true, 'simple');
        assert.strictEqual(result, 'test.js copy');
    });
    test('Increment folder name "with extension" and with suffix version', function () {
        const name = 'test.js copy 5';
        const result = incrementFileName(name, true, 'simple');
        assert.strictEqual(result, 'test.js copy 6');
    });
    test('Increment file/folder name with suffix version, special case 1', function () {
        const name = 'test copy 0';
        const result = incrementFileName(name, true, 'simple');
        assert.strictEqual(result, 'test copy');
    });
    test('Increment file/folder name with suffix version, special case 2', function () {
        const name = 'test copy 1';
        const result = incrementFileName(name, true, 'simple');
        assert.strictEqual(result, 'test copy 2');
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
suite('Files - Increment file name smart', () => {
    test('Increment file name without any version', function () {
        const name = 'test.js';
        const result = incrementFileName(name, false, 'smart');
        assert.strictEqual(result, 'test.1.js');
    });
    test('Increment folder name without any version', function () {
        const name = 'test';
        const result = incrementFileName(name, true, 'smart');
        assert.strictEqual(result, 'test.1');
    });
    test('Increment file name with suffix version', function () {
        const name = 'test.1.js';
        const result = incrementFileName(name, false, 'smart');
        assert.strictEqual(result, 'test.2.js');
    });
    test('Increment file name with suffix version with trailing zeros', function () {
        const name = 'test.001.js';
        const result = incrementFileName(name, false, 'smart');
        assert.strictEqual(result, 'test.002.js');
    });
    test('Increment file name with suffix version with trailing zeros, changing length', function () {
        const name = 'test.009.js';
        const result = incrementFileName(name, false, 'smart');
        assert.strictEqual(result, 'test.010.js');
    });
    test('Increment file name with suffix version with `-` as separator', function () {
        const name = 'test-1.js';
        const result = incrementFileName(name, false, 'smart');
        assert.strictEqual(result, 'test-2.js');
    });
    test('Increment file name with suffix version with `-` as separator, trailing zeros', function () {
        const name = 'test-001.js';
        const result = incrementFileName(name, false, 'smart');
        assert.strictEqual(result, 'test-002.js');
    });
    test('Increment file name with suffix version with `-` as separator, trailing zeros, changnig length', function () {
        const name = 'test-099.js';
        const result = incrementFileName(name, false, 'smart');
        assert.strictEqual(result, 'test-100.js');
    });
    test('Increment file name with suffix version with `_` as separator', function () {
        const name = 'test_1.js';
        const result = incrementFileName(name, false, 'smart');
        assert.strictEqual(result, 'test_2.js');
    });
    test('Increment folder name with suffix version', function () {
        const name = 'test.1';
        const result = incrementFileName(name, true, 'smart');
        assert.strictEqual(result, 'test.2');
    });
    test('Increment folder name with suffix version, trailing zeros', function () {
        const name = 'test.001';
        const result = incrementFileName(name, true, 'smart');
        assert.strictEqual(result, 'test.002');
    });
    test('Increment folder name with suffix version with `-` as separator', function () {
        const name = 'test-1';
        const result = incrementFileName(name, true, 'smart');
        assert.strictEqual(result, 'test-2');
    });
    test('Increment folder name with suffix version with `_` as separator', function () {
        const name = 'test_1';
        const result = incrementFileName(name, true, 'smart');
        assert.strictEqual(result, 'test_2');
    });
    test('Increment file name with suffix version, too big number', function () {
        const name = 'test.9007199254740992.js';
        const result = incrementFileName(name, false, 'smart');
        assert.strictEqual(result, 'test.9007199254740992.1.js');
    });
    test('Increment folder name with suffix version, too big number', function () {
        const name = 'test.9007199254740992';
        const result = incrementFileName(name, true, 'smart');
        assert.strictEqual(result, 'test.9007199254740992.1');
    });
    test('Increment file name with prefix version', function () {
        const name = '1.test.js';
        const result = incrementFileName(name, false, 'smart');
        assert.strictEqual(result, '2.test.js');
    });
    test('Increment file name with just version in name', function () {
        const name = '1.js';
        const result = incrementFileName(name, false, 'smart');
        assert.strictEqual(result, '2.js');
    });
    test('Increment file name with just version in name, too big number', function () {
        const name = '9007199254740992.js';
        const result = incrementFileName(name, false, 'smart');
        assert.strictEqual(result, '9007199254740992.1.js');
    });
    test('Increment file name with prefix version, trailing zeros', function () {
        const name = '001.test.js';
        const result = incrementFileName(name, false, 'smart');
        assert.strictEqual(result, '002.test.js');
    });
    test('Increment file name with prefix version with `-` as separator', function () {
        const name = '1-test.js';
        const result = incrementFileName(name, false, 'smart');
        assert.strictEqual(result, '2-test.js');
    });
    test('Increment file name with prefix version with `_` as separator', function () {
        const name = '1_test.js';
        const result = incrementFileName(name, false, 'smart');
        assert.strictEqual(result, '2_test.js');
    });
    test('Increment file name with prefix version, too big number', function () {
        const name = '9007199254740992.test.js';
        const result = incrementFileName(name, false, 'smart');
        assert.strictEqual(result, '9007199254740992.test.1.js');
    });
    test('Increment file name with just version and no extension', function () {
        const name = '001004';
        const result = incrementFileName(name, false, 'smart');
        assert.strictEqual(result, '001005');
    });
    test('Increment file name with just version and no extension, too big number', function () {
        const name = '9007199254740992';
        const result = incrementFileName(name, false, 'smart');
        assert.strictEqual(result, '9007199254740992.1');
    });
    test('Increment file name with no extension and no version', function () {
        const name = 'file';
        const result = incrementFileName(name, false, 'smart');
        assert.strictEqual(result, 'file1');
    });
    test('Increment file name with no extension', function () {
        const name = 'file1';
        const result = incrementFileName(name, false, 'smart');
        assert.strictEqual(result, 'file2');
    });
    test('Increment file name with no extension, too big number', function () {
        const name = 'file9007199254740992';
        const result = incrementFileName(name, false, 'smart');
        assert.strictEqual(result, 'file9007199254740992.1');
    });
    test('Increment folder name with prefix version', function () {
        const name = '1.test';
        const result = incrementFileName(name, true, 'smart');
        assert.strictEqual(result, '2.test');
    });
    test('Increment folder name with prefix version, too big number', function () {
        const name = '9007199254740992.test';
        const result = incrementFileName(name, true, 'smart');
        assert.strictEqual(result, '9007199254740992.test.1');
    });
    test('Increment folder name with prefix version, trailing zeros', function () {
        const name = '001.test';
        const result = incrementFileName(name, true, 'smart');
        assert.strictEqual(result, '002.test');
    });
    test('Increment folder name with prefix version  with `-` as separator', function () {
        const name = '1-test';
        const result = incrementFileName(name, true, 'smart');
        assert.strictEqual(result, '2-test');
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsZUFjdGlvbnMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2ZpbGVzL3Rlc3QvYnJvd3Nlci9maWxlQWN0aW9ucy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUVqRSxLQUFLLENBQUMsb0NBQW9DLEVBQUUsR0FBRyxFQUFFO0lBRWhELElBQUksQ0FBQyx5Q0FBeUMsRUFBRTtRQUMvQyxNQUFNLElBQUksR0FBRyxTQUFTLENBQUM7UUFDdkIsTUFBTSxNQUFNLEdBQUcsaUJBQWlCLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxRQUFRLENBQUMsQ0FBQztRQUN4RCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxjQUFjLENBQUMsQ0FBQztJQUM1QyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx5Q0FBeUMsRUFBRTtRQUMvQyxNQUFNLElBQUksR0FBRyxjQUFjLENBQUM7UUFDNUIsTUFBTSxNQUFNLEdBQUcsaUJBQWlCLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxRQUFRLENBQUMsQ0FBQztRQUN4RCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO0lBQzlDLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDREQUE0RCxFQUFFO1FBQ2xFLE1BQU0sSUFBSSxHQUFHLGtCQUFrQixDQUFDO1FBQ2hDLE1BQU0sTUFBTSxHQUFHLGlCQUFpQixDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDeEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztJQUM5QyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx5REFBeUQsRUFBRTtRQUMvRCxNQUFNLElBQUksR0FBRywrQkFBK0IsQ0FBQztRQUM3QyxNQUFNLE1BQU0sR0FBRyxpQkFBaUIsQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQ3hELE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLG9DQUFvQyxDQUFDLENBQUM7SUFDbEUsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsK0NBQStDLEVBQUU7UUFDckQsTUFBTSxJQUFJLEdBQUcsU0FBUyxDQUFDO1FBQ3ZCLE1BQU0sTUFBTSxHQUFHLGlCQUFpQixDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDeEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsY0FBYyxDQUFDLENBQUM7SUFDNUMsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsbURBQW1ELEVBQUU7UUFDekQsTUFBTSxJQUFJLEdBQUcsV0FBVyxDQUFDO1FBQ3pCLE1BQU0sTUFBTSxHQUFHLGlCQUFpQixDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDeEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztJQUM5QyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxzREFBc0QsRUFBRTtRQUM1RCxNQUFNLElBQUksR0FBRyxNQUFNLENBQUM7UUFDcEIsTUFBTSxNQUFNLEdBQUcsaUJBQWlCLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxRQUFRLENBQUMsQ0FBQztRQUN4RCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxXQUFXLENBQUMsQ0FBQztJQUN6QyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxvRUFBb0UsRUFBRTtRQUMxRSxNQUFNLElBQUksR0FBRyxPQUFPLENBQUM7UUFDckIsTUFBTSxNQUFNLEdBQUcsaUJBQWlCLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxRQUFRLENBQUMsQ0FBQztRQUN4RCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxZQUFZLENBQUMsQ0FBQztJQUMxQyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxtRUFBbUUsRUFBRTtRQUN6RSxNQUFNLElBQUksR0FBRyxPQUFPLENBQUM7UUFDckIsTUFBTSxNQUFNLEdBQUcsaUJBQWlCLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxRQUFRLENBQUMsQ0FBQztRQUN4RCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxZQUFZLENBQUMsQ0FBQztJQUMxQyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxzRUFBc0UsRUFBRTtRQUM1RSxNQUFNLElBQUksR0FBRyxRQUFRLENBQUM7UUFDdEIsTUFBTSxNQUFNLEdBQUcsaUJBQWlCLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxRQUFRLENBQUMsQ0FBQztRQUN4RCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxhQUFhLENBQUMsQ0FBQztJQUMzQyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxtRUFBbUUsRUFBRTtRQUN6RSxNQUFNLElBQUksR0FBRyxhQUFhLENBQUM7UUFDM0IsTUFBTSxNQUFNLEdBQUcsaUJBQWlCLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxRQUFRLENBQUMsQ0FBQztRQUN4RCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxhQUFhLENBQUMsQ0FBQztJQUMzQyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQywyQ0FBMkMsRUFBRTtRQUNqRCxNQUFNLElBQUksR0FBRyxNQUFNLENBQUM7UUFDcEIsTUFBTSxNQUFNLEdBQUcsaUJBQWlCLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxRQUFRLENBQUMsQ0FBQztRQUN2RCxNQUFNLENBQUMs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