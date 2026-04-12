/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { KeybindingEditorDecorationsRenderer } from '../../browser/keybindingsEditorContribution.js';
suite('KeybindingsEditorContribution', () => {
    function assertUserSettingsFuzzyEquals(a, b, expected) {
        const actual = KeybindingEditorDecorationsRenderer._userSettingsFuzzyEquals(a, b);
        const message = expected ? `${a} == ${b}` : `${a} != ${b}`;
        assert.strictEqual(actual, expected, 'fuzzy: ' + message);
    }
    function assertEqual(a, b) {
        assertUserSettingsFuzzyEquals(a, b, true);
    }
    function assertDifferent(a, b) {
        assertUserSettingsFuzzyEquals(a, b, false);
    }
    test('_userSettingsFuzzyEquals', () => {
        assertEqual('a', 'a');
        assertEqual('a', 'A');
        assertEqual('ctrl+a', 'CTRL+A');
        assertEqual('ctrl+a', ' CTRL+A ');
        assertEqual('ctrl+shift+a', 'shift+ctrl+a');
        assertEqual('ctrl+shift+a ctrl+alt+b', 'shift+ctrl+a alt+ctrl+b');
        assertDifferent('ctrl+[KeyA]', 'ctrl+a');
        // issue #23335
        assertEqual('cmd+shift+p', 'shift+cmd+p');
        assertEqual('cmd+shift+p', 'shift-cmd-p');
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoia2V5YmluZGluZ3NFZGl0b3JDb250cmlidXRpb24udGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3ByZWZlcmVuY2VzL3Rlc3QvYnJvd3Nlci9rZXliaW5kaW5nc0VkaXRvckNvbnRyaWJ1dGlvbi50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsbUNBQW1DLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUVyRyxLQUFLLENBQUMsK0JBQStCLEVBQUUsR0FBRyxFQUFFO0lBRTNDLFNBQVMsNkJBQTZCLENBQUMsQ0FBUyxFQUFFLENBQVMsRUFBRSxRQUFpQjtRQUM3RSxNQUFNLE1BQU0sR0FBRyxtQ0FBbUMsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDbEYsTUFBTSxPQUFPLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7UUFDM0QsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsUUFBUSxFQUFFLFNBQVMsR0FBRyxPQUFPLENBQUMsQ0FBQztJQUMzRCxDQUFDO0lBRUQsU0FBUyxXQUFXLENBQUMsQ0FBUyxFQUFFLENBQVM7UUFDeEMsNkJBQTZCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUMzQyxDQUFDO0lBRUQsU0FBUyxlQUFlLENBQUMsQ0FBUyxFQUFFLENBQVM7UUFDNUMsNkJBQTZCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUM1QyxDQUFDO0lBRUQsSUFBSSxDQUFDLDBCQUEwQixFQUFFLEdBQUcsRUFBRTtRQUNyQyxXQUFXLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQ3RCLFdBQVcsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDdEIsV0FBVyxDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUNoQyxXQUFXLENBQUMsUUFBUSxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBRWxDLFdBQVcsQ0FBQyxjQUFjLEVBQUUsY0FBYyxDQUFDLENBQUM7UUFDNUMsV0FBVyxDQUFDLHlCQUF5QixFQUFFLHlCQUF5QixDQUFDLENBQUM7UUFFbEUsZUFBZSxDQUFDLGFBQWEsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUV6QyxlQUFlO1FBQ2YsV0FBVyxDQUFDLGFBQWEsRUFBRSxhQUFhLENBQUMsQ0FBQztRQUMxQyxXQUFXLENBQUMsYUFBYSxFQUFFLGFBQWEsQ0FBQyxDQUFDO0lBQzNDLENBQUMsQ0FBQyxDQUFDO0lBRUgsdUNBQXVDLEVBQUUsQ0FBQztBQUMzQyxDQUFDLENBQUMsQ0FBQyJ9