/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { collectTerminalResults } from '../../browser/taskHelpers.js';
import { OutputMonitorState } from '../../browser/tools/monitoring/types.js';
suite('Task Helpers', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('collectTerminalResults reads output from invocation start marker', async () => {
        const lines = ['old output', 'more old output', 'new output line 1', 'new output line 2'];
        let markerDisposed = false;
        const marker = {
            line: 2,
            dispose: () => { markerDisposed = true; }
        };
        const terminal = {
            instanceId: 1,
            title: 'task-terminal',
            shellLaunchConfig: { name: 'task-terminal' },
            registerMarker: () => marker,
            xterm: {
                raw: {
                    buffer: {
                        active: {
                            length: lines.length,
                            getLine: (y) => ({ translateToString: () => lines[y] })
                        }
                    }
                }
            }
        };
        const task = {
            _label: 'my-task',
            configurationProperties: {}
        };
        const invocationContext = {
            sessionResource: URI.parse('vscode-chat-session://test')
        };
        const instantiationService = {
            createInstance: (_ctor, execution) => {
                const didFinishEmitter = new Emitter();
                const monitor = {
                    onDidFinishCommand: didFinishEmitter.event,
                    pollingResult: {
                        output: execution.getOutput(),
                        pollDurationMs: 1,
                        state: OutputMonitorState.Idle
                    },
                    outputMonitorTelemetryCounters: {
                        inputToolManualAcceptCount: 0,
                        inputToolManualRejectCount: 0,
                        inputToolManualChars: 0,
                        inputToolAutoAcceptCount: 0,
                        inputToolAutoChars: 0,
                        inputToolManualShownCount: 0,
                        inputToolFreeFormInputShownCount: 0,
                        inputToolFreeFormInputCount: 0,
                    },
                    dispose: () => didFinishEmitter.dispose()
                };
                setTimeout(() => didFinishEmitter.fire(), 0);
                return monitor;
            }
        };
        const disposableStore = new DisposableStore();
        const results = await collectTerminalResults([terminal], task, instantiationService, invocationContext, { report: () => { } }, CancellationToken.None, disposableStore);
        disposableStore.dispose();
        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0].output, 'new output line 1\nnew output line 2');
        assert.strictEqual(markerDisposed, true);
    });
    test('collectTerminalResults uses provided pre-run marker when present', async () => {
        const lines = ['old output', 'new output line 1', 'new output line 2', '* Terminal will be reused by tasks, press any key to close it.'];
        let defaultMarkerDisposed = false;
        let preRunMarkerDisposed = false;
        const defaultMarker = {
            line: 3,
            dispose: () => { defaultMarkerDisposed = true; }
        };
        const preRunMarker = {
            id: 1,
            line: 1,
            isDisposed: false,
            onDispose: new Emitter().event,
            dispose: () => { preRunMarkerDisposed = true; }
        };
        const terminal = {
            instanceId: 1,
            title: 'task-terminal',
            shellLaunchConfig: { name: 'task-terminal' },
            registerMarker: () => defaultMarker,
            xterm: {
                raw: {
                    buffer: {
                        active: {
                            length: lines.length,
                            getLine: (y) => ({ translateToString: () => lines[y] })
                        }
                    }
                }
            }
        };
        const task = {
            _label: 'my-task',
            configurationProperties: {}
        };
        const invocationContext = {
            sessionResource: URI.parse('vscode-chat-session://test')
        };
        const instantiationService = {
            createInstance: (_ctor, execution) => {
                const didFinishEmitter = new Emitter();
                const monitor = {
                    onDidFinishCommand: didFinishEmitter.event,
                    pollingResult: {
                        output: execution.getOutput(),
                        pollDurationMs: 1,
                        state: OutputMonitorState.Idle
                    },
                    outputMonitorTelemetryCounters: {
                        inputToolManualAcceptCount: 0,
                        inputToolManualRejectCount: 0,
                        inputToolManualChars: 0,
                        inputToolAutoAcceptCount: 0,
                        inputToolAutoChars: 0,
                        inputToolManualShownCount: 0,
                        inputToolFreeFormInputShownCount: 0,
                        inputToolFreeFormInputCount: 0,
                    },
                    dispose: () => didFinishEmitter.dispose()
                };
                setTimeout(() => didFinishEmitter.fire(), 0);
                return monitor;
            }
        };
        const startMarkersByTerminalInstanceId = new Map();
        startMarkersByTerminalInstanceId.set(terminal.instanceId, preRunMarker);
        const disposableStore = new DisposableStore();
        const results = await collectTerminalResults([terminal], task, instantiationService, invocationContext, { report: () => { } }, CancellationToken.None, disposableStore, undefined, undefined, undefined, startMarkersByTerminalInstanceId);
        disposableStore.dispose();
        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0].output, 'new output line 1\nnew output line 2\n* Terminal will be reused by tasks, press any key to close it.');
        assert.strictEqual(preRunMarkerDisposed, true);
        assert.strictEqual(defaultMarkerDisposed, false);
    });
    test('collectTerminalResults reads full output when pre-run marker map has no marker for terminal', async () => {
        const lines = ['new output line 1', 'new output line 2', '* Terminal will be reused by tasks, press any key to close it.'];
        let defaultMarkerDisposed = false;
        const defaultMarker = {
            line: 1,
            dispose: () => { defaultMarkerDisposed = true; }
        };
        const terminal = {
            instanceId: 1,
            title: 'task-terminal',
            shellLaunchConfig: { name: 'task-terminal' },
            registerMarker: () => defaultMarker,
            xterm: {
                raw: {
                    buffer: {
                        active: {
                            length: lines.length,
                            getLine: (y) => ({ translateToString: () => lines[y] })
                        }
                    }
                }
            }
        };
        const task = {
            _label: 'my-task',
            configurationProperties: {}
        };
        const invocationContext = {
            sessionResource: URI.parse('vscode-chat-session://test')
        };
        const instantiationService = {
            createInstance: (_ctor, execution) => {
                const didFinishEmitter = new Emitter();
                const monitor = {
                    onDidFinishCommand: didFinishEmitter.event,
                    pollingResult: {
                        output: execution.getOutput(),
                        pollDurationMs: 1,
                        state: OutputMonitorState.Idle
                    },
                    outputMonitorTelemetryCounters: {
                        inputToolManualAcceptCount: 0,
                        inputToolManualRejectCount: 0,
                        inputToolManualChars: 0,
                        inputToolAutoAcceptCount: 0,
                        inputToolAutoChars: 0,
                        inputToolManualShownCount: 0,
                        inputToolFreeFormInputShownCount: 0,
                        inputToolFreeFormInputCount: 0,
                    },
                    dispose: () => didFinishEmitter.dispose()
                };
                setTimeout(() => didFinishEmitter.fire(), 0);
                return monitor;
            }
        };
        const startMarkersByTerminalInstanceId = new Map();
        const disposableStore = new DisposableStore();
        const results = await collectTerminalResults([terminal], task, instantiationService, invocationContext, { report: () => { } }, CancellationToken.None, disposableStore, undefined, undefined, undefined, startMarkersByTerminalInstanceId);
        disposableStore.dispose();
        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0].output, 'new output line 1\nnew output line 2\n* Terminal will be reused by tasks, press any key to close it.');
        assert.strictEqual(defaultMarkerDisposed, false);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGFza0hlbHBlcnMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy90ZXN0L2Jyb3dzZXIvdGFza0hlbHBlcnMudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUNqQyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUNsRixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUUzRCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUl0RyxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUN0RSxPQUFPLEVBQWMsa0JBQWtCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUV6RixLQUFLLENBQUMsY0FBYyxFQUFFLEdBQUcsRUFBRTtJQUMxQix1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLElBQUksQ0FBQyxrRUFBa0UsRUFBRSxLQUFLLElBQUksRUFBRTtRQUNuRixNQUFNLEtBQUssR0FBRyxDQUFDLFlBQVksRUFBRSxpQkFBaUIsRUFBRSxtQkFBbUIsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO1FBQzFGLElBQUksY0FBYyxHQUFHLEtBQUssQ0FBQztRQUMzQixNQUFNLE1BQU0sR0FBRztZQUNkLElBQUksRUFBRSxDQUFDO1lBQ1AsT0FBTyxFQUFFLEdBQUcsRUFBRSxHQUFHLGNBQWMsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDO1NBQ3pDLENBQUM7UUFDRixNQUFNLFFBQVEsR0FBRztZQUNoQixVQUFVLEVBQUUsQ0FBQztZQUNiLEtBQUssRUFBRSxlQUFlO1lBQ3RCLGlCQUFpQixFQUFFLEVBQUUsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUM1QyxjQUFjLEVBQUUsR0FBRyxFQUFFLENBQUMsTUFBTTtZQUM1QixLQUFLLEVBQUU7Z0JBQ04sR0FBRyxFQUFFO29CQUNKLE1BQU0sRUFBRTt3QkFDUCxNQUFNLEVBQUU7NEJBQ1AsTUFBTSxFQUFFLEtBQUssQ0FBQyxNQUFNOzRCQUNwQixPQUFPLEVBQUUsQ0FBQyxDQUFTLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxpQkFBaUIsRUFBRSxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQzt5QkFDL0Q7cUJBQ0Q7aUJBQ0Q7YUFDRDtTQUMrQixDQUFDO1FBQ2xDLE1BQU0sSUFBSSxHQUFHO1lBQ1osTUFBTSxFQUFFLFNBQVM7WUFDakIsdUJBQXVCLEVBQUUsRUFBRTtTQUNuQixDQUFDO1FBQ1YsTUFBTSxpQkFBaUIsR0FBMkI7WUFDakQsZUFBZSxFQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsNEJBQTRCLENBQUM7U0FDeEQsQ0FBQztRQUNGLE1BQU0sb0JBQW9CLEdBQUc7WUFDNUIsY0FBYyxFQUFFLENBQUMsS0FBYyxFQUFFLFNBQXFCLEVBQUUsRUFBRTtnQkFDekQsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLE9BQU8sRUFBUSxDQUFDO2dCQUM3QyxNQUFNLE9BQU8sR0FBRztvQkFDZixrQkFBa0IsRUFBRSxnQkFBZ0IsQ0FBQyxLQUFLO29CQUMxQyxhQUFhLEVBQUU7d0JBQ2QsTUFBTSxFQUFFLFNBQVMsQ0FBQyxTQUFTLEVBQUU7d0JBQzdCLGNBQWMsRUFBRSxDQUFDO3dCQUNqQixLQUFLLEVBQUUsa0JBQWtCLENBQUMsSUFBSTtxQkFDOUI7b0JBQ0QsOEJBQThCLEVBQUU7d0JBQy9CLDBCQUEwQixFQUFFLENBQUM7d0JBQzdCLDBCQUEwQixFQUFFLENBQUM7d0JBQzdCLG9CQUFvQixFQUFFLENBQUM7d0JBQ3ZCLHdCQUF3QixFQUFFLENBQUM7d0JBQzNCLGtCQUFrQixFQUFFLENBQUM7d0JBQ3JCLHlCQUF5QixFQUFFLENBQUM7d0JBQzVCLGdDQUFnQyxFQUFFLENBQUM7d0JBQ25DLDJCQUEyQixFQUFFLENBQUM7cUJBQzlCO29CQUNELE9BQU8sRUFBRSxHQUFHLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUU7aUJBQ3pDLENBQUM7Z0JBQ0YsVUFBVSxDQUFDLEdBQUcsRUFBRSxDQUFDLGdCQUFnQixDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUM3QyxPQUFPLE9BQU8sQ0FBQztZQUNoQixDQUFDO1NBQ21DLENBQUM7UUFFdEMsTUFBTSxlQUFlLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUM5QyxNQUFNLE9BQU8sR0FBRyxNQUFNLHNCQUFzQixDQUMzQyxDQUFDLFFBQVEsQ0FBQyxFQUNWLElBQUksRUFDSixvQkFBb0IsRUFDcEIsaUJBQWlCLEVBQ2pCLEVBQUUsTUFBTSxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFBRSxFQUNyQixpQkFBaUIsQ0FBQyxJQUFJLEVBQ3RCLGVBQWUsQ0FDZixDQUFDO1FBQ0YsZUFBZSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBRTFCLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN0QyxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLEVBQUUsc0NBQXNDLENBQUMsQ0FBQztRQUM5RSxNQUFNLENBQUMsV0FBVyxDQUFDLGNBQWMsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUMxQyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxrRUFBa0UsRUFBRSxLQUFLLElBQUksRUFBRTtRQUNuRixNQUFNLEtBQUssR0FBRyxDQUFDLFlBQVksRUFBRSxtQkFBbUIsRUFBRSxtQkFBbUIsRUFBRSxnRUFBZ0UsQ0FBQyxDQUFDO1FBQ3pJLElBQUkscUJBQXFCLEdBQUcsS0FBSyxDQUFDO1FBQ2xDLElBQUksb0JBQW9CLEdBQUcsS0FBSyxDQUFDO1FBQ2pDLE1BQU0sYUFBYSxHQUFHO1lBQ3JCLElBQUksRUFBRSxDQUFDO1lBQ1AsT0FBTyxFQUFFLEdBQUcsRUFBRSxHQUFHLHFCQUFxQixHQUFHLElBQUksQ0FBQyxDQUFDLENBQUM7U0FDaEQsQ0FBQztRQUNGLE1BQU0sWUFBWSxHQUFHO1lBQ3BCLEVBQUUsRUFBRSxDQUFDO1lBQ0wsSUFBSSxFQUFFLENBQUM7WUFDUCxVQUFVLEVBQUUsS0FBSztZQUNqQixTQUFTLEVBQUUsSUFBSSxPQUFPLEVBQVEsQ0FBQyxLQUFLO1lBQ3BDLE9BQU8sRUFBRSxHQUFHLEVBQUUsR0FBRyxvQkFBb0IsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDO1NBQy9DLENBQUM7UUFDRixNQUFNLFFBQVEsR0FBRztZQUNoQixVQUFVLEVBQUUsQ0FBQztZQUNiLEtBQUssRUFBRSxlQUFlO1lBQ3RCLGlCQUFpQixFQUFFLEVBQUUsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUM1QyxjQUFjLEVBQUUsR0FBRyxFQUFFLENBQUMsYUFBYTtZQUNuQyxLQUFLLEVBQUU7Z0JBQ04sR0FBRyxFQUFFO29CQUNKLE1BQU0sRUFBRTt3QkFDUCxNQUFNLEVBQUU7NEJBQ1AsTUFBTSxFQUFFLEtBQUssQ0FBQyxNQUFNOzRCQUNwQixPQUFPLEVBQUUsQ0FBQyxDQUFTLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxpQkFBaUIsRUFBRSxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQzt5QkFDL0Q7cUJBQ0Q7aUJBQ0Q7YUFDRDtTQUMrQixDQUFDO1FBQ2xDLE1BQU0sSUFBSSxHQUFHO1lBQ1osTUFBTSxFQUFFLFNBQVM7WUFDakIsdUJBQXVCLEVBQUUsRUFBRTtTQUNuQixDQUFDO1FBQ1YsTUFBTSxpQkFBaUIsR0FBMkI7WUFDakQsZUFBZSxFQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsNEJBQTRCLENBQUM7U0FDeEQsQ0FBQztRQUNGLE1BQU0sb0JBQW9CLEdBQUc7WUFDNUIsY0FBYyxFQUFFLENBQUMsS0FBYyxFQUFFLFNBQXFCLEVBQUUsRUFBRTtnQkFDekQsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLE9BQU8sRUFBUSxDQUFDO2dCQUM3QyxNQUFNLE9BQU8sR0FBRztvQkFDZixrQkFBa0IsRUFBRSxnQkFBZ0IsQ0FBQyxLQUFLO29CQUMxQyxhQUFhLEVBQUU7d0JBQ2QsTUFBTSxFQUFFLFNBQVMsQ0FBQyxTQUFTLEVBQUU7d0JBQzdCLGNBQWMsRUFBRSxDQUFDO3dCQUNqQixLQUFLLEVBQUUsa0JBQWtCLENBQUMsSUFBSTtxQkFDOUI7b0JBQ0QsOEJBQThCLEVBQUU7d0JBQy9CLDBCQUEwQixFQUFFLENBQUM7d0JBQzdCLDBCQUEwQixFQUFFLENBQUM7d0JBQzdCLG9CQUFvQixFQUFFLENBQUM7d0JBQ3ZCLHdCQUF3QixFQUFFLENBQUM7d0JBQzNCLGtCQUFrQixFQUFFLENBQUM7d0JBQ3JCLHlCQUF5QixFQUFFLENBQUM7d0JBQzVCLGdDQUFnQyxFQUFFLENBQUM7d0JBQ25DLDJCQUEyQixFQUFFLENBQUM7cUJBQzlCO29CQUNELE9BQU8sRUFBRSxHQUFHLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUU7aUJBQ3pDLENBQUM7Z0JBQ0YsVUFBVSxDQUFDLEdBQUcsRUFBRSxDQUFDLGdCQUFnQixDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUM3QyxPQUFPLE9BQU8sQ0FBQztZQUNoQixDQUFDO1NBQ21DLENBQUM7UUFFdEMsTUFBTSxnQ0FBZ0MsR0FBRyxJQUFJLEdBQUcsRUFBMkQsQ0FBQztRQUM1RyxnQ0FBZ0MsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLFVBQVUsRUFBRSxZQUErRCxDQUFDLENBQUM7UUFFM0gsTUFBTSxlQUFlLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUM5QyxNQUFNLE9BQU8sR0FBRyxNQUFNLHNCQUFzQixDQUMzQyxDQUFDLFFBQVEsQ0FBQyxFQUNWLElBQUksRUFDSixvQkFBb0IsRUFDcEIsaUJBQWlCLEVBQ2pCLEVBQUUsTUFBTSxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFBRSxFQUNyQixpQkFBaUIsQ0FBQyxJQUFJLEVBQ3RCLGVBQWUsRUFDZixTQUFTLEVBQ1QsU0FBUyxFQUNULFNBQVMsRUFDVCxnQ0FBZ0MsQ0FDaEMsQ0FBQztRQUNGLGVBQWUsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUUxQixNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDdEMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxFQUFFLHNHQUFzRyxDQUFDLENBQUM7UUFDOUksTUFBTSxDQUFDLFdBQVcsQ0FBQyxvQkFBb0IsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUMvQyxNQUFNLENBQUMsV0FBVyxDQUFDLHFCQUFxQixFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ2xELENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDZGQUE2RixFQUFFLEtBQUssSUFBSSxFQUFFO1FBQzlHLE1BQU0sS0FBSyxHQUFHLENBQUMsbUJBQW1CLEVBQUUsbUJBQW1CLEVBQUUsZ0VBQWdFLENBQUMsQ0FBQztRQUMzSCxJQUFJLHFCQUFxQixHQUFHLEtBQUssQ0FBQztRQUNsQyxNQUFNLGFBQWEsR0FBRztZQUNyQixJQUFJLEVBQUUsQ0FBQztZQUNQLE9BQU8sRUFBRSxHQUFHLEVBQUUsR0FBRyxxQkFBcUIsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDO1NBQ2hELENBQUM7UUFDRixNQUFNLFFBQVEsR0FBRztZQUNoQixVQUFVLEVBQUUsQ0FBQztZQUNiLEtBQUssRUFBRSxlQUFlO1lBQ3RCLGlCQUFpQixFQUFFLEVBQUUsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUM1QyxjQUFjLEVBQUUsR0FBRyxFQUFFLENBQUMsYUFBYTtZQUNuQyxLQUFLLEVBQUU7Z0JBQ04sR0FBRyxFQUFFO29CQUNKLE1BQU0sRUFBRTt3QkFDUCxNQUFNLEVBQUU7NEJBQ1AsTUFBTSxFQUFFLEtBQUssQ0FBQyxNQUFNOzRCQUNwQixPQUFPLEVBQUUsQ0FBQyxDQUFTLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxpQkFBaUIsRUFBRSxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQzt5QkFDL0Q7cUJBQ0Q7aUJBQ0Q7YUFDRDtTQUMrQixDQUFDO1FBQ2xDLE1BQU0sSUFBSSxHQUFHO1lBQ1osTUFBTSxFQUFFLFNBQVM7WUFDakIsdUJBQXVCLEVBQUUsRUFBRTtTQUNuQixDQUFDO1FBQ1YsTUFBTSxpQkFBaUIsR0FBMkI7WUFDakQsZUFBZSxFQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsNEJBQTRCLENBQUM7U0FDeEQsQ0FBQztRQUNGLE1BQU0sb0JBQW9CLEdBQUc7WUFDNUIsY0FBYyxFQUFFLENBQUMsS0FBYyxFQUFFLFNBQXFCLEVBQUUsRUFBRTtnQkFDekQsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLE9BQU8sRUFBUSxDQUFDO2dCQUM3QyxNQUFNLE9BQU8sR0FBRztvQkFDZixrQkFBa0IsRUFBRSxnQkFBZ0IsQ0FBQyxLQUFLO29CQUMxQyxhQUFhLEVBQUU7d0JBQ2QsTUFBTSxFQUFFLFNBQVMsQ0FBQyxTQUFTLEVBQUU7d0JBQzdCLGNBQWMsRUFBRSxDQUFDO3dCQUNqQixLQUFLLEVBQUUsa0JBQWtCLENBQUMsSUFBSTtxQkFDOUI7b0JBQ0QsOEJBQThCLEVBQUU7d0JBQy9CLDBCQUEwQixFQUFFLENBQUM7d0JBQzdCLDBCQUEwQixFQUFFLENBQUM7d0JBQzdCLG9CQUFvQixFQUFFLENBQUM7d0JBQ3ZCLHdCQUF3QixFQUFFLENBQUM7d0JBQzNCLGtCQUFrQixFQUFFLENBQUM7d0JBQ3JCLHlCQUF5QixFQUFFLENBQUM7d0JBQzVCLGdDQUFnQyxFQUFFLENBQUM7d0JBQ25DLDJCQUEyQixFQUFFLENBQUM7cUJBQzlCO29CQUNELE9BQU8sRUFBRSxHQUFHLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUU7aUJBQ3pDLENBQUM7Z0JBQ0YsVUFBVSxDQUFDLEdBQUcsRUFBRSxDQUFDLGdCQUFnQixDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUM3QyxPQUFPLE9BQU8sQ0FBQztZQUNoQixDQUFDO1NBQ21DLENBQUM7UUFFdEMsTUFBTSxnQ0FBZ0MsR0FBRyxJQUFJLEdBQUcsRUFBMkQsQ0FBQztRQUU1RyxNQUFNLGVBQWUsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBQzlDLE1BQU0sT0FBTyxHQUFHLE1BQU0sc0JBQXNCLENBQzNDLENBQUMsUUFBUSxDQUFDLEVBQ1YsSUFBSSxFQUNKLG9CQUFvQixFQUNwQixpQkFBaUIsRUFDakIsRUFBRSxNQUFNLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLEVBQ3JCLGlCQUFpQixDQUFDLElBQUksRUFDdEIsZUFBZSxFQUNmLFNBQVMsRUFDVCxTQUFTLEVBQ1QsU0FBUyxFQUNULGdDQUFnQyxDQUNoQyxDQUFDO1FBQ0YsZUFBZSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBRTFCLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN0QyxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLEVBQUUsc0dBQXNHLENBQUMsQ0FBQztRQUM5SSxNQUFNLENBQUMsV0FBVyxDQUFDLHFCQUFxQixFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ2xELENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUMifQ==