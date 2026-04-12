/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { deepStrictEqual, strictEqual } from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ITerminalInstanceService, ITerminalService } from '../../browser/terminal.js';
import { TerminalProcessManager } from '../../browser/terminalProcessManager.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
class TestTerminalChildProcess {
    get capabilities() { return []; }
    constructor(shouldPersist) {
        this.shouldPersist = shouldPersist;
        this.id = 0;
        this.onDidChangeProperty = Event.None;
        this.onProcessData = Event.None;
        this.onProcessExit = Event.None;
        this.onProcessReady = Event.None;
        this.onProcessTitleChanged = Event.None;
        this.onProcessShellTypeChanged = Event.None;
    }
    updateProperty(property, value) {
        throw new Error('Method not implemented.');
    }
    async start() { return undefined; }
    shutdown(immediate) { }
    input(data) { }
    sendSignal(signal) { }
    resize(cols, rows) { }
    clearBuffer() { }
    acknowledgeDataEvent(charCount) { }
    async setUnicodeVersion(version) { }
    async getInitialCwd() { return ''; }
    async getCwd() { return ''; }
    async processBinary(data) { }
    refreshProperty(property) { return Promise.resolve(''); }
}
class TestTerminalInstanceService {
    constructor() {
        this.ptyHostRestartEmitter = new Emitter();
    }
    async getBackend() {
        return {
            onPtyHostExit: Event.None,
            onPtyHostUnresponsive: Event.None,
            onPtyHostResponsive: Event.None,
            onPtyHostRestart: this.ptyHostRestartEmitter.event,
            onDidMoveWindowInstance: Event.None,
            onDidRequestDetach: Event.None,
            createProcess: (shellLaunchConfig, cwd, cols, rows, unicodeVersion, env, options, shouldPersist) => new TestTerminalChildProcess(shouldPersist),
            getLatency: () => Promise.resolve([]),
            getShellEnvironment: () => Promise.resolve({})
        };
    }
}
suite('Workbench - TerminalProcessManager', () => {
    let manager;
    let terminalInstanceService;
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    setup(async () => {
        const instantiationService = workbenchInstantiationService(undefined, store);
        const configurationService = instantiationService.get(IConfigurationService);
        await configurationService.setUserConfiguration('editor', { fontFamily: 'foo' });
        await configurationService.setUserConfiguration('terminal', {
            integrated: {
                fontFamily: 'bar',
                enablePersistentSessions: true,
                shellIntegration: {
                    enabled: false
                }
            }
        });
        configurationService.onDidChangeConfigurationEmitter.fire({
            affectsConfiguration: () => true,
        });
        terminalInstanceService = new TestTerminalInstanceService();
        store.add(terminalInstanceService.ptyHostRestartEmitter);
        instantiationService.stub(ITerminalInstanceService, terminalInstanceService);
        instantiationService.stub(ITerminalService, { setNextCommandId: async () => { } });
        manager = store.add(instantiationService.createInstance(TerminalProcessManager, 1, undefined, undefined, undefined));
    });
    suite('process persistence', () => {
        suite('local', () => {
            test('regular terminal should persist', async () => {
                const p = await manager.createProcess({}, 1, 1, false);
                strictEqual(p, undefined);
                strictEqual(manager.shouldPersist, true);
            });
            test('task terminal should not persist', async () => {
                const p = await manager.createProcess({
                    isFeatureTerminal: true
                }, 1, 1, false);
                strictEqual(p, undefined);
                strictEqual(manager.shouldPersist, false);
            });
        });
        suite('remote', () => {
            const remoteCwd = URI.from({
                scheme: Schemas.vscodeRemote,
                path: 'test/cwd'
            });
            test('regular terminal should persist', async () => {
                const p = await manager.createProcess({
                    cwd: remoteCwd
                }, 1, 1, false);
                strictEqual(p, undefined);
                strictEqual(manager.shouldPersist, true);
            });
            test('task terminal should not persist', async () => {
                const p = await manager.createProcess({
                    isFeatureTerminal: true,
                    cwd: remoteCwd
                }, 1, 1, false);
                strictEqual(p, undefined);
                strictEqual(manager.shouldPersist, false);
            });
        });
    });
    suite('pty host restart', () => {
        async function fireRestartAndCaptureData(os, rows) {
            await manager.createProcess({}, 80, rows, false);
            manager.os = os;
            let captured;
            store.add(manager.onProcessData(e => captured = e.data));
            terminalInstanceService.ptyHostRestartEmitter.fire();
            return captured;
        }
        test('appends viewport-clearing newlines and ESC[H on Windows', async () => {
            const data = await fireRestartAndCaptureData(1 /* OperatingSystem.Windows */, 24);
            deepStrictEqual({ endsWithViewportClear: data.endsWith('\r\n'.repeat(23) + '\x1b[H') }, { endsWithViewportClear: true });
        });
        test('does not append viewport-clearing sequence on non-Windows', async () => {
            const data = await fireRestartAndCaptureData(3 /* OperatingSystem.Linux */, 24);
            deepStrictEqual({ containsCursorHome: data.includes('\x1b[H') }, { containsCursorHome: false });
        });
        test('does not append viewport-clearing sequence on Windows when rows is 0', async () => {
            const data = await fireRestartAndCaptureData(1 /* OperatingSystem.Windows */, 0);
            deepStrictEqual({ containsCursorHome: data.includes('\x1b[H') }, { containsCursorHome: false });
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxQcm9jZXNzTWFuYWdlci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvdGVzdC9icm93c2VyL3Rlcm1pbmFsUHJvY2Vzc01hbmFnZXIudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLFdBQVcsRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUN0RCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUVoRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLHFCQUFxQixFQUFrQyxNQUFNLCtEQUErRCxDQUFDO0FBR3RJLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ2pGLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBRWxHLE1BQU0sd0JBQXdCO0lBRTdCLElBQUksWUFBWSxLQUFLLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztJQUNqQyxZQUNVLGFBQXNCO1FBQXRCLGtCQUFhLEdBQWIsYUFBYSxDQUFTO1FBSGhDLE9BQUUsR0FBVyxDQUFDLENBQUM7UUFjZix3QkFBbUIsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBQ2pDLGtCQUFhLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztRQUMzQixrQkFBYSxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDM0IsbUJBQWMsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBQzVCLDBCQUFxQixHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDbkMsOEJBQXlCLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztJQWR2QyxDQUFDO0lBQ0QsY0FBYyxDQUFDLFFBQWEsRUFBRSxLQUFVO1FBQ3ZDLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQztJQUM1QyxDQUFDO0lBWUQsS0FBSyxDQUFDLEtBQUssS0FBeUIsT0FBTyxTQUFTLENBQUMsQ0FBQyxDQUFDO0lBQ3ZELFFBQVEsQ0FBQyxTQUFrQixJQUFVLENBQUM7SUFDdEMsS0FBSyxDQUFDLElBQVksSUFBVSxDQUFDO0lBQzdCLFVBQVUsQ0FBQyxNQUFjLElBQVUsQ0FBQztJQUNwQyxNQUFNLENBQUMsSUFBWSxFQUFFLElBQVksSUFBVSxDQUFDO0lBQzVDLFdBQVcsS0FBVyxDQUFDO0lBQ3ZCLG9CQUFvQixDQUFDLFNBQWlCLElBQVUsQ0FBQztJQUNqRCxLQUFLLENBQUMsaUJBQWlCLENBQUMsT0FBbUIsSUFBbUIsQ0FBQztJQUMvRCxLQUFLLENBQUMsYUFBYSxLQUFzQixPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDckQsS0FBSyxDQUFDLE1BQU0sS0FBc0IsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQzlDLEtBQUssQ0FBQyxhQUFhLENBQUMsSUFBWSxJQUFtQixDQUFDO0lBQ3BELGVBQWUsQ0FBQyxRQUFhLElBQWtCLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7Q0FDNUU7QUFFRCxNQUFNLDJCQUEyQjtJQUFqQztRQUNVLDBCQUFxQixHQUFHLElBQUksT0FBTyxFQUFRLENBQUM7SUF1QnRELENBQUM7SUF0QkEsS0FBSyxDQUFDLFVBQVU7UUFDZixPQUFPO1lBQ04sYUFBYSxFQUFFLEtBQUssQ0FBQyxJQUFJO1lBQ3pCLHFCQUFxQixFQUFFLEtBQUssQ0FBQyxJQUFJO1lBQ2pDLG1CQUFtQixFQUFFLEtBQUssQ0FBQyxJQUFJO1lBQy9CLGdCQUFnQixFQUFFLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxLQUFLO1lBQ2xELHVCQUF1QixFQUFFLEtBQUssQ0FBQyxJQUFJO1lBQ25DLGtCQUFrQixFQUFFLEtBQUssQ0FBQyxJQUFJO1lBQzlCLGFBQWEsRUFBRSxDQUNkLGlCQUFzQixFQUN0QixHQUFXLEVBQ1gsSUFBWSxFQUNaLElBQVksRUFDWixjQUEwQixFQUMxQixHQUFRLEVBQ1IsT0FBWSxFQUNaLGFBQXNCLEVBQ3JCLEVBQUUsQ0FBQyxJQUFJLHdCQUF3QixDQUFDLGFBQWEsQ0FBQztZQUNoRCxVQUFVLEVBQUUsR0FBRyxFQUFFLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDckMsbUJBQW1CLEVBQUUsR0FBRyxFQUFFLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7U0FDZixDQUFDO0lBQ2xDLENBQUM7Q0FDRDtBQUVELEtBQUssQ0FBQyxvQ0FBb0MsRUFBRSxHQUFHLEVBQUU7SUFDaEQsSUFBSSxPQUErQixDQUFDO0lBQ3BDLElBQUksdUJBQW9ELENBQUM7SUFFekQsTUFBTSxLQUFLLEdBQUcsdUNBQXVDLEVBQUUsQ0FBQztJQUV4RCxLQUFLLENBQUMsS0FBSyxJQUFJLEVBQUU7UUFDaEIsTUFBTSxvQkFBb0IsR0FBRyw2QkFBNkIsQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDN0UsTUFBTSxvQkFBb0IsR0FBRyxvQkFBb0IsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQTZCLENBQUM7UUFDekcsTUFBTSxvQkFBb0IsQ0FBQyxvQkFBb0IsQ0FBQyxRQUFRLEVBQUUsRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztRQUNqRixNQUFNLG9CQUFvQixDQUFDLG9CQUFvQixDQUFDLFVBQVUsRUFBRTtZQUMzRCxVQUFVLEVBQUU7Z0JBQ1gsVUFBVSxFQUFFLEtBQUs7Z0JBQ2pCLHdCQUF3QixFQUFFLElBQUk7Z0JBQzlCLGdCQUFnQixFQUFFO29CQUNqQixPQUFPLEVBQUUsS0FBSztpQkFDZDthQUNEO1NBQ0QsQ0FBQyxDQUFDO1FBQ0gsb0JBQW9CLENBQUMsK0JBQStCLENBQUMsSUFBSSxDQUFDO1lBQ3pELG9CQUFvQixFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUk7U0FDcUQsQ0FBQyxDQUFDO1FBQ3hGLHVCQUF1QixHQUFHLElBQUksMkJBQTJCLEVBQUUsQ0FBQztRQUM1RCxLQUFLLENBQUMsR0FBRyxDQUFDLHVCQUF1QixDQUFDLHFCQUFxQixDQUFDLENBQUM7UUFDekQsb0JBQW9CLENBQUMsSUFBSSxDQUFDLHdCQUF3QixFQUFFLHVCQUF1QixDQUFDLENBQUM7UUFDN0Usb0JBQW9CLENBQUMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLEVBQUUsZ0JBQWdCLEVBQUUsS0FBSyxJQUFJLEVBQUUsR0FBRyxDQUFDLEVBQStCLENBQUMsQ0FBQztRQUVoSCxPQUFPLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsc0JBQXNCLEVBQUUsQ0FBQyxFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQztJQUN0SCxDQUFDLENBQUMsQ0FBQztJQUVILEtBQUssQ0FBQyxxQkFBcUIsRUFBRSxHQUFHLEVBQUU7UUFDakMsS0FBSyxDQUFDLE9BQU8sRUFBRSxHQUFHLEVBQUU7WUFDbkIsSUFBSSxDQUFDLGlDQUFpQyxFQUFFLEtBQUssSUFBSSxFQUFFO2dCQUNsRCxNQUFNLENBQUMsR0FBRyxNQUFNLE9BQU8sQ0FBQyxhQUFhLENBQUMsRUFDckMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO2dCQUNoQixXQUFXLENBQUMsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDO2dCQUMxQixXQUFXLENBQUMsT0FBTyxDQUFDLGFBQWEsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUMxQyxDQUFDLENBQUMsQ0FBQztZQUNILElBQUksQ0FBQyxrQ0FBa0MsRUFBRSxLQUFLLElBQUksRUFBRTtnQkFDbkQsTUFBTSxDQUFDLEdBQUcsTUFBTSxPQUFPLENBQUMsYUFBYSxDQUFDO29CQUNyQyxpQkFBaUIsRUFBRSxJQUFJO2lCQUN2QixFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7Z0JBQ2hCLFdBQVcsQ0FBQyxDQUFDLEVBQUUsU0FBUyxDQUFDLENBQUM7Z0JBQzFCLFdBQVcsQ0FBQyxPQUFPLENBQUMsYUFBYSxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzNDLENBQUMsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7UUFDSCxLQUFLLENBQUMsUUFBUSxFQUFFLEdBQUcsRUFBRTtZQUNwQixNQUFNLFNBQVMsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDO2dCQUMxQixNQUFNLEVBQUUsT0FBTyxDQUFDLFlBQVk7Z0JBQzVCLElBQUksRUFBRSxVQUFVO2FBQ2hCLENBQUMsQ0FBQztZQUVILElBQUksQ0FBQyxpQ0FBaUMsRUFBRSxLQUFLLElBQUksRUFBRTtnQkFDbEQsTUFBTSxDQUFDLEdBQUcsTUFBTSxPQUFPLENBQUMsYUFBYSxDQUFDO29CQUNyQyxHQUFHLEVBQUUsU0FBUztpQkFDZCxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7Z0JBQ2hCLFdBQVcsQ0FBQyxDQUFDLEVBQUUsU0FBUyxDQUFDLENBQUM7Z0JBQzFCLFdBQVcsQ0FBQyxPQUFPLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQzFDLENBQUMsQ0FBQyxDQUFDO1lBQ0gsSUFBSSxDQUFDLGtDQUFrQyxFQUFFLEtBQUssSUFBSSxFQUFFO2dCQUNuRCxNQUFNLENBQUMsR0FBRyxNQUFNLE9BQU8sQ0FBQyxhQUFhLENBQUM7b0JBQ3JDLGlCQUFpQixFQUFFLElBQUk7b0JBQ3ZCLEdBQUcsRUFBRSxTQUFTO2lCQUNkLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztnQkFDaEIsV0FBVyxDQUFDLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztnQkFDMUIsV0FBVyxDQUFDLE9BQU8sQ0FBQyxhQUFhLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDM0MsQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsS0FBSyxDQUFDLGtCQUFrQixFQUFFLEdBQUcsRUFBRTtRQUM5QixLQUFLLFVBQVUseUJBQXlCLENBQUMsRUFBbUIsRUFBRSxJQUFZO1lBQ3pFLE1BQU0sT0FBTyxDQUFDLGFBQWEsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztZQUNqRCxPQUFPLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQztZQUNoQixJQUFJLFFBQTRCLENBQUM7WUFDakMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsUUFBUSxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQ3pELHVCQUF1QixDQUFDLHFCQUFxQixDQUFDLElBQUksRUFBRSxDQUFDO1lBQ3JELE9BQU8sUUFBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxJQUFJLENBQUMseURBQXlELEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDMUUsTUFBTSxJQUFJLEdBQUcsTUFBTSx5QkFBeUIsa0NBQTBCLEVBQUUsQ0FBQyxDQUFDO1lBQzFFLGVBQWUsQ0FDZCxFQUFFLHFCQUFxQixFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsR0FBRyxRQUFRLENBQUMsRUFBRSxFQUN0RSxFQUFFLHFCQUFxQixFQUFFLElBQUksRUFBRSxDQUMvQixDQUFDO1FBQ0gsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsMkRBQTJELEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDNUUsTUFBTSxJQUFJLEdBQUcsTUFBTSx5QkFBeUIsZ0NBQXdCLEVBQUUsQ0FBQyxDQUFDO1lBQ3hFLGVBQWUsQ0FDZCxFQUFFLGtCQUFrQixFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLEVBQUUsRUFDL0MsRUFBRSxrQkFBa0IsRUFBRSxLQUFLLEVBQUUsQ0FDN0IsQ0FBQztRQUNILENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHNFQUFzRSxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ3ZGLE1BQU0sSUFBSSxHQUFHLE1BQU0seUJBQXlCLGtDQUEwQixDQUFDLENBQUMsQ0FBQztZQUN6RSxlQUFlLENBQ2QsRUFBRSxrQkFBa0IsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxFQUFFLEVBQy9DLEVBQUUsa0JBQWtCLEVBQUUsS0FBSyxFQUFFLENBQzdCLENBQUM7UUFDSCxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUMifQ==