/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { autorun, constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { isIMenuItem, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { testWorkspace } from '../../../../../../platform/workspace/test/common/testWorkspace.js';
import { CustomizationMarketplaceMediaType, ICustomizationMarketplaceResource } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { AGENT_BUILTIN_CUSTOMIZATION_SCHEME } from '../../../../../../platform/agentHost/common/agentHostCustomizationUri.js';
import { toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import '../../../browser/aiCustomization/aiCustomizationManagement.contribution.js';
import {
	AI_CUSTOMIZATION_ITEM_PLUGIN_REQUIRED_KEY,
	AI_CUSTOMIZATION_ITEM_PLUGIN_URI_KEY,
	AI_CUSTOMIZATION_ITEM_STORAGE_KEY,
	AICustomizationManagementItemMenuId,
	AICustomizationManagementSyntheticItemMenuId,
	DELETE_AI_CUSTOMIZATION_ID,
	getAICustomizationManagementItemMenuId,
} from '../../../browser/aiCustomization/aiCustomizationManagement.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { aiCustomizationManagementSectionRegistry } from '../../../browser/aiCustomization/aiCustomizationManagementSectionRegistry.js';
import { AICustomizationManagementCommands, AICustomizationManagementSection, AICustomizationSources, IAICustomizationWorkspaceService } from '../../../common/aiCustomizationWorkspaceService.js';
import { createCustomizationMarketplaceInstallationSnapshot, ICustomizationMarketplaceInstallService, RecordedCustomizationMarketplaceInstallState } from '../../../common/customizationMarketplaceInstallService.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { IPromptsService, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { IAgentPlugin, IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { IConfirmationResult, IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { ICustomizationHarnessService } from '../../../common/customizationHarnessService.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { AICustomizationManagementEditorInput } from '../../../browser/aiCustomization/aiCustomizationManagementEditorInput.js';
import { AICustomizationWorkspaceService } from '../../../browser/aiCustomization/aiCustomizationWorkspaceService.js';
import { IAgentHostCustomizationService } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { resolveWorkspaceTargetDirectory } from '../../../browser/aiCustomization/customizationCreatorService.js';
import { LocalChatSessionUri } from '../../../common/model/chatUri.js';

suite('AI customization management contribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const fileActionIds = new Set([
		'aiCustomizationManagement.openFile',
		'aiCustomizationManagement.runPrompt',
		'aiCustomizationManagement.copyPath',
		'aiCustomizationManagement.delete',
		'aiCustomizationManagement.installChatCustomizationExtension',
	]);

	test('Marketplace is not registered as a separate management section', () => {
		assert.strictEqual(aiCustomizationManagementSectionRegistry.getDefault(AICustomizationManagementSection.Marketplace), undefined);
	});

	test('an explicit sessionResource uses its workspace in a different project or an empty editor window', async () => {
		const resource = URI.parse('agent-host-copilot:/selected-session');
		const harnessTargets: URI[] = [];
		const opened: { description: string | undefined; project: string | undefined; root: string | undefined; creationDirectory: string | undefined }[] = [];
		const instantiationService = workbenchInstantiationService({}, store);
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			lastFocusedWidget: upcastPartial<IChatWidget>({
				input: upcastPartial<IChatWidget['input']>({ pendingDelegationTarget: 'agent-host-claude' }),
				viewModel: upcastPartial<NonNullable<IChatWidget['viewModel']>>({ sessionResource: URI.parse('local:/focused-session') }),
			}),
		}));
		instantiationService.stub(ICustomizationHarnessService, new class extends mock<ICustomizationHarnessService>() {
			override setActiveSession(target: URI) { harnessTargets.push(target); }
			override getActiveDescriptor() { return { id: 'agent-host-copilot', label: 'Copilot', icon: Codicon.copilot }; }
		}());
		const command = CommandsRegistry.getCommand(AICustomizationManagementCommands.OpenEditor)!;
		for (const windowRoots of [[URI.file('/window-project')], []]) {
			const workspaceService = new AICustomizationWorkspaceService(
				upcastPartial<IWorkspaceContextService>({
					onDidChangeWorkspaceFolders: Event.None,
					getWorkspace: () => testWorkspace(...windowRoots),
				}),
				upcastPartial<ICommandService>({}),
				upcastPartial<IPromptsService>({}),
				upcastPartial<IAgentHostCustomizationService>({
					onDidChangeCustomizations: Event.None,
					getClientWorkingDirectoryUris: target => target.toString() === resource.toString() ? [URI.file('/target-project')] : [],
				}),
			);
			instantiationService.stub(IAICustomizationWorkspaceService, workspaceService);
			instantiationService.stub(IEditorService, upcastPartial<IEditorService>({
				openEditor: async input => {
					assert.ok(input instanceof AICustomizationManagementEditorInput);
					store.add(input);
					opened.push({
						description: input.getDescription(),
						project: workspaceService.activeProjectLabel.get(),
						root: workspaceService.getActiveProjectRoot()?.path,
						creationDirectory: resolveWorkspaceTargetDirectory(workspaceService, PromptsType.skill)?.path,
					});
					return undefined;
				},
			}));
			await instantiationService.invokeFunction(accessor => command.handler(accessor, { sessionResource: resource }));
		}
		assert.deepStrictEqual({ harnessTargets, opened }, {
			harnessTargets: [resource, resource],
			opened: Array(2).fill({
				description: '(Copilot · target-project)',
				project: 'target-project',
				root: '/target-project',
				creationDirectory: '/target-project/.agents/skills',
			}),
		});
	});

	test('session workspace hydration updates the target and clearing it restores the window workspace', () => {
		const changed = store.add(new Emitter<void>());
		const resource = URI.parse('remote-devbox-copilot:/selected-session');
		const targetRoot = URI.from({ scheme: Schemas.vscodeRemote, authority: 'ssh-remote+devbox', path: '/target-project' });
		let roots: readonly URI[] = [];
		const service = new AICustomizationWorkspaceService(
			upcastPartial<IWorkspaceContextService>({
				onDidChangeWorkspaceFolders: Event.None,
				getWorkspace: () => testWorkspace(URI.file('/window-project')),
			}),
			upcastPartial<ICommandService>({}),
			upcastPartial<IPromptsService>({}),
			upcastPartial<IAgentHostCustomizationService>({
				onDidChangeCustomizations: changed.event,
				getClientWorkingDirectoryUris: () => roots,
			}),
		);
		const observed: { root: string | undefined; label: string | undefined }[] = [];
		store.add(autorun(reader => {
			observed.push({ root: service.activeProjectRoot.read(reader)?.toString(), label: service.activeProjectLabel.read(reader) });
		}));
		service.setActiveSessionResource(resource);
		roots = [targetRoot];
		changed.fire();
		service.setActiveSessionResource(undefined);
		service.setActiveSessionResource(LocalChatSessionUri.forSession('local'));
		assert.deepStrictEqual(observed, [
			{ root: URI.file('/window-project').toString(), label: 'window-project' },
			{ root: undefined, label: undefined },
			{ root: targetRoot.toString(), label: 'target-project' },
			{ root: URI.file('/window-project').toString(), label: 'window-project' },
		]);
	});

	test('routes deletion of a recorded skill through marketplace uninstall', async () => {
		const uri = URI.file('/workspace/.github/skills/review/SKILL.md');
		const resource: ICustomizationMarketplaceResource = {
			sourceId: 'testSource',
			identifier: 'review',
			displayName: 'Review',
			description: 'Review changes',
			mediaType: CustomizationMarketplaceMediaType.Skill,
			tags: [],
			capabilities: [],
			representativeQueries: [],
		};
		const uninstallCalls: ICustomizationMarketplaceResource[] = [];
		const state: RecordedCustomizationMarketplaceInstallState = { kind: 'installed', target: { kind: 'skill', uri } };
		const installService = new class extends mock<ICustomizationMarketplaceInstallService>() {
			override readonly onDidChange = Event.None;
			override readonly installations = constObservable(createCustomizationMarketplaceInstallationSnapshot([{ resource, state }]));
			override async uninstall(candidate: ICustomizationMarketplaceResource): Promise<void> { uninstallCalls.push(candidate); }
		}();
		const instantiationService = workbenchInstantiationService({}, store);
		instantiationService.stub(ICustomizationMarketplaceInstallService, installService);
		const command = CommandsRegistry.getCommand(DELETE_AI_CUSTOMIZATION_ID);
		assert.ok(command);

		await instantiationService.invokeFunction(accessor => command.handler(accessor, {
			uri,
			name: 'Review',
			promptType: PromptsType.skill,
			storage: PromptsStorage.local,
		}));

		assert.deepStrictEqual(uninstallCalls, [resource]);
	});

	test('keeps Uninstall Plugin visible but disabled for items of a plugin the organization requires', async () => {
		const pluginUri = URI.file('/plugins/handy-commands');
		const removals: string[] = [];
		const plugin = new class extends mock<IAgentPlugin>() {
			override readonly uri = pluginUri;
			override readonly label = 'handy-commands';
			override readonly policyEnablement = constObservable<boolean | undefined>(true);
			override async remove(): Promise<boolean> {
				removals.push(this.label);
				return true;
			}
		}();
		const dialogs: string[] = [];
		const instantiationService = workbenchInstantiationService({}, store);
		instantiationService.stub(IAgentPluginService, new class extends mock<IAgentPluginService>() {
			override readonly plugins = constObservable([plugin]);
		}());
		instantiationService.stub(IDialogService, new class extends mock<IDialogService>() {
			override async info(message: string): Promise<void> { dialogs.push(message); }
			override async confirm(): Promise<IConfirmationResult> {
				dialogs.push('confirm');
				return { confirmed: true };
			}
		}());
		const context = { uri: URI.joinPath(pluginUri, 'commands', 'fix-issue.md'), name: 'fix-issue', promptType: PromptsType.prompt, storage: AICustomizationSources.plugin };
		for (const id of [DELETE_AI_CUSTOMIZATION_ID, 'aiCustomizationManagement.uninstallPlugin']) {
			await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(id)!.handler(accessor, context));
		}
		const menuItems = (required: boolean) => {
			const values: Record<string, string | boolean> = {
				[AI_CUSTOMIZATION_ITEM_STORAGE_KEY]: AICustomizationSources.plugin,
				[AI_CUSTOMIZATION_ITEM_PLUGIN_URI_KEY]: pluginUri.toString(),
				[AI_CUSTOMIZATION_ITEM_PLUGIN_REQUIRED_KEY]: required,
			};
			const itemContext = { getValue: <T>(key: string) => values[key] as T };
			return MenuRegistry.getMenuItems(AICustomizationManagementItemMenuId)
				.filter(isIMenuItem)
				.filter(item => item.command.id === 'aiCustomizationManagement.uninstallPlugin' && item.when?.evaluate(itemContext))
				.map(item => ({ group: item.group, enabled: item.command.precondition?.evaluate(itemContext) ?? true, tooltip: item.command.tooltip }));
		};

		assert.deepStrictEqual({ dialogs, removals, unmanaged: menuItems(false), required: menuItems(true) }, {
			dialogs: ['This plugin is managed by your organization.', 'This plugin is managed by your organization.'],
			removals: [],
			unmanaged: [
				{ group: 'inline', enabled: true, tooltip: undefined },
				{ group: '4_modify', enabled: true, tooltip: undefined },
			],
			required: [
				{ group: 'inline', enabled: false, tooltip: 'This plugin is managed by your organization.' },
				{ group: '4_modify', enabled: false, tooltip: undefined },
			],
		});
	});

	test('isolates synthetic items from extension-contributed item actions', () => {
		const disposables = store.add(new DisposableStore());
		disposables.add(MenuRegistry.appendMenuItem(AICustomizationManagementItemMenuId, {
			command: {
				id: 'test.extensionContributedAction',
				title: 'Extension Action',
			},
		}));

		const syntheticUri = toAgentHostUri(
			URI.from({ scheme: AGENT_BUILTIN_CUSTOMIZATION_SCHEME, path: '/skill/code-review' }),
			'remote'
		);
		const selectedMenuId = getAICustomizationManagementItemMenuId(syntheticUri);
		const syntheticActionIds = MenuRegistry.getMenuItems(selectedMenuId)
			.filter(isIMenuItem)
			.map(item => item.command.id);
		const regularActionIds = MenuRegistry.getMenuItems(AICustomizationManagementItemMenuId)
			.filter(isIMenuItem)
			.map(item => item.command.id);

		assert.deepStrictEqual({
			usesSyntheticMenu: selectedMenuId === AICustomizationManagementSyntheticItemMenuId,
			syntheticFileActions: syntheticActionIds.filter(id => fileActionIds.has(id)),
			syntheticExtensionActions: syntheticActionIds.filter(id => id === 'test.extensionContributedAction'),
			regularHasFileActions: [...fileActionIds].every(id => regularActionIds.includes(id)),
			readableUsesExtensibleMenu: getAICustomizationManagementItemMenuId(URI.file('/workspace/SKILL.md')) === AICustomizationManagementItemMenuId,
		}, {
			usesSyntheticMenu: true,
			syntheticFileActions: [],
			syntheticExtensionActions: [],
			regularHasFileActions: true,
			readableUsesExtensibleMenu: true,
		});
	});
});
