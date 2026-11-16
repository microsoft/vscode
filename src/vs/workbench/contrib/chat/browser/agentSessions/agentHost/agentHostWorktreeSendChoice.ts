/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { onUnexpectedError } from '../../../../../../base/common/errors.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
import { extUriBiasedIgnorePathCase } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { createDecorator, IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { SyncDescriptor } from '../../../../../../platform/instantiation/common/descriptors.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../common/contributions.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { registerOnboardingTargetProvider } from '../../../../onboarding/browser/spotlight/onboardingTarget.js';
import { ISpotlightPayload, SPOTLIGHT_PRESENTATION_KIND } from '../../../../onboarding/browser/spotlight/spotlightTypes.js';
import { onboardingScenarioRegistry } from '../../../../onboarding/common/onboardingRegistry.js';
import { IOnboardingScenario } from '../../../../onboarding/common/onboardingScenario.js';
import { IOnboardingScenarioService } from '../../../../onboarding/common/onboardingScenarioService.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { isUntitledChatSession } from '../../../common/model/chatUri.js';
import { IChatWidgetService } from '../../chat.js';
import { IChatSubmitRequest, IChatSubmitRequestHandlerService } from '../../chatSubmitRequestHandlerService.js';
import { isLocalAgentHostTarget } from '../../../common/chatSessionsService.js';
import { IAgentSessionsService } from '../agentSessionsService.js';
import { IAgentHostNewSessionFolderService } from './agentHostNewSessionFolderService.js';
import { getWorktreeControl } from './agentHostNewWorktreeToggle.js';
import { AgentHostWorktreeFolderChoices } from './agentHostWorktreeFolderChoices.js';
import { IAgentHostWorktreeSessionSources } from './agentHostWorktreeSessionSources.js';

export const AGENT_HOST_WORKTREE_SEND_CHOICE_ID = 'chat.agentHost.worktreeSendChoice';
const AGENT_HOST_WORKTREE_SEND_CHOICE_TARGET_ID = 'chat.agentHost.worktreeSendChoice.control';
/** Where the user chose new chats in the window's own folder to work, once asked: `worktree` or `folder`. */
export const AGENT_HOST_WORKTREE_SEND_CHOICE_STORAGE_KEY = 'chat.agentHost.worktreeSendChoice';

export type WorktreeSendChoice = 'worktree' | 'folder';

/** How recently another chat in the window's own folder must have been active for a new one there to be asked. */
export const WORKTREE_SEND_CHOICE_RECENT_MS = 24 * 60 * 60 * 1000;

/** A session as {@link isRecentChatInFolder} reads it. */
export interface IWorktreeSendChoiceSession {
	readonly resource: URI;
	/** Whether it is a chat of an agent host, rather than a local Copilot chat. */
	readonly isAgentHost: boolean;
	readonly isArchived: boolean;
	/** Where it works; `undefined` while not known. */
	readonly workingDirectory: URI | undefined;
	/** When it was last active, in milliseconds since the epoch. */
	readonly lastActivity: number;
}

/**
 * Whether a chat of an agent host other than `draft`, not archived, worked in `folder` itself (not a worktree of it) and was
 * active within the last {@link WORKTREE_SEND_CHOICE_RECENT_MS}, the bound included, as of `now`.
 */
export function isRecentChatInFolder(sessions: readonly IWorktreeSendChoiceSession[], folder: URI, draft: URI, now: number): boolean {
	return sessions.some(session => session.isAgentHost && !session.isArchived
		&& !extUriBiasedIgnorePathCase.isEqual(session.resource, draft)
		&& !!session.workingDirectory && extUriBiasedIgnorePathCase.isEqual(session.workingDirectory, folder)
		&& now - session.lastActivity <= WORKTREE_SEND_CHOICE_RECENT_MS);
}

export const IAgentHostWorktreeSendChoiceService = createDecorator<IAgentHostWorktreeSendChoiceService>('agentHostWorktreeSendChoiceService');

/** Where a new chat in the window's own folder works, as the user chose once: for other chat surfaces' own new chats. */
export interface IAgentHostWorktreeSendChoiceService {
	readonly _serviceBrand: undefined;

	/**
	 * Where the new chat of `sessionResource` works: as the user chose before, else as they choose now in the Work in
	 * Parallel callout on `control`, its worktree control, which it remembers for the profile. The caller applies it, and
	 * decides when to ask, such as with {@link isRecentChatInFolder}.
	 */
	runWorktreeSendChoice(sessionResource: URI, control: HTMLElement): Promise<WorktreeSendChoice>;
}

/**
 * Asks once, as the user sends the first request of a new chat that would work in the window's own folder while another
 * chat of an agent host there was active within the last day ({@link isRecentChatInFolder}), whether it works in a new worktree instead, separately from the others; and applies
 * the answer to later such chats without asking.
 *
 * It holds the send through the chat's submit handler, which the normal send then continues once answered, so the request is
 * sent once, in the new worktree or in the folder. It leaves alone a chat whose user chose where it works in its folder chip
 * or New Worktree checkbox, and a session that cannot work in a new worktree.
 */
export class AgentHostWorktreeSendChoice extends Disposable implements IAgentHostWorktreeSendChoiceService {

	declare readonly _serviceBrand: undefined;

	/** New chats whose send is held while the user is asked. */
	private readonly _asking = new ResourceSet();
	private _target: HTMLElement | undefined;
	private _useWorktree = false;

	constructor(
		private readonly _now: () => number,
		@IChatSubmitRequestHandlerService submitRequestHandlerService: IChatSubmitRequestHandlerService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IAgentSessionsService private readonly _agentSessionsService: IAgentSessionsService,
		@IAgentHostWorktreeSessionSources private readonly _sessionSources: IAgentHostWorktreeSessionSources,
		@IAgentHostNewSessionFolderService private readonly _folderService: IAgentHostNewSessionFolderService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IStorageService private readonly _storageService: IStorageService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IOnboardingScenarioService private readonly _onboardingService: IOnboardingScenarioService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
		this._register(registerOnboardingTargetProvider(AGENT_HOST_WORKTREE_SEND_CHOICE_TARGET_ID, scope => scope === undefined && this._target ? { element: this._target } : undefined));
		this._register(onboardingScenarioRegistry.register(this._createScenario()));
		this._register(submitRequestHandlerService.register({
			id: AGENT_HOST_WORKTREE_SEND_CHOICE_ID,
			tryHandle: async request => {
				try {
					return await this._tryHandle(request);
				} catch (error) {
					// Never at the cost of the request: it is sent as it is
					onUnexpectedError(error);
					return false;
				}
			},
		}));
	}

	/** Returns whether it handled the request in place of the send, which it does only for one sent again while it asks. */
	private async _tryHandle(request: IChatSubmitRequest): Promise<boolean> {
		const resource = request.sessionResource;
		if (this._asking.has(resource)) {
			// Sent again while asked: the held request is sent once answered
			return true;
		}
		if (!this._isNewChatInFolder(resource) || !this._hasRecentChatInFolder(resource)) {
			return false;
		}
		const choices = this._instantiationService.createInstance(AgentHostWorktreeFolderChoices, () => resource);
		try {
			if (!choices.canWorkInNewWorktree()) {
				return false;
			}
			const target = this._chatWidgetService.getWidgetBySessionResource(resource)?.domNode;
			const control = target && getWorktreeControl(target);
			// Asked only where the user sees what it points at; the choice remembered applies also without
			if (!control && !this._rememberedChoice()) {
				return false;
			}
			const choice = await this.runWorktreeSendChoice(resource, control);
			if (choice === 'worktree') {
				await choices.setNewWorktree(true);
				if (!choices.isNewWorktreeSelected()) {
					this._notificationService.warn(localize('agentHost.worktreeSendChoice.notApplied', "This chat could not start in a new worktree, so it works in the folder."));
				}
			}
			return false;
		} finally {
			choices.dispose();
		}
	}

	async runWorktreeSendChoice(sessionResource: URI, control: HTMLElement | undefined): Promise<WorktreeSendChoice> {
		const remembered = this._rememberedChoice();
		if (remembered || !control) {
			return remembered ?? 'folder';
		}
		const choice = await this._ask(sessionResource, control);
		this._storageService.store(AGENT_HOST_WORKTREE_SEND_CHOICE_STORAGE_KEY, choice, StorageScope.PROFILE, StorageTarget.USER);
		return choice;
	}

	private _rememberedChoice(): WorktreeSendChoice | undefined {
		const stored = this._storageService.get(AGENT_HOST_WORKTREE_SEND_CHOICE_STORAGE_KEY, StorageScope.PROFILE);
		return stored === 'worktree' || stored === 'folder' ? stored : undefined;
	}

	private async _ask(resource: URI, control: HTMLElement): Promise<WorktreeSendChoice> {
		this._asking.add(resource);
		this._target = control;
		this._useWorktree = false;
		try {
			await this._onboardingService.runScenario(AGENT_HOST_WORKTREE_SEND_CHOICE_ID, CancellationToken.None);
			return this._useWorktree ? 'worktree' : 'folder';
		} finally {
			this._asking.delete(resource);
			this._target = undefined;
		}
	}

	/**
	 * Whether `resource` is a new chat of the local agent host, with AI features and worktree support on in a local editor
	 * window, that would work in the window's own folder: not in a new worktree, not without a workspace, and not where the
	 * user chose where it works.
	 */
	private _isNewChatInFolder(resource: URI): boolean {
		if (!/^agent-host-/.test(resource.scheme) || !isUntitledChatSession(resource)
			|| this._contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.enabled.key) !== true
			|| this._environmentService.isSessionsWindow || this._environmentService.remoteAuthority
			|| this._folderService.isIsolationChosen(resource) || this._folderService.isNoWorkspace(resource) || this._folderService.isNewWorktree(resource)) {
			return false;
		}
		const choices = this._instantiationService.createInstance(AgentHostWorktreeFolderChoices, () => resource);
		try {
			if (!choices.isActive() || choices.isNewWorktreeSelected()) {
				return false;
			}
		} finally {
			choices.dispose();
		}
		const primary = this._primaryFolder();
		const folder = this._folderService.getFolder(resource) ?? this._workspaceContextService.getWorkspace().folders[0]?.uri;
		return !!primary && !!folder && extUriBiasedIgnorePathCase.isEqual(folder, primary);
	}

	private _hasRecentChatInFolder(draft: URI): boolean {
		const primary = this._primaryFolder();
		return !!primary && isRecentChatInFolder(this._agentSessionsService.model.sessions.map(session => {
			const path = session.metadata?.worktreePath ?? session.metadata?.workingDirectoryPath;
			return {
				resource: session.resource,
				isAgentHost: isLocalAgentHostTarget(session.providerType),
				isArchived: session.isArchived(),
				workingDirectory: this._sessionSources.getWorkingDirectory(session.resource) ?? (typeof path === 'string' && path ? URI.file(path) : undefined),
				// Its last request, else, without one, when it was made
				lastActivity: session.timing.lastRequestEnded ?? session.timing.lastRequestStarted ?? session.timing.created,
			};
		}), primary, draft, this._now());
	}

	/** The window's own folder, rather than a worktree it may be at. */
	private _primaryFolder(): URI | undefined {
		const workspace = this._workspaceContextService.getWorkspace();
		return workspace.uri ?? workspace.folders[0]?.uri;
	}

	private _createScenario(): IOnboardingScenario<ISpotlightPayload> {
		return {
			id: AGENT_HOST_WORKTREE_SEND_CHOICE_ID,
			// Asked as a request is sent, never on its own; the answer it remembers decides how often
			trigger: { kind: 'command', commandId: AGENT_HOST_WORKTREE_SEND_CHOICE_ID },
			repeatable: true,
			presentation: {
				kind: SPOTLIGHT_PRESENTATION_KIND,
				payload: {
					steps: [{
						id: 'worktree',
						targetId: AGENT_HOST_WORKTREE_SEND_CHOICE_TARGET_ID,
						title: localize('agentHost.worktreeSendChoice.title', "Work in Parallel"),
						description: localize('agentHost.worktreeSendChoice.description', "Start this chat in a new worktree so it works separately from your other chats, on its own branch."),
						primaryAction: {
							label: localize('agentHost.worktreeSendChoice.useWorktree', "Use New Worktree"),
							run: () => { this._useWorktree = true; },
							advance: true,
						},
						endTourLabel: localize('agentHost.worktreeSendChoice.continueInFolder', "Continue in Folder"),
						placement: 'above',
						missingTarget: { kind: 'abort' },
					}],
				},
			},
		};
	}
}

registerSingleton(IAgentHostWorktreeSendChoiceService, new SyncDescriptor(AgentHostWorktreeSendChoice, [() => Date.now()], false));

/** Creates the service, not delayed, so that the Chat view's new chats are asked as they send. */
class AgentHostWorktreeSendChoiceContribution implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.agentHostWorktreeSendChoice';
	constructor(@IAgentHostWorktreeSendChoiceService _service: IAgentHostWorktreeSendChoiceService) { }
}

registerWorkbenchContribution2(AgentHostWorktreeSendChoiceContribution.ID, AgentHostWorktreeSendChoiceContribution, WorkbenchPhase.AfterRestored);
