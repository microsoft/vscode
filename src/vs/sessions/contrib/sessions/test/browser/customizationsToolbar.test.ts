/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Action, IAction } from '../../../../../base/common/actions.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { decodeKeybinding } from '../../../../../base/common/keybindings.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, derived, observableValue } from '../../../../../base/common/observable.js';
import { isWeb, OS } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILocalizedString } from '../../../../../platform/action/common/action.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { ContextKeyExpr, IContext } from '../../../../../platform/contextkey/common/contextkey.js';
import { EXTENSIONS_AGENTS_WINDOW_MANAGEMENT } from '../../../../../platform/extensions/common/extensions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingResolver } from '../../../../../platform/keybinding/common/keybindingResolver.js';
import { KeybindingsRegistry } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ResolvedKeybindingItem } from '../../../../../platform/keybinding/common/resolvedKeybindingItem.js';
import { USLayoutResolvedKeybinding } from '../../../../../platform/keybinding/common/usLayoutResolvedKeybinding.js';
import { createUSLayoutResolvedKeybinding } from '../../../../../platform/keybinding/test/common/keybindingsTestUtils.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { IAICustomizationItemsModel } from '../../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationItemsModel.js';
import { CustomizationMigrationCategoryId } from '../../../../../workbench/contrib/chat/browser/aiCustomization/customizationMigrationCategories.js';
import { getCustomizationMigrationGroupIgnoreKey, storeIgnoredCustomizationMigrationGroupKeys } from '../../../../../workbench/contrib/chat/browser/aiCustomization/customizationMigrationIgnoredGroups.js';
import { IAgentHostToolSetEnablementService } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostToolSetEnablementService.js';
import { getCopilotCliBuiltinToolSet } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/copilotCliBuiltinToolSet.js';
import { AICustomizationManagementSection, IAICustomizationWorkspaceService } from '../../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService, IHarnessDescriptor } from '../../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { CustomizationMigrationType, ICustomizationMigrationHint, ICustomizationMigrationIgnoredGroup, ICustomizationMigrationService } from '../../../../../workbench/contrib/chat/common/promptSyntax/service/customizationMigrationService.js';
import { PromptsStorage } from '../../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { ILanguageModelToolsService, IToolData, IToolSet } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { IAICustomizationMcpServerCountService } from '../../../../../workbench/contrib/sessions/browser/customizationMcpServerCount.js';
import { CustomizationLinkViewItem, CustomizationsToolbarContribution } from '../../browser/customizationsToolbar.contribution.js';
import { CUSTOMIZATION_ITEMS, readCustomizationCount } from '../../../../../workbench/contrib/sessions/browser/customizationItems.js';
import { VIEWLET_ID as EXTENSIONS_VIEWLET_ID } from '../../../../../workbench/contrib/extensions/common/extensions.js';
import { CustomizationsNavigationState } from '../../../../../workbench/contrib/sessions/browser/customizationsNavigationState.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { focusedSessionHostServiceOf, ITestSessionWithChat } from '../../../../../workbench/contrib/sessions/test/browser/sessionHostTestUtils.js';
import { IFocusedSessionHostService } from '../../../../../workbench/services/sessions/browser/sessionHost.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { ChatCustomizationsTelemetry } from '../../../../../workbench/contrib/chat/browser/aiCustomization/chatCustomizationsTelemetry.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { OPEN_AI_CUSTOMIZATIONS_COMMAND_ID } from '../../../../../workbench/contrib/sessions/browser/customizationsConstants.js';
import { AICustomizationManagementEditorInput } from '../../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditorInput.js';
import { aiCustomizationManagementSectionRegistry } from '../../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementSectionRegistry.js';

suite('Customizations toolbar', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const copilotCliToolCount = [...getCopilotCliBuiltinToolSet().getTools()].length;

	function telemetryInstantiationService(onActivation: () => void = () => { }) {
		const instantiationService = workbenchInstantiationService({}, disposables);
		instantiationService.stubInstance(ChatCustomizationsTelemetry, new class extends mock<ChatCustomizationsTelemetry>() {
			override logInteraction() { onActivation(); }
		});
		return instantiationService;
	}

	test('does not include standalone Remotes management in Customizations', () => {
		assert.ok(CUSTOMIZATION_ITEMS.every(item => item.id !== 'sessions.customization.remotes'));
	});

	test('opens the modal with complete new-session target labels', async () => {
		const instantiationService = telemetryInstantiationService();
		const descriptions: (string | undefined)[] = [];
		const targeted: (URI | undefined)[] = [];
		const descriptor = upcastPartial<IHarnessDescriptor>({ id: 'copilot', label: 'Copilot', icon: Codicon.copilot });
		const harnessService = new class extends mock<ICustomizationHarnessService>() {
			override readonly activeHarness = constObservable('copilot');
			override readonly availableHarnesses = constObservable([descriptor]);
			override getActiveDescriptor() { return descriptor; }
		};
		const workspaceService = new class extends mock<IAICustomizationWorkspaceService>() {
			override readonly activeProjectLabel = constObservable('vscode');
			override readonly activeTargetLabels = constObservable({ harness: 'Copilot', workspace: 'vscode', environment: 'Cloud' });
			override setActiveSessionResource(resource: URI | undefined) { targeted.push(resource); }
		};
		instantiationService.stub(IEditorService, upcastPartial<IEditorService>({
			openEditor: async input => {
				assert.ok(input instanceof AICustomizationManagementEditorInput);
				disposables.add(input);
				descriptions.push(input.getDescription());
				return undefined;
			},
		}));
		instantiationService.stub(ICustomizationHarnessService, harnessService);
		instantiationService.stub(IFocusedSessionHostService, focusedSessionHostServiceOf(constObservable(undefined)));
		instantiationService.stub(IAICustomizationWorkspaceService, workspaceService);
		disposables.add(new CustomizationsToolbarContribution(
			new class extends mock<IActionViewItemService>() {
				override register() { return toDisposable(() => { }); }
			},
			instantiationService,
			harnessService,
			disposables.add(new MockContextKeyService()),
			new TestConfigurationService(),
		));

		await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(OPEN_AI_CUSTOMIZATIONS_COMMAND_ID)!.handler(accessor));

		assert.deepStrictEqual({ descriptions, targeted }, {
			descriptions: ['(Copilot · vscode · Cloud)'],
			targeted: [undefined],
		});
	});

	test('includes enabled Tools in customization totals', () => {
		const toolSets = [
			upcastPartial<IToolSet>({
				id: 'builtin',
				getTools: () => [
					upcastPartial<IToolData>({ id: 'one' }),
					upcastPartial<IToolData>({ id: 'two' }),
				],
			}),
			upcastPartial<IToolSet>({
				id: 'deprecated',
				deprecated: true,
				getTools: () => [upcastPartial<IToolData>({ id: 'ignored' })],
			}),
		];
		const toolsService = new class extends mock<ILanguageModelToolsService>() {
			override readonly toolSets = constObservable(toolSets);
		};
		const enablementService = new class extends mock<IAgentHostToolSetEnablementService>() {
			override observe() {
				return constObservable({
					toolSets: new Map([['builtin', false]]),
					tools: new Map([['one', true]]),
				});
			}
		};

		const count = derived(reader => readCustomizationCount(
			{ id: 'tools', label: 'Tools', icon: Codicon.tools, isTools: true },
			reader,
			new class extends mock<IAICustomizationItemsModel>() { },
			new class extends mock<IAICustomizationMcpServerCountService>() { },
			toolsService,
			enablementService,
		)).get();

		assert.strictEqual(count, 1 + copilotCliToolCount);
	});

	test('gates Canvases on desktop and the shared enablement setting', () => {
		const canvases = CUSTOMIZATION_ITEMS.find(item => item.section === AICustomizationManagementSection.Canvases);
		const evaluate = (enabled: boolean) => canvases?.when?.evaluate({
			getValue: <T>(key: string) => ({ 'config.chat.canvases.enabled': enabled }[key] as T | undefined),
		}) ?? true;

		assert.deepStrictEqual({
			enabled: evaluate(true),
			disabled: evaluate(false),
		}, {
			enabled: !isWeb,
			disabled: false,
		});
	});

	test('keeps Canvases separate from the VS Code Extensions section', () => {
		const sections = CUSTOMIZATION_ITEMS
			.filter(item => item.section === AICustomizationManagementSection.Extensions || item.section === AICustomizationManagementSection.Canvases)
			.map(item => ({ id: item.id, label: item.label, section: item.section }));

		assert.deepStrictEqual(sections, [{
			id: 'sessions.customization.canvases',
			label: 'Canvases',
			section: AICustomizationManagementSection.Canvases,
		}, {
			id: EXTENSIONS_VIEWLET_ID,
			label: 'Extensions',
			section: AICustomizationManagementSection.Extensions,
		}]);
	});

	test('opens the Extensions section with Extensions: Manage Extensions..., with the command ID and keybinding of the Extensions view in editor windows, where the sidebar offers it', () => {
		// The keybinding service does not pick up keybindings registered after it first resolves keybindings, so the keybinding must not wait for the contribution.
		const keybindings = () => KeybindingsRegistry.getDefaultKeybindings().filter(rule => rule.command === EXTENSIONS_VIEWLET_ID);
		const keybindingsOnLoad = keybindings();
		disposables.add(new CustomizationsToolbarContribution(
			new class extends mock<IActionViewItemService>() {
				override register() { return toDisposable(() => { }); }
			},
			new class extends mock<IInstantiationService>() { },
			new class extends mock<ICustomizationHarnessService>() {
				override readonly activeHarness = constObservable('vscode');
				override readonly availableHarnesses = constObservable<readonly IHarnessDescriptor[]>([]);
				override getActiveDescriptor() { return upcastPartial<IHarnessDescriptor>({ hiddenSections: [] }); }
			},
			disposables.add(new MockContextKeyService()),
			new TestConfigurationService(),
		));
		const palette = MenuRegistry.getMenuItems(MenuId.CommandPalette).filter(isIMenuItem).find(item => item.command.id === EXTENSIONS_VIEWLET_ID);
		const keybinding = keybindingsOnLoad[0];
		const text = (value: string | ILocalizedString | undefined) => typeof value === 'string' ? value : value?.value;
		const offered = (values: { chatEnabled: boolean; sectionVisible: boolean; managementEnabled: boolean }) => {
			const context: IContext = {
				getValue: <T>(key: string) => ({
					[ChatContextKeys.enabled.key]: values.chatEnabled,
					[`sessionsCustomizationSectionVisible.${AICustomizationManagementSection.Extensions}`]: values.sectionVisible,
					[`config.${EXTENSIONS_AGENTS_WINDOW_MANAGEMENT}`]: values.managementEnabled,
				}[key] as T | undefined),
			};
			return { commandPalette: palette?.when?.evaluate(context) };
		};

		assert.deepStrictEqual({
			commandId: palette?.command.id,
			title: `${text(palette?.command.category)}: ${text(palette?.command.title)}`,
			keybindingsOnLoad: keybindingsOnLoad.map(rule => rule.keybinding?.getHashCode()),
			keybindingsWithContribution: keybindings().map(rule => rule.keybinding?.getHashCode()),
			keybindingWhen: keybinding?.when?.serialize(),
			offered: offered({ chatEnabled: true, sectionVisible: true, managementEnabled: true }),
			aiFeaturesDisabled: offered({ chatEnabled: false, sectionVisible: true, managementEnabled: true }),
			hiddenByHarness: offered({ chatEnabled: true, sectionVisible: false, managementEnabled: true }),
			managementDisabled: offered({ chatEnabled: true, sectionVisible: true, managementEnabled: false }),
		}, {
			commandId: 'workbench.view.extensions',
			title: 'Extensions: Manage Extensions...',
			keybindingsOnLoad: [decodeKeybinding(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyX, OS)?.getHashCode()],
			keybindingsWithContribution: [decodeKeybinding(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyX, OS)?.getHashCode()],
			// Like in editor windows, so that removals of the keybinding written by the Keyboard Shortcuts editor there apply.
			keybindingWhen: 'viewContainer.workbench.view.extensions.enabled',
			offered: { commandPalette: true },
			aiFeaturesDisabled: { commandPalette: false },
			hiddenByHarness: { commandPalette: false },
			managementDisabled: { commandPalette: false },
		});
	});

	test('applies the keybindings that users assign Show Extensions in the Keyboard Shortcuts editor of editor windows, where the sidebar offers Extensions', () => {
		const configurationService = new TestConfigurationService({ [EXTENSIONS_AGENTS_WINDOW_MANAGEMENT]: true });
		const contextKeyService = disposables.add(new ContextKeyService(configurationService));
		const chatEnabled = ChatContextKeys.enabled.bindTo(contextKeyService);
		chatEnabled.set(true);
		const activeHarness = observableValue<string>(disposables, 'vscode');
		disposables.add(new CustomizationsToolbarContribution(
			new class extends mock<IActionViewItemService>() {
				override register() { return toDisposable(() => { }); }
			},
			new class extends mock<IInstantiationService>() { },
			new class extends mock<ICustomizationHarnessService>() {
				override readonly activeHarness = activeHarness;
				override readonly availableHarnesses = constObservable<readonly IHarnessDescriptor[]>([]);
				override getActiveDescriptor() { return upcastPartial<IHarnessDescriptor>({ hiddenSections: activeHarness.get() === 'vscode' ? [] : [AICustomizationManagementSection.Extensions] }); }
			},
			contextKeyService,
			configurationService,
		));

		// As the Keyboard Shortcuts editor of editor windows writes them, scoped to the Extensions view container's enablement like the default keybinding there.
		const userKeybinding = (keybinding: number, command: string) => new ResolvedKeybindingItem(createUSLayoutResolvedKeybinding(keybinding, OS), command, undefined, ContextKeyExpr.deserialize('viewContainer.workbench.view.extensions.enabled'), false, null, false);
		const changed = [
			userKeybinding(KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyX, 'workbench.view.extensions'),
			userKeybinding(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyX, '-workbench.view.extensions'),
		];
		const removed = [userKeybinding(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyX, '-workbench.view.extensions')];
		const defaults = KeybindingsRegistry.getDefaultKeybindings()
			.filter(rule => rule.command === EXTENSIONS_VIEWLET_ID)
			.map(rule => new ResolvedKeybindingItem(rule.keybinding ? USLayoutResolvedKeybinding.resolveKeybinding(rule.keybinding, OS)[0] : undefined, rule.command, rule.commandArgs, rule.when ?? undefined, true, null, false));
		const activeKeybindings = (userKeybindings: ResolvedKeybindingItem[]) => new KeybindingResolver(defaults, userKeybindings, () => { })
			.lookupKeybindings(EXTENSIONS_VIEWLET_ID)
			.filter(item => contextKeyService.contextMatchesRules(item.when))
			.map(item => item.resolvedKeybinding?.getUserSettingsLabel());
		const state = () => ({ default: activeKeybindings([]), changed: activeKeybindings(changed), removed: activeKeybindings(removed) });

		const offered = state();
		chatEnabled.set(false);
		const aiFeaturesDisabled = state();
		chatEnabled.set(true);
		activeHarness.set('claude', undefined);
		const hiddenByHarness = state();
		activeHarness.set('vscode', undefined);
		configurationService.setUserConfiguration(EXTENSIONS_AGENTS_WINDOW_MANAGEMENT, false);
		configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectedKeys: new Set([EXTENSIONS_AGENTS_WINDOW_MANAGEMENT]), affectsConfiguration: key => key === EXTENSIONS_AGENTS_WINDOW_MANAGEMENT }));
		const managementDisabled = state();

		const label = (keybinding: number) => createUSLayoutResolvedKeybinding(keybinding, OS)?.getUserSettingsLabel();
		const none = { default: [], changed: [], removed: [] };
		assert.deepStrictEqual({ offered, aiFeaturesDisabled, hiddenByHarness, managementDisabled }, {
			offered: {
				default: [label(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyX)],
				changed: [label(KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyX)],
				removed: [],
			},
			aiFeaturesDisabled: none,
			hiddenByHarness: none,
			managementDisabled: none,
		});
	});

	test('tracks the active customization total and migration availability', async () => {
		const enabled = observableValue(disposables, true);
		const activeSession = observableValue<ITestSessionWithChat | undefined>(disposables, upcastPartial<ITestSessionWithChat>({
			resource: URI.parse('agent-host-test:/session'),
			workspace: constObservable(undefined),
		}));
		const itemsModel = new class extends mock<IAICustomizationItemsModel>() {
			override getCount() { return constObservable(1); }
			override getPluginCount() { return constObservable(2); }
		};
		const mcpServerCountService = new class extends mock<IAICustomizationMcpServerCountService>() {
			override readonly count = constObservable(3);
		};
		const toolsService = new class extends mock<ILanguageModelToolsService>() {
			override readonly toolSets = constObservable<readonly IToolSet[]>([]);
		};
		const toolEnablementService = new class extends mock<IAgentHostToolSetEnablementService>() {
			override observe() {
				return constObservable({ toolSets: new Map(), tools: new Map() });
			}
		};
		const harnessDescriptor = upcastPartial<IHarnessDescriptor>({ id: 'agent-host-test', label: 'Test', icon: Codicon.extensions });
		const harnessService = new class extends mock<ICustomizationHarnessService>() {
			override readonly activeHarness = constObservable('agent-host-test');
			override readonly availableHarnesses = constObservable([harnessDescriptor]);
			override getActiveDescriptor() { return harnessDescriptor; }
			override findHarnessById(id: string) { return id === harnessDescriptor.id ? harnessDescriptor : undefined; }
		};
		const customizationsChanged = disposables.add(new Emitter<void>());
		const refreshedHint = new DeferredPromise<ICustomizationMigrationHint | undefined>();
		const removedHint = new DeferredPromise<ICustomizationMigrationHint | undefined>();
		const migrationHint: ICustomizationMigrationHint = { migrationFlowId: 'flow', message: 'Migrations available', counts: [] };
		const ignoredGroupsSeen: ICustomizationMigrationIgnoredGroup[][] = [];
		const migrationResponses = [migrationHint, refreshedHint.p, removedHint.p];
		const migrationService = new class extends mock<ICustomizationMigrationService>() {
			override readonly onDidChangeCustomizations = customizationsChanged.event;
			override computeMigrationHint(_resource: URI, _token?: CancellationToken, ignoredGroups: readonly ICustomizationMigrationIgnoredGroup[] = []): Promise<ICustomizationMigrationHint | undefined> {
				ignoredGroupsSeen.push([...ignoredGroups]);
				return Promise.resolve(migrationResponses.shift() ?? (ignoredGroups.length > 0 ? undefined : migrationHint));
			}
		};
		const activeProjectRoot = constObservable(URI.file('/worktrees/one'));
		const storageService = disposables.add(new InMemoryStorageService());
		const skillsBadge = observableValue<string | undefined>(disposables, 'Skills to review.');
		disposables.add(aiCustomizationManagementSectionRegistry.registerBadge(AICustomizationManagementSection.Skills, () => skillsBadge));
		const state = disposables.add(new CustomizationsNavigationState(
			enabled,
			focusedSessionHostServiceOf(activeSession),
			itemsModel,
			mcpServerCountService,
			toolsService,
			toolEnablementService,
			harnessService,
			migrationService,
			new class extends mock<IConfigurationService>() {
				override readonly onDidChangeConfiguration = Event.None;
			},
			new class extends mock<IAICustomizationWorkspaceService>() {
				override readonly activeProjectRoot = activeProjectRoot;
				override readonly managementSections = [AICustomizationManagementSection.Agents, AICustomizationManagementSection.Skills];
			},
			storageService,
			new class extends mock<ILogService>() { },
			telemetryInstantiationService(),
		));
		await Promise.resolve();

		const enabledState = {
			totalCount: state.totalCount.get(),
			migrationAvailable: state.migrationAvailable.get(),
			badge: state.badge.get(),
		};
		skillsBadge.set(undefined, undefined);
		const clearedBadgeState = state.badge.get();
		skillsBadge.set('Skills to review.', undefined);
		customizationsChanged.fire();
		const refreshingState = state.migrationAvailable.get();
		void refreshedHint.complete(migrationHint);
		await refreshedHint.p;
		await Promise.resolve();
		const refreshedState = state.migrationAvailable.get();
		customizationsChanged.fire();
		const removingState = state.migrationAvailable.get();
		void removedHint.complete(undefined);
		await removedHint.p;
		await Promise.resolve();
		const removedState = state.migrationAvailable.get();
		storeIgnoredCustomizationMigrationGroupKeys(storageService, new Set([
			getCustomizationMigrationGroupIgnoreKey(
				'agent-host-test',
				CustomizationMigrationCategoryId.PromptFiles,
				PromptsStorage.local,
				activeProjectRoot.get(),
			),
		]));
		await Promise.resolve();
		const ignoredState = state.migrationAvailable.get();
		storeIgnoredCustomizationMigrationGroupKeys(storageService, new Set());
		await Promise.resolve();
		const restoredState = state.migrationAvailable.get();
		enabled.set(false, undefined);

		assert.deepStrictEqual({
			enabledState,
			clearedBadgeState,
			refreshingState,
			refreshedState,
			removingState,
			removedState,
			ignoredState,
			restoredState,
			ignoredGroupsSeen,
			disabledState: {
				totalCount: state.totalCount.get(),
				migrationAvailable: state.migrationAvailable.get(),
				badge: state.badge.get(),
			},
		}, {
			enabledState: {
				totalCount: 9 + copilotCliToolCount,
				migrationAvailable: true,
				badge: 'Skills to review.',
			},
			clearedBadgeState: undefined,
			refreshingState: true,
			refreshedState: true,
			removingState: true,
			removedState: false,
			ignoredState: false,
			restoredState: true,
			ignoredGroupsSeen: [
				[],
				[],
				[],
				[{ type: CustomizationMigrationType.PromptFiles, storage: PromptsStorage.local }],
				[],
			],
			disabledState: {
				totalCount: 0,
				migrationAvailable: false,
				badge: undefined,
			},
		});
	});

	test('renders one focus target and runs its action once', async () => {
		let runCount = 0;
		let activationCount = 0;
		const action = disposables.add(new Action('test.customization', 'Customization', undefined, true, () => {
			runCount++;
		}));
		const item = disposables.add(new CustomizationLinkViewItem(
			action,
			{},
			{ id: 'sessions.customization.overview', label: 'Customization', icon: Codicon.settingsGear },
			new class extends mock<IAICustomizationItemsModel>() { },
			new class extends mock<IAICustomizationMcpServerCountService>() { },
			new class extends mock<ILanguageModelToolsService>() { },
			new class extends mock<IAgentHostToolSetEnablementService>() { },
			NullHoverService,
			telemetryInstantiationService(() => activationCount++),
		));
		const container = mainWindow.document.createElement('div');
		item.render(container);
		const button = container.querySelector<HTMLElement>('.customization-link-button');
		button?.click();
		await Promise.resolve();

		assert.deepStrictEqual({
			buttonCount: container.querySelectorAll('.customization-link-button').length,
			focusableCount: container.querySelectorAll('a, button').length,
			runCount,
			activationCount,
		}, {
			buttonCount: 1,
			focusableCount: 1,
			runCount: 1,
			activationCount: 1,
		});
	});

	test('badges links to sections while their badge is set and the section is visible', () => {
		const section = AICustomizationManagementSection.Skills;
		const badge = observableValue<string | undefined>(disposables, 'Skills to review.');
		const hiddenSections = observableValue<readonly string[]>(disposables, []);
		disposables.add(aiCustomizationManagementSectionRegistry.registerBadge(section, () => badge));
		const hovers = new Set<{ readonly content: unknown }>();
		const hoverService = new class extends mock<IHoverService>() {
			override setupDelayedHover(_target: HTMLElement, options: Parameters<IHoverService['setupDelayedHover']>[1]) {
				const hover = { content: (typeof options === 'function' ? options() : options).content };
				hovers.add(hover);
				return toDisposable(() => hovers.delete(hover));
			}
		};
		const instantiationService = telemetryInstantiationService();
		instantiationService.stub(ICustomizationHarnessService, new class extends mock<ICustomizationHarnessService>() {
			override readonly activeHarness = constObservable('test');
			override readonly availableHarnesses = hiddenSections.map(hidden => [upcastPartial<IHarnessDescriptor>({ id: 'test', hiddenSections: hidden })]);
			override findHarnessById(id: string) {
				return this.availableHarnesses.get().find(harness => harness.id === id);
			}
		});
		instantiationService.stub(IAICustomizationWorkspaceService, new class extends mock<IAICustomizationWorkspaceService>() {
			override readonly managementSections = [section];
		});
		const item = disposables.add(new CustomizationLinkViewItem(
			disposables.add(new Action('test.skills', 'Skills')),
			{},
			{ id: 'test.skills', label: 'Skills', icon: Codicon.lightbulb, section },
			new class extends mock<IAICustomizationItemsModel>() { },
			new class extends mock<IAICustomizationMcpServerCountService>() { },
			new class extends mock<ILanguageModelToolsService>() { },
			new class extends mock<IAgentHostToolSetEnablementService>() { },
			hoverService,
			instantiationService,
		));
		const container = mainWindow.document.createElement('div');
		item.render(container);
		const badgeElement = container.querySelector<HTMLElement>('.customization-link-button .ai-customization-suggestion-badge');
		const readState = () => ({
			visible: badgeElement?.classList.contains('hidden') === false,
			ariaLabel: badgeElement?.getAttribute('aria-label'),
			hovers: [...hovers].map(hover => hover.content),
		});
		const shown = readState();
		hiddenSections.set([section], undefined);
		const hidden = readState();
		hiddenSections.set([], undefined);
		badge.set(undefined, undefined);

		assert.deepStrictEqual({ role: badgeElement?.getAttribute('role'), shown, hidden, cleared: readState() }, {
			role: 'img',
			shown: { visible: true, ariaLabel: 'Skills to review.', hovers: ['Skills to review.'] },
			hidden: { visible: false, ariaLabel: null, hovers: [] },
			cleared: { visible: false, ariaLabel: null, hovers: [] },
		});
	});

	test('forwards ActionBar roving focus to the nested button', () => {
		const container = mainWindow.document.createElement('div');
		const createViewItem = (action: IAction) => new CustomizationLinkViewItem(
			action,
			{},
			{ id: action.id, label: action.label, icon: Codicon.settingsGear },
			new class extends mock<IAICustomizationItemsModel>() { },
			new class extends mock<IAICustomizationMcpServerCountService>() { },
			new class extends mock<ILanguageModelToolsService>() { },
			new class extends mock<IAgentHostToolSetEnablementService>() { },
			NullHoverService,
			telemetryInstantiationService(),
		);
		const actionBar = disposables.add(new ActionBar(container, {
			actionViewItemProvider: action => createViewItem(action),
		}));
		const actions = [
			disposables.add(new Action('test.one', 'One')),
			disposables.add(new Action('test.two', 'Two')),
		];

		actionBar.push(actions);

		assert.deepStrictEqual({
			itemTabIndexes: Array.from(container.querySelectorAll<HTMLElement>('li'), element => element.tabIndex),
			buttonTabIndexes: Array.from(container.querySelectorAll<HTMLElement>('.customization-link-button'), element => element.tabIndex),
			focusableElements: Array.from(container.querySelectorAll<HTMLElement>('li, a, button')).filter(element => element.tabIndex === 0).length,
		}, {
			itemTabIndexes: [-1, -1],
			buttonTabIndexes: [0, -1],
			focusableElements: 1,
		});
	});
});
