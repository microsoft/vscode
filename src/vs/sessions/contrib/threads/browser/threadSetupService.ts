/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
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
import { allChatPetAccessories, ChatPetAccessoryId } from '../../../../workbench/contrib/chat/browser/chatPetAchievements.js';
import { isAgentHostProvider, isAgentHostProviderId } from '../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionAgentRef } from '../../../services/sessions/common/session.js';
import { IProviderSessionType, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IThreadsService, IThreadDescriptor, ThreadAvatarId, ThreadAvatarIds, ThreadScope } from '../../../services/threads/browser/threadsService.js';

interface IThreadScopePick extends IQuickPickItem {
	readonly scope: ThreadScope;
}

interface ISessionTypePick extends IQuickPickItem {
	readonly candidate: IProviderSessionType;
}

interface IAgentPick extends IQuickPickItem {
	readonly agent?: ISessionAgentRef;
}

interface IAvatarPick extends IQuickPickItem {
	readonly avatar: ThreadAvatarId;
}

interface IConnectorPick extends IQuickPickItem {
	readonly id?: string;
	readonly comingSoon?: boolean;
}

const threadAvatarIds = new Set<ChatPetAccessoryId>(Object.values(ThreadAvatarIds));

export interface IThreadSetupService {
	readonly _serviceBrand: undefined;
	createThread(): Promise<IThreadDescriptor | undefined>;
	createAutomation(thread: IThreadDescriptor): Promise<void>;
	changeAvatar(thread: IThreadDescriptor): Promise<void>;
}

export const IThreadSetupService = createDecorator<IThreadSetupService>('threadSetupService');

export class ThreadSetupService implements IThreadSetupService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IDialogService private readonly dialogService: IDialogService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@IThreadsService private readonly threadsService: IThreadsService,
		@IAutomationDialogService private readonly automationDialogService: IAutomationDialogService,
		@IAutomationService private readonly automationService: IAutomationService,
		@INotificationService private readonly notificationService: INotificationService,
	) { }

	async createThread(): Promise<IThreadDescriptor | undefined> {
		const input = await this.dialogService.input({
			type: 'info',
			message: localize('threadSetup.title', "Create Thread"),
			detail: localize('threadSetup.detail', "Threads are persistent conversations that stay visible while their agent works."),
			primaryButton: localize('threadSetup.continue', "Continue"),
			inputs: [
				{ placeholder: localize('threadSetup.name', "Thread name") },
				{ placeholder: localize('threadSetup.prompt', "What should this thread help with?") },
			],
		});
		const name = input.values?.[0]?.trim();
		const prompt = input.values?.[1]?.trim();
		if (!input.confirmed || !name || !prompt) {
			return undefined;
		}

		const scope = await this.pickScope();
		if (!scope) {
			return undefined;
		}
		const sessionType = await this.pickSessionType(scope);
		if (!sessionType) {
			return undefined;
		}

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

		try {
			await provider.whenSessionConfigResolved(draft.sessionId, CancellationToken.None);
			const agent = await this.pickAgent(provider.getCustomAgents(draft.sessionId));
			if (agent === null) {
				this.sessionsManagementService.discardNewSession(draft);
				return undefined;
			}
			const avatar = await this.pickAvatar();
			if (!avatar) {
				this.sessionsManagementService.discardNewSession(draft);
				return undefined;
			}
			const connectorIds = await this.pickConnectors(provider.getMcpServers(draft.sessionId));
			if (!connectorIds) {
				this.sessionsManagementService.discardNewSession(draft);
				return undefined;
			}

			provider.setAgent?.(draft.sessionId, agent);
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
				agent: agent ?? undefined,
				avatar,
				connectorIds,
			});
			try {
				await sendThreadInitialRequest(this.sessionsManagementService, draft, name, prompt);
			} catch (error) {
				await this.threadsService.deleteThread(thread.id);
				throw error;
			}
			const current = this.threadsService.getThread(thread.id) ?? thread;
			await this.sessionsService.openSession(current.sessionResource, { preserveFocus: false });
			return current;
		} catch (error) {
			this.sessionsManagementService.discardNewSession(draft);
			throw error;
		}
	}

	async createAutomation(thread: IThreadDescriptor): Promise<void> {
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
				...(thread.agent ? { sessionTemplate: { agent: { uri: thread.agent.uri } } } : {}),
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

	private async pickScope(): Promise<ThreadScope | undefined> {
		const picks: IThreadScopePick[] = [{
			label: localize('threadScope.global', "Global"),
			description: localize('threadScope.global.description', "Workspace-less thread"),
			iconClass: ThemeIcon.asClassName(Codicon.globe),
			scope: { kind: 'global' },
		}];
		const seen = new Set<string>();
		const addWorkspace = (folderUri: URI, label: string) => {
			const key = folderUri.toString();
			if (seen.has(key)) {
				return;
			}
			seen.add(key);
			picks.push({
				label,
				description: folderUri.toString(true),
				iconClass: ThemeIcon.asClassName(Codicon.folder),
				scope: { kind: 'workspace', folderUri },
			});
		};
		for (const folder of this.workspaceContextService.getWorkspace().folders) {
			addWorkspace(folder.uri, folder.name);
		}
		for (const session of this.sessionsManagementService.getSessions()) {
			for (const folder of session.workspace.get()?.folders ?? []) {
				addWorkspace(folder.root, folder.name);
			}
		}
		return (await this.quickInputService.pick(picks, {
			title: localize('threadScope.title', "Choose Thread Scope"),
			placeHolder: localize('threadScope.placeholder', "Choose where this thread can work"),
		}))?.scope;
	}

	private async pickSessionType(scope: ThreadScope): Promise<IProviderSessionType | undefined> {
		const candidates = (scope.kind === 'workspace'
			? this.sessionsManagementService.getSessionTypesForFolder(scope.folderUri)
			: this.sessionsManagementService.getQuickChatSessionTypes())
			.filter(candidate => isAgentHostProviderId(candidate.providerId));
		const picks: ISessionTypePick[] = candidates.map(candidate => ({
			label: candidate.sessionType.label,
			description: candidate.providerId,
			iconClass: candidate.sessionType.icon ? ThemeIcon.asClassName(candidate.sessionType.icon) : undefined,
			candidate,
		}));
		return (await this.quickInputService.pick(picks, {
			title: localize('threadAgentHost.title', "Choose Agent Host"),
			placeHolder: localize('threadAgentHost.placeholder', "Choose the provider for this persistent thread"),
		}))?.candidate;
	}

	private async pickAgent(agents: readonly { readonly uri: string; readonly name: string }[]): Promise<ISessionAgentRef | undefined | null> {
		const picks: IAgentPick[] = [
			{ label: localize('threadAgent.default', "Default Agent"), description: localize('threadAgent.default.description', "Use the provider's default agent") },
			...agents.map(agent => ({ label: agent.name, description: agent.uri, agent })),
		];
		const result = await this.quickInputService.pick(picks, {
			title: localize('threadAgent.title', "Choose Thread Agent"),
			placeHolder: localize('threadAgent.placeholder', "One agent stays assigned to this thread"),
		});
		return result ? result.agent : null;
	}

	private async pickAvatar(): Promise<ThreadAvatarId | undefined> {
		const picks: IAvatarPick[] = allChatPetAccessories
			.filter(accessory => threadAvatarIds.has(accessory.id))
			.map(accessory => ({
				label: accessory.label,
				description: localize('threadAvatar.description', "Blobby with {0}", accessory.label),
				avatar: accessory.id as ThreadAvatarId,
			}));
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
}

export function buildThreadAutomationPrompt(thread: IThreadDescriptor, prompt: string): string {
	return [
		`This Automation belongs to the persistent Thread "${thread.name}".`,
		`Use send_message exactly once with session "${thread.sessionResource.toString()}", delivery "queue", and the following complete message:`,
		'',
		prompt,
		'',
		'Do not perform the requested work in this Automation run. The persistent Thread must receive and perform it.',
	].join('\n');
}

export function sendThreadInitialRequest(sessionsManagementService: ISessionsManagementService, draft: ISession, name: string, prompt: string): Promise<void> {
	return sessionsManagementService.sendNewChatRequest(draft, {
		query: prompt,
		title: name,
	});
}

registerSingleton(IThreadSetupService, ThreadSetupService, InstantiationType.Delayed);
