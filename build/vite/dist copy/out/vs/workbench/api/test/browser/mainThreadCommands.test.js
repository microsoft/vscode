/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { MainThreadCommands } from '../../browser/mainThreadCommands.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
suite('MainThreadCommands', function () {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('dispose on unregister', function () {
        const commands = new MainThreadCommands(SingleProxyRPCProtocol(null), undefined, new class extends mock() {
        });
        assert.strictEqual(CommandsRegistry.getCommand('foo'), undefined);
        // register
        commands.$registerCommand('foo');
        assert.ok(CommandsRegistry.getCommand('foo'));
        // unregister
        commands.$unregisterCommand('foo');
        assert.strictEqual(CommandsRegistry.getCommand('foo'), undefined);
        commands.dispose();
    });
    test('unregister all on dispose', function () {
        const commands = new MainThreadCommands(SingleProxyRPCProtocol(null), undefined, new class extends mock() {
        });
        assert.strictEqual(CommandsRegistry.getCommand('foo'), undefined);
        commands.$registerCommand('foo');
        commands.$registerCommand('bar');
        assert.ok(CommandsRegistry.getCommand('foo'));
        assert.ok(CommandsRegistry.getCommand('bar'));
        commands.dispose();
        assert.strictEqual(CommandsRegistry.getCommand('foo'), undefined);
        assert.strictEqual(CommandsRegistry.getCommand('bar'), undefined);
    });
    test('activate and throw when needed', async function () {
        const activations = [];
        const runs = [];
        const commands = new MainThreadCommands(SingleProxyRPCProtocol(null), new class extends mock() {
            executeCommand(id) {
                runs.push(id);
                return Promise.resolve(undefined);
            }
        }, new class extends mock() {
            activateByEvent(id) {
                activations.push(id);
                return Promise.resolve();
            }
        });
        // case 1: arguments and retry
        try {
            activations.length = 0;
            await commands.$executeCommand('bazz', [1, 2, { n: 3 }], true);
            assert.ok(false);
        }
        catch (e) {
            assert.deepStrictEqual(activations, ['onCommand:bazz']);
            assert.strictEqual(e.message, '$executeCommand:retry');
        }
        // case 2: no arguments and retry
        runs.length = 0;
        await commands.$executeCommand('bazz', [], true);
        assert.deepStrictEqual(runs, ['bazz']);
        // case 3: arguments and no retry
        runs.length = 0;
        await commands.$executeCommand('bazz', [1, 2, true], false);
        assert.deepStrictEqual(runs, ['bazz']);
        commands.dispose();
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZENvbW1hbmRzLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL3Rlc3QvYnJvd3Nlci9tYWluVGhyZWFkQ29tbWFuZHMudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDekUsT0FBTyxFQUFFLGdCQUFnQixFQUFtQixNQUFNLGtEQUFrRCxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBRXRFLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUM1RCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUVoRyxLQUFLLENBQUMsb0JBQW9CLEVBQUU7SUFFM0IsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxJQUFJLENBQUMsdUJBQXVCLEVBQUU7UUFFN0IsTUFBTSxRQUFRLEdBQUcsSUFBSSxrQkFBa0IsQ0FBQyxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxTQUFVLEVBQUUsSUFBSSxLQUFNLFNBQVEsSUFBSSxFQUFxQjtTQUFJLENBQUMsQ0FBQztRQUNuSSxNQUFNLENBQUMsV0FBVyxDQUFDLGdCQUFnQixDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUVsRSxXQUFXO1FBQ1gsUUFBUSxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ2pDLE1BQU0sQ0FBQyxFQUFFLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFFOUMsYUFBYTtRQUNiLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxL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