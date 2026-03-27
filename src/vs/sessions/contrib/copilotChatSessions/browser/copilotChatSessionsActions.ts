/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IReader, autorun, observableValue } from '../../../../base/common/observable.js';
import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2, MenuId, MenuRegistry, isIMenuItem } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { MarshalledId } from '../../../../base/common/marshallingIds.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { BaseActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { AgentSessionProviders } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { IModelPickerDelegate } from '../../../../workbench/contrib/chat/browser/widget/input/modelPickerActionItem.js';
import { IChatInputPickerOptions } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputPickerActionItem.js';
import { EnhancedModelPickerActionItem } from '../../../../workbench/contrib/chat/browser/widget/input/modelPickerActionItem2.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { IContextKeyService, ContextKeyExpr, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { Menus } from '../../../browser/menus.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { ISessionsProvidersService } from '../../sessions/browser/sessionsProvidersService.js';
import { SessionItemContextMenuId } from '../../sessions/browser/views/sessionsList.js';
import { ISessionData } from '../../sessions/common/sessionData.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { CopilotCLISession, COPILOT_PROVIDER_ID } from './copilotChatSessionsProvider.js';
import { COPILOT_CLI_SESSION_TYPE, COPILOT_CLOUD_SESSION_TYPE } from '../../sessions/browser/sessionTypes.js';
import { IsolationPicker } from './isolationPicker.js';
import { BranchPicker } from './branchPicker.js';
import { ModePicker } from './modePicker.js';
import { CloudModelPicker } from './modelPicker.js';
import { NewChatPermissionPicker } from '../../chat/browser/newChatPermissionPicker.js';

const ActiveSessionHasGitRepositoryContext = new RawContextKey<boolean>('activeSessionHasGitRepository', false);
const IsActiveSessionCopilotCLI = ContextKeyExpr.equals('activeSessionType', COPILOT_CLI_SESSION_TYPE);
const IsActiveSessionCopilotCloud = ContextKeyExpr.equals('activeSessionType', COPILOT_CLOUD_SESSION_TYPE);
const IsActiveCopilotChatSessionProvider = ContextKeyExpr.equals('activeSessionProviderId', COPILOT_PROVIDER_ID);
const IsActiveSessionCopilotChatCLI = ContextKeyExpr.and(IsActiveSessionCopilotCLI, IsActiveCopilotChatSessionProvider);
const IsActiveSessionCopilotChatCloud = ContextKeyExpr.and(IsActiveSessionCopilotCloud, IsActiveCopilotChatSessionProvider);

// -- Actions --

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.defaultCopilot.isolationPicker',
			title: localize2('isolationPicker', "Isolation Mode"),
			f1: false,
			menu: [{
				id: Menus.NewSessionRepositoryConfig,
				group: 'navigation',
				order: 1,
				when: ContextKeyExpr.and(
					IsActiveSessionCopilotChatCLI,
					ContextKeyExpr.equals('config.github.copilot.chat.cli.isolationOption.enabled', true),
				),
			}],
		});
	}
	override async run(): Promise<void> { /* handled by action view item */ }
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.defaultCopilot.branchPicker',
			title: localize2('branchPicker', "Branch"),
			f1: false,
			precondition: ActiveSessionHasGitRepositoryContext,
			menu: [{
				id: Menus.NewSessionRepositoryConfig,
				group: 'navigation',
				order: 2,
				when: IsActiveSessionCopilotChatCLI,
			}],
		});
	}
	override async run(): Promise<void> { /* handled by action view item */ }
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.defaultCopilot.modePicker',
			title: localize2('modePicker', "Mode"),
			f1: false,
			menu: [{
				id: Menus.NewSessionConfig,
				group: 'navigation',
				order: 0,
				when: IsActiveSessionCopilotChatCLI,
			}],
		});
	}
	override async run(): Promise<void> { /* handled by action view item */ }
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.defaultCopilot.localModelPicker',
			title: localize2('localModelPicker', "Model"),
			f1: false,
			menu: [{
				id: Menus.NewSessionConfig,
				group: 'navigation',
				order: 1,
				when: IsActiveSessionCopilotChatCLI,
			}],
		});
	}
	override async run(): Promise<void> { /* handled by action view item */ }
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.defaultCopilot.cloudModelPicker',
			title: localize2('cloudModelPicker', "Model"),
			f1: false,
			menu: [{
				id: Menus.NewSessionConfig,
				group: 'navigation',
				order: 1,
				when: IsActiveSessionCopilotChatCloud,
			}],
		});
	}
	override async run(): Promise<void> { /* handled by action view item */ }
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.defaultCopilot.permissionPicker',
			title: localize2('permissionPicker', "Permissions"),
			f1: false,
			menu: [{
				id: Menus.NewSessionControl,
				group: 'navigation',
				order: 1,
				when: IsActiveSessionCopilotChatCLI,
			}],
		});
	}
	override async run(): Promise<void> { /* handled by action view item */ }
});

// -- Helper --

/**
 * Wraps a standalone picker widget as a {@link BaseActionViewItem}
 * so it can be rendered by a {@link MenuWorkbenchToolBar}.
 */
class PickerActionViewItem extends BaseActionViewItem {
	constructor(private readonly picker: { render(container: HTMLElement): void; dispose(): void }) {
		super(undefined, { id: '', label: '', enabled: true, class: undefined, tooltip: '', run: () => { } });
	}

	override render(container: HTMLElement): void {
		this.picker.render(container);
	}

	override dispose(): void {
		this.picker.dispose();
		super.dispose();
	}
}

// -- Action View Item Registrations --

class CopilotPickerActionViewItemContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.copilotPickerActionViewItems';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILanguageModelsService languageModelsService: ILanguageModelsService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@IStorageService storageService: IStorageService,
	) {
		super();

		this._register(actionViewItemService.register(
			Menus.NewSessionRepositoryConfig, 'sessions.defaultCopilot.isolationPicker',
			() => {
				const picker = instantiationService.createInstance(IsolationPicker);
				return new PickerActionViewItem(picker);
			},
		));
		this._register(actionViewItemService.register(
			Menus.NewSessionRepositoryConfig, 'sessions.defaultCopilot.branchPicker',
			() => {
				const picker = instantiationService.createInstance(BranchPicker);
				return new PickerActionViewItem(picker);
			},
		));
		this._register(actionViewItemService.register(
			Menus.NewSessionConfig, 'sessions.defaultCopilot.modePicker',
			() => {
				const picker = instantiationService.createInstance(ModePicker);
				return new PickerActionViewItem(picker);
			},
		));
		this._register(actionViewItemService.register(
			Menus.NewSessionConfig, 'sessions.defaultCopilot.localModelPicker',
			() => {
				const currentModel = observableValue<ILanguageModelChatMetadataAndIdentifier | undefined>('currentModel', undefined);
				const delegate: IModelPickerDelegate = {
					currentModel,
					setModel: (model: ILanguageModelChatMetadataAndIdentifier) => {
						currentModel.set(model, undefined);
						storageService.store('sessions.localModelPicker.selectedModelId', model.identifier, StorageScope.PROFILE, StorageTarget.MACHINE);
						const session = sessionsManagementService.activeSession.get();
						if (session) {
							const provider = sessionsProvidersService.getProviders().find(p => p.id === session.providerId);
							const activeChat = session.activeChat.get();
							if (activeChat) {
								provider?.setModel(activeChat.chatId, model.identifier);
							}
						}
					},
					getModels: () => getAvailableModels(languageModelsService),
					useGroupedModelPicker: () => true,
					showManageModelsAction: () => false,
					showUnavailableFeatured: () => false,
					showFeatured: () => true,
				};
				const pickerOptions: IChatInputPickerOptions = {
					hideChevrons: observableValue('hideChevrons', false),
					hoverPosition: { hoverPosition: HoverPosition.ABOVE },
				};
				const action = { id: 'sessions.modelPicker', label: '', enabled: true, class: undefined, tooltip: '', run: () => { } };
				const modelPicker = instantiationService.createInstance(EnhancedModelPickerActionItem, action, delegate, pickerOptions);

				// Initialize with remembered model or first available model
				const rememberedModelId = storageService.get('sessions.localModelPicker.selectedModelId', StorageScope.PROFILE);
				const initModel = () => {
					const models = getAvailableModels(languageModelsService);
					modelPicker.setEnabled(models.length > 0);
					if (!currentModel.get() && models.length > 0) {
						const remembered = rememberedModelId ? models.find(m => m.identifier === rememberedModelId) : undefined;
						currentModel.set(remembered ?? models[0], undefined);
					}
				};
				initModel();
				this._register(languageModelsService.onDidChangeLanguageModels(() => initModel()));

				return modelPicker;
			},
		));
		this._register(actionViewItemService.register(
			Menus.NewSessionConfig, 'sessions.defaultCopilot.cloudModelPicker',
			() => {
				const picker = instantiationService.createInstance(CloudModelPicker);
				return new PickerActionViewItem(picker);
			},
		));
		this._register(actionViewItemService.register(
			Menus.NewSessionControl, 'sessions.defaultCopilot.permissionPicker',
			() => {
				const picker = instantiationService.createInstance(NewChatPermissionPicker);
				return new PickerActionViewItem(picker);
			},
		));
	}
}

function getAvailableModels(languageModelsService: ILanguageModelsService): ILanguageModelChatMetadataAndIdentifier[] {
	return languageModelsService.getLanguageModelIds()
		.map(id => {
			const metadata = languageModelsService.lookupLanguageModel(id);
			return metadata ? { metadata, identifier: id } : undefined;
		})
		.filter((m): m is ILanguageModelChatMetadataAndIdentifier => !!m && m.metadata.targetChatSessionType === AgentSessionProviders.Background);
}

// -- Context Key Contribution --

class CopilotActiveSessionContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.copilotActiveSession';

	constructor(
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		const hasRepositoryKey = ActiveSessionHasGitRepositoryContext.bindTo(contextKeyService);

		this._register(autorun((reader: IReader) => {
			const session = sessionsManagementService.activeSession.read(reader);
			const chat = session?.activeChat.read(reader);
			if (chat instanceof CopilotCLISession) {
				const isLoading = chat.loading.read(reader);
				hasRepositoryKey.set(!isLoading && !!chat.gitRepository);
			} else {
				hasRepositoryKey.set(false);
			}
		}));
	}
}

registerWorkbenchContribution2(CopilotPickerActionViewItemContribution.ID, CopilotPickerActionViewItemContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(CopilotActiveSessionContribution.ID, CopilotActiveSessionContribution, WorkbenchPhase.AfterRestored);

/**
 * Bridges extension-contributed context menu actions from {@link MenuId.AgentSessionsContext}
 * to {@link SessionItemContextMenuId} for the new sessions view.
 * Registers wrapper commands that resolve {@link ISessionData} → {@link IAgentSession}
 * and forward to the original command with marshalled context.
 */
class CopilotSessionContextMenuBridge extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'copilotChatSessions.contextMenuBridge';

	private readonly _bridgedIds = new Set<string>();

	constructor(
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();
		this._bridgeItems();
		this._register(MenuRegistry.onDidChangeMenu(menuIds => {
			if (menuIds.has(MenuId.AgentSessionsContext)) {
				this._bridgeItems();
			}
		}));
	}

	private _bridgeItems(): void {
		const items = MenuRegistry.getMenuItems(MenuId.AgentSessionsContext).filter(isIMenuItem);
		for (const item of items) {
			const commandId = item.command.id;
			if (!commandId.startsWith('github.copilot.')) {
				continue;
			}
			if (this._bridgedIds.has(commandId)) {
				continue;
			}
			this._bridgedIds.add(commandId);

			const wrapperId = `sessionsViewPane.bridge.${commandId}`;
			this._register(CommandsRegistry.registerCommand(wrapperId, (accessor, sessionData?: ISessionData) => {
				if (!sessionData) {
					return;
				}
				const agentSession = this.agentSessionsService.getSession(sessionData.resource);
				if (!agentSession) {
					return;
				}
				return this.commandService.executeCommand(commandId, {
					session: agentSession,
					sessions: [agentSession],
					$mid: MarshalledId.AgentSessionContext,
				});
			}));

			const providerWhen = ContextKeyExpr.equals('chatSessionProviderId', COPILOT_PROVIDER_ID);
			this._register(MenuRegistry.appendMenuItem(SessionItemContextMenuId, {
				command: { ...item.command, id: wrapperId },
				group: item.group,
				order: item.order,
				when: item.when ? ContextKeyExpr.and(providerWhen, item.when) : providerWhen,
			}));
		}
	}
}

registerWorkbenchContribution2(CopilotSessionContextMenuBridge.ID, CopilotSessionContextMenuBridge, WorkbenchPhase.AfterRestored);
