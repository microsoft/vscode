/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { detectsGenericPressAnyKeyPattern, detectsInputRequiredPattern, detectsNonInteractiveHelpPattern, detectsVSCodeTaskFinishMessage, matchTerminalPromptOption, OutputMonitor } from '../../browser/tools/monitoring/outputMonitor.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { OutputMonitorState } from '../../browser/tools/monitoring/types.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILanguageModelsService } from '../../../../chat/common/languageModels.js';
import { IChatService } from '../../../../chat/common/chatService/chatService.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { ChatModel } from '../../../../chat/common/model/chatModel.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { ITerminalLogService } from '../../../../../../platform/terminal/common/terminal.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { LocalChatSessionUri } from '../../../../chat/common/model/chatUri.js';
import { isNumber } from '../../../../../../base/common/types.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IChatWidgetService } from '../../../../chat/browser/chat.js';
suite('OutputMonitor', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let monitor;
    let execution;
    let cts;
    let instantiationService;
    let sendTextCalled;
    let sentText;
    let dataEmitter;
    setup(() => {
        sendTextCalled = false;
        sentText = undefined;
        dataEmitter = new Emitter();
        execution = {
            getOutput: () => 'test output',
            isActive: async () => false,
            instance: {
                instanceId: 1,
                sendText: async (text) => {
                    sendTextCalled = true;
                    sentText = text;
                },
                onDidInputData: dataEmitter.event,
                onDisposed: Event.None,
                onData: dataEmitter.event,
                focus: () => { },
                // eslint-disable-next-line local/code-no-any-casts
                registerMarker: () => ({ id: 1 })
            },
            sessionResource: LocalChatSessionUri.forSession('1')
        };
        instantiationService = new TestInstantiationService();
        instantiationService.stub(ILanguageModelsService, {
            selectLanguageModels: async () => []
        });
        instantiationService.stub(IChatService, {
            // eslint-disable-next-line local/code-no-any-casts
            getSession: () => ({
                sessionId: '1',
                onDidDispose: { event: () => { }, dispose: () => { } },
                onDidChange: { event: () => { }, dispose: () => { } },
                initialLocation: undefined,
                requests: [],
                responses: [],
                addRequest: () => { },
                addResponse: () => { },
                dispose: () => { }
            })
        });
        instantiationService.stub(ITerminalLogService, new NullLogService());
        instantiationService.stub(IConfigurationService, new TestConfigurationService({
            ["chat.tools.terminal.autoReplyToPrompts" /* TerminalChatAgentToolsSettingId.AutoReplyToPrompts */]: false
        }));
        instantiationService.stub(IChatWidgetService, {
            getWidgetsByLocations: () => []
        });
        cts = new CancellationTokenSource();
    });
    teardown(() => {
        cts.dispose();
    });
    test('startMonitoring returns immediately when polling succeeds', async () => {
        return runWithFakedTimers({}, async () => {
            // Simulate output change after first poll
            let callCount = 0;
            execution.getOutput = () => {
                callCount++;
                return callCount > 1 ? 'changed output' : 'test output';
            };
            monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, createTestContext('1'), cts.token, 'test command'));
            await Event.toPromise(monitor.onDidFinishCommand);
            const pollingResult = monitor.pollingResult;
            assert.strictEqual(pollingResult?.state, OutputMonitorState.Idle);
            assert.strictEqual(pollingResult.output, 'changed output');
            assert.strictEqual(sendTextCalled, false, 'sendText should not be called');
        });
    });
    test('startMonitoring returns cancelled when token is cancelled', async () => {
        return runWithFakedTimers({}, async () => {
            monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, createTestContext('1'), cts.token, 'test command'));
            cts.cancel();
            await Event.toPromise(monitor.onDidFinishCommand);
            const pollingResult = monitor.pollingResult;
            assert.strictEqual(pollingResult?.state, OutputMonitorState.Cancelled);
        });
    });
    test('startMonitoring returns idle when isActive is false', async () => {
        return runWithFakedTimers({}, async () => {
            execution.isActive = async () => false;
            monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, createTestContext('1'), cts.token, 'test command'));
            await Event.toPromise(monitor.onDidFinishCommand);
            const pollingResult = monitor.pollingResult;
            assert.strictEqual(pollingResult?.state, OutputMonitorState.Idle);
        });
    });
    test('startMonitoring works when isActive is undefined', async () => {
        return runWithFakedTimers({}, async () => {
            // Simulate output change after first poll
            let callCount = 0;
            execution.getOutput = () => {
                callCount++;
                return callCount > 1 ? 'changed output' : 'test output';
            };
            delete execution.isActive;
            monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, createTestContext('1'), cts.token, 'test command'));
            await Event.toPromise(monitor.onDidFinishCommand);
            const pollingResult = monitor.pollingResult;
            assert.strictEqual(pollingResult?.state, OutputMonitorState.Idle);
        });
    });
    test('non-interactive help completes without prompting', async () => {
        return runWithFakedTimers({}, async () => {
            execution.getOutput = () => 'press h + enter to show help';
            instantiationService.stub(ILanguageModelsService, {
                selectLanguageModels: async () => { throw new Error('language model should not be consulted'); }
            });
            monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, createTestContext('1'), cts.token, 'test command'));
            await Event.toPromise(monitor.onDidFinishCommand);
            const pollingResult = monitor.pollingResult;
            assert.strictEqual(pollingResult?.state, OutputMonitorState.Idle);
            assert.strictEqual(pollingResult?.output, 'press h + enter to show help');
        });
    });
    test('monitor can be disposed twice without error', async () => {
        return runWithFakedTimers({}, async () => {
            // Simulate output change after first poll
            let callCount = 0;
            execution.getOutput = () => {
                callCount++;
                return callCount > 1 ? 'changed output' : 'test output';
            };
            monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, createTestContext('1'), cts.token, 'test command'));
            await Event.toPromise(monitor.onDidFinishCommand);
            const pollingResult = monitor.pollingResult;
            assert.strictEqual(pollingResult?.state, OutputMonitorState.Idle);
            monitor.dispose();
            monitor.dispose();
        });
    });
    test('timeout prompt unanswered → continues polling and completes when idle', async () => {
        return runWithFakedTimers({}, async () => {
            // Fake a ChatModel enough to pass instanceof and the two methods used
            const fakeChatModel = {
                getRequests: () => [{}],
                acceptResponseProgress: () => { }
            };
            Object.setPrototypeOf(fakeChatModel, ChatModel.prototype);
            instantiationService.stub(IChatService, { getSession: () => fakeChatModel });
            // Poller: first pass times out (to show the prompt), second pass goes idle
            let pass = 0;
            const timeoutThenIdle = async () => {
                pass++;
                return pass === 1
                    ? { state: OutputMonitorState.Timeout, output: execution.getOutput() }
                    : { state: OutputMonitorState.Idle, output: execution.getOutput() };
            };
            monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, timeoutThenIdle, createTestContext('1'), cts.token, 'test command'));
            await Event.toPromise(monitor.onDidFinishCommand);
            const res = monitor.pollingResult;
            assert.strictEqual(res.state, OutputMonitorState.Idle);
            assert.strictEqual(res.output, 'test output');
            assert.ok(isNumber(res.pollDurationMs));
        });
    });
    test('auto reply sends first option when model lookup is unavailable', async () => {
        instantiationService.stub(IConfigurationService, new TestConfigurationService({
            ["chat.tools.terminal.autoReplyToPrompts" /* TerminalChatAgentToolsSettingId.AutoReplyToPrompts */]: true
        }));
        instantiationService.stub(ILanguageModelsService, {
            selectLanguageModels: async () => []
        });
        const monitorCts = new CancellationTokenSource();
        monitorCts.cancel();
        monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, createTestContext('1'), monitorCts.token, 'test command'));
        const outputMonitorWithPrivateMethod = monitor;
        const optionResult = await outputMonitorWithPrivateMethod['_selectAndHandleOption']({
            prompt: 'Continue?',
            options: ['y', 'n'],
            detectedRequestForFreeFormInput: false
        }, CancellationToken.None);
        await Event.toPromise(monitor.onDidFinishCommand);
        monitorCts.dispose();
        assert.strictEqual(sendTextCalled, true, 'sendText should be called when auto reply is enabled');
        assert.strictEqual(optionResult?.sentToTerminal, true, 'option should be auto-sent');
        assert.strictEqual(optionResult?.suggestedOption, 'y', 'first option should be used as fallback');
    });
    test('auto reply uses fallback model to derive suggested option', async () => {
        instantiationService.stub(IConfigurationService, new TestConfigurationService({
            ["chat.tools.terminal.autoReplyToPrompts" /* TerminalChatAgentToolsSettingId.AutoReplyToPrompts */]: true
        }));
        let fallbackModelRequested = false;
        instantiationService.stub(ILanguageModelsService, {
            selectLanguageModels: async (selector) => {
                if (selector.id === 'copilot-fast') {
                    fallbackModelRequested = true;
                    return ['copilot-fast'];
                }
                return [];
            },
            sendChatRequest: async () => ({
                stream: (async function* () {
                    yield { type: 'text', value: 'n' };
                })(),
                result: Promise.resolve(undefined)
            })
        });
        const monitorCts = new CancellationTokenSource();
        monitorCts.cancel();
        monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, createTestContext('1'), monitorCts.token, 'test command'));
        const outputMonitorWithPrivateMethod = monitor;
        const optionResult = await outputMonitorWithPrivateMethod['_selectAndHandleOption']({
            prompt: 'Continue?',
            options: ['y', 'n'],
            detectedRequestForFreeFormInput: false
        }, CancellationToken.None);
        await Event.toPromise(monitor.onDidFinishCommand);
        monitorCts.dispose();
        assert.strictEqual(fallbackModelRequested, true, 'fallback model should be requested via _getLanguageModel');
        assert.strictEqual(sendTextCalled, true, 'sendText should be called when auto reply is enabled');
        assert.strictEqual(optionResult?.sentToTerminal, true, 'option should be auto-sent');
        assert.strictEqual(optionResult?.suggestedOption, 'n', 'suggested option should be derived from fallback model response');
    });
    test('auto reply stops on generic press any key prompts', async () => {
        instantiationService.stub(IConfigurationService, new TestConfigurationService({
            ["chat.tools.terminal.autoReplyToPrompts" /* TerminalChatAgentToolsSettingId.AutoReplyToPrompts */]: true
        }));
        execution.getOutput = () => 'Press any key to continue...';
        const monitorCts = new CancellationTokenSource();
        monitorCts.cancel();
        monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, createTestContext('1'), monitorCts.token, 'test command'));
        const outputMonitorWithPrivateMethod = monitor;
        const idleResult = await outputMonitorWithPrivateMethod['_handleIdleState'](CancellationToken.None);
        await Event.toPromise(monitor.onDidFinishCommand);
        monitorCts.dispose();
        assert.strictEqual(sendTextCalled, false, 'sendText should not be called when auto reply is enabled for free-form prompts');
        assert.strictEqual(sentText, undefined, 'no terminal input should be sent');
        assert.strictEqual(idleResult.shouldContinuePolling, false, 'monitor should stop polling for free-form prompts in auto reply mode');
    });
    test('auto reply does not propagate free-form input requests without explicit input', async () => {
        instantiationService.stub(IConfigurationService, new TestConfigurationService({
            ["chat.tools.terminal.autoReplyToPrompts" /* TerminalChatAgentToolsSettingId.AutoReplyToPrompts */]: true
        }));
        const monitorCts = new CancellationTokenSource();
        monitorCts.cancel();
        monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, createTestContext('1'), monitorCts.token, 'test command'));
        const outputMonitorWithPrivateMethod = monitor;
        let freeFormRequestShown = false;
        outputMonitorWithPrivateMethod['_determineUserInputOptions'] = async () => ({
            prompt: 'Password:',
            options: [],
            detectedRequestForFreeFormInput: true
        });
        outputMonitorWithPrivateMethod['_requestFreeFormTerminalInput'] = async () => {
            freeFormRequestShown = true;
            return true;
        };
        const idleResult = await outputMonitorWithPrivateMethod['_handleIdleState'](CancellationToken.None);
        await Event.toPromise(monitor.onDidFinishCommand);
        monitorCts.dispose();
        assert.strictEqual(freeFormRequestShown, false, 'free-form elicitation should not be shown when auto reply is enabled');
        assert.strictEqual(sendTextCalled, false, 'sensitive free-form prompt should not be auto-replied');
        assert.strictEqual(idleResult.shouldContinuePolling, false, 'monitor should stop instead of propagating free-form prompt');
    });
    suite('detectsInputRequiredPattern', () => {
        test('detects yes/no confirmation prompts (pairs and variants)', () => {
            assert.strictEqual(detectsInputRequiredPattern('Continue? (y/N) '), true);
            assert.strictEqual(detectsInputRequiredPattern('Continue? (y/n) '), true);
            assert.strictEqual(detectsInputRequiredPattern('Overwrite file? [Y/n] '), true);
            assert.strictEqual(detectsInputRequiredPattern('Are you sure? (Y/N) '), true);
            assert.strictEqual(detectsInputRequiredPattern('Delete files? [y/N] '), true);
            assert.strictEqual(detectsInputRequiredPattern('Proceed? (yes/no) '), true);
            assert.strictEqual(detectsInputRequiredPattern('Proceed? [no/yes] '), true);
            assert.strictEqual(detectsInputRequiredPattern('Continue? y/n '), true);
            assert.strictEqual(detectsInputRequiredPattern('Overwrite: yes/no '), true);
            // No match if there's a response already
            assert.strictEqual(detectsInputRequiredPattern('Continue? (y/N) y'), false);
            assert.strictEqual(detectsInputRequiredPattern('Continue? (y/n) n'), false);
            assert.strictEqual(detectsInputRequiredPattern('Overwrite file? [Y/n] N'), false);
            assert.strictEqual(detectsInputRequiredPattern('Are you sure? (Y/N) Y'), false);
            assert.strictEqual(detectsInputRequiredPattern('Delete files? [y/N] y'), false);
            assert.strictEqual(detectsInputRequiredPattern('Continue? y/n y\/n'), false);
            assert.strictEqual(detectsInputRequiredPattern('Overwrite: yes/no yes\/n'), false);
        });
        test('detects PowerShell multi-option confirmation line', () => {
            assert.strictEqual(detectsInputRequiredPattern('[Y] Yes  [A] Yes to All  [N] No  [L] No to All  [S] Suspend  [?] Help (default is "Y"): '), true);
            // also matches without default suffix
            assert.strictEqual(detectsInputRequiredPattern('[Y] Yes  [N] No '), true);
            // No match if there's a response already
            assert.strictEqual(detectsInputRequiredPattern('[Y] Yes  [A] Yes to All  [N] No  [L] No to All  [S] Suspend  [?] Help (default is "Y"): Y'), false);
            assert.strictEqual(detectsInputRequiredPattern('[Y] Yes  [N] No N'), false);
        });
        test('Line ends with colon', () => {
            assert.strictEqual(detectsInputRequiredPattern('Enter your name: '), true);
            assert.strictEqual(detectsInputRequiredPattern('Password: '), true);
            assert.strictEqual(detectsInputRequiredPattern('File to overwrite: '), true);
        });
        test('detects trailing questions', () => {
            assert.strictEqual(detectsInputRequiredPattern('Continue?'), true);
            assert.strictEqual(detectsInputRequiredPattern('Proceed?   '), true);
            assert.strictEqual(detectsInputRequiredPattern('Are you sure?'), true);
        });
        test('detects press any key prompts', () => {
            assert.strictEqual(detectsInputRequiredPattern('Press any key to continue...'), true);
            assert.strictEqual(detectsInputRequiredPattern('Press a key'), true);
        });
        test('detects non-interactive help prompts without treating them as input', () => {
            assert.strictEqual(detectsInputRequiredPattern('press h + enter to show help'), false);
            assert.strictEqual(detectsInputRequiredPattern('press h to show help'), false);
            assert.strictEqual(detectsNonInteractiveHelpPattern('press h + enter to show help'), true);
            assert.strictEqual(detectsNonInteractiveHelpPattern('press h to show help'), true);
            assert.strictEqual(detectsNonInteractiveHelpPattern('press h to show commands'), true);
            assert.strictEqual(detectsNonInteractiveHelpPattern('press ? to see commands'), true);
            assert.strictEqual(detectsNonInteractiveHelpPattern('press ? + enter for options'), true);
            assert.strictEqual(detectsNonInteractiveHelpPattern('type h + enter to show help'), true);
            assert.strictEqual(detectsNonInteractiveHelpPattern('hit ? for help'), true);
            assert.strictEqual(detectsNonInteractiveHelpPattern('type h to see options'), true);
            assert.strictEqual(detectsInputRequiredPattern('press o to open the app'), false);
            assert.strictEqual(detectsNonInteractiveHelpPattern('press o to open the app'), true);
            assert.strictEqual(detectsInputRequiredPattern('press r to restart the server'), false);
            assert.strictEqual(detectsNonInteractiveHelpPattern('press r to restart the server'), true);
            assert.strictEqual(detectsInputRequiredPattern('press q to quit'), false);
            assert.strictEqual(detectsNonInteractiveHelpPattern('press q to quit'), true);
            assert.strictEqual(detectsInputRequiredPattern('press u to show server url'), false);
            assert.strictEqual(detectsNonInteractiveHelpPattern('press u to show server url'), true);
        });
    });
    suite('matchTerminalPromptOption', () => {
        test('matches suggested option case-insensitively', () => {
            assert.deepStrictEqual(matchTerminalPromptOption(['Y', 'n'], 'y'), { option: 'Y', index: 0 });
            assert.deepStrictEqual(matchTerminalPromptOption(['y', 'N'], 'n'), { option: 'N', index: 1 });
        });
        test('strips quotes and trailing punctuation', () => {
            assert.deepStrictEqual(matchTerminalPromptOption(['Y', 'n'], '"y"'), { option: 'Y', index: 0 });
            assert.deepStrictEqual(matchTerminalPromptOption(['yes', 'no'], 'no.'), { option: 'no', index: 1 });
        });
        test('handles bracketed options like [Y]', () => {
            assert.deepStrictEqual(matchTerminalPromptOption(['Y', 'n'], '[y]'), { option: 'Y', index: 0 });
            assert.deepStrictEqual(matchTerminalPromptOption(['y', 'N'], '(n)'), { option: 'N', index: 1 });
        });
        test('handles default suffixes by using first token', () => {
            assert.deepStrictEqual(matchTerminalPromptOption(['Y', 'n'], 'Y (default)'), { option: 'Y', index: 0 });
            assert.deepStrictEqual(matchTerminalPromptOption(['Enter'], 'Enter to continue'), { option: 'Enter', index: 0 });
        });
    });
    suite('detectsVSCodeTaskFinishMessage', () => {
        test('detects VS Code task completion messages', () => {
            assert.strictEqual(detectsVSCodeTaskFinishMessage('Press any key to close the terminal.'), true);
            assert.strictEqual(detectsVSCodeTaskFinishMessage('Terminal will be reused by tasks, press any key to close it.'), true);
            assert.strictEqual(detectsVSCodeTaskFinishMessage('The terminal will be reused by tasks. Press any key to close. Please provide the required input to the terminal.'), true);
            // Case insensitive
            assert.strictEqual(detectsVSCodeTaskFinishMessage('press any key to close the terminal.'), true);
            assert.strictEqual(detectsVSCodeTaskFinishMessage('PRESS ANY KEY TO CLOSE THE TERMINAL.'), true);
            // With " * " prefix (VS Code adds this to task messages)
            assert.strictEqual(detectsVSCodeTaskFinishMessage(' *  Terminal will be reused by tasks, press any key to close it.'), true);
            assert.strictEqual(detectsVSCodeTaskFinishMessage(' *  Press any key to close the terminal.'), true);
        });
        test('does not match generic press any key messages', () => {
            // Regular script messages should NOT be matched
            assert.strictEqual(detectsVSCodeTaskFinishMessage('Press any key to continue...'), false);
            assert.strictEqual(detectsVSCodeTaskFinishMessage('Press any key to exit'), false);
            assert.strictEqual(detectsVSCodeTaskFinishMessage('Press any key'), false);
        });
        test('does not match other prompts', () => {
            assert.strictEqual(detectsVSCodeTaskFinishMessage('Continue? (y/n)'), false);
            assert.strictEqual(detectsVSCodeTaskFinishMessage('Password:'), false);
            assert.strictEqual(detectsVSCodeTaskFinishMessage('press h to show help'), false);
        });
    });
    suite('detectsGenericPressAnyKeyPattern', () => {
        test('detects generic press any key prompts from scripts', () => {
            assert.strictEqual(detectsGenericPressAnyKeyPattern('Press any key to continue...'), true);
            assert.strictEqual(detectsGenericPressAnyKeyPattern('Press any key to exit'), true);
            assert.strictEqual(detectsGenericPressAnyKeyPattern('Press any key'), true);
            assert.strictEqual(detectsGenericPressAnyKeyPattern('press a key to continue'), true);
            // Case insensitive
            assert.strictEqual(detectsGenericPressAnyKeyPattern('PRESS ANY KEY TO CONTINUE'), true);
        });
        test('does not match VS Code task finish messages', () => {
            // These should be handled by detectsVSCodeTaskFinishMessage, not this function
            assert.strictEqual(detectsGenericPressAnyKeyPattern('Press any key to close the terminal.'), false);
            assert.strictEqual(detectsGenericPressAnyKeyPattern('Terminal will be reused by tasks, press any key to close it.'), false);
            // With " * " prefix
            assert.strictEqual(detectsGenericPressAnyKeyPattern(' *  Terminal will be reused by tasks, press any key to close it.'), false);
            assert.strictEqual(detectsGenericPressAnyKeyPattern(' *  Press any key to close the terminal.'), false);
        });
        test('does not match other prompts', () => {
            assert.strictEqual(detectsGenericPressAnyKeyPattern('Continue? (y/n)'), false);
            assert.strictEqual(detectsGenericPressAnyKeyPattern('Password:'), false);
            assert.strictEqual(detectsGenericPressAnyKeyPattern('press h to show help'), false);
        });
    });
});
function createTestContext(id) {
    return { sessionResource: LocalChatSessionUri.forSession(id) };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3V0cHV0TW9uaXRvci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL2NoYXRBZ2VudFRvb2xzL3Rlc3QvYnJvd3Nlci9vdXRwdXRNb25pdG9yLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDakMsT0FBTyxFQUFFLGdDQUFnQyxFQUFFLDJCQUEyQixFQUFFLGdDQUFnQyxFQUFFLDhCQUE4QixFQUFFLHlCQUF5QixFQUFFLGFBQWEsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQzVPLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzNHLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3RHLE9BQU8sRUFBOEIsa0JBQWtCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN6RyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxrRkFBa0YsQ0FBQztBQUM1SCxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNuRixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDbEYsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN4RSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDdkUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBRS9GLE9BQU8sRUFB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