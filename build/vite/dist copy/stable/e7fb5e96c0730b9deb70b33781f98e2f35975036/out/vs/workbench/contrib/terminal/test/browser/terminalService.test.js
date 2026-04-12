/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { fail } from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService.js';
import { TerminalLocation } from '../../../../../platform/terminal/common/terminal.js';
import { ITerminalInstanceService, ITerminalService } from '../../browser/terminal.js';
import { TerminalService } from '../../browser/terminalService.js';
import { TERMINAL_CONFIG_SECTION } from '../../common/terminal.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
suite('Workbench - TerminalService', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let terminalService;
    let configurationService;
    let dialogService;
    setup(async () => {
        dialogService = new TestDialogService();
        configurationService = new TestConfigurationService({
            files: {},
            terminal: {
                integrated: {
                    confirmOnKill: 'never'
                }
            }
        });
        const instantiationService = workbenchInstantiationService({
            configurationService: () => configurationService,
        }, store);
        instantiationService.stub(IDialogService, dialogService);
        instantiationService.stub(ITerminalInstanceService, 'getBackend', undefined);
        instantiationService.stub(ITerminalInstanceService, 'getRegisteredBackends', []);
        instantiationService.stub(IRemoteAgentService, 'getConnection', null);
        terminalService = store.add(instantiationService.createInstance(TerminalService));
        instantiationService.stub(ITerminalService, terminalService);
    });
    suite('safeDisposeTerminal', () => {
        let onExitEmitter;
        setup(() => {
            onExitEmitter = store.add(new Emitter());
        });
        test('should not show prompt when confirmOnKill is never', async () => {
            await setConfirmOnKill(configurationService, 'never');
            await terminalService.safeDisposeTerminal({
                target: TerminalLocation.Editor,
                hasChildProcesses: true,
                onExit: onExitEmitter.event,
                dispose: () => onExitEmitter.fire(undefined)
            });
            await terminalService.safeDisposeTerminal({
                target: TerminalLocation.Panel,
                hasChildProcesses: true,
                onExit: onExitEmitter.event,
                dispose: () => onExitEmitter.fire(undefined)
            });
        });
        test('should not show prompt when any terminal editor is closed (handled by editor itself)', async () => {
            await setConfirmOnKill(configurationService, 'editor');
            terminalService.safeDisposeTerminal({
                target: TerminalLocation.Editor,
                hasChildProcesses: true,
                onExit: onExitEmitter.event,
                dispose: () => onExitEmitter.fire(undefined)
            });
            await setConfirmOnKill(configurationService, 'always');
            terminalService.safeDisposeTerminal({
                target: TerminalLocation.Editor,
                hasChildProcesses: true,
                onExit: onExitEmitter.event,
                dispose: () => onExitEmitter.fire(undefined)
            });
        });
        test('should not show prompt when confirmOnKill is editor and panel terminal is closed', async () => {
            await setConfirmOnKill(configurationService, 'editor');
            terminalService.safeDisposeTerminal({
                target: TerminalLocation.Panel,
                hasChildProcesses: true,
                onExit: onExitEmitter.event,
                dispose: () => onExitEmitter.fire(undefined)
            });
        });
        test('should show prompt when confirmOnKill is panel and panel terminal is closed', async () => {
            await setConfirmOnKill(configurationService, 'panel');
            // No child process cases
            dialogService.setConfirmResult({ confirmed: false });
            terminalService.safeDisposeTerminal({
                target: TerminalLocation.Panel,
                hasChildProcesses: false,
                onExit: onExitEmitter.event,
                dispose: () => onExitEmitter.fire(undefined)
            });
            dialogService.setConfirmResult({ confirmed: true });
            terminalService.safeDisposeTerminal({
                target: TerminalLocation.Panel,
                hasChildProcesses: false,
                onExit: onExitEmitter.event,
                dispose: () => onExitEmitter.fire(undefined)
            });
            // Child process cases
            dialogService.setConfirmResult({ confirmed: false });
            await terminalService.safeDisposeTerminal({
                target: TerminalLocation.Panel,
                hasChildProcesses: true,
                dispose: () => fail()
            });
            dialogService.setConfirmResult({ confirmed: true });
            terminalService.safeDisposeTerminal({
                target: TerminalLocation.Panel,
                hasChildProcesses: true,
                onExit: onExitEmitter.event,
                dispose: () => onExitEmitter.fire(undefined)
            });
        });
        test('should show prompt when confirmOnKill is always and panel terminal is closed', async () => {
            await setConfirmOnKill(configurationService, 'always');
            // No child process cases
            dialogService.setConfirmResult({ confirmed: false });
            terminalService.safeDisposeTerminal({
                target: TerminalLocation.Panel,
                hasChildProcesses: false,
                onExit: onExitEmitter.event,
                dispose: () => onExitEmitter.fire(undefined)
            });
            dialogService.setConfirmResult({ confirmed: true });
            terminalService.safeDisposeTerminal({
                target: TerminalLocation.Panel,
                hasChildProcesses: false,
                onExit: onExitEmitter.event,
                dispose: () => onExitEmitter.fire(undefined)
            });
            // Child process cases
            dialogService.setConfirmResult({ confirmed: false });
            await terminalService.safeDisposeTerminal({
                target: TerminalLocation.Panel,
                hasChildProcesses: true,
                dispose: () => fail()
            });
            dialogService.setConfirmResult({ confirmed: true });
            terminalService.safeDisposeTerminal({
                target: TerminalLocation.Panel,
                hasChildProcesses: true,
                onExit: onExitEmitter.event,
                dispose: () => onExitEmitter.fire(undefined)
            });
        });
    });
});
async function setConfirmOnKill(configurationService, value) {
    await configurationService.setUserConfiguration(TERMINAL_CONFIG_SECTION, { confirmOnKill: value });
    configurationService.onDidChangeConfigurationEmitter.fire({
        affectsConfiguration: () => true,
        affectedKeys: ['terminal.integrated.confirmOnKill']
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxTZXJ2aWNlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbC90ZXN0L2Jyb3dzZXIvdGVybWluYWxTZXJ2aWNlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUM5QixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sK0VBQStFLENBQUM7QUFDekgsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ25GLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBcUIsd0JBQXdCLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUMxRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbkUsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDbkUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDL0YsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFHbEcsS0FBSyxDQUFDLDZCQUE2QixFQUFFLEdBQUcsRUFBRTtJQUN6QyxNQUFNLEtBQUssR0FBRyx1Q0FBdUMsRUFBRSxDQUFDO0lBRXhELElBQUksZUFBZ0MsQ0FBQztJQUNyQyxJQUFJLG9CQUE4QyxDQUFDO0lBQ25ELElBQUksYUFBZ0Ms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