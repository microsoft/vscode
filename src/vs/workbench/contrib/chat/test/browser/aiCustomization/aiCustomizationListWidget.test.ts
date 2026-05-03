/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { AICustomizationListWidget } from '../../../browser/aiCustomization/aiCustomizationListWidget.js';
import { IAICustomizationItemsModel } from '../../../browser/aiCustomization/aiCustomizationItemsModel.js';
import { extractExtensionIdFromPath, getCustomizationSecondaryText, truncateToFirstLine } from '../../../browser/aiCustomization/aiCustomizationListWidgetUtils.js';
import { AICustomizationManagementSection, IAICustomizationWorkspaceService, IStorageSourceFilter } from '../../../common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService, IHarnessDescriptor } from '../../../common/customizationHarnessService.js';
import { ContributionEnablementState } from '../../../common/enablement.js';
import { IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { IPromptsService, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { ResourceSet } from '../../../../../../base/common/map.js';

suite('aiCustomizationListWidget', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('truncateToFirstLine', () => {
		test('keeps first line when text has multiple lines', () => {
			assert.strictEqual(
				truncateToFirstLine('First line\nSecond line'),
				'First line'
			);
		});

		test('returns full text when no newline is present', () => {
			assert.strictEqual(
				truncateToFirstLine('No newline here. Even with sentences.'),
				'No newline here. Even with sentences.'
			);
		});

		test('handles carriage return line endings', () => {
			assert.strictEqual(
				truncateToFirstLine('First line\r\nSecond line'),
				'First line'
			);
		});
	});

	suite('getCustomizationSecondaryText', () => {
		test('keeps hook descriptions intact', () => {
			assert.strictEqual(
				getCustomizationSecondaryText('echo "setup". echo "run".', 'hook.json', PromptsType.hook),
				'echo "setup". echo "run".'
			);
		});

		test('truncates non-hook descriptions to the first line', () => {
			assert.strictEqual(
				getCustomizationSecondaryText('Show the first line.\nHide the rest.', 'prompt.md', PromptsType.prompt),
				'Show the first line.'
			);
		});

		test('falls back to filename when description is missing', () => {
			assert.strictEqual(
				getCustomizationSecondaryText(undefined, 'prompt.md', PromptsType.prompt),
				'prompt.md'
			);
		});
	});

	suite('extractExtensionIdFromPath', () => {
		test('extracts extension ID from copilot-chat extension path', () => {
			assert.strictEqual(
				extractExtensionIdFromPath('/Users/josh/.vscode-insiders/extensions/github.copilot-chat-0.43.2026040602/assets/prompts/skills/agent-customization/SKILL.md'),
				'github.copilot-chat'
			);
		});

		test('extracts extension ID from PR extension path', () => {
			assert.strictEqual(
				extractExtensionIdFromPath('/Users/josh/.vscode-insiders/extensions/github.vscode-pull-request-github-0.135.2026040604/src/lm/skills/SKILL.md'),
				'github.vscode-pull-request-github'
			);
		});

		test('extracts extension ID from Code OSS dev path', () => {
			assert.strictEqual(
				extractExtensionIdFromPath('/Users/josh/.vscode-oss-dev/extensions/github.copilot-chat-0.43.2026040602/assets/prompts/skills/troubleshoot/SKILL.md'),
				'github.copilot-chat'
			);
		});

		test('extracts extension ID from Windows-style path', () => {
			assert.strictEqual(
				extractExtensionIdFromPath('C:/Users/dev/.vscode/extensions/ms-python.python-2024.1.1/skills/SKILL.md'),
				'ms-python.python'
			);
		});

		test('returns undefined for workspace paths', () => {
			assert.strictEqual(
				extractExtensionIdFromPath('/Users/josh/git/vscode/.github/skills/accessibility/SKILL.md'),
				undefined
			);
		});

		test('returns undefined for user home paths', () => {
			assert.strictEqual(
				extractExtensionIdFromPath('/Users/josh/.copilot/skills/ios-project-setup/SKILL.md'),
				undefined
			);
		});

		test('returns undefined for plugin paths', () => {
			assert.strictEqual(
				extractExtensionIdFromPath('/Users/josh/.vscode-insiders/agent-plugins/github.com/microsoft/vscode-team-kit/model-council/skills/council-review/SKILL.md'),
				undefined
			);
		});

		test('returns undefined for bare extensions folder without version', () => {
			assert.strictEqual(
				extractExtensionIdFromPath('/workspace/extensions/my-extension/SKILL.md'),
				undefined
			);
		});

		test('extracts extension ID from User/globalStorage path (Copilot Chat ask agent)', () => {
			assert.strictEqual(
				extractExtensionIdFromPath('/Users/josh/.vscode-oss-dev/User/globalStorage/github.copilot-chat/ask-agent/Ask.agent.md'),
				'github.copilot-chat'
			);
		});

		test('extracts extension ID from User/globalStorage path on Insiders', () => {
			assert.strictEqual(
				extractExtensionIdFromPath('/Users/josh/Library/Application Support/Code - Insiders/User/globalStorage/github.copilot-chat/ask-agent/Ask.agent.md'),
				'github.copilot-chat'
			);
		});

		test('returns undefined for non-extension entries in globalStorage', () => {
			// e.g. `state.vscdb` or other workspace storage that lacks a publisher.name pattern
			assert.strictEqual(
				extractExtensionIdFromPath('/Users/josh/.vscode-oss-dev/User/globalStorage/state.vscdb'),
				undefined
			);
		});
	});

	suite('disposed widget', () => {

		let disposables: DisposableStore;
		let instaService: TestInstantiationService;

		const descriptor: IHarnessDescriptor = {
			id: 'test',
			label: 'Test',
			icon: Codicon.settingsGear,
			getStorageSourceFilter: (): IStorageSourceFilter => ({ sources: [PromptsStorage.local, PromptsStorage.user] }),
			itemProvider: {
				onDidChange: Event.None,
				provideChatSessionCustomizations: (_token: CancellationToken) => Promise.resolve(undefined),
			},
		};

		setup(() => {
			disposables = new DisposableStore();
			instaService = workbenchInstantiationService({}, disposables);

			instaService.stub(IPromptsService, {
				onDidChangeCustomAgents: Event.None,
				onDidChangeSlashCommands: Event.None,
				onDidChangeSkills: Event.None,
				onDidChangeHooks: Event.None,
				onDidChangeInstructions: Event.None,
				listPromptFiles: async () => [],
				getCustomAgents: async () => [],
				findAgentSkills: async () => [],
				getHooks: async () => undefined,
				getInstructionFiles: async () => [],
				getDisabledPromptFiles: () => new ResourceSet(),
			});

			instaService.stub(IAICustomizationWorkspaceService, {
				activeProjectRoot: observableValue('test', undefined),
				getActiveProjectRoot: () => undefined,
				managementSections: [AICustomizationManagementSection.Agents],
				isSessionsWindow: false,
				welcomePageFeatures: { showGettingStartedBanner: false },
				getStorageSourceFilter: () => ({ sources: [] }),
				getSkillUIIntegrations: () => new Map(),
				hasOverrideProjectRoot: observableValue('test', false),
				commitFiles: async () => { },
				deleteFiles: async () => { },
				generateCustomization: async () => { },
				setOverrideProjectRoot: () => { },
				clearOverrideProjectRoot: () => { },
			});

			instaService.stub(ICustomizationHarnessService, {
				activeHarness: observableValue('test', 'test'),
				availableHarnesses: observableValue('test', [descriptor]),
				setActiveHarness: () => { },
				getStorageSourceFilter: () => ({ sources: [] }),
				getActiveDescriptor: () => descriptor,
				findHarnessById: (id) => id === descriptor.id ? descriptor : undefined,
				registerExternalHarness: () => ({ dispose() { } }),
			});

			instaService.stub(IAgentPluginService, {
				plugins: observableValue('test', []),
				enablementModel: {
					readEnabled: () => ContributionEnablementState.EnabledProfile,
					setEnabled: () => { },
					remove: () => { },
				},
			});

			instaService.stub(ICommandService, {
				executeCommand: async () => undefined,
				onWillExecuteCommand: Event.None,
				onDidExecuteCommand: Event.None,
			});

			// The widget reads items from the items model; stub it with empty
			// per-section observables. This avoids needing to wire up the full
			// ProviderCustomizationItemSource pipeline in tests.
			instaService.stub(IAICustomizationItemsModel, {
				getItems: () => observableValue('test', [] as readonly never[]),
				getCount: () => observableValue('test', 0),
				getPluginCount: () => observableValue('test', 0),
				getActiveItemSource: () => ({ onDidChange: Event.None, fetchItems: async () => [] }),
				getPromptsServiceItemProvider: () => ({ onDidChange: Event.None, provideChatSessionCustomizations: async () => undefined }),
			});
		});

		teardown(() => disposables.dispose());

		test('generateDebugReport returns empty string when widget is disposed', async () => {
			const widget = disposables.add(instaService.createInstance(AICustomizationListWidget));
			widget.dispose();
			const result = await widget.generateDebugReport();
			assert.strictEqual(result, '');
		});
	});
});
