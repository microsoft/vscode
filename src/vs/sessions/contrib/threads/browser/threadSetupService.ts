/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { CustomizationEnablementKind } from '../../../../platform/agentHost/common/state/protocol/state.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IAutomationDialogService } from '../../../../workbench/contrib/chat/common/automations/automationDialogService.js';
import { IAutomationService } from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import { IAutomationDescriptor } from '../../../../workbench/contrib/chat/common/automations/automation.js';
import { allChatPetAccessories, ChatPetAccessoryId } from '../../../../workbench/contrib/chat/browser/chatPetAchievements.js';
import { isAgentHostProvider, isAgentHostProviderId } from '../../../common/agentHostSessionsProvider.js';
import { IAgentHostFilterEntry, IAgentHostFilterService } from '../../../services/agentHostFilter/common/agentHostFilter.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { IProviderSessionType, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IThreadParticipant, IThreadsService, IThreadDescriptor, LOCAL_THREAD_HOST_ID, ThreadAvatarId, ThreadAvatarIds, ThreadScope } from '../../../services/threads/browser/threadsService.js';

interface IThreadScopePick extends IQuickPickItem {
	readonly scope: ThreadScope;
}

interface ISessionTypePick extends IQuickPickItem {
	readonly candidate: IProviderSessionType;
}

interface IAgentPick extends IQuickPickItem {
	readonly participant: IThreadParticipant;
}

interface IAvatarPick extends IQuickPickItem {
	readonly avatar: ThreadAvatarId;
}

interface IConnectorPick extends IQuickPickItem {
	readonly id?: string;
	readonly comingSoon?: boolean;
}

const threadAvatarIds = new Set<ChatPetAccessoryId>([
	ThreadAvatarIds.Cowboy,
	ThreadAvatarIds.Wizard,
	ThreadAvatarIds.Chef,
	ThreadAvatarIds.Artist,
	ThreadAvatarIds.Crown,
	ThreadAvatarIds.Propeller,
]);

export interface IThreadSetupService {
	readonly _serviceBrand: undefined;
	createThread(): Promise<IThreadDescriptor | undefined>;
	createAutomation(thread: IThreadDescriptor): Promise<void>;
	changeAvatar(thread: IThreadDescriptor): Promise<void>;
	changeParticipants(thread: IThreadDescriptor): Promise<void>;
	openThread(thread: IThreadDescriptor): Promise<void>;
}

export const IThreadSetupService = createDecorator<IThreadSetupService>('threadSetupService');

export class ThreadSetupKeyReleaseBarrier extends Disposable {
	private readonly pressedKeys = new Set<string>();
	private readonly onDidReleaseKeysEmitter = this._register(new Emitter<void>());

	constructor(private readonly targetWindow = DOM.getActiveWindow()) {
		super();
		this._register(DOM.addDisposableListener(targetWindow, DOM.EventType.KEY_DOWN, (event: KeyboardEvent) => {
			this.pressedKeys.add(event.code || event.key);
		}, true));
		this._register(DOM.addDisposableListener(targetWindow, DOM.EventType.KEY_UP, (event: KeyboardEvent) => {
			this.pressedKeys.delete(event.code || event.key);
			if (this.pressedKeys.size === 0) {
				this.onDidReleaseKeysEmitter.fire();
			}
		}, true));
		this._register(DOM.addDisposableListener(targetWindow, DOM.EventType.BLUR, () => {
			if (this.pressedKeys.size > 0) {
				this.pressedKeys.clear();
				this.onDidReleaseKeysEmitter.fire();
			}
		}, true));
	}

	async wait(): Promise<void> {
		if (this.pressedKeys.size > 0) {
			await Event.toPromise(this.onDidReleaseKeysEmitter.event);
		}
		await new Promise<void>(resolve => this.targetWindow.requestAnimationFrame(() => resolve()));
	}
}

export class ThreadSetupService extends Disposable implements IThreadSetupService {
	declare readonly _serviceBrand: undefined;
	private readonly keyReleaseBarrier = this._register(new ThreadSetupKeyReleaseBarrier());
	private readonly syncingAutomationIds = new Set<string>();

	constructor(
		@IDialogService private readonly dialogService: IDialogService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IAgentHostFilterService private readonly agentHostFilterService: IAgentHostFilterService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@IThreadsService private readonly threadsService: IThreadsService,
		@IAutomationDialogService private readonly automationDialogService: IAutomationDialogService,
		@IAutomationService private readonly automationService: IAutomationService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		this._register(autorun(reader => {
			const threads = this.threadsService.threads.read(reader);
			const automations = this.automationService.automations.read(reader);
			this.syncAutomationDestinations(threads, automations);
		}));
	}

	async createThread(): Promise<IThreadDescriptor | undefined> {
		const input = await this.dialogService.input({
			type: 'info',
			message: localize('threadSetup.title', "Create Thread"),
			detail: localize('threadSetup.detail', "Threads are persistent conversations that stay visible while their agent works."),
			primaryButton: localize('threadSetup.continue', "Continue"),
			inputs: [
				{ placeholder: localize('threadSetup.name', "Thread name") },
			],
		});
		const name = input.values?.[0]?.trim();
		if (!input.confirmed || !name) {
			return undefined;
		}
		await this.keyReleaseBarrier.wait();

		const scope = await this.pickScope();
		if (!scope) {
			return undefined;
		}
		await this.keyReleaseBarrier.wait();
		const sessionType = await this.pickSessionType(scope);
		if (!sessionType) {
			return undefined;
		}
		await this.keyReleaseBarrier.wait();

		const draft = scope.kind === 'workspace'
			? this.sessionsManagementService.createNewSession(scope.folderUri, {
				providerId: sessionType.providerId,
				sessionTypeId: sessionType.sessionType.id,
			})
			: this.sessionsManagementService.createQuickChat({
				providerId: sessionType.providerId,
				sessionTypeId: sessionType.sessionType.id,
			});
		const provider = this.sessionsProvidersService.getProvider(draft.providerId);
		if (!provider || !isAgentHostProvider(provider)) {
			this.sessionsManagementService.discardNewSession(draft);
			this.notificationService.error(localize('threadSetup.agentHostRequired', "Threads require an Agent Host provider."));
			return undefined;
		}

		let persisted = false;
		try {
			await provider.whenSessionConfigResolved(draft.sessionId, CancellationToken.None);
			const participantSelection = await this.pickParticipants(provider.getCustomAgents(draft.sessionId));
			if (!participantSelection) {
				this.sessionsManagementService.discardNewSession(draft);
				return undefined;
			}
			await this.keyReleaseBarrier.wait();
			const avatar = await this.pickAvatar();
			if (!avatar) {
				this.sessionsManagementService.discardNewSession(draft);
				return undefined;
			}
			await this.keyReleaseBarrier.wait();
			const connectorIds = await this.pickConnectors(provider.getMcpServers(draft.sessionId));
			if (!connectorIds) {
				this.sessionsManagementService.discardNewSession(draft);
				return undefined;
			}

			const primaryParticipant = participantSelection.participants.find(participant => participant.id === participantSelection.primaryParticipantId)!;
			provider.setAgent?.(draft.sessionId, primaryParticipant.agent);
			for (const server of provider.getMcpServers(draft.sessionId)) {
				provider.setCustomizationEnablement(draft.sessionId, server.id, [{
					kind: CustomizationEnablementKind.Session,
					enabled: connectorIds.includes(server.id),
				}]);
			}
			const thread = this.threadsService.createThread({
				name,
				session: draft,
				sessionTypeId: sessionType.sessionType.id,
				scope,
				participants: participantSelection.participants,
				primaryParticipantId: participantSelection.primaryParticipantId,
				avatar,
				connectorIds,
			});
			persisted = true;
			await this.openThread(thread);
			return thread;
		} catch (error) {
			if (!persisted) {
				this.sessionsManagementService.discardNewSession(draft);
			}
			throw error;
		}
	}

	async createAutomation(thread: IThreadDescriptor): Promise<void> {
		const primaryParticipant = thread.participants.find(participant => participant.id === thread.primaryParticipantId);
		const target = thread.scope.kind === 'workspace'
			? {
				kind: 'workspace' as const,
				folderUri: thread.scope.folderUri,
				providerId: thread.providerId,
				sessionTypeId: thread.sessionTypeId,
				isolation: { kind: 'default' as const },
			}
			: {
				kind: 'quickChat' as const,
				providerId: thread.providerId,
				sessionTypeId: thread.sessionTypeId,
			};
		await this.automationDialogService.showAutomationDialog({
			initialValues: {
				name: localize('threadAutomation.name', "{0} check-in", thread.name),
				prompt: '',
				schedule: { interval: 'daily', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 1 },
				target,
				enabled: true,
				...(primaryParticipant?.agent ? { sessionTemplate: { agent: { uri: primaryParticipant.agent.uri } } } : {}),
			},
			commit: async result => {
				if (result.kind !== 'create') {
					return;
				}
				const automation = await this.automationService.createAutomation({
					...result.value,
					prompt: buildThreadAutomationPrompt(thread, result.value.prompt),
				});
				this.threadsService.addAutomation(thread.id, automation.id);
			},
		});
	}

	async changeAvatar(thread: IThreadDescriptor): Promise<void> {
		const avatar = await this.pickAvatar();
		if (avatar) {
			this.threadsService.setAvatar(thread.id, avatar);
		}
	}

	async changeParticipants(thread: IThreadDescriptor): Promise<void> {
		const session = this.sessionsManagementService.getSession(thread.sessionResource);
		const provider = session ? this.sessionsProvidersService.getProvider(session.providerId) : undefined;
		if (!session || !provider || !isAgentHostProvider(provider)) {
			this.notificationService.error(localize('threadParticipants.unavailable', "Thread agents are unavailable."));
			return;
		}
		await provider.whenSessionConfigResolved(session.sessionId, CancellationToken.None);
		const selection = await this.pickParticipants(provider.getCustomAgents(session.sessionId), thread);
		if (!selection) {
			return;
		}
		const primaryParticipant = selection.participants.find(participant => participant.id === selection.primaryParticipantId)!;
		provider.setAgent?.(session.sessionId, primaryParticipant.agent);
		this.threadsService.setParticipants(thread.id, selection.participants, selection.primaryParticipantId);
	}

	async openThread(thread: IThreadDescriptor): Promise<void> {
		const currentDraft = this.sessionsManagementService.newSession.get();
		if (currentDraft?.resource.toString() === thread.sessionResource.toString()) {
			this.threadsService.setActiveDraftThread(thread.id);
			await this.openDraft(currentDraft);
			return;
		}
		if (thread.materialized) {
			await this.sessionsService.openSession(thread.sessionResource, { preserveFocus: false });
			return;
		}

		const draft = thread.scope.kind === 'workspace'
			? this.sessionsManagementService.createNewSession(thread.scope.folderUri, {
				providerId: thread.providerId,
				sessionTypeId: thread.sessionTypeId,
			})
			: this.sessionsManagementService.createQuickChat({
				providerId: thread.providerId,
				sessionTypeId: thread.sessionTypeId,
			});
		const provider = this.sessionsProvidersService.getProvider(draft.providerId);
		if (!provider || !isAgentHostProvider(provider)) {
			this.sessionsManagementService.discardNewSession(draft);
			throw new Error(localize('threadSetup.agentHostRequired', "Threads require an Agent Host provider."));
		}
		try {
			await provider.whenSessionConfigResolved(draft.sessionId, CancellationToken.None);
			const primaryParticipant = thread.participants.find(participant => participant.id === thread.primaryParticipantId);
			provider.setAgent?.(draft.sessionId, primaryParticipant?.agent);
			for (const server of provider.getMcpServers(draft.sessionId)) {
				provider.setCustomizationEnablement(draft.sessionId, server.id, [{
					kind: CustomizationEnablementKind.Session,
					enabled: thread.connectorIds.includes(server.id),
				}]);
			}
			this.threadsService.rebindDraft(thread.id, draft);
			this.threadsService.setActiveDraftThread(thread.id);
			await this.openDraft(draft);
		} catch (error) {
			this.sessionsManagementService.discardNewSession(draft);
			throw error;
		}
	}

	private async openDraft(draft: ISession): Promise<void> {
		await activateThreadDraft(this.sessionsService, draft);
	}

	private async pickScope(): Promise<ThreadScope | undefined> {
		const localHostLabel = localize('threadScope.localHost', "This machine");
		const remoteHosts = this.agentHostFilterService.hosts;
		const quickChatTypes = this.sessionsManagementService.getQuickChatSessionTypes().filter(candidate => isAgentHostProviderId(candidate.providerId));
		const remoteProviderIds = new Set(remoteHosts.flatMap(host => [...host.providerIds, ...(host.sessionCreationProviderId ? [host.sessionCreationProviderId] : [])]));
		const picks: IThreadScopePick[] = [];
		if (quickChatTypes.some(candidate => !remoteProviderIds.has(candidate.providerId))) {
			picks.push({
				label: localize('threadScope.noWorkspace', "No workspace"),
				description: localHostLabel,
				iconClass: ThemeIcon.asClassName(Codicon.globe),
				scope: { kind: 'global', hostId: LOCAL_THREAD_HOST_ID },
			});
		}
		for (const host of remoteHosts) {
			if (quickChatTypes.some(candidate => this.isCandidateForHost(candidate, host))) {
				picks.push({
					label: localize('threadScope.noWorkspace', "No workspace"),
					description: host.label,
					iconClass: ThemeIcon.asClassName(Codicon.globe),
					scope: { kind: 'global', hostId: host.id },
				});
			}
		}
		const seen = new Set<string>();
		const addWorkspace = (folderUri: URI, label: string, hostId: string, hostLabel: string) => {
			const key = `${hostId}:${folderUri.toString()}`;
			if (seen.has(key)) {
				return;
			}
			seen.add(key);
			picks.push({
				label,
				description: hostLabel,
				iconClass: ThemeIcon.asClassName(Codicon.folder),
				scope: { kind: 'workspace', hostId, folderUri },
			});
		};
		for (const folder of this.workspaceContextService.getWorkspace().folders) {
			addWorkspace(folder.uri, folder.name, LOCAL_THREAD_HOST_ID, localHostLabel);
		}
		for (const session of this.sessionsManagementService.getSessions()) {
			const host = remoteHosts.find(candidate => candidate.providerIds.includes(session.providerId));
			for (const folder of session.workspace.get()?.folders ?? []) {
				addWorkspace(folder.root, folder.name, host?.id ?? LOCAL_THREAD_HOST_ID, host?.label ?? localHostLabel);
			}
		}
		return (await this.quickInputService.pick(picks, {
			title: localize('threadScope.title', "Choose Thread Scope"),
			placeHolder: localize('threadScope.placeholder', "Choose where this thread can work"),
		}))?.scope;
	}

	private async pickSessionType(scope: ThreadScope): Promise<IProviderSessionType | undefined> {
		const host = scope.hostId === LOCAL_THREAD_HOST_ID
			? undefined
			: this.agentHostFilterService.hosts.find(candidate => candidate.id === scope.hostId);
		const remoteProviderIds = new Set(this.agentHostFilterService.hosts.flatMap(candidate => [
			...candidate.providerIds,
			...(candidate.sessionCreationProviderId ? [candidate.sessionCreationProviderId] : []),
		]));
		const candidates = (scope.kind === 'workspace'
			? this.sessionsManagementService.getSessionTypesForFolder(scope.folderUri)
			: this.sessionsManagementService.getQuickChatSessionTypes())
			.filter(candidate => isAgentHostProviderId(candidate.providerId))
			.filter(candidate => host ? this.isCandidateForHost(candidate, host) : !remoteProviderIds.has(candidate.providerId));
		const unique = new Map<string, IProviderSessionType>();
		for (const candidate of candidates) {
			const key = candidate.sessionType.id;
			if (!unique.has(key)) {
				unique.set(key, candidate);
			}
		}
		const picks: ISessionTypePick[] = [...unique.values()].map(candidate => ({
			label: candidate.sessionType.label,
			iconClass: candidate.sessionType.icon ? ThemeIcon.asClassName(candidate.sessionType.icon) : undefined,
			candidate,
		}));
		return (await this.quickInputService.pick(picks, {
			title: localize('threadHarness.title', "Choose Agent Harness"),
			placeHolder: localize('threadHarness.placeholder', "Choose how this thread should work"),
		}))?.candidate;
	}

	private isCandidateForHost(candidate: IProviderSessionType, host: IAgentHostFilterEntry): boolean {
		return host.providerIds.includes(candidate.providerId) || host.sessionCreationProviderId === candidate.providerId;
	}

	private async pickParticipants(
		agents: readonly { readonly uri: string; readonly name: string }[],
		thread?: IThreadDescriptor,
	): Promise<{ readonly participants: readonly IThreadParticipant[]; readonly primaryParticipantId: string } | undefined> {
		const picks: IAgentPick[] = [
			{
				label: localize('threadAgent.default', "Default Agent"),
				participant: { id: 'default', name: localize('threadAgent.default', "Default Agent") },
				picked: thread?.participants.some(participant => participant.id === 'default') ?? true,
			},
			...agents.map(agent => ({
				label: agent.name,
				participant: { id: agent.uri, name: agent.name, agent },
				picked: thread?.participants.some(participant => participant.id === agent.uri) ?? false,
			})),
		];
		const selected = await this.quickInputService.pick(picks, {
			title: localize('threadAgent.title', "Choose Thread Agents"),
			placeHolder: localize('threadAgent.placeholder', "Choose the agents that can work in this thread"),
			canPickMany: true,
		});
		if (!selected) {
			return undefined;
		}
		await this.keyReleaseBarrier.wait();
		const participants = selected.length > 0 ? selected.map(item => item.participant) : [picks[0].participant];
		if (participants.length === 1) {
			return { participants, primaryParticipantId: participants[0].id };
		}
		const primary = await this.quickInputService.pick(participants.map(participant => ({
			label: participant.name,
			participant,
			picked: participant.id === thread?.primaryParticipantId,
		})), {
			title: localize('threadPrimaryAgent.title', "Choose Primary Agent"),
			placeHolder: localize('threadPrimaryAgent.placeholder', "The primary agent delegates work to the other agents"),
		});
		return primary ? { participants, primaryParticipantId: primary.participant.id } : undefined;
	}

	private async pickAvatar(): Promise<ThreadAvatarId | undefined> {
		const picks: IAvatarPick[] = [{
			label: localize('threadAvatar.none', "No Hat"),
			avatar: ThreadAvatarIds.None,
		}, ...allChatPetAccessories
			.filter(accessory => threadAvatarIds.has(accessory.id))
			.map(accessory => ({
				label: accessory.label,
				avatar: accessory.id as ThreadAvatarId,
			}))];
		return (await this.quickInputService.pick(picks, {
			title: localize('threadAvatar.title', "Choose Blobby Avatar"),
			placeHolder: localize('threadAvatar.placeholder', "Choose a hat for this thread"),
		}))?.avatar;
	}

	private async pickConnectors(servers: readonly { readonly id: string; readonly name: string; readonly displayName?: string; readonly enabled: boolean }[]): Promise<readonly string[] | undefined> {
		const picks: IConnectorPick[] = [
			...servers.map(server => ({
				label: server.displayName ?? server.name,
				description: localize('threadConnector.available', "Available now"),
				picked: server.enabled,
				id: server.id,
			})),
			{
				label: localize('threadConnector.slack', "Slack"),
				description: localize('threadConnector.comingSoon', "Coming Soon"),
				disabled: true,
				comingSoon: true,
			},
		];
		const selected = await this.quickInputService.pick(picks, {
			title: localize('threadConnector.title', "Set Up Connectors"),
			placeHolder: localize('threadConnector.placeholder', "Choose tools this thread can use"),
			canPickMany: true,
		});
		return selected?.flatMap(item => item.id ? [item.id] : []);
	}

	private syncAutomationDestinations(threads: readonly IThreadDescriptor[], automations: readonly IAutomationDescriptor[]): void {
		const automationsById = new Map(automations.map(automation => [automation.id, automation]));
		for (const thread of threads) {
			for (const automationId of thread.automationIds) {
				const automation = automationsById.get(automationId);
				const prompt = automation ? getThreadAutomationPromptUpdate(thread, automation) : undefined;
				if (!automation || prompt === undefined || this.syncingAutomationIds.has(automationId)) {
					continue;
				}
				this.syncingAutomationIds.add(automationId);
				void this.automationService.updateAutomationIfUnchanged(automationId, { prompt }, automation)
					.catch(error => this.notificationService.error(localize('threadAutomation.updateDestinationFailed', "Could not update the destination for {0}: {1}", automation.name, error)))
					.finally(() => this.syncingAutomationIds.delete(automationId));
			}
		}
	}
}

const THREAD_AUTOMATION_PROMPT_SUFFIX = 'Do not perform the requested work in this Automation run. The persistent Thread must receive and perform it.';

export function buildThreadAutomationPrompt(thread: IThreadDescriptor, prompt: string): string {
	return [
		`This Automation belongs to the persistent Thread "${thread.name}".`,
		`Use send_message exactly once with session "${thread.routingResource.toString()}", delivery "queue", and the following complete message:`,
		'',
		prompt,
		'',
		THREAD_AUTOMATION_PROMPT_SUFFIX,
	].join('\n');
}

export function parseThreadAutomationPrompt(prompt: string): string | undefined {
	const lines = prompt.split('\n');
	if (
		lines.length < 6
		|| !lines[0].startsWith('This Automation belongs to the persistent Thread "')
		|| !lines[1].startsWith('Use send_message exactly once with session "')
		|| lines[2] !== ''
		|| lines.at(-2) !== ''
		|| lines.at(-1) !== THREAD_AUTOMATION_PROMPT_SUFFIX
	) {
		return undefined;
	}
	return lines.slice(3, -2).join('\n');
}

export function getThreadAutomationPromptUpdate(thread: IThreadDescriptor, automation: IAutomationDescriptor): string | undefined {
	const message = parseThreadAutomationPrompt(automation.prompt);
	if (message === undefined) {
		return undefined;
	}
	const prompt = buildThreadAutomationPrompt(thread, message);
	return prompt === automation.prompt ? undefined : prompt;
}

export function activateThreadDraft(sessionsService: ISessionsService, draft: ISession): Promise<void> {
	sessionsService.openNewSessionDraft(draft);
	return Promise.resolve();
}

registerSingleton(IThreadSetupService, ThreadSetupService, InstantiationType.Delayed);
