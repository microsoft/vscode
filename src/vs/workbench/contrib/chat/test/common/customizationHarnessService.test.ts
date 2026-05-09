/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CustomizationHarnessServiceBase, createVSCodeHarnessDescriptor, ICustomizationItemProvider, IHarnessDescriptor, matchesWorkspaceSubpath } from '../../common/customizationHarnessService.js';
import { PromptsType, Target } from '../../common/promptSyntax/promptTypes.js';
import { ICustomAgent, IPromptsService, PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { SessionType } from '../../common/chatSessionsService.js';
import { MockPromptsService } from './promptSyntax/service/mockPromptsService.js';

suite('CustomizationHarnessService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(...harnesses: IHarnessDescriptor[]): CustomizationHarnessServiceBase {
		if (harnesses.length === 0) {
			harnesses = [createVSCodeHarnessDescriptor([PromptsStorage.extension])];
		}
		const promptsService: IPromptsService = new MockPromptsService();
		const service = new CustomizationHarnessServiceBase(harnesses, harnesses[0].id, promptsService);
		store.add(service);
		return service;
	}

	suite('registerExternalHarness', () => {
		test('forwards item provider changes via onDidChangeSlashCommands with sessionType', () => {
			const service = createService();
			const emitter = new Emitter<void>();
			store.add(emitter);
			const harnessId = 'test-harness';
			const externalDescriptor: IHarnessDescriptor = {
				id: harnessId,
				label: 'Test Harness',
				icon: ThemeIcon.fromId('extensions'),
				getStorageSourceFilter: () => ({ sources: [PromptsStorage.local] }),
				itemProvider: {
					onDidChange: emitter.event,
					provideChatSessionCustomizations: async () => [],
				},
			};

			store.add(service.registerExternalHarness(externalDescriptor));

			let firedSessionType: string | undefined;
			const listener = store.add(service.onDidChangeSlashCommands(e => firedSessionType = e.sessionType));
			store.add(listener);

			emitter.fire();
			assert.strictEqual(firedSessionType, harnessId);
		});

		test('forwards item provider changes via onDidChangeCustomAgents with sessionType', () => {
			const service = createService();
			const emitter = new Emitter<void>();
			store.add(emitter);
			const harnessId = 'test-harness';
			const externalDescriptor: IHarnessDescriptor = {
				id: harnessId,
				label: 'Test Harness',
				icon: ThemeIcon.fromId('extensions'),
				getStorageSourceFilter: () => ({ sources: [PromptsStorage.local] }),
				itemProvider: {
					onDidChange: emitter.event,
					provideChatSessionCustomizations: async () => [],
				},
			};

			store.add(service.registerExternalHarness(externalDescriptor));

			let firedSessionType: string | undefined;
			const listener = store.add(service.onDidChangeCustomAgents(e => firedSessionType = e.sessionType));
			store.add(listener);

			emitter.fire();
			assert.strictEqual(firedSessionType, harnessId);
		});

		test('adds harness to available list', () => {
			const service = createService();
			assert.strictEqual(service.availableHarnesses.get().length, 1);

			const emitter = new Emitter<void>();
			store.add(emitter);
			const externalDescriptor: IHarnessDescriptor = {
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
			const emitter = new Emitter<void>();
			store.add(emitter);
			const externalDescriptor: IHarnessDescriptor = {
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
			const emitter = new Emitter<void>();
			store.add(emitter);
			const externalDescriptor: IHarnessDescriptor = {
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
			assert.strictEqual(service.activeHarness.get(), SessionType.Local);
		});

		test('allows switching to external harness', () => {
			const service = createService();
			const emitter = new Emitter<void>();
			store.add(emitter);
			const externalDescriptor: IHarnessDescriptor = {
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
			const emitter = new Emitter<void>();
			store.add(emitter);
			const customFilter = { sources: [PromptsStorage.local, PromptsStorage.user] };
			const externalDescriptor: IHarnessDescriptor = {
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
			const emitter = new Emitter<void>();
			store.add(emitter);
			const testItems = [
				{ uri: URI.parse('file:///workspace/.claude/SKILL.md'), type: 'skill', name: 'Test Skill', description: 'A test skill', extensionId: undefined, pluginUri: undefined, userInvocable: undefined },
			];

			const itemProvider: ICustomizationItemProvider = {
				onDidChange: emitter.event,
				provideChatSessionCustomizations: async () => testItems,
			};

			const externalDescriptor: IHarnessDescriptor = {
				id: 'test-ext',
				label: 'Test Extension',
				icon: ThemeIcon.fromId('extensions'),
				getStorageSourceFilter: () => ({ sources: [PromptsStorage.local] }),
				itemProvider,
			};

			store.add(service.registerExternalHarness(externalDescriptor));
			service.setActiveHarness('test-ext');

			const items = await service.getActiveDescriptor().itemProvider!.provideChatSessionCustomizations(CancellationToken.None);
			assert.strictEqual(items?.length, 1);
			assert.strictEqual(items![0].name, 'Test Skill');
			assert.strictEqual(items![0].type, 'skill');
		});

		test('external harness with hidden sections and workspace subpaths', () => {
			const service = createService();
			const emitter = new Emitter<void>();
			store.add(emitter);
			const externalDescriptor: IHarnessDescriptor = {
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
			const staticDescriptor: IHarnessDescriptor = {
				id: 'cli',
				label: 'Copilot CLI (static)',
				icon: ThemeIcon.fromId('extensions'),
				getStorageSourceFilter: () => ({ sources: [PromptsStorage.local] }),
			};
			const service = createService(
				createVSCodeHarnessDescriptor([PromptsStorage.extension]),
				staticDescriptor,
			);
			assert.strictEqual(service.availableHarnesses.get().length, 2);

			const emitter = new Emitter<void>();
			store.add(emitter);
			const externalDescriptor: IHarnessDescriptor = {
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
			const cliHarness = service.availableHarnesses.get().find(h => h.id === 'cli')!;
			assert.strictEqual(cliHarness.label, 'Copilot CLI (from API)');
		});

		test('static harness reappears when shadowing external harness is disposed', () => {
			const staticDescriptor: IHarnessDescriptor = {
				id: 'cli',
				label: 'Copilot CLI (static)',
				icon: ThemeIcon.fromId('extensions'),
				getStorageSourceFilter: () => ({ sources: [PromptsStorage.local] }),
			};
			const service = createService(
				createVSCodeHarnessDescriptor([PromptsStorage.extension]),
				staticDescriptor,
			);

			const emitter = new Emitter<void>();
			store.add(emitter);
			const externalDescriptor: IHarnessDescriptor = {
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
			const cliHarness = service.availableHarnesses.get().find(h => h.id === 'cli')!;
			assert.strictEqual(cliHarness.label, 'Copilot CLI (static)');
		});

		test('active harness stays when shadowing external harness is disposed (static restored)', () => {
			const staticDescriptor: IHarnessDescriptor = {
				id: 'cli',
				label: 'Copilot CLI (static)',
				icon: ThemeIcon.fromId('extensions'),
				getStorageSourceFilter: () => ({ sources: [PromptsStorage.local] }),
			};
			const service = createService(
				createVSCodeHarnessDescriptor([PromptsStorage.extension]),
				staticDescriptor,
			);

			const emitter = new Emitter<void>();
			store.add(emitter);
			const externalDescriptor: IHarnessDescriptor = {
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

	suite('getSlashCommands', () => {
		test('uses the active harness provider for prompt and skill items', async () => {


			const testSessionType = 'test-session-type';

			const emitter = new Emitter<void>();
			store.add(emitter);
			const service = createService({
				id: testSessionType,
				label: 'Test Extension',
				icon: ThemeIcon.fromId('extensions'),
				getStorageSourceFilter: () => ({ sources: [PromptsStorage.local] }),
				itemProvider: {
					onDidChange: emitter.event,
					provideChatSessionCustomizations: async () => [
						{ uri: URI.parse('file:///workspace/.test/prompts/fix.prompt.md'), type: PromptsType.prompt, name: 'fix', description: 'Fix something', extensionId: undefined, pluginUri: undefined, userInvocable: undefined },
						{ uri: URI.parse('file:///workspace/.test/skills/lint/SKILL.md'), type: PromptsType.skill, name: 'lint', description: 'Lint skill', extensionId: undefined, pluginUri: undefined, userInvocable: undefined },
						{ uri: URI.parse('file:///workspace/.test/instructions/rule.instructions.md'), type: PromptsType.instructions, name: 'rule', description: 'Ignore me', extensionId: undefined, pluginUri: undefined, userInvocable: undefined },
						{ uri: URI.parse('file:///workspace/.test/skills/disabled/SKILL.md'), type: PromptsType.skill, name: 'disabled', enabled: false, extensionId: undefined, pluginUri: undefined, userInvocable: undefined },
					],
				},
			});

			const commands = await service.getSlashCommands(testSessionType, CancellationToken.None);
			assert.deepStrictEqual(commands.map(command => ({ name: command.name, type: command.type })), [
				{ name: 'fix', type: PromptsType.prompt },
				{ name: 'lint', type: PromptsType.skill },
			]);
		});

		test('falls back to promptsService when the active harness has no provider', async () => {

			const testSessionType = 'test-session-type';
			const promptsService = new class extends MockPromptsService {
				override async getPromptSlashCommands() {
					return [
						{ uri: URI.parse('file:///workspace/.github/prompts/explain.prompt.md'), name: 'explain', type: PromptsType.prompt, storage: PromptsStorage.local, userInvocable: false, sessionTypes: [testSessionType] },
						{ uri: URI.parse('file:///workspace/.github/skills/review/SKILL.md'), name: 'review', type: PromptsType.skill, storage: PromptsStorage.user, userInvocable: true },
					];
				}
				override isValidSlashCommandName() { return true; }
			};
			const service = new CustomizationHarnessServiceBase([createVSCodeHarnessDescriptor([PromptsStorage.extension])], SessionType.Local, promptsService);
			store.add(service);
			{
				const commands = await service.getSlashCommands(testSessionType, CancellationToken.None);
				assert.deepStrictEqual(commands.map(command => ({ name: command.name, type: command.type, userInvocable: command.userInvocable, sessionTypes: command.sessionTypes })), [
					{ name: 'explain', type: PromptsType.prompt, userInvocable: false, sessionTypes: [testSessionType] },
					{ name: 'review', type: PromptsType.skill, userInvocable: true, sessionTypes: undefined },
				]);
			}
			{
				const commands = await service.getSlashCommands(SessionType.Local, CancellationToken.None);
				assert.deepStrictEqual(commands.map(command => ({ name: command.name, type: command.type, userInvocable: command.userInvocable, sessionTypes: command.sessionTypes })), [
					{ name: 'review', type: PromptsType.skill, userInvocable: true, sessionTypes: undefined },
				]);
			}
		});
	});

	suite('getCustomAgents', () => {
		const createAgent = (name: string, path: string, sessionTypes: readonly string[] | undefined, enabled: boolean): ICustomAgent => ({
			uri: URI.parse(path),
			name,
			target: Target.GitHubCopilot,
			visibility: { userInvocable: true, agentInvocable: true },
			agentInstructions: { content: '', toolReferences: [] },
			source: { storage: PromptsStorage.local },
			sessionTypes,
			enabled,
		});

		test('falls back to promptsService and filters by session type', async () => {
			const testSessionType = 'test-session-type';
			const promptsService = new MockPromptsService();
			promptsService.setCustomModes([
				createAgent('matching', 'file:///workspace/.github/agents/matching.agent.md', [testSessionType], true),
				createAgent('global', 'file:///workspace/.github/agents/global.agent.md', undefined, true),
				createAgent('other', 'file:///workspace/.github/agents/other.agent.md', ['other-session'], true),
			]);
			const service = new CustomizationHarnessServiceBase([createVSCodeHarnessDescriptor([PromptsStorage.extension])], SessionType.Local, promptsService);
			store.add(service);

			const agents = await service.getCustomAgents(testSessionType, CancellationToken.None);
			assert.deepStrictEqual(agents.map(agent => agent.name), ['matching', 'global']);
		});

		test('uses provider item URIs to scope resolved custom agents', async () => {
			const testSessionType1 = 'test-session-type1';
			const testSessionType2 = 'test-session-type2';
			const promptsService = new MockPromptsService();
			promptsService.setCustomModes([
				createAgent('selected', 'file:///workspace/.test/agents/selected.agent.md', undefined, true),
				createAgent('not-selected', 'file:///workspace/.test/agents/not-selected.agent.md', undefined, false),
			]);

			const emitter = new Emitter<void>();
			store.add(emitter);
			const service = new CustomizationHarnessServiceBase([{
				id: testSessionType1,
				label: 'Test Extension',
				icon: ThemeIcon.fromId('extensions'),
				getStorageSourceFilter: () => ({ sources: [PromptsStorage.local] }),
				itemProvider: {
					onDidChange: emitter.event,
					provideChatSessionCustomizations: async () => [
						{ uri: URI.parse('file:///workspace/.test/agents/enabled.agent.md'), type: PromptsType.agent, name: 'enabled', enabled: true, extensionId: undefined, pluginUri: undefined, userInvocable: undefined },
						{ uri: URI.parse('file:///workspace/.test/agents/disabled.agent.md'), type: PromptsType.agent, name: 'disabled', enabled: false, extensionId: undefined, pluginUri: undefined, userInvocable: undefined },
					],
				},
			}], testSessionType1, promptsService);
			store.add(service);
			{
				const agents = (await service.getCustomAgents(testSessionType1, CancellationToken.None));
				assert.deepStrictEqual(agents.map(agent => [agent.name, agent.enabled]), [['enabled', true], ['disabled', false]]);
			}
			{
				const agents = (await service.getCustomAgents(testSessionType2, CancellationToken.None));
				assert.deepStrictEqual(agents.map(agent => [agent.name, agent.enabled]), [['selected', true], ['not-selected', false]]);
			}
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
