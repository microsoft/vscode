/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { NoneExecuteStrategy } from '../../browser/executeStrategy/noneExecuteStrategy.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
suite('NoneExecuteStrategy', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    function createLogService() {
        return new class extends NullLogService {
            constructor() {
                super(...arguments);
                this._logBrand = undefined;
            }
        };
    }
    /**
     * Creates a mock terminal instance and xterm for testing NoneExecuteStrategy.
     *
     * @param contentsAsText The text that `xterm.getContentsAsText()` will return (simulates
     * the terminal buffer content between the start and end markers)
     * @param cursorLineText The text at the cursor line, used by prompt detection heuristics
     */
    function createMockTerminalAndXterm(contentsAsText, cursorLineText) {
        const onDataEmitter = store.add(new Emitter());
        const activeBuffer = {};
        const alternateBuffer = {}; // different object → not alt buffer
        const mockXterm = {
            raw: {
                registerMarker: () => ({
                    line: 0,
                    isDisposed: false,
                    onDispose: Event.None,
                    dispose: () => { },
                }),
                buffer: {
                    active: {
                        ...activeBuffer,
                        baseY: 0,
                        cursorY: 1,
                        getLine: () => ({
                            translateToString: () => cursorLineText,
                        }),
                    },
                    alternate: alternateBuffer,
                    onBufferChange: () => ({ dispose: () => { } }),
                },
                onWriteParsed: Event.None,
            },
            getContentsAsText: () => contentsAsText,
        };
        const mockInstance = {
            xtermReadyPromise: Promise.resolve(mockXterm),
            onData: onDataEmitter.event,
            sendText: () => { },
        };
        return { instance: mockInstance, onDataEmitter };
    }
    test('should report "Command produced no output" when output is empty', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        // Simulate a command that produces no output. Between the start and end markers,
        // getContentsAsText returns only whitespace (no actual command output).
        const { instance } = createMockTerminalAndXterm('   \n   \n   ', // only whitespace between markers
        'user@host:~$ ' // prompt at cursor line → triggers prompt detection
        );
        const logService = createLogService();
        const configService = new TestConfigurationService();
        const strategy = store.add(new NoneExecuteStrategy(instance, () => false, configService, logService));
        const cts = store.add(new CancellationTokenSource());
        const result = await strategy.execute('echo test', cts.token);
        assert.strictEqual(result.additionalInformation, 'Command produced no output');
    }));
    test('should not leak sandbox command echo as output when command produces no output', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        // This simulates the exact scenario from issue #303531:
        // A sandboxed command produces no output, but getContentsAsText returns the
        // prompt + sandbox-wrapped command echo + next prompt line.
        const promptLine = '[ user@host:~/src (main) ] $ ';
        const sandboxCommandEcho = 'ELECTRON_RUN_AS_NODE=1 PATH="$PATH:/app/node_modules/@vscode/ripgrep/bin" '
            + 'TMPDIR="/var/folders/bb/_8jjjyy971x2frm3nr3g7m4r0000gn/T" '
            + '"/app/Contents/MacOS/Code - Insiders" "/app/Contents/Resources/app/node_modules/@anthropic-ai/sandbox-runtime/dist/cli.js" '
            + '--settings "/var/folders/bb/_8jjjyy971x2frm3nr3g7m4r0000gn/T/vscode-sandbox-settings.json" '
            + '-c \' git diff 0e5d5949d13f..2c357a926df6 -- \'\\\'\'src/foo.ts\'\\\'\' | grep -A3 -B3 \'\\\'\'someFunc\'\\\'\'\'';
        const terminalContent = `${promptLine}${sandboxCommandEcho}\n${' '.repeat(80)}\n${promptLine}`;
        const { instance } = createMockTerminalAndXterm(terminalContent, promptLine // prompt at cursor line → triggers prompt detection
        );
        const logService = createLogService();
        const configService = new TestConfigurationService();
        const strategy = store.add(new NoneExecuteStrategy(instance, () => false, configService, logService));
        const cts = store.add(new CancellationTokenSource());
        const result = await strategy.execute('git diff 0e5d5949d13f..2c357a926df6 -- \'src/foo.ts\' | grep -A3 -B3 \'someFunc\'', cts.token);
        // The output should NOT contain sandbox wrapper artifacts
        assert.strictEqual(result.output?.includes('sandbox-runtime') ?? false, false, 'Output should not leak sandbox-runtime path');
        assert.strictEqual(result.output?.includes('ELECTRON_RUN_AS_NODE') ?? false, false, 'Output should not leak ELECTRON_RUN_AS_NODE');
        // Should report that the command produced no output
        assert.strictEqual(result.additionalInformation, 'Command produced no output');
    }));
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm9uZUV4ZWN1dGVTdHJhdGVneS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL2NoYXRBZ2VudFRvb2xzL3Rlc3QvYnJvd3Nlci9ub25lRXhlY3V0ZVN0cmF0ZWd5LnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDeEUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBRTlFLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQy9GLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBRTNGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGtGQUFrRixDQUFDO0FBRTVILEtBQUssQ0FBQyxxQkFBcUIsRUFBRSxHQUFHLEVBQUU7SUFDakMsTUFBTSxLQUFLLEdBQUcsdUNBQXVDLEVBQUUsQ0FBQztJQUV4RCxTQUFTLGdCQUFnQjtRQUN4QixPQUFPLElBQUksS0FBTSxTQUFRLGNBQWM7WUFBNUI7O2dCQUF3QyxjQUFTLEdBQUcsU0FBUyxDQUFDO1lBQUMsQ0FBQztTQUFBLENBQUM7SUFDN0UsQ0FBQztJQUVEOzs7Ozs7T0FNRztJQUNILFNBQVMsMEJBQTBCLENBQUMsY0FBc0IsRUFBRSxjQUFzQjtRQUlqRixNQUFNLGFBQWEsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksT0FBTyxFQUFV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