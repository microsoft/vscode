/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as terminalEncoding from '../../../../../../base/node/terminalEncoding.js';
import * as encoding from '../../../common/encoding.js';
suite('Encoding', function () {
    this.timeout(10000);
    test('resolve terminal encoding (detect)', async function () {
        const enc = await terminalEncoding.resolveTerminalEncoding();
        assert.ok(enc.length > 0);
    });
    test('resolve terminal encoding (environment)', async function () {
        process.env['VSCODE_CLI_ENCODING'] = 'utf16le';
        const enc = await terminalEncoding.resolveTerminalEncoding();
        assert.ok(await encoding.encodingExists(enc));
        assert.strictEqual(enc, 'utf16le');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW5jb2RpbmcuaW50ZWdyYXRpb25UZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3RleHRmaWxlL3Rlc3Qvbm9kZS9lbmNvZGluZy9lbmNvZGluZy5pbnRlZ3JhdGlvblRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sS0FBSyxnQkFBZ0IsTUFBTSxpREFBaUQsQ0FBQztBQUNwRixPQUFPLEtBQUssUUFBUSxNQUFNLDZCQUE2QixDQUFDO0FBRXhELEtBQUssQ0FBQyxVQUFVLEVBQUU7SUFFakIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUVwQixJQUFJLENBQUMsb0NBQW9DLEVBQUUsS0FBSztRQUMvQyxNQUFNLEdBQUcsR0FBRyxNQUFNLGdCQUFnQixDQUFDLHVCQUF1QixFQUFFLENBQUM7UUFDN0QsTUFBTSxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQzNCLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHlDQUF5QyxFQUFFLEtBQUs7UUFDcEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxHQUFHLFNBQVMsQ0FBQztRQUUvQyxNQUFNLEdBQUcsR0FBRyxNQUFNLGdCQUFnQixDQUFDLHVCQUF1QixFQUFFLENBQUM7UUFDN0QsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLFFBQVEsQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUM5QyxNQUFNLENBQUMsV0FBVyxDQUFDLEdBQUcsRUFBRSxTQUFTLENBQUMsQ0FBQztJQUNwQyxDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDIn0=