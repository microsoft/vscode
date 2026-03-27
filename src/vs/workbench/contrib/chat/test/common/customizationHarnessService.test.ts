/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CustomizationHarness, CustomizationHarnessServiceBase, createVSCodeHarnessDescriptor, IExternalCustomizationItemProvider, IHarnessDescriptor, matchesWorkspaceSubpath } from '../../common/customizationHarnessService.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';

suite('CustomizationHarnessService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(...harnesses: IHarnessDescriptor[]): CustomizationHarnessServiceBase {
		if (harnesses.length === 0) {
			harnesses = [createVSCodeHarnessDescriptor([PromptsStorage.extension])];
		}
		return new CustomizationHarnessServiceBase(harnesses, harnesses[0].id);
	}

	suite('registerExternalHarness', () => {
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
			assert.strictEqual(service.activeHarness.get(), CustomizationHarness.VSCode);
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
				{ uri: URI.parse('file:///workspace/.claude/SKILL.md'), type: 'skill', name: 'Test Skill', description: 'A test skill' },
			];

			const itemProvider: IExternalCustomizationItemProvider = {
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
