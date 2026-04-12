/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CustomizationHarness, CustomizationHarnessServiceBase, createVSCodeHarnessDescriptor, matchesWorkspaceSubpath } from '../../common/customizationHarnessService.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
suite('CustomizationHarnessService', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    function createService(...harnesses) {
        if (harnesses.length === 0) {
            harnesses = [createVSCodeHarnessDescriptor([PromptsStorage.extension])];
        }
        return new CustomizationHarnessServiceBase(harnesses, harnesses[0].id);
    }
    suite('registerExternalHarness', () => {
        test('adds harness to available list', () => {
            const service = createService();
            assert.strictEqual(service.availableHarnesses.get().length, 1);
            const emitter = new Emitter();
            store.add(emitter);
            const externalDescriptor = {
                id: 'test-ext',
                label: 'Test Extension',
                icon: ThemeIcon.fromId('extensions'),
                getStorageSourceFilter: () => ({ sources: [PromptsStorage.local] }),
                itemProvider: {
                    onDidChange: emitter.event,
                    provideChatSessionCustomizations: async () => [],
                },
            };
            const reg = service.registerExternalHarness(externalDescriptor);
            store.add(reg);
            assert.strictEqual(service.availableHarnesses.get().length, 2);
            assert.strictEqual(service.availableHarnesses.get()[1].id, 'test-ext');
        });
        test('removes harness on dispose', () => {
            const service = createService();
            const emitter = new Emitter();
            store.add(emitter);
            const externalDescriptor = {
                id: 'test-ext',
                label: 'Test Extension',
                icon: ThemeIcon.fromId('extensions'),
                getStorageSourceFilter: () => ({ sources: [PromptsStorage.local] }),
                itemProvider: {
                    onDidChange: emitter.event,
                    provideChatSessionCustomizations: async () => [],
                },
            };
            const reg = service.registerExternalHarness(externalDescriptor);
            assert.strictEqual(service.availableHarnesses.get().length, 2);
            reg.dispose();
            assert.strictEqual(service.availableHarnesses.get().length, 1);
        });
        test('falls back to first harness when active external harness is removed', () => {
            const service = createService();
            const emitter = new Emitter();
            store.add(emitter);
            const externalDescriptor = {
                id: 'test-ext',
                label: 'Test Extension',
                icon: ThemeIcon.fromId('extensions'),
                getStorageSourceFilter: () => ({ sources: [PromptsStorage.local] }),
                itemProvider: {
                    onDidChange: emitter.event,
                    provideChatSessionCustomizations: async () => [],
                },
            };
            const reg = service.registerExternalHarness(externalDescriptor);
            service.setActiveHarness('test-ext');
            assert.strictEqual(service.activeHarness.get(), 'test-ext');
            reg.dispose();
            assert.strictEqual(service.activeHarness.get(), CustomizationHarness.VSCode);
        });
        test('allows switching to external harness', () => {
            const service = createService();
            const emitter = new Emitter();
            store.add(emitter);
            const externalDescriptor = {
                id: 'test-ext',
                label: 'Test Extension',
                icon: ThemeIcon.fromId('extensions'),
                getStorageSourceFilter: () => ({ sources: [PromptsStorage.local] }),
                itemProvider: {
                    onDidChange: emitter.event,
                    provideChatSessionCustomizations: async () => [],
                },
            };
            store.add(service.registerExternalHarness(externalDescriptor));
            service.setActiveHarness('test-ext');
            assert.strictEqual(service.activeHarness.get(), 'test-ext');
            const activeDescriptor = service.getActiveDescriptor();
            assert.strictEqual(activeDescriptor.id, 'test-ext');
            assert.strictEqual(activeDescriptor.label, 'Test Extension');
            assert.ok(activeDescriptor.itemProvider);
        });
        test('external harness provides storage filter', () => {
            const service = createService();
            const emitter = new Emitter();
            store.add(emitter);
            const customFilter = { sources: [PromptsStorage.local, PromptsStorage.user] };
            const externalDescriptor = {
                id: 'test-ext',
                label: 'Test Extension',
                icon: ThemeIcon.fromId('extensions'),
                getStorageSourceFilter: () => customFilter,
                itemProvider: {
                    onDidChange: emitter.event,
                    provideChatSessionCustomizations: async () => [],
                },
            };
            store.add(service.registerExternalHarness(externalDescriptor));
            service.setActiveHarness('test-ext');
            assert.deepStrictEqual(service.getStorageSourceFilter(PromptsType.agent), customFilter);
        });
        test('external harness item provider returns items', async () => {
            const service = createService();
            const emitter = new Emitter();
            store.add(emitter);
            const testItems = [
                { uri: URI.parse('file:///workspace/.claude/SKILL.md'), type: 'skill', name: 'Test Skill', description: 'A test skill' },
            ];
            const itemProvider = {
                onDidChange: emitter.event,
                provideChatSessionCustomizations: async () => testItems,
            };
            const externalDescriptor = {
                id: 'test-ext',
                label: 'Test Extension',
                icon: ThemeIcon.fromId('extensions'),
                getStorageSourceFilter: () => ({ sources: [PromptsStorage.local] }),
                itemProvider,
            };
            store.add(service.registerExternalHarness(externalDescriptor));
            service.setActiveHarness('test-ext');
            const items = await service.getActiveDescriptor().itemProvider.provideChatSessionCustomizations(CancellationToken.None);
            assert.strictEqual(items?.length, 1);
            assert.strictEqual(items[0].name, 'Test Skill');
            assert.strictEqual(items[0].type, 'skill');
        });
        test('external harness with hidden sections and workspace subpaths', () => {
            const service = createService();
            const emitter = new Emitter();
            store.add(emitter);
            const externalDescriptor = {
                id: 'test-ext',
                label: 'Test Extension',
                icon: ThemeIcon.fromId('extensions'),
                hiddenSections: ['agents', 'prompts'],
                workspaceSubpaths: ['.test-ext'],
                getStorageSourceFilter: () => ({ sources: [PromptsStorage.local] }),
                itemProvider: {
                    onDidChange: emitter.event,
                    provideChatSessionCustomizations: async () => [],
                },
            };
            store.add(service.registerExternalHarness(externalDescriptor));
            service.setActiveHarness('test-ext');
            const descriptor = service.getActiveDescriptor();
            assert.deepStrictEqual(descriptor.hiddenSections, ['agents', 'prompts']);
            assert.deepStrictEqual(descriptor.workspaceSubpaths, ['.test-ext']);
        });
        test('external harness with same id as static harness replaces it', () => {
            const staticDescriptor = {
                id: 'cli',
                label: 'Copilot CLI (static)',
                icon: ThemeIcon.fromId('extensions'),
                getStorageSourceFilter: () => ({ sources: [PromptsStorage.local] }),
            };
            const service = createService(createVSCodeHarnessDescriptor([PromptsStorage.extension]), staticDescriptor);
            assert.strictEqual(service.availableHarnesses.get().length, 2);
            const emitter = new Emitter();
            store.add(emitter);
            const externalDescriptor = {
                id: 'cli',
                label: 'Copilot CLI (from API)',
                icon: ThemeIcon.fromId('extensions'),
                getStorageSourceFilter: () => ({ sources: [PromptsStorage.local] }),
                itemProvider: {
                    onDidChange: emitter.event,
                    provideChatSessionCustomizations: async () => [],
                },
            };
            const reg = service.registerExternalHarness(externalDescriptor);
            store.add(reg);
            // Should still be 2, not 3 — the external shadows the static
            assert.strictEqual(service.availableHarnesses.get().length, 2);
            const cliHarness = service.availableHarnesses.get().find(h => h.id === 'cli');
            assert.strictEqual(cliHarness.label, 'Copilot CLI (from API)');
        });
        test('static harness reappears when shadowing external harness is disposed', () => {
            const staticDescriptor = {
                id: 'cli',
                label: 'Copilot CLI (static)',
                icon: ThemeIcon.fromId('extensions'),
                getStorageSourceFilter: () => ({ sources: [PromptsStorage.local] }),
            };
            const service = createService(createVSCodeHarnessDescriptor([PromptsStorage.extension]), staticDescriptor);
            const emitter = new Emitter();
            store.add(emitter);
            const externalDescriptor = {
                id: 'cli',
                label: 'Copilot CLI (from API)',
                icon: ThemeIcon.fromId('extensions'),
                getStorageSourceFilter: () => ({ sources: [PromptsStorage.local] }),
                itemProvider: {
                    onDidChange: emitter.event,
                    provideChatSessionCustomizations: async () => [],
                },
            };
            const reg = service.registerExternalHarness(externalDescriptor);
            reg.dispose();
            // Static harness should be back
            assert.strictEqual(service.availableHarnesses.get().length, 2);
            const cliHarness = service.availableHarnesses.get().find(h => h.id === 'cli');
            assert.strictEqual(cliHarness.label, 'Copilot CLI (static)');
        });
        test('active harness stays when shadowing external harness is disposed (static restored)', () => {
            const staticDescriptor = {
                id: 'cli',
                label: 'Copilot CLI (static)',
                icon: ThemeIcon.fromId('extensions'),
                getStorageSourceFilter: () => ({ sources: [PromptsStorage.local] }),
            };
            const service = createService(createVSCodeHarnessDescriptor([PromptsStorage.extension]), staticDescriptor);
            const emitter = new Emitter();
            store.add(emitter);
            const externalDescriptor = {
                id: 'cli',
                label: 'Copilot CLI (from API)',
                icon: ThemeIcon.fromId('extensions'),
                getStorageSourceFilter: () => ({ sources: [PromptsStorage.local] }),
                itemProvider: {
                    onDidChange: emitter.event,
                    provideChatSessionCustomizations: async () => [],
                },
            };
            const reg = service.registerExternalHarness(externalDescriptor);
            service.setActiveHarness('cli');
            assert.strictEqual(service.activeHarness.get(), 'cli');
            reg.dispose();
            // Active stays on 'cli' because the static harness with the same id is restored
            assert.strictEqual(service.activeHarness.get(), 'cli');
        });
    });
    suite('matchesWorkspaceSubpath', () => {
        test('matches segment boundary', () => {
            assert.ok(matchesWorkspaceSubpath('/workspace/.claude/skills/SKILL.md', ['.claude']));
            assert.ok(matchesWorkspaceSubpath('/workspace/.github/instructions.md', ['.github']));
        });
        test('does not match partial segment', () => {
            assert.ok(!matchesWorkspaceSubpath('/workspace/not.claude/file.md', ['.claude']));
        });
        test('matches path ending with subpath', () => {
            assert.ok(matchesWorkspaceSubpath('/workspace/.claude', ['.claude']));
        });
        test('matches any of multiple subpaths', () => {
            assert.ok(matchesWorkspaceSubpath('/workspace/.copilot/file.md', ['.github', '.copilot']));
            assert.ok(matchesWorkspaceSubpath('/workspace/.github/file.md', ['.github', '.copilot']));
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L3Rlc3QvY29tbW9uL2N1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsK0JBQStCLEVBQUUsNkJBQTZCLEVBQTBELHVCQUF1QixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDcE8sT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNyRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUUvRSxLQUFLLENBQUMsNkJBQTZCLEVBQUUsR0FBRyxFQUFFO0lBQ3pDLE1BQU0sS0FBSyxHQUFHLHVDQUF1QyxFQUFFLENBQUM7SUFFeEQsU0FBUyxhQUFhLENBQUMsR0FBRyxTQUErQjtRQUN4RCxJQUFJLFNBQVMsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDNUIsU0FBUyxHQUFHLENBQUMsNkJBQTZCLENBQUMsQ0FBQyxjQUFjLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3pFLENBQUM7UUFDRCxP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