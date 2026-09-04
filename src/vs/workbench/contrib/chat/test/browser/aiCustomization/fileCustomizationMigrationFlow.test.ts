/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { IManagedHover } from '../../../../../../base/browser/ui/hover/hover.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { AICustomizationSources, IAICustomizationWorkspaceService } from '../../../common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService, ICustomizationSourceFolder } from '../../../common/customizationHarnessService.js';
import { CustomizationMigrationType, ICustomizationMigrationService, MigratableConfiguration } from '../../../common/promptSyntax/service/customizationMigrationService.js';
import { PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { PromptFileSource, PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { CustomizationMigrationCategoryId, getCustomizationMigrationCategory } from '../../../browser/aiCustomization/customizationMigrationCategories.js';
import { CustomizationMigrationRunCoordinator, FileCustomizationMigrationFlow, ICustomizationMigrationRunCoordinator } from '../../../browser/aiCustomization/fileCustomizationMigrationFlow.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';

interface ITestFlowOptions {
	readonly candidates?: readonly MigratableConfiguration[];
	readonly enabled?: boolean;
	readonly sourceFolders?: ReadonlyMap<PromptsType, readonly ICustomizationSourceFolder[]>;
	readonly pick?: (items: readonly { folder: ICustomizationSourceFolder }[]) => Promise<{ folder: ICustomizationSourceFolder } | undefined>;
	readonly runCoordinator?: ICustomizationMigrationRunCoordinator;
}

suite('FileCustomizationMigrationFlow', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createTestFlow(categoryId: CustomizationMigrationCategoryId, options: ITestFlowOptions = {}) {
		const category = getCustomizationMigrationCategory(categoryId);
		const values = new Map<string, unknown>([[category.enablementSetting, options.enabled ?? true]]);
		const configurationService = {
			getValue: (key: string) => values.get(key),
			onDidChangeConfiguration: Event.None,
		} as IConfigurationService;
		const activeHarness = observableValue('activeHarness', 'agent-host-test');
		const activeSessionResource = observableValue('activeSessionResource', URI.parse('agent-host-test:/session-a'));
		const computeSessions: string[] = [];
		let candidates = options.candidates ?? [];
		let sourceFolders = options.sourceFolders ?? new Map<PromptsType, readonly ICustomizationSourceFolder[]>();
		const migrationService = {
			computeMigration: async (sessionResource: URI, type: CustomizationMigrationType) => {
				computeSessions.push(sessionResource.path);
				return { type, files: candidates.map(candidate => candidate.uri), candidates };
			},
		} as unknown as ICustomizationMigrationService;
		const harnessService = {
			activeHarness,
			activeSessionResource,
			getActiveDescriptor: () => ({ label: 'Copilot' }),
			findHarnessById: () => ({
				label: 'Copilot',
				itemProvider: {
					provideSourceFolders: async (_sessionResource: URI, type: PromptsType) => sourceFolders.get(type) ?? [],
				},
			}),
		} as unknown as ICustomizationHarnessService;
		const workspaceService = {
			isSessionsWindow: false,
			getActiveProjectRoot: () => undefined,
			deleteFiles: async () => undefined,
		} as unknown as IAICustomizationWorkspaceService;
		const fileService = {
			readFile: async () => ({ value: VSBuffer.fromString('---\nname: test\n---\nBody') }),
			createFolder: async () => undefined,
			createFile: async () => undefined,
			del: async () => undefined,
			hasCapability: () => false,
		} as unknown as IFileService;
		const notifications: string[] = [];
		const notificationService = {
			error: (message: string) => notifications.push(message),
			warn: (message: string) => notifications.push(message),
			info: (message: string) => notifications.push(message),
		} as unknown as INotificationService;
		const dialogService = {
			confirm: async () => ({ confirmed: false }),
		} as unknown as IDialogService;
		const quickInputService = {
			pick: options.pick ?? (async (items: readonly { folder: ICustomizationSourceFolder }[]) => items[0]),
		} as unknown as IQuickInputService;
		const labelService = {
			getUriLabel: (uri: URI) => uri.path,
		} as unknown as ILabelService;
		const openerService = {
			open: async () => true,
		} as unknown as IOpenerService;
		const hoverService = {
			setupManagedHover: (): IManagedHover => ({
				dispose() { },
				show() { },
				hide() { },
				update() { },
			}),
		} as unknown as IHoverService;
		const contextMenuService = {
			showContextMenu: () => undefined,
		} as unknown as IContextMenuService;
		const runCoordinator = options.runCoordinator ?? store.add(new CustomizationMigrationRunCoordinator());
		const opened: MigratableConfiguration[] = [];
		const revealed: (readonly { uri: URI; type: PromptsType }[])[] = [];
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(ICustomizationMigrationService, migrationService);
		instantiationService.stub(ICustomizationHarnessService, harnessService);
		instantiationService.stub(IAICustomizationWorkspaceService, workspaceService);
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(INotificationService, notificationService);
		instantiationService.stub(IDialogService, dialogService);
		instantiationService.stub(IQuickInputService, quickInputService);
		instantiationService.stub(ILabelService, labelService);
		instantiationService.stub(IOpenerService, openerService);
		instantiationService.stub(IHoverService, hoverService);
		instantiationService.stub(IContextMenuService, contextMenuService);
		const flow = store.add(instantiationService.createInstance(
			FileCustomizationMigrationFlow,
			category,
			{
				openFileCustomization: async customization => { opened.push(customization); },
				revealMigratedFiles: async customizations => { revealed.push(customizations); },
			},
			runCoordinator,
		));
		const container = document.createElement('div');
		document.body.appendChild(container);
		flow.activate(container);

		return {
			flow,
			container,
			activeSessionResource,
			computeSessions,
			notifications,
			opened,
			revealed,
			runCoordinator,
			setEnabled: (enabled: boolean) => values.set(category.enablementSetting, enabled),
			setCandidates: (newCandidates: readonly MigratableConfiguration[]) => { candidates = newCandidates; },
			setSourceFolders: (newSourceFolders: ReadonlyMap<PromptsType, readonly ICustomizationSourceFolder[]>) => { sourceFolders = newSourceFolders; },
		};
	}

	function disposeTestFlow(context: ReturnType<typeof createTestFlow>): void {
		context.flow.deactivate();
		context.container.remove();
	}

	test('gates summaries on the category setting', async () => {
		const promptFile: MigratableConfiguration = {
			uri: URI.file('/workspace/.github/prompts/review.prompt.md'),
			storage: PromptsStorage.local,
			type: PromptsType.prompt,
			source: PromptFileSource.GitHubWorkspace,
		};
		const context = createTestFlow(CustomizationMigrationCategoryId.PromptFiles, { candidates: [promptFile], enabled: false });
		try {
			await context.flow.refresh();
			const disabledSummary = context.flow.summary.get();
			context.setEnabled(true);
			await context.flow.refresh();

			assert.deepStrictEqual({
				disabledSummary,
				enabledSummary: context.flow.summary.get(),
			}, {
				disabledSummary: undefined,
				enabledSummary: {
					id: CustomizationMigrationCategoryId.PromptFiles,
					label: 'Migrate Prompt Files',
					description: 'Prompt files are deprecated for this harness. Found 1 workspace prompt files that local VS Code can still run, but Copilot ignores. Convert them to skills to keep them available.',
					actionLabel: 'Convert to Skills...',
					actionAriaLabel: 'Convert prompt files to skills',
					count: 1,
				},
			});
		} finally {
			disposeTestFlow(context);
		}
	});

	test('preserves selection by URI and storage across refreshes', async () => {
		const sharedUri = URI.file('/home/user/shared.prompt.md');
		const candidates: MigratableConfiguration[] = [
			{ uri: sharedUri, storage: PromptsStorage.local, type: PromptsType.prompt, source: PromptFileSource.ConfigWorkspace },
			{ uri: sharedUri, storage: PromptsStorage.user, type: PromptsType.prompt, source: PromptFileSource.ConfigPersonal },
		];
		const context = createTestFlow(CustomizationMigrationCategoryId.PromptFiles, { candidates });
		try {
			await context.flow.refresh();
			const checkboxes = context.container.querySelectorAll<HTMLElement>('.prompt-migration-checkbox [role="checkbox"]');
			checkboxes[0].click();
			await context.flow.refresh();

			assert.deepStrictEqual(
				[...context.container.querySelectorAll<HTMLElement>('.prompt-migration-checkbox [role="checkbox"]')].map(checkbox => checkbox.getAttribute('aria-checked')),
				['false', 'true'],
			);
		} finally {
			disposeTestFlow(context);
		}
	});

	test('refreshes against the current active session', async () => {
		const context = createTestFlow(CustomizationMigrationCategoryId.UserData);
		try {
			await context.flow.refresh();
			context.activeSessionResource.set(URI.parse('agent-host-test:/session-b'), undefined);
			await context.flow.refresh();

			assert.deepStrictEqual(context.computeSessions, ['/session-a', '/session-b']);
		} finally {
			disposeTestFlow(context);
		}
	});

	test('suppresses prompt refreshes only while migration writes are in progress', async () => {
		const context = createTestFlow(CustomizationMigrationCategoryId.UserData);
		try {
			await context.flow.refresh();
			const runLock = context.runCoordinator.tryAcquire();
			assert.ok(runLock);
			context.flow.refreshFromPromptChange();
			await new Promise(resolve => setTimeout(resolve, 0));
			const writeLock = context.runCoordinator.beginWrite();
			context.flow.refreshFromPromptChange();
			await new Promise(resolve => setTimeout(resolve, 0));
			writeLock.dispose();
			context.flow.refreshFromPromptChange();
			await new Promise(resolve => setTimeout(resolve, 0));
			runLock.dispose();

			assert.deepStrictEqual(context.computeSessions, ['/session-a', '/session-a', '/session-a']);
		} finally {
			disposeTestFlow(context);
		}
	});

	test('renders migration banners with destination consequences', async () => {
		const candidates: MigratableConfiguration[] = [
			{
				uri: URI.file('/user-data/prompts/legacy.agent.md'),
				name: 'legacy.agent.md',
				storage: PromptsStorage.user,
				type: PromptsType.agent,
				source: PromptFileSource.UserData,
			},
			{
				uri: URI.file('/user-data/prompts/style.instructions.md'),
				name: 'style.instructions.md',
				storage: PromptsStorage.user,
				type: PromptsType.instructions,
				source: PromptFileSource.UserData,
			},
		];
		const sourceFolders = new Map<PromptsType, readonly ICustomizationSourceFolder[]>([
			[PromptsType.agent, [{ uri: URI.file('/home/test/.copilot/agents'), label: '~/.copilot', source: AICustomizationSources.user }]],
			[PromptsType.instructions, [{ uri: URI.file('/home/test/.copilot/instructions'), label: '~/.copilot', source: AICustomizationSources.user }]],
		]);
		const context = createTestFlow(CustomizationMigrationCategoryId.UserData, { candidates, sourceFolders });
		try {
			await context.flow.refresh();

			assert.deepStrictEqual({
				message: context.container.querySelector('.customization-migration-banner-message')?.textContent,
				consequence: context.container.querySelector('.customization-migration-banner-consequence')?.textContent,
				descriptionHidden: context.container.querySelector<HTMLElement>('.section-title-description')?.style.display === 'none',
				linkInBanner: context.container.querySelector('.customization-migration-banner-content .migration-learn-more-link') !== null,
			}, {
				message: 'They are stored in user data, which only VS Code reads. Move them to \'~/.copilot\' so both VS Code and this harness can use them, keeping their name, type, and content.',
				consequence: 'Migrated files aren\'t currently included in Settings Sync.',
				descriptionHidden: true,
				linkInBanner: true,
			});
		} finally {
			disposeTestFlow(context);
		}
	});

	test('opens migration candidates with the shared Button widget', async () => {
		const promptFile: MigratableConfiguration = {
			uri: URI.file('/workspace/.github/prompts/review.prompt.md'),
			name: 'Review',
			storage: PromptsStorage.local,
			type: PromptsType.prompt,
			source: PromptFileSource.GitHubWorkspace,
		};
		const context = createTestFlow(CustomizationMigrationCategoryId.PromptFiles, { candidates: [promptFile] });
		try {
			await context.flow.refresh();
			const openButton = context.container.querySelector<HTMLElement>('.prompt-migration-open-button');
			const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
			Object.defineProperty(event, 'keyCode', { get: () => 13 });
			openButton?.dispatchEvent(event);

			assert.deepStrictEqual({
				tagName: openButton?.tagName,
				role: openButton?.getAttribute('role'),
				ariaLabel: openButton?.getAttribute('aria-label'),
				opened: context.opened,
			}, {
				tagName: 'A',
				role: 'button',
				ariaLabel: 'Open Review, /workspace/.github/prompts/review.prompt.md',
				opened: [promptFile],
			});
		} finally {
			disposeTestFlow(context);
		}
	});

	test('disables migration while another category holds the shared run lock', async () => {
		const runCoordinator = store.add(new CustomizationMigrationRunCoordinator());
		const runLock = runCoordinator.tryAcquire();
		assert.ok(runLock);
		const promptFile: MigratableConfiguration = {
			uri: URI.file('/workspace/review.prompt.md'),
			storage: PromptsStorage.local,
			type: PromptsType.prompt,
			source: PromptFileSource.GitHubWorkspace,
		};
		const context = createTestFlow(CustomizationMigrationCategoryId.PromptFiles, { candidates: [promptFile], runCoordinator });
		try {
			await context.flow.refresh();
			const migrateButton = context.container.querySelector<HTMLElement>('.prompt-migration-button');
			const whileLocked = migrateButton?.classList.contains('disabled');
			runLock.dispose();

			assert.deepStrictEqual({
				whileLocked,
				afterRelease: migrateButton?.classList.contains('disabled'),
			}, {
				whileLocked: true,
				afterRelease: false,
			});
		} finally {
			runLock.dispose();
			disposeTestFlow(context);
		}
	});

	test('uses one destination group for mixed user data when explicitly identified', async () => {
		let pickerInvocationCount = 0;
		const customizations = [
			{ uri: URI.file('/user-data/reviewer.agent.md'), storage: PromptsStorage.user, type: PromptsType.agent, source: PromptFileSource.UserData },
			{ uri: URI.file('/user-data/review.instructions.md'), storage: PromptsStorage.user, type: PromptsType.instructions, source: PromptFileSource.UserData },
		] as const satisfies readonly MigratableConfiguration[];
		const availableSourceFolders = new Map<PromptsType, readonly ICustomizationSourceFolder[]>([
			[PromptsType.agent, [
				{ uri: URI.file('/home/test/.copilot/agents'), label: 'Copilot', source: PromptsStorage.user, destinationGroupId: 'copilot' },
				{ uri: URI.file('/home/test/.claude/agents'), label: 'Claude', source: PromptsStorage.user, destinationGroupId: 'claude' },
			]],
			[PromptsType.instructions, [
				{ uri: URI.file('/home/test/.copilot/instructions'), label: 'Copilot', source: PromptsStorage.user, destinationGroupId: 'copilot' },
				{ uri: URI.file('/home/test/.claude/rules'), label: 'Claude', source: PromptsStorage.user, destinationGroupId: 'claude' },
			]],
		]);
		const context = createTestFlow(CustomizationMigrationCategoryId.UserData, {
			pick: async items => {
				pickerInvocationCount++;
				return items[0];
			},
		});
		try {
			const targetFolders = await context.flow.resolveTargetFolders(customizations, availableSourceFolders, context.activeSessionResource.get());

			assert.deepStrictEqual({
				pickerInvocationCount,
				agentTarget: targetFolders?.get(PromptsType.agent)?.get(PromptsStorage.user)?.uri.path,
				instructionsTarget: targetFolders?.get(PromptsType.instructions)?.get(PromptsStorage.user)?.uri.path,
			}, {
				pickerInvocationCount: 1,
				agentTarget: '/home/test/.copilot/agents',
				instructionsTarget: '/home/test/.copilot/instructions',
			});
		} finally {
			disposeTestFlow(context);
		}
	});

	test('does not let an automatic target constrain a later folder choice', async () => {
		let pickerInvocationCount = 0;
		const customizations = [
			{ uri: URI.file('/user-data/reviewer.agent.md'), storage: PromptsStorage.user, type: PromptsType.agent, source: PromptFileSource.UserData },
			{ uri: URI.file('/user-data/review.instructions.md'), storage: PromptsStorage.user, type: PromptsType.instructions, source: PromptFileSource.UserData },
		] as const satisfies readonly MigratableConfiguration[];
		const availableSourceFolders = new Map<PromptsType, readonly ICustomizationSourceFolder[]>([
			[PromptsType.agent, [
				{ uri: URI.file('/home/test/.copilot/agents'), label: 'Copilot', source: PromptsStorage.user, destinationGroupId: 'copilot' },
			]],
			[PromptsType.instructions, [
				{ uri: URI.file('/home/test/.copilot/instructions'), label: 'Copilot', source: PromptsStorage.user, destinationGroupId: 'copilot' },
				{ uri: URI.file('/home/test/.claude/rules'), label: 'Claude', source: PromptsStorage.user, destinationGroupId: 'claude' },
			]],
		]);
		const context = createTestFlow(CustomizationMigrationCategoryId.UserData, {
			pick: async items => {
				pickerInvocationCount++;
				return items[1];
			},
		});
		try {
			const targetFolders = await context.flow.resolveTargetFolders(customizations, availableSourceFolders, context.activeSessionResource.get());

			assert.deepStrictEqual({
				pickerInvocationCount,
				agentTarget: targetFolders?.get(PromptsType.agent)?.get(PromptsStorage.user)?.uri.path,
				instructionsTarget: targetFolders?.get(PromptsType.instructions)?.get(PromptsStorage.user)?.uri.path,
			}, {
				pickerInvocationCount: 1,
				agentTarget: '/home/test/.copilot/agents',
				instructionsTarget: '/home/test/.claude/rules',
			});
		} finally {
			disposeTestFlow(context);
		}
	});

	test('does not infer destination groups from folder parents', async () => {
		let pickerInvocationCount = 0;
		const customizations = [
			{ uri: URI.file('/user-data/reviewer.agent.md'), storage: PromptsStorage.user, type: PromptsType.agent, source: PromptFileSource.UserData },
			{ uri: URI.file('/user-data/review.instructions.md'), storage: PromptsStorage.user, type: PromptsType.instructions, source: PromptFileSource.UserData },
		] as const satisfies readonly MigratableConfiguration[];
		const availableSourceFolders = new Map<PromptsType, readonly ICustomizationSourceFolder[]>([
			[PromptsType.agent, [
				{ uri: URI.file('/home/test/.copilot/agents'), label: 'Copilot', source: PromptsStorage.user },
				{ uri: URI.file('/home/test/.claude/agents'), label: 'Claude', source: PromptsStorage.user },
			]],
			[PromptsType.instructions, [
				{ uri: URI.file('/home/test/.copilot/instructions'), label: 'Copilot', source: PromptsStorage.user },
				{ uri: URI.file('/home/test/.claude/rules'), label: 'Claude', source: PromptsStorage.user },
			]],
		]);
		const context = createTestFlow(CustomizationMigrationCategoryId.UserData, {
			pick: async items => {
				pickerInvocationCount++;
				return items[0];
			},
		});
		try {
			await context.flow.resolveTargetFolders(customizations, availableSourceFolders, context.activeSessionResource.get());
			assert.strictEqual(pickerInvocationCount, 2);
		} finally {
			disposeTestFlow(context);
		}
	});
});
