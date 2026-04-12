/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { prepareCommand } from '../../node/terminals.js';
suite('Debug - prepareCommand', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('bash', () => {
        assert.strictEqual(prepareCommand('bash', ['{$} ('], false).trim(), '\\{\\$\\}\\ \\(');
        assert.strictEqual(prepareCommand('bash', ['hello', 'world', '--flag=true'], false).trim(), 'hello world --flag=true');
        assert.strictEqual(prepareCommand('bash', [' space arg '], false).trim(), '\\ space\\ arg\\');
        assert.strictEqual(prepareCommand('bash', ['{$} ('], true).trim(), '{$} (');
        assert.strictEqual(prepareCommand('bash', ['hello', 'world', '--flag=true'], true).trim(), 'hello world --flag=true');
        assert.strictEqual(prepareCommand('bash', [' space arg '], true).trim(), 'space arg');
    });
    test('bash - do not escape > and <', () => {
        assert.strictEqual(prepareCommand('bash', ['arg1', '>', '> hello.txt', '<', '<input.in'], false).trim(), 'arg1 > \\>\\ hello.txt < \\<input.in');
    });
    test('cmd', () => {
        assert.strictEqual(prepareCommand('cmd.exe', ['^!< '], false).trim(), '"^^^!^< "');
        assert.strictEqual(prepareCommand('cmd.exe', ['hello', 'world', '--flag=true'], false).trim(), 'hello world --flag=true');
        assert.strictEqual(prepareCommand('cmd.exe', [' space arg '], false).trim(), '" space arg "');
        assert.strictEqual(prepareCommand('cmd.exe', ['"A>0"'], false).trim(), '"""A^>0"""');
        assert.strictEqual(prepareCommand('cmd.exe', [''], false).trim(), '""');
        assert.strictEqual(prepareCommand('cmd.exe', ['^!< '], true).trim(), '^!<');
        assert.strictEqual(prepareCommand('cmd.exe', ['hello', 'world', '--flag=true'], true).trim(), 'hello world --flag=true');
        assert.strictEqual(prepareCommand('cmd.exe', [' space arg '], true).trim(), 'space arg');
        assert.strictEqual(prepareCommand('cmd.exe', ['"A>0"'], true).trim(), '"A>0"');
        assert.strictEqual(prepareCommand('cmd.exe', [''], true).trim(), '');
    });
    test('cmd - do not escape > and <', () => {
        assert.strictEqual(prepareCommand('cmd.exe', ['arg1', '>', '> hello.txt', '<', '<input.in'], false).trim(), 'arg1 > "^> hello.txt" < ^<input.in');
    });
    test('powershell', () => {
        assert.strictEqual(prepareCommand('powershell', ['!< '], false).trim(), `& '!< '`);
        assert.strictEqual(prepareCommand('powershell', ['hello', 'world', '--flag=true'], false).trim(), `& 'hello' 'world' '--flag=true'`);
        assert.strictEqual(prepareCommand('powershell', [' space arg '], false).trim(), `& ' space arg '`);
        assert.strictEqual(prepareCommand('powershell', ['"A>0"'], false).trim(), `& '"A>0"'`);
        assert.strictEqual(prepareCommand('powershell', [''], false).trim(), `& ''`);
        assert.strictEqual(prepareCommand('powershell', ['!< '], true).trim(), '!<');
        assert.strictEqual(prepareCommand('powershell', ['hello', 'world', '--flag=true'], true).trim(), 'hello world --flag=true');
        assert.strictEqual(prepareCommand('powershell', [' space arg '], true).trim(), 'space arg');
        assert.strictEqual(prepareCommand('powershell', ['"A>0"'], true).trim(), '"A>0"');
        assert.strictEqual(prepareCommand('powershell', [''], true).trim(), ``);
    });
    test('powershell - do not escape > and <', () => {
        assert.strictEqual(prepareCommand('powershell', ['arg1', '>', '> hello.txt', '<', '<input.in'], false).trim(), `& 'arg1' > '> hello.txt' < '<input.in'`);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxzLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9kZWJ1Zy90ZXN0L25vZGUvdGVybWluYWxzLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUd6RCxLQUFLLENBQUMsd0JBQXdCLEVBQUUsR0FBRyxFQUFFO0lBQ3BDLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxHQUFHLEVBQUU7UUFDakIsTUFBTSxDQUFDLFdBQVcsQ0FDakIsY0FBYyxDQUFDLE1BQU0sRUFBRSxDQUFDLE9BQU8sQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDLElBQUksRUFBRSxFQUMvQyxpQkFBaUIsQ0FBQyxDQUFDO1FBQ3BCLE1BQU0sQ0FBQyxXQUFXLENBQ2pCLGNBQWMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxPQUFPLEVBQUUsT0FBTyxFQUFFLGFBQWEsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDLElBQUksRUFBRSxFQUN2RSx5QkFBeUIsQ0FBQyxDQUFDO1FBQzVCLE1BQU0sQ0FBQyxXQUFXLENBQ2pCLGNBQWMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxhQUFhLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFDckQsa0JBQWtCLENBQUMsQ0FBQztRQUVyQixNQUFNLENBQUMsV0FBVyxDQUNqQixjQUFjLENBQUMsTUFBTSxFQUFFLENBQUMsT0FBTyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQzlDLE9BQU8sQ0FBQyxDQUFDO1FBQ1Ys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