/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { basename, dirname, isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../../nls.js';
import { Action2 } from '../../../../../../platform/actions/common/actions.js';
import { COPILOT_CLI_AGENT_PROVIDER_ID } from '../../../../../../platform/agentHost/common/agent.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { AgentHostSavedChatWorkspace, IAgentHostSavedChat } from '../../../../../../platform/agentHost/common/agentHostSavedChat.js';
import { IAgentHostService, isLocalAgentHostProviderDisabledByPolicy } from '../../../../../../platform/agentHost/common/agentService.js';
import { supportsAgentHostSavedChatContinuation } from '../../../../../../platform/agentHost/common/meta/agentHostSavedChatMeta.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { NotificationType } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { ChatOriginKind } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IFileDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../../../platform/files/common/files.js';
import { createDecorator, ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IManagedSettingsService, requiresCopilotAgentHost } from '../../../../../../platform/policy/common/copilotManagedSettings.js';
import { IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { IChatSessionsService, SessionType } from '../../../common/chatSessionsService.js';
import { ChatAgentLocation, CONTINUE_AGENT_HOST_CHAT_IN_COPILOT_ACTION_ID } from '../../../common/constants.js';
import { IChatModelInputState } from '../../../common/model/chatModel.js';
import { IChatWidget, IChatWidgetService } from '../../chat.js';
import { readAgentHostSavedChat, savedChatDraftInput } from './agentHostPolicyUnavailableSession.js';

export const IAgentHostPolicyContinuationPresenter = createDecorator<IAgentHostPolicyContinuationPresenter>('agentHostPolicyContinuationPresenter');

/** Opens a persisted Copilot conversation in the window's normal session surface. */
export interface IAgentHostPolicyContinuationPresenter {
	readonly _serviceBrand: undefined;
	open(resource: URI, source: IChatWidget, ensureSourceCurrent: () => void): Promise<void>;
}

export const IAgentHostPolicyContinuationService = createDecorator<IAgentHostPolicyContinuationService>('agentHostPolicyContinuationService');

export interface IAgentHostPolicyContinuationService {
	readonly _serviceBrand: undefined;
	continueInCopilot(resource: URI, trigger?: 'manual' | 'automatic'): Promise<void>;
}

type Draft = Pick<IChatModelInputState, 'inputText' | 'attachments' | 'selections'>;
type Continuation = {
	readonly resource: URI;
	readonly backendSession: URI;
	readonly source: Pick<IAgentHostSavedChat, 'session' | 'chat' | 'identity'>;
} & (
		| { readonly state: 'created'; readonly turnCount: number; readonly draft: Draft }
		| { readonly state: 'draftHandedOff' | 'completed' }
	);

function continuationFailedMessage(): string {
	return localize('agentHost.policyContinuation.failed', "Couldn't continue this conversation in Copilot. Your original conversation is still available.");
}

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export class AgentHostPolicyContinuationService extends Disposable implements IAgentHostPolicyContinuationService {
	declare readonly _serviceBrand: undefined;
	private readonly _pending = new ResourceMap<Promise<void>>();
	private readonly _destinations = new ResourceMap<Continuation>();

	constructor(
		@IAgentHostService private readonly _connection: IAgentHostService,
		@IAgentHostConnectionsService private readonly _connections: IAgentHostConnectionsService,
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
		@IChatService private readonly _chatService: IChatService,
		@IChatWidgetService private readonly _widgets: IChatWidgetService,
		@IAgentHostPolicyContinuationPresenter private readonly _presenter: IAgentHostPolicyContinuationPresenter,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IFileDialogService private readonly _fileDialogService: IFileDialogService,
		@IFileService private readonly _fileService: IFileService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IWorkspaceTrustRequestService private readonly _workspaceTrustRequestService: IWorkspaceTrustRequestService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IManagedSettingsService private readonly _managedSettingsService: IManagedSettingsService,
	) {
		super();
		this._register(this._connection.onDidNotification(notification => {
			if (notification.type === NotificationType.SessionRemoved) {
				for (const [source, destination] of this._destinations) {
					if (destination.backendSession.toString() === notification.session) {
						this._destinations.delete(source);
					}
				}
			}
		}));
	}

	continueInCopilot(resource: URI, trigger: 'manual' | 'automatic' = 'manual'): Promise<void> {
		const pending = this._pending.get(resource);
		if (pending) {
			return pending;
		}
		const operation = this._continueInCopilot(resource, trigger).finally(() => this._pending.delete(resource));
		this._pending.set(resource, operation);
		return operation;
	}

	private async _continueInCopilot(resource: URI, trigger: 'manual' | 'automatic'): Promise<void> {
		const source = this._widgets.getWidgetBySessionResource(resource);
		const model = source?.viewModel?.model;
		if (!source || !model || !isEqual(model.sessionResource, resource) || !model.isReadOnly.get() || model.requestInProgress.get()) {
			throw new Error(continuationFailedMessage());
		}
		const automatic = trigger === 'automatic';
		const provider = resource.scheme === SessionType.AgentHostClaude ? 'claude' : resource.scheme === SessionType.AgentHostCodex ? 'codex' : undefined;
		const supportsCompletion = !!this._connection.completeSavedChatContinuation && supportsAgentHostSavedChatContinuation(this._connection.initializeResult.get());
		const ensureSourceCurrent = () => {
			if (!source.visible || source.viewModel?.model !== model || this._widgets.getWidgetBySessionResource(resource) !== source || model.requestInProgress.get()
				|| (automatic && (!provider || !supportsCompletion || !requiresCopilotAgentHost(this._managedSettingsService, this._configurationService) || !isLocalAgentHostProviderDisabledByPolicy(provider, this._configurationService)))) {
				throw new CancellationError();
			}
		};
		ensureSourceCurrent();
		if (!await this._chatSessionsService.canResolveChatSession(SessionType.AgentHostCopilot)) {
			throw new Error(localize('agentHost.policyContinuation.unavailable', "Copilot Agent Host is not available. Your original conversation is still available."));
		}
		ensureSourceCurrent();
		const saved = await readAgentHostSavedChat(resource, this._connection, this._connections, CancellationToken.None);
		ensureSourceCurrent();
		if (automatic && (saved.availability?.kind !== 'available' || saved.origin?.kind === ChatOriginKind.Tool || !saved.turns.length || saved.workspace.kind === 'managed')) {
			throw new CancellationError();
		}
		let destination = this._destinations.get(resource);
		if (destination && (destination.source.identity !== saved.identity
			|| (supportsCompletion && destination.state === 'completed' && saved.availability?.kind !== 'continued'))) {
			this._destinations.delete(resource);
			destination = undefined;
		}
		if (automatic && destination?.state === 'completed') {
			throw new CancellationError();
		}
		if (saved.availability?.kind === 'continued') {
			destination = {
				state: 'completed',
				resource: this._connections.registerSessionResource(saved.availability.destination, undefined, COPILOT_CLI_AGENT_PROVIDER_ID),
				backendSession: saved.availability.destination,
				source: { session: saved.session, chat: saved.chat, identity: saved.identity },
			};
			this._destinations.set(resource, destination);
		}
		if (!destination) {
			const input = source.getInputState() ?? model.inputModel.state.get();
			const turns = saved.turns;
			if (model.getRequests().length !== turns.length) {
				throw new Error(localize('agentHost.policyContinuation.sourceHistoryMissing', "The original conversation hasn't finished loading. Try again after its history loads."));
			}
			const savedInput = savedChatDraftInput(saved);
			const draft: Draft = input
				? { inputText: input.inputText, attachments: input.attachments, selections: input.selections }
				: { inputText: savedInput?.inputText ?? '', attachments: savedInput?.attachments ?? [], selections: savedInput?.selections ?? [] };
			const workspace = await this._chooseWorkspace(saved.workspace);
			ensureSourceCurrent();
			if (!workspace) {
				return;
			}
			for (const uri of workspace.workingDirectories ?? []) {
				const trust = await this._workspaceTrustManagementService.getUriTrustInfo(uri);
				ensureSourceCurrent();
				if (!trust.trusted) {
					if (automatic) {
						throw new CancellationError();
					}
					if (!await this._workspaceTrustRequestService.requestResourcesTrust({
						uri,
						message: localize('agentHost.policyContinuation.trust', "Copilot will be able to read files, run commands, and make changes in this folder."),
					})) {
						return;
					}
				}
			}
			ensureSourceCurrent();
			const backend = await this._connection.createSession({
				provider: COPILOT_CLI_AGENT_PROVIDER_ID,
				workingDirectories: workspace.workingDirectories,
				config: { [SessionConfigKey.Isolation]: 'folder' },
				importConversation: { turns, title: saved.title },
			});
			destination = { state: 'created', resource: this._connections.registerSessionResource(backend, undefined, COPILOT_CLI_AGENT_PROVIDER_ID), backendSession: backend, source: { session: saved.session, chat: saved.chat, identity: saved.identity }, turnCount: turns.length, draft };
			this._destinations.set(resource, destination);
			this._chatSessionsService.notifySessionMaterialized?.(destination.resource);
		}
		ensureSourceCurrent();
		const modelRef = await this._chatService.acquireOrLoadSession(destination.resource, ChatAgentLocation.Chat, CancellationToken.None, 'AgentHostPolicyContinuation');
		if (!modelRef) {
			throw new Error(continuationFailedMessage());
		}
		try {
			if (destination.state === 'created' && modelRef.object.getRequests().length < destination.turnCount) {
				throw new Error(localize('agentHost.policyContinuation.historyMissing', "Copilot hasn't loaded the copied conversation yet. Try again to open it. Your original conversation is still available."));
			}
			ensureSourceCurrent();
			if (this._destinations.get(resource) !== destination) {
				throw new Error(continuationFailedMessage());
			}
			if (destination.state === 'created') {
				const currentInput = modelRef.object.inputModel.state.get();
				if (!currentInput?.inputText && !currentInput?.attachments.length && modelRef.object.getRequests().length === destination.turnCount) {
					modelRef.object.inputModel.setState(destination.draft);
				}
				destination = { state: 'draftHandedOff', resource: destination.resource, backendSession: destination.backendSession, source: destination.source };
				this._destinations.set(resource, destination);
			}
			await this._presenter.open(destination.resource, source, ensureSourceCurrent);
			const target = this._widgets.getWidgetBySessionResource(destination.resource);
			if (!target?.visible || target.viewModel?.model !== modelRef.object || !isEqual(target.viewModel.sessionResource, destination.resource) || this._destinations.get(resource) !== destination) {
				throw new Error(continuationFailedMessage());
			}
			target.focusInput();
			if (supportsCompletion && this._connection.completeSavedChatContinuation) {
				await this._connection.completeSavedChatContinuation({ ...destination.source, destination: destination.backendSession });
			}
			if (this._destinations.get(resource) === destination) {
				this._destinations.set(resource, { ...destination, state: 'completed' });
			}
		} finally {
			modelRef.dispose();
		}
	}

	private async _chooseWorkspace(workspace: AgentHostSavedChatWorkspace): Promise<{ readonly workingDirectories: readonly URI[] | undefined } | undefined> {
		if (workspace.kind === 'none') {
			return { workingDirectories: undefined };
		}
		if (workspace.kind === 'folder') {
			return { workingDirectories: workspace.workingDirectories };
		}
		const choice = await this._quickInputService.pick([
			...(workspace.suggestedDirectories.length ? [{ id: 'project', label: localize('agentHost.policyContinuation.project', "Use Project Folders"), description: workspace.suggestedDirectories.map(uri => uri.fsPath).join(', ') }] : []),
			{ id: 'browse', label: localize('agentHost.policyContinuation.chooseFolder', "Choose Another Folder...") },
		], {
			title: localize('agentHost.policyContinuation.title', "Continue in Copilot"),
			placeHolder: localize('agentHost.policyContinuation.workspace', "Choose an independent workspace. Uncommitted files stay in the original checkout."),
		});
		if (!choice) {
			return undefined;
		}
		const workingDirectories = choice.id === 'project' ? workspace.suggestedDirectories : await this._fileDialogService.showOpenDialog({
			title: localize('agentHost.policyContinuation.chooseWorkspace', "Choose Copilot Workspace"),
			defaultUri: workspace.suggestedDirectories[0],
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: true,
		});
		if (!workingDirectories?.length) {
			return undefined;
		}
		const canonicalize = async (directory: URI): Promise<URI> => {
			const canonical = await this._fileService.realpath(directory);
			if (!canonical) {
				throw new Error(localize('agentHost.policyContinuation.unresolvedWorkspace', "Couldn't verify the selected workspace is independent of the original checkout. Choose another folder and try again."));
			}
			return canonical;
		};
		const canonicalizeOwnedDirectory = async (directory: URI): Promise<URI> => {
			let ancestor = directory;
			const suffix: string[] = [];
			while (true) {
				try {
					return URI.joinPath(await canonicalize(ancestor), ...suffix);
				} catch (error) {
					if (!(error instanceof Error) || (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND && !(isObject(error) && error.code === 'ENOENT'))) {
						throw error;
					}
					const parent = dirname(ancestor);
					if (isEqual(parent, ancestor)) {
						throw error;
					}
					suffix.unshift(basename(ancestor));
					ancestor = parent;
				}
			}
		};
		const [canonicalDirectories, canonicalManagedDirectories] = await Promise.all([
			Promise.all(workingDirectories.map(canonicalize)),
			Promise.all(workspace.managedDirectories.map(canonicalizeOwnedDirectory)),
		]);
		if (canonicalDirectories.some(directory => canonicalManagedDirectories.some(owned => this._uriIdentityService.extUri.isEqualOrParent(directory, owned)))) {
			throw new Error(localize('agentHost.policyContinuation.ownedCheckout', "Choose a folder outside the original session's managed checkout. Its files remain with that session."));
		}
		const uniqueDirectories = new ResourceMap<URI>(directory => this._uriIdentityService.extUri.getComparisonKey(directory));
		for (const directory of canonicalDirectories) {
			if (!uniqueDirectories.has(directory)) {
				uniqueDirectories.set(directory, directory);
			}
		}
		return { workingDirectories: [...uniqueDirectories.values()] };
	}
}

export class ContinueAgentHostChatInCopilotAction extends Action2 {
	constructor() {
		super({ id: CONTINUE_AGENT_HOST_CHAT_IN_COPILOT_ACTION_ID, title: localize2('agentHost.policyContinuation.action', "Continue in Copilot"), f1: false });
	}

	override run(accessor: ServicesAccessor, resource: unknown): Promise<void> {
		if (!URI.isUri(resource)) {
			throw new Error(continuationFailedMessage());
		}
		return accessor.get(IAgentHostPolicyContinuationService).continueInCopilot(resource);
	}
}
