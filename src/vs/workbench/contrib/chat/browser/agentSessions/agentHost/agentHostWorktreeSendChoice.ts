/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { onUnexpectedError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { ResourceMap, ResourceSet } from '../../../../../../base/common/map.js';
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
import { ISpotlightPayload, SPOTLIGHT_PRESENTATION_KIND } from '../../../../onboarding/browser/spotlight/spotlightTypes.js';
import { onboardingScenarioRegistry } from '../../../../onboarding/common/onboardingRegistry.js';
import { IOnboardingScenario, OnboardingOutcome } from '../../../../onboarding/common/onboardingScenario.js';
import { IOnboardingScenarioService } from '../../../../onboarding/common/onboardingScenarioService.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { isUntitledChatSession } from '../../../common/model/chatUri.js';
import { IChatWidgetService } from '../../chat.js';
import { ChatSubmitRequestOutcome, IChatSubmitRequest, IChatSubmitRequestHandlerService, IChatSubmitRequestResult } from '../../chatSubmitRequestHandlerService.js';
import { isLocalAgentHostTarget } from '../../../common/chatSessionsService.js';
import { IAgentSession } from '../agentSessionsModel.js';
import { IAgentSessionsService } from '../agentSessionsService.js';
import { IAgentHostNewSessionFolderService } from './agentHostNewSessionFolderService.js';
import { AgentHostWorktreeFolderChoices } from './agentHostWorktreeFolderChoices.js';

export const AGENT_HOST_WORKTREE_SEND_CHOICE_ID = 'chat.agentHost.worktreeSendChoice';
/** The onboarding target of the Work in Parallel callout: the worktree control of the chat it asks about, which marks itself. */
export const AGENT_HOST_WORKTREE_SEND_CHOICE_TARGET_ID = 'chat.agentHost.worktreeSendChoice.control';
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

/**
 * `sessions` as {@link isRecentChatInFolder} reads them: where each works, as its metadata says; and when it was last active,
 * its last request, else, without one, when it was made.
 */
export function toWorktreeSendChoiceSessions(sessions: readonly IAgentSession[]): IWorktreeSendChoiceSession[] {
	return sessions.map(session => {
		const path = session.metadata?.worktreePath ?? session.metadata?.workingDirectoryPath;
		return {
			resource: session.resource,
			isAgentHost: isLocalAgentHostTarget(session.providerType),
			isArchived: session.isArchived(),
			workingDirectory: typeof path === 'string' && path ? URI.file(path) : undefined,
			lastActivity: session.timing.lastRequestEnded ?? session.timing.lastRequestStarted ?? session.timing.created,
		};
	});
}

export const IAgentHostWorktreeSendChoiceService = createDecorator<IAgentHostWorktreeSendChoiceService>('agentHostWorktreeSendChoiceService');

/** Where a new chat in the window's own folder works, as the user chose once: for other chat surfaces' own new chats. */
export interface IAgentHostWorktreeSendChoiceService {
	readonly _serviceBrand: undefined;

	/**
	 * The new chat whose send the Work in Parallel callout asks about now, if any. The worktree controls of that chat's input
	 * anchor the callout, marked as its onboarding target ({@link AGENT_HOST_WORKTREE_SEND_CHOICE_TARGET_ID}); without a visible one it ends unanswered.
	 */
	readonly pendingSendChoice: IObservable<URI | undefined>;

	/**
	 * Fires with the chat asked about each time its callout shows, on the control it then anchors on, which can tell so by
	 * resolving the callout's target as it fires.
	 */
	readonly onDidShowSendChoice: Event<URI>;

	/**
	 * Where the new chat of `resource` in the window's own folder works: as the user chose before, else as they choose now in
	 * the Work in Parallel callout on that chat's worktree control, which it remembers for the profile; the folder where they
	 * give no answer, such as where no control of that chat shows. The caller decides when to ask, such as with
	 * {@link isRecentChatInFolder}, holds its send meanwhile, and applies the answer to its chat.
	 */
	requestSendChoice(resource: URI): Promise<WorktreeSendChoice>;

	/**
	 * Ends the callout asking about the chat of `resource`, if it shows, unanswered: as where it could not show, the chat
	 * works in the folder and nothing is remembered. Such as once the control that anchors it shows another chat.
	 */
	cancelSendChoice(resource: URI): void;

	/**
	 * Whether another chat of the agent host, not archived, worked in `folder` itself within the last day, as
	 * {@link isRecentChatInFolder} decides over all sessions: when another chat surface asks of its new chat `draft`.
	 */
	isRecentChatInFolder(folder: URI, draft: URI): boolean;

	/**
	 * Whether the new chat of `resource` starts with New Worktree selected, as the user answered before: a new chat in the
	 * window's own folder, while another chat there was recently active, that the user has not chosen for yet, and whose
	 * session can work in a new worktree, as `choices` read it. Selecting it so is not the user's choice.
	 */
	preselectsNewWorktree(resource: URI, choices: AgentHostWorktreeFolderChoices): boolean;

	/**
	 * Selects New Worktree for the new chat of `resource` with `choices`, as {@link preselectsNewWorktree} tells. Until that
	 * settles, a send of it waits for it, and so should anything that reads or flips its selection ({@link whenPreselected}).
	 */
	preselectNewWorktree(resource: URI, choices: AgentHostWorktreeFolderChoices): Promise<void>;

	/** Settles once the preselection of the new chat of `resource` under way, if any, has. */
	whenPreselected(resource: URI): Promise<void>;

	/**
	 * Remembers where the user chose the new chat of `resource` to work, as its checkbox or folder chip now shows it: New
	 * Worktree, or the window's own folder. Nothing for an existing worktree, nor for a chat not in the window's own folder.
	 */
	rememberSelection(resource: URI): void;
}

/**
 * Asks once, as the user sends the first request of a new chat that would work in the window's own folder while another
 * chat of an agent host there was active within the last day ({@link isRecentChatInFolder}), whether it works in a new
 * worktree instead, separately from the others. Later such chats start with the answer preselected in their New Worktree
 * checkbox or folder chip ({@link preselectsNewWorktree}), and send as that shows then: the user can change it before they
 * send, which it remembers as their answer ({@link rememberSelection}).
 *
 * It holds the asked send through the chat's submit handler, which the normal send then continues once answered, so the
 * request is sent once, in the new worktree or in the folder. It leaves alone a chat whose user chose where it works in its
 * folder chip or New Worktree checkbox, and a session that cannot work in a new worktree.
 */
export class AgentHostWorktreeSendChoice extends Disposable implements IAgentHostWorktreeSendChoiceService {

	declare readonly _serviceBrand: undefined;

	/** New chats whose send is held, from deciding until it goes on: a request sent again meanwhile is not sent twice. */
	private readonly _holding = new ResourceSet();
	/** The callout shown now: one at a time, as the onboarding engine joins runs of the same scenario. */
	private _asking: { readonly resource: URI; readonly cancellation: CancellationTokenSource; useWorktree: boolean } | undefined;
	private readonly _pendingSendChoice = observableValue<URI | undefined>(this, undefined);
	readonly pendingSendChoice: IObservable<URI | undefined> = this._pendingSendChoice;
	private readonly _onDidShowSendChoice = this._register(new Emitter<URI>());
	readonly onDidShowSendChoice = this._onDidShowSendChoice.event;
	/** Asks one after another, so that each has its own chat and answer. */
	private readonly _asks = new Sequencer();
	/** The preselections of New Worktree under way, by the new chat. */
	private readonly _preselecting = new ResourceMap<Promise<void>>();

	constructor(
		private readonly _now: () => number,
		@IChatSubmitRequestHandlerService submitRequestHandlerService: IChatSubmitRequestHandlerService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IAgentSessionsService private readonly _agentSessionsService: IAgentSessionsService,
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
		this._register(onboardingScenarioRegistry.register(this._createScenario()));
		this._register(submitRequestHandlerService.register({
			id: AGENT_HOST_WORKTREE_SEND_CHOICE_ID,
			tryHandle: async request => {
				try {
					return await this._tryHandle(request);
				} catch (error) {
					onUnexpectedError(error);
					// Sent as it is only where it still works in the folder; else kept in the input, never sent elsewhere
					return this._worksInFolder(request.sessionResource) ? { outcome: ChatSubmitRequestOutcome.Continue, held: true } : this._cancel();
				}
			},
		}));
	}

	/**
	 * Continues the request, or cancels it so that it stays in the input unsent: where it is sent again while held (ChatWidget
	 * does not, holding it itself), or where it cannot work where chosen. Once it asks or changes where the chat works, the
	 * request was held.
	 */
	private async _tryHandle(request: IChatSubmitRequest): Promise<IChatSubmitRequestResult> {
		const resource = request.sessionResource;
		if (this._holding.has(resource)) {
			// The held request goes on once decided; this one is neither sent as well nor cleared
			return { outcome: ChatSubmitRequestOutcome.Cancelled };
		}
		const preselecting = this._preselecting.get(resource);
		if (preselecting) {
			// Sent while New Worktree is being preselected: not before the chat works where its checkbox shows
			await preselecting;
			return { outcome: ChatSubmitRequestOutcome.Continue, held: true };
		}
		if (!this._mayBeNewChatInFolder(resource)) {
			return { outcome: ChatSubmitRequestOutcome.Continue };
		}
		// The one reader of where the chat works for this send
		const choices = this._instantiationService.createInstance(AgentHostWorktreeFolderChoices, () => resource);
		// With an answer remembered, the chat starts as it was preselected, and sends as its checkbox or chip shows now
		if (this._rememberedChoice() || !this._isNewChatInFolder(resource, choices) || !this._hasRecentChatInFolder(resource) || !choices.canWorkInNewWorktree()) {
			choices.dispose();
			return { outcome: ChatSubmitRequestOutcome.Continue };
		}
		this._holding.add(resource);
		try {
			const widget = this._chatWidgetService.getWidgetBySessionResource(resource);
			const choice = widget ? await this._askAndRemember(resource) : 'folder';
			// Where no chat input shows the draft anymore, its send does not go on (ChatWidget checks too), so nothing is applied
			if (choice === 'worktree' && this._chatWidgetService.getWidgetBySessionResource(resource) === widget && !await this._applyNewWorktree(choices)) {
				return this._cancel();
			}
			return { outcome: ChatSubmitRequestOutcome.Continue, held: true };
		} finally {
			choices.dispose();
			this._holding.delete(resource);
		}
	}

	/**
	 * Has the chat work in a new worktree. Where that fails, it goes back to the folder, which a warning tells. Returns whether
	 * the chat can be sent: only in a new worktree or where its configuration is read to be in the folder, not where it is
	 * unknown, such as a configuration or isolation gone, or a change back to the folder that did nothing.
	 */
	private async _applyNewWorktree(choices: AgentHostWorktreeFolderChoices): Promise<boolean> {
		try {
			await choices.setNewWorktree(true);
			if (choices.isNewWorktreeSelected()) {
				return true;
			}
		} catch (error) {
			onUnexpectedError(error);
		}
		if (!choices.isFolderSelected()) {
			// Changed before the change failed, or not known: back to the folder, which must be read so then
			try {
				await choices.setNewWorktree(false);
			} catch (error) {
				onUnexpectedError(error);
				return false;
			}
			if (!choices.isFolderSelected()) {
				return false;
			}
		}
		this._notificationService.warn(localize('agentHost.worktreeSendChoice.notApplied', "This chat could not start in a new worktree, so it works in the folder."));
		return true;
	}

	private _worksInFolder(resource: URI): boolean {
		const choices = this._instantiationService.createInstance(AgentHostWorktreeFolderChoices, () => resource);
		try {
			return choices.isFolderSelected();
		} finally {
			choices.dispose();
		}
	}

	private _cancel(): IChatSubmitRequestResult {
		this._notificationService.error(localize('agentHost.worktreeSendChoice.notSent', "This chat could not start in a new worktree nor go back to the folder, so its request was not sent. It is still in the chat input."));
		return { outcome: ChatSubmitRequestOutcome.Cancelled, held: true };
	}

	preselectsNewWorktree(resource: URI, choices: AgentHostWorktreeFolderChoices): boolean {
		return this._rememberedChoice() === 'worktree' && this._isNewChatInFolder(resource, choices) && this._hasRecentChatInFolder(resource) && choices.canWorkInNewWorktree();
	}

	preselectNewWorktree(resource: URI, choices: AgentHostWorktreeFolderChoices): Promise<void> {
		const preselecting = choices.preselectNewWorktree().catch(onUnexpectedError).finally(() => {
			if (this._preselecting.get(resource) === preselecting) {
				this._preselecting.delete(resource);
			}
		});
		this._preselecting.set(resource, preselecting);
		return preselecting;
	}

	async whenPreselected(resource: URI): Promise<void> {
		await this._preselecting.get(resource);
	}

	rememberSelection(resource: URI): void {
		if (!isLocalAgentHostTarget(resource.scheme) || !isUntitledChatSession(resource)) {
			return;
		}
		const choices = this._instantiationService.createInstance(AgentHostWorktreeFolderChoices, () => resource);
		try {
			if (!choices.isActive()) {
				return;
			}
			const choice: WorktreeSendChoice | undefined = choices.isNewWorktreeSelected() ? 'worktree' : this._isInPrimaryFolder(resource) && choices.isFolderSelected() ? 'folder' : undefined;
			if (choice) {
				this._storageService.store(AGENT_HOST_WORKTREE_SEND_CHOICE_STORAGE_KEY, choice, StorageScope.PROFILE, StorageTarget.USER);
			}
		} finally {
			choices.dispose();
		}
	}

	cancelSendChoice(resource: URI): void {
		if (this._asking && extUriBiasedIgnorePathCase.isEqual(this._asking.resource, resource)) {
			this._asking.cancellation.cancel();
		}
	}

	async requestSendChoice(resource: URI): Promise<WorktreeSendChoice> {
		return this._rememberedChoice() ?? this._askAndRemember(resource);
	}

	/**
	 * Asks about the chat of `resource`, after any callout shown before, unless that answer is remembered by then; and
	 * remembers the answer only where the user gave one: not where the callout did not show or ended on its own, which then
	 * works in the folder.
	 */
	private _askAndRemember(resource: URI): Promise<WorktreeSendChoice> {
		return this._asks.queue(async () => {
			const remembered = this._rememberedChoice();
			if (remembered) {
				return remembered;
			}
			const answer = await this._ask(resource);
			if (answer) {
				this._storageService.store(AGENT_HOST_WORKTREE_SEND_CHOICE_STORAGE_KEY, answer, StorageScope.PROFILE, StorageTarget.USER);
			}
			return answer ?? 'folder';
		});
	}

	private _rememberedChoice(): WorktreeSendChoice | undefined {
		const stored = this._storageService.get(AGENT_HOST_WORKTREE_SEND_CHOICE_STORAGE_KEY, StorageScope.PROFILE);
		return stored === 'worktree' || stored === 'folder' ? stored : undefined;
	}

	/**
	 * The user's answer in the callout on the worktree control of the chat of `resource`; `undefined` where they gave none,
	 * such as where no such control shows to anchor it.
	 */
	private async _ask(resource: URI): Promise<WorktreeSendChoice | undefined> {
		const asking = this._asking = { resource, cancellation: new CancellationTokenSource(), useWorktree: false };
		this._pendingSendChoice.set(resource, undefined);
		try {
			const outcome = await this._onboardingService.runScenario(AGENT_HOST_WORKTREE_SEND_CHOICE_ID, asking.cancellation.token);
			if (asking.cancellation.token.isCancellationRequested) {
				// Ended for its chat, such as as its control showed another: no answer, whatever the callout reported
				return undefined;
			}
			// Use New Worktree completes it; Continue in Folder and Escape skip it
			return outcome === OnboardingOutcome.Completed && asking.useWorktree ? 'worktree'
				: outcome === OnboardingOutcome.Skipped ? 'folder'
					: undefined;
		} finally {
			asking.cancellation.dispose();
			this._asking = undefined;
			this._pendingSendChoice.set(undefined, undefined);
		}
	}

	/**
	 * Whether `resource` is a new chat of the local agent host in the Chat view (`/untitled-…`, not a chat area composer's
	 * session, which asks on its own), with AI features and worktree support on in a local editor
	 * window, that would work in the window's own folder: not in a new worktree, not without a workspace, and not where the
	 * user chose where it works.
	 */
	private _isNewChatInFolder(resource: URI, choices: AgentHostWorktreeFolderChoices): boolean {
		return this._mayBeNewChatInFolder(resource) && choices.isActive() && !choices.isNewWorktreeSelected() && this._isInPrimaryFolder(resource);
	}

	/** Whether the new chat of `resource` is to work in the window's own folder, rather than a worktree of it. */
	private _isInPrimaryFolder(resource: URI): boolean {
		const primary = this._primaryFolder();
		const folder = this._folderService.getFolder(resource) ?? this._workspaceContextService.getWorkspace().folders[0]?.uri;
		return !!primary && !!folder && extUriBiasedIgnorePathCase.isEqual(folder, primary);
	}

	/** What {@link _isNewChatInFolder} tells without reading where the chat works. */
	private _mayBeNewChatInFolder(resource: URI): boolean {
		return isLocalAgentHostTarget(resource.scheme) && isUntitledChatSession(resource)
			&& this._contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.enabled.key) === true
			&& !this._environmentService.isSessionsWindow && !this._environmentService.remoteAuthority
			&& !this._folderService.isIsolationChosen(resource) && !this._folderService.isNewWorktree(resource);
	}

	private _hasRecentChatInFolder(draft: URI): boolean {
		const primary = this._primaryFolder();
		return !!primary && this.isRecentChatInFolder(primary, draft);
	}

	isRecentChatInFolder(folder: URI, draft: URI): boolean {
		const sessions = toWorktreeSendChoiceSessions(this._agentSessionsService.model.sessions);
		return isRecentChatInFolder(sessions, folder, draft, this._now());
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
							run: () => {
								if (this._asking) {
									this._asking.useWorktree = true;
								}
							},
							advance: true,
						},
						endTourLabel: localize('agentHost.worktreeSendChoice.continueInFolder', "Continue in Folder"),
						placement: 'above',
						missingTarget: { kind: 'abort' },
						onDidShow: () => {
							if (this._asking) {
								this._onDidShowSendChoice.fire(this._asking.resource);
							}
						},
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
