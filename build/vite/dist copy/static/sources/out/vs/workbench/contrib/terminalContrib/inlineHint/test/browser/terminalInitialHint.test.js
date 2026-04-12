/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ShellIntegrationAddon } from '../../../../../../platform/terminal/common/xterm/shellIntegrationAddon.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { getActiveDocument } from '../../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { strictEqual } from 'assert';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { importAMDNodeModule } from '../../../../../../amdX.js';
import { ChatAgentLocation, ChatModeKind } from '../../../../chat/common/constants.js';
import { InitialHintAddon } from '../../browser/terminal.initialHint.contribution.js';
import { TestXtermLogger } from '../../../../../../platform/terminal/test/common/terminalTestHelpers.js';
suite('Terminal Initial Hint Addon', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let eventCount = 0;
    let xterm;
    let initialHintAddon;
    const onDidChangeAgentsEmitter = new Emitter();
    const onDidChangeAgents = onDidChangeAgentsEmitter.event;
    const agent = {
        id: 'termminal',
        name: 'terminal',
        extensionId: new ExtensionIdentifier('test'),
        extensionVersion: undefined,
        extensionPublisherId: 'test',
        extensionDisplayName: 'test',
        metadata: {},
        slashCommands: [{ name: 'test', description: 'test' }],
        disambiguation: [],
        locations: [ChatAgentLocation.fromRaw('terminal')],
        modes: [ChatModeKind.Ask],
        invoke: async () => { return {}; }
    };
    const editorAgent = {
        id: 'editor',
        name: 'editor',
        extensionId: new ExtensionIdentifier('test-editor'),
        extensionVersion: undefined,
        extensionPublisherId: 'test-editor',
        extensionDisplayName: 'test-editor',
        metadata: {},
        slashCommands: [{ name: 'test', description: 'test' }],
        locations: [ChatAgentLocation.fromRaw('editor')],
        modes: [ChatModeKind.Ask],
        disambiguation: [],
        invoke: async () => { return {}; }
    };
    setup(async () => {
        const instantiationService = workbenchInstantiationService({}, store);
        const TerminalCtor = (await importAMDNodeModule('@xterm/xterm', 'lib/xterm.js')).Terminal;
        xterm = store.add(new TerminalCtor({ logger: TestXtermLogger }));
        const shellIntegrationAddon = store.add(new ShellIntegrationAddon('', true, undefined, undefined, new NullLogService));
        initialHintAddon = store.add(instantiationService.createInstance(InitialHintAddon, shellIntegrationAddon.capabilities, onDidChangeAgents));
        store.add(initialHintAddon.onDidRequestCreateHint(() => eventCount++));
        const testContainer = document.createElement('div');
        getActiveDocument().body.append(testContainer);
        xterm.open(testContainer);
        xterm.loadAddon(shellIntegrationAddon);
        xterm.loadAddon(initialHintAddon);
    });
    suite('Chat providers', () => {
        test('hint is not shown when there are no chat providers', () => {
            eventCount = 0;
            xterm.focus();
            strictEqual(eventCount, 0);
        });
        test('hint is not shown when there is just an editor agent', () => {
            eventCount = 0;
            onDidChangeAgentsEmitter.fire(editorAgent);
            xterm.focus();
            strictEqual(eventCount, 0);
        });
        test('hint is shown when there is a terminal chat agent', () => {
            eventCount = 0;
            onDidChangeAgentsEmitter.fire(editorAgent);
            xterm.focus();
            strictEqual(eventCount, 0);
            onDidChangeAgentsEmitter.fire(agent);
            strictEqual(eventCount, 1);
        });
        test('hint is not shown again when another terminal chat agent is added if it has already shown', () => {
            eventCount = 0;
            onDidChangeAgentsEmitter.fire(agent);
            xterm.focus();
            strictEqual(eventCount, 1);
            onDidChangeAgentsEmitter.fire(agent);
            strictEqual(eventCount, 1);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxJbml0aWFsSGludC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL2lubGluZUhpbnQvdGVzdC9icm93c2VyL3Rlcm1pbmFsSW5pdGlhbEhpbnQudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwyRUFBMkUsQ0FBQztBQUNsSCxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUNyRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDOUUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDMUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxRQUFRLENBQUM7QUFDckMsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFFakcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDaEUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx3RUFBd0UsQ0FBQztBQUV6RyxLQUFLLENBQUMsNkJBQTZCLEVBQUUsR0FBRyxFQUFFO0lBQ3pDLE1BQU0sS0FBSyxHQUFHLHVDQUF1QyxFQUFFLENBQUM7SUFDeEQsSUFBSSxVQUFVLEdBQUcsQ0FBQyxDQUFDO0lBQ25CLElB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