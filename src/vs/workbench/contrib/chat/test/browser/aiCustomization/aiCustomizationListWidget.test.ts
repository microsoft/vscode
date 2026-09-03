/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { derived, observableValue } from '../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { AICustomizationListWidget, getAlwaysVisibleCustomizationGroupKeys, getTargetedCreateActionLabel, usesCustomizationCardLayout } from '../../../browser/aiCustomization/aiCustomizationListWidget.js';
import { IAICustomizationItemsModel } from '../../../browser/aiCustomization/aiCustomizationItemsModel.js';
import { extractExtensionIdFromPath, getCustomizationSecondaryText, truncateToFirstLine } from '../../../browser/aiCustomization/aiCustomizationListWidgetUtils.js';
import { AICustomizationManagementSection, IAICustomizationWorkspaceService } from '../../../common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService, IHarnessDescriptor } from '../../../common/customizationHarnessService.js';
import { ContributionEnablementState } from '../../../common/enablement.js';
import { getChatSessionType } from '../../../common/model/chatUri.js';
import { IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { IPromptsService, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
import { createCustomizationCardPrimaryAction, CustomizationCardListController } from '../../../browser/aiCustomization/customizationCardList.js';

suite('aiCustomizationListWidget', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses the inventory card layout for all file customization sections', () => {
		assert.deepStrictEqual({
			agents: usesCustomizationCardLayout(AICustomizationManagementSection.Agents),
			skills: usesCustomizationCardLayout(AICustomizationManagementSection.Skills),
			instructions: usesCustomizationCardLayout(AICustomizationManagementSection.Instructions),
			hooks: usesCustomizationCardLayout(AICustomizationManagementSection.Hooks),
			prompts: usesCustomizationCardLayout(AICustomizationManagementSection.Prompts),
		}, {
			agents: true,
			skills: true,
			instructions: true,
			hooks: true,
			prompts: true,
		});
	});

	test('keeps editable source sections visible until search filtering starts', () => {
		assert.deepStrictEqual({
			agents: getAlwaysVisibleCustomizationGroupKeys(AICustomizationManagementSection.Agents, false),
			skills: getAlwaysVisibleCustomizationGroupKeys(AICustomizationManagementSection.Skills, false),
			instructions: getAlwaysVisibleCustomizationGroupKeys(AICustomizationManagementSection.Instructions, false),
			hooks: getAlwaysVisibleCustomizationGroupKeys(AICustomizationManagementSection.Hooks, false),
			filtered: getAlwaysVisibleCustomizationGroupKeys(AICustomizationManagementSection.Agents, true),
			prompts: getAlwaysVisibleCustomizationGroupKeys(AICustomizationManagementSection.Prompts, false),
		}, {
			agents: [PromptsStorage.local, PromptsStorage.user],
			skills: [PromptsStorage.local, PromptsStorage.user],
			instructions: [PromptsStorage.local, PromptsStorage.user],
			hooks: [PromptsStorage.local, PromptsStorage.user],
			filtered: [],
			prompts: [PromptsStorage.local, PromptsStorage.user],
		});
	});

	test('uses localized compact labels instead of parsing display labels', () => {
		assert.deepStrictEqual([
			getTargetedCreateActionLabel('$(add) Nuevo agente (Espacio de trabajo)', 'Nuevo agente'),
			getTargetedCreateActionLabel('$(add) Create from provider'),
		], [
			'Nuevo agente',
			'Create from provider',
		]);
	});

	test('card lists use roving focus and expose focused-row actions', async () => {
		const disposables = new DisposableStore();
		const list = document.createElement('div');
		document.body.appendChild(list);
		const controller = disposables.add(new CustomizationCardListController(list, 'Customizations'));
		const createItem = (label: string) => {
			const row = document.createElement('div');
			const primaryAction = createCustomizationCardPrimaryAction(row, label);
			const action = document.createElement('button');
			row.appendChild(action);
			list.appendChild(row);
			controller.addItem({ row, primaryAction, label, actions: [action], contextMenuAction: action });
			return { row, primaryAction, action };
		};
		const alpha = createItem('Alpha');
		const beta = createItem('Beta');
		const disabledActionRow = document.createElement('div');
		const disabledActionPrimary = createCustomizationCardPrimaryAction(disabledActionRow, 'Disabled Action');
		const disabledAction = document.createElement('button');
		disabledAction.disabled = true;
		const enabledAction = document.createElement('button');
		disabledActionRow.append(disabledAction, enabledAction);
		list.appendChild(disabledActionRow);
		controller.addItem({ row: disabledActionRow, primaryAction: disabledActionPrimary, label: 'Disabled Action', actions: [disabledAction, enabledAction], contextMenuAction: enabledAction });
		const remoteRow = document.createElement('div');
		const remoteAction = document.createElement('button');
		remoteRow.appendChild(remoteAction);
		list.appendChild(remoteRow);
		controller.addItem({ row: remoteRow, primaryAction: remoteRow, label: 'Remote', actions: [remoteAction], contextMenuAction: remoteAction });
		controller.finalize();

		try {
			alpha.primaryAction.focus();
			alpha.primaryAction.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
			beta.primaryAction.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
			beta.action.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
			const spaceKeyEvent = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
			beta.primaryAction.dispatchEvent(spaceKeyEvent);
			disabledActionPrimary.focus();
			disabledActionPrimary.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
			const disabledActionTabTarget = document.activeElement;
			beta.primaryAction.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
			enabledAction.tabIndex = 0;
			await new Promise(resolve => setTimeout(resolve, 0));

			assert.deepStrictEqual({
				listRole: list.getAttribute('role'),
				rowRoles: [alpha.row.getAttribute('role'), beta.row.getAttribute('role'), disabledActionRow.getAttribute('role'), remoteRow.getAttribute('role')],
				positions: [alpha.row.getAttribute('aria-posinset'), beta.row.getAttribute('aria-posinset')],
				remotePosition: remoteRow.getAttribute('aria-posinset'),
				setSizes: [alpha.row.getAttribute('aria-setsize'), beta.row.getAttribute('aria-setsize'), disabledActionRow.getAttribute('aria-setsize'), remoteRow.getAttribute('aria-setsize')],
				tabIndexes: [alpha.primaryAction.tabIndex, beta.primaryAction.tabIndex, remoteRow.tabIndex, alpha.action.tabIndex, beta.action.tabIndex, remoteAction.tabIndex],
				spaceDefaultPrevented: spaceKeyEvent.defaultPrevented,
				disabledActionTabIndexes: [disabledAction.tabIndex, enabledAction.tabIndex],
				disabledActionTabTarget,
				activeElement: document.activeElement,
			}, {
				listRole: 'list',
				rowRoles: ['listitem', 'listitem', 'listitem', 'listitem'],
				positions: ['1', '2'],
				remotePosition: '4',
				setSizes: ['4', '4', '4', '4'],
				tabIndexes: [0, -1, -1, -1, -1, -1],
				spaceDefaultPrevented: false,
				disabledActionTabIndexes: [-1, -1],
				disabledActionTabTarget: enabledAction,
				activeElement: alpha.primaryAction,
			});
		} finally {
			disposables.dispose();
			list.remove();
		}
	});

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
		const searchBarHeight = 40;
		const headerHeight = 30;
		const setLayoutHeights = (widget: AICustomizationListWidget, clientHeight: number): void => {
			Object.defineProperty(widget.element, 'clientHeight', { configurable: true, value: clientHeight });
			Object.defineProperty(widget.element.querySelector('.list-search-and-button-container')!, 'offsetHeight', { configurable: true, value: searchBarHeight });
			Object.defineProperty(widget.element.querySelector('.section-title-header')!, 'offsetHeight', { configurable: true, value: headerHeight });
		};

		const descriptor: IHarnessDescriptor = {
			id: 'test',
			label: 'Test',
			icon: Codicon.settingsGear,
			itemProvider: {
				onDidChange: Event.None,
				provideChatSessionCustomizations: (sessionResource: URI, token: CancellationToken) => Promise.resolve(undefined),
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
				activeProjectLabel: observableValue('test', undefined),
				getActiveProjectRoot: () => undefined,
				managementSections: [AICustomizationManagementSection.Agents],
				isSessionsWindow: false,
				welcomePageFeatures: { showGettingStartedBanner: false },
				getSkillUIIntegrations: () => new Map(),
				hasOverrideProjectRoot: observableValue('test', false),
				commitFiles: async () => { },
				deleteFiles: async () => { },
				generateCustomization: async () => { },
				setOverrideProjectRoot: () => { },
				clearOverrideProjectRoot: () => { },
			});

			const activeSessionResource = observableValue('test', URI.parse('test:///session'));
			const activeHarness = derived(reader => getChatSessionType(activeSessionResource.read(reader)));

			instaService.stub(ICustomizationHarnessService, {
				activeSessionResource,
				activeHarness,
				availableHarnesses: observableValue('test', [descriptor]),
				setActiveSession: () => { },
				getActiveDescriptor: () => descriptor,
				findHarnessById: (id) => id === descriptor.id ? descriptor : undefined,
				registerExternalHarness: () => ({ dispose() { } }),
			});

			instaService.stub(IAgentPluginService, {
				plugins: observableValue('test', []),
				enablementModel: {
					readEnabled: () => ContributionEnablementState.EnabledProfile,
					readProfileEnabled: () => true,
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
				getActiveItemSource: () => ({ onDidAICustomizationItemsChange: Event.None, fetchProviderItems: async () => [], fetchAICustomizationItems: async () => [], fetchSourceFolders: async () => [], sessionResource: activeSessionResource.get(), dispose() { } }),
			});
		});

		teardown(() => disposables.dispose());

		test('generateDebugReport returns empty string when widget is disposed', async () => {
			const widget = disposables.add(instaService.createInstance(AICustomizationListWidget));
			widget.dispose();
			const result = await widget.generateDebugReport();
			assert.strictEqual(result, '');
		});

		test('uses the rendered container height for list layout when available', () => {
			const widget = disposables.add(instaService.createInstance(AICustomizationListWidget));
			document.body.appendChild(widget.element);
			disposables.add(toDisposable(() => widget.element.remove()));

			setLayoutHeights(widget, 500);

			widget.layout(900, 320);

			assert.strictEqual(widget.element.querySelector<HTMLElement>('.list-container')!.style.height, '430px');
		});

		test('falls back to supplied layout height when rendered container height is 0', () => {
			const widget = disposables.add(instaService.createInstance(AICustomizationListWidget));
			document.body.appendChild(widget.element);
			disposables.add(toDisposable(() => widget.element.remove()));

			setLayoutHeights(widget, 0);

			widget.layout(900, 320);

			assert.strictEqual(widget.element.querySelector<HTMLElement>('.list-container')!.style.height, '830px');
		});
	});
});
