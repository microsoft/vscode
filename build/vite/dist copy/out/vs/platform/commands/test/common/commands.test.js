/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { combinedDisposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../common/commands.js';
suite('Command Tests', function () {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('register command - no handler', function () {
        assert.throws(() => CommandsRegistry.registerCommand('foo', null));
    });
    test('register/dispose', () => {
        const command = function () { };
        const reg = CommandsRegistry.registerCommand('foo', command);
        assert.ok(CommandsRegistry.getCommand('foo').handler === command);
        reg.dispose();
        assert.ok(CommandsRegistry.getCommand('foo') === undefined);
    });
    test('register/register/dispose', () => {
        const command1 = function () { };
        const command2 = function () { };
        // dispose overriding command
        let reg1 = CommandsRegistry.registerCommand('foo', command1);
        assert.ok(CommandsRegistry.getCommand('foo').handler === command1);
        let reg2 = CommandsRegistry.registerCommand('foo', command2);
        assert.ok(CommandsRegistry.getCommand('foo').handler === command2);
        reg2.dispose();
        assert.ok(CommandsRegistry.getCommand('foo').handler === command1);
        reg1.dispose();
        assert.ok(CommandsRegistry.getCommand('foo') === undefined);
        // dispose override command first
        reg1 = CommandsRegistry.registerCommand('foo', command1);
        reg2 = CommandsRegistry.registerCommand('foo', command2);
        assert.ok(CommandsRegistry.getCommand('foo').handler === command2);
        reg1.dispose();
        assert.ok(CommandsRegistry.getCommand('foo').handler === command2);
        reg2.dispose();
        assert.ok(CommandsRegistry.getCommand('foo') === undefined);
    });
    test('command with description', function () {
        const r1 = CommandsRegistry.registerCommand('test', function (accessor, args) {
            assert.ok(typeof args === 'string');
        });
        const r2 = CommandsRegistry.registerCommand('test2', function (accessor, args) {
            assert.ok(typeof args === 'string');
        });
        const r3 = CommandsRegistry.registerCommand({
            id: 'test3',
            handler: function (accessor, args) {
                return true;
            },
            metadata: {
                description: 'a command',
                args: [{ name: 'value', constraint: Number }]
            }
        });
        CommandsRegistry.getCommands().get('test').handler.apply(undefined, [undefined, 'string']);
        CommandsRegistry.getCommands().get('test2').handler.apply(undefined, [undefined, 'string']);
        assert.throws(() => CommandsRegistry.getCommands().get('test3').handler.apply(undefined, [undefined, 'string']));
        assert.strictEqual(CommandsRegistry.getCommands().get('test3').handler.apply(undefined, [undefined, 1]), true);
        combinedDisposable(r1, r2, r3).dispose();
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWFuZHMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2NvbW1hbmRzL3Rlc3QvY29tbW9uL2NvbW1hbmRzLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFDaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzFFLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBRTVELEtBQUssQ0FBQyxlQUFlLEVBQUU7SUFFdEIsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxJQUFJLENBQUMsK0JBQStCLEVBQUU7UUFDckMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxlQUFlLENBQUMsS0FBSyxFQUFFLElBQUssQ0FBQyxDQUFDLENBQUM7SUFDckUsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsa0JBQWtCLEVBQUUsR0FBRyxFQUFFO1FBQzdCLE1BQU0sT0FBTyxHQUFHLGNBQWMsQ0FBQyxDQUFDO1FBQ2hDLE1BQU0sR0FBRyxHQUFHLGdCQUFnQixDQUFDLGVBQWUsQ0FBQyxLQUFLLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDN0QsTUFBTSxDQUFDLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFFLENBQUMsT0FBTyxLQUFLLE9BQU8sQ0FBQyxDQUFDO1FBQ25FLEdBQUcsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNkLE1BQU0sQ0FBQyxFQUFFLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxLQUFLLFNBQVMsQ0FBQyxDQUFDO0lBQzdELENBQUMs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