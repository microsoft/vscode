/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from '../../../../base/common/arrays.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { IReader, autorun, observableValue } from '../../../../base/common/observable.js';
import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2, MenuId, MenuRegistry, isIMenuItem } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { MarshalledId } from '../../../../base/common/marshallingIds.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { BaseActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { ModelPickerActionItem, IModelPickerDelegate } from '../../../../workbench/contrib/chat/browser/widget/input/modelPickerActionItem.js';
import { IChatInputPickerOptions } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputPickerActionItem.js';
import { IContextKeyService, ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { Menus } from '../../../browser/menus.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { SessionItemContextMenuId } from '../../sessions/browser/views/sessionsList.js';
import { CLAUDE_CODE_SESSION_TYPE, COPILOT_CLI_SESSION_TYPE, COPILOT_CLOUD_SESSION_TYPE, ISession } from '../../../services/sessions/common/session.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { COPILOT_PROVIDER_ID, CopilotChatSessionsProvider } from './copilotChatSessionsProvider.js';
import { ActiveSessionHasGitRepositoryContext, ActiveSessionProviderIdContext, ActiveSessionTypeContext, ChatSessionProviderIdContext, IsNewChatSessionContext } from '../../../common/contextkeys.js';
import { IsolationPicker } from './isolationPicker.js';
import { BranchPicker } from './branchPicker.js';
import { ModePicker } from './modePicker.js';
import { CloudModelPicker } from './modelPicker.js';
import { CopilotPermissionPickerDelegate, PermissionPicker } from './permissionPicker.js';
import { ClaudePermissionModePicker } from './claudePermissionModePicker.js';

const IsActiveSessionCopilotCLI = ContextKeyExpr.equals(ActiveSessionTypeContext.key, COPILOT_CLI_SESSION_TYPE);
const IsActiveSessionCopilotCloud = ContextKeyExpr.equals(ActiveSessionTypeContext.key, COPILOT_CLOUD_SESSION_TYPE);
const IsActiveCopilotChatSessionProvider = ContextKeyExpr.equals(ActiveSessionProviderIdContext.key, COPILOT_PROVIDER_ID);
const IsActiveSessionCopilotChatCLI = ContextKeyExpr.and(IsActiveSessionCopilotCLI, IsActiveCopilotChatSessionProvider);
const IsActiveSessionCopilotChatCloud = ContextKeyExpr.and(IsActiveSessionCopilotCloud, IsActiveCopilotChatSessionProvider);
const IsActiveSessionClaudeCode = ContextKeyExpr.equals(ActiveSessionTypeContext.key, CLAUDE_CODE_SESSION_TYPE);
const IsActiveSessionCopilotChatClaudeCode = ContextKeyExpr.and(IsActiveSessionClaudeCode, IsActiveCopilotChatSessionProvider);

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
					IsNewChatSessionContext,
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
				when: ContextKeyExpr.and(IsNewChatSessionContext, IsActiveSessionCopilotChatCLI),
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
				when: ContextKeyExpr.or(IsActiveSessionCopilotChatCLI, IsActiveSessionCopilotChatClaudeCode),
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

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.defaultCopilot.claudePermissionModePicker',
			title: localize2('claudePermissionModePicker', "Permission Mode"),
			f1: false,
			menu: [{
				id: Menus.NewSessionControl,
				group: 'navigation',
				order: 1,
				when: IsActiveSessionCopilotChatClaudeCode,
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
	constructor(private readonly picker: { render(container: HTMLElement): void; dispose(): void }, disposable?: IDisposable) {
		super(undefined, { id: '', label: '', enabled: true, class: undefined, tooltip: '', run: () => { } });
		if (disposable) {
			this._register(disposable);
		}
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
				const picker = instantiationService.createInstance(SessionModelPicker);
				return new PickerActionViewItem(picker);
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
				const delegate = instantiationService.createInstance(CopilotPermissionPickerDelegate);
				const picker = instantiationService.createInstance(PermissionPicker, delegate);
				return new PickerActionViewItem(picker, delegate);
			},
		));
		this._register(actionViewItemService.register(
			Menus.NewSessionControl, 'sessions.defaultCopilot.claudePermissionModePicker',
			() => {
				const picker = instantiationService.createInstance(ClaudePermissionModePicker);
				return new PickerActionViewItem(picker);
			},
		));
	}
}

// -- Model Picker Helpers --

/**
 * Returns a storage key scoped to the given session type.
 */
export function modelPickerStorageKey(sessionType: string): string {
	return `sessions.modelPicker.${sessionType}.selectedModelId`;
}

/**
 * A model picker widget that persists the selected model per session type and
 * syncs the selection to the active session's provider. Instantiated via DI,
 * consistent with the other picker widgets in this file.
 */
export class SessionModelPicker extends Disposable {

	private readonly _currentModel = observableValue<ILanguageModelChatMetadataAndIdentifier | undefined>('currentModel', undefined);
	private readonly _delegate: IModelPickerDelegate;
	private readonly _modelPicker: ModelPickerActionItem;
	private _lastSessionType: string | undefined;
	private _lastPushedSessionId: string | undefined;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();

		this._delegate = {
			currentModel: this._currentModel,
			setModel: (model: ILanguageModelChatMetadataAndIdentifier) => {
				this._currentModel.set(model, undefined);
				const session = this._sessionsManagementService.activeSession.get();
				if (session) {
					this._storageService.store(modelPickerStorageKey(session.sessionType), model.identifier, StorageScope.PROFILE, StorageTarget.MACHINE);
					const provider = this._sessionsProvidersService.getProviders().find(p => p.id === session.providerId);
					provider?.setModel(session.sessionId, model.identifier);
				}
			},
			getModels: () => getAvailableModels(this._languageModelsService, this._sessionsManagementService),
			useGroupedModelPicker: () => true,
			showManageModelsAction: () => false,
			showUnavailableFeatured: () => false,
			showFeatured: () => true,
		};

		const pickerOptions: IChatInputPickerOptions = {
			hideChevrons: observableValue('hideChevrons', false),
		};
		const action = { id: 'sessions.modelPicker', label: '', enabled: true, class: undefined, tooltip: '', run: () => { } };
		this._modelPicker = instantiationService.createInstance(ModelPickerActionItem, action, this._delegate, pickerOptions);

		this._initModel();
		this._register(this._languageModelsService.onDidChangeLanguageModels(() => this._initModel()));

		// When the active session changes, re-init (may switch session type).
		// _initModel() calls _delegate.setModel() which already forwards to
		// the provider, so no additional provider.setModel() call is needed.
		this._register(autorun(reader => {
			const session = this._sessionsManagementService.activeSession.read(reader);
			if (session) {
				this._initModel();
			}
		}));
	}

	private _initModel(): void {
		const session = this._sessionsManagementService.activeSession.get();
		const sessionType = session?.sessionType;

		// Reset the current model when switching session types so we load the
		// remembered model for the new type instead of carrying over the old one.
		if (sessionType !== this._lastSessionType) {
			this._currentModel.set(undefined, undefined);
			this._lastSessionType = sessionType;
		}

		const models = getAvailableModels(this._languageModelsService, this._sessionsManagementService);
		this._modelPicker.setEnabled(models.length > 0);
		if (models.length === 0) {
			return;
		}

		const current = this._currentModel.get();
		if (!current) {
			const rememberedModelId = sessionType ? this._storageService.get(modelPickerStorageKey(sessionType), StorageScope.PROFILE) : undefined;
			const remembered = rememberedModelId ? models.find(m => m.identifier === rememberedModelId) : undefined;
			this._delegate.setModel(remembered ?? models[0]);
			this._lastPushedSessionId = session?.sessionId;
		} else if (session && session.sessionId !== this._lastPushedSessionId && models.some(m => m.identifier === current.identifier)) {
			// Active session changed (e.g. user switched repository) but the
			// previously selected model is still available. Re-push it so the
			// new session's provider receives setModel — otherwise the request
			// would be sent with the default model even though the picker UI
			// still shows the user's selection. See #313385.
			//
			// Gated on sessionId so unrelated re-invocations of _initModel
			// (e.g. from onDidChangeLanguageModels) don't redundantly write
			// storage and dispatch provider.setModel for the same session.
			this._delegate.setModel(current);
			this._lastPushedSessionId = session.sessionId;
		}
	}

	render(container: HTMLElement): void {
		this._modelPicker.render(container);
	}

	override dispose(): void {
		this._modelPicker.dispose();
		super.dispose();
	}
}

export function getAvailableModels(
	languageModelsService: ILanguageModelsService,
	sessionsManagementService: ISessionsManagementService,
): ILanguageModelChatMetadataAndIdentifier[] {
	const session = sessionsManagementService.activeSession.get();
	if (!session) {
		return [];
	}
	return languageModelsService.getLanguageModelIds()
		.map(id => {
			const metadata = languageModelsService.lookupLanguageModel(id);
			return metadata ? { metadata, identifier: id } : undefined;
		})
		.filter((m): m is ILanguageModelChatMetadataAndIdentifier => !!m && m.metadata.targetChatSessionType === session.sessionType);
}

// -- Context Key Contribution --

class CopilotActiveSessionContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.copilotActiveSession';

	constructor(
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		const hasRepositoryKey = ActiveSessionHasGitRepositoryContext.bindTo(contextKeyService);

		this._register(autorun((reader: IReader) => {
			const session = sessionsManagementService.activeSession.read(reader);
			if (session?.providerId === COPILOT_PROVIDER_ID) {
				const provider = sessionsProvidersService.getProvider(session.providerId);
				const providerSession = provider instanceof CopilotChatSessionsProvider ? provider.getSession(session.sessionId) : undefined;
				const isLoading = providerSession?.loading.read(reader);
				hasRepositoryKey.set(!isLoading && !!providerSession?.gitRepository);
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
 * Registers wrapper commands that resolve {@link ISession} → {@link IAgentSession}
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
			if (commandId === 'github.copilot.cli.sessions.delete') {
				continue; // Delete is handled natively via sessionsManagementService
			}
			if (this._bridgedIds.has(commandId)) {
				continue;
			}
			this._bridgedIds.add(commandId);

			const wrapperId = `sessionsViewPane.bridge.${commandId}`;
			this._register(CommandsRegistry.registerCommand(wrapperId, (accessor, context?: ISession | ISession[]) => {
				if (!context) {
					return;
				}
				const sessions = Array.isArray(context) ? context : [context];
				const agentSessions = coalesce(sessions.map(s => this.agentSessionsService.getSession(s.resource)));
				if (agentSessions.length === 0) {
					return;
				}
				return this.commandService.executeCommand(commandId, {
					session: agentSessions[0],
					sessions: agentSessions,
					$mid: MarshalledId.AgentSessionContext,
				});
			}));

			const providerWhen = ContextKeyExpr.equals(ChatSessionProviderIdContext.key, COPILOT_PROVIDER_ID);
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

registerAction2(class DeleteSessionAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.copilot.deleteSession',
			title: localize2('deleteSession', "Delete..."),
			menu: [{
				id: SessionItemContextMenuId,
				group: '1_edit',
				order: 4,
				when: ContextKeyExpr.equals(ChatSessionProviderIdContext.key, COPILOT_PROVIDER_ID),
			}]
		});
	}
	async run(accessor: ServicesAccessor, context?: ISession | ISession[]): Promise<void> {
		if (!context) {
			return;
		}
		const sessions = Array.isArray(context) ? context : [context];
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		for (const session of sessions) {
			await sessionsManagementService.deleteSession(session);
		}
	}
});
