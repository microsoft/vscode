/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { structuralEquals } from '../../../../base/common/equals.js';
import { Event } from '../../../../base/common/event.js';
import { constObservable, derived, derivedOpts, IObservable, IReader, observableFromEvent, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { themeColorFromId, ThemeIcon } from '../../../../base/common/themables.js';
import { AgentMergeConfiguration, AgentMergeSettingId, defaultAgentMergeConfiguration, isAgentMergeMergePullRequest, resolveAgentMergeConfiguration } from '../../../../platform/agentHost/common/agentMerge.js';
import { ArtifactIntegrationsSettingId } from '../../../../platform/artifactIntegrations/common/artifactIntegration.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { extUriBiasedIgnorePathCase } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IAgentMergeClientState, isAgentHostProvider } from '../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from './sessionsProvidersService.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { getGitHubPullRequestRefs, getHighestPriorityPullRequestIcon, IChat, ISession } from '../../../services/sessions/common/session.js';

const openPullRequestIcon = { ...Codicon.gitPullRequest, color: themeColorFromId('charts.green') };

/** Effective Agent Merge state used by client presentation. */
export interface ISessionAgentMergeConfiguration {
	readonly enabled: boolean;
	readonly actions: AgentMergeConfiguration;
}

export const ISessionAgentMergeService = createDecorator<ISessionAgentMergeService>('sessionAgentMergeService');

/** The Agent Merge state of the folders of sessions, as their client presentation shows it. */
export interface ISessionAgentMergeService {
	readonly _serviceBrand: undefined;

	/**
	 * The Agent Merge state of a session's folder. Each folder a chat works in has its own Agent Merge: pass `chat` for
	 * the folder it works in, or omit it for the session folder (the main chat's), which session-wide surfaces use
	 * alongside the session folder's pull request. Pass `repository` for one repository of a session of several, which
	 * has its own.
	 */
	getStateObservable(session: ISession, chat?: IChat, repository?: URI): IObservable<IAgentMergeClientState | undefined>;

	/** The effective Agent Merge actions of a session's folder; see {@link getStateObservable}. */
	getConfigurationObservable(session: ISession, chat?: IChat, repository?: URI): IObservable<ISessionAgentMergeConfiguration | undefined>;
}

export class SessionAgentMergeService implements ISessionAgentMergeService {
	declare readonly _serviceBrand: undefined;

	/** Cached per session, then per chat (`''` for the session folder) and repository. */
	private readonly _states = new WeakMap<ISession, Map<string, IObservable<IAgentMergeClientState | undefined>>>();
	private readonly _configurations = new WeakMap<ISession, Map<string, IObservable<ISessionAgentMergeConfiguration | undefined>>>();

	constructor(
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) { }

	getStateObservable(session: ISession, chat?: IChat, repository?: URI): IObservable<IAgentMergeClientState | undefined> {
		return this._getOrCreate(this._states, session, chat, repository, () => {
			const provider = this._observeProvider(session);
			return derived(reader => {
				const current = provider.read(reader);
				return current && isAgentHostProvider(current)
					? current.getAgentMergeClientStateObservable(session.sessionId, this._chatKey(session, chat) || repository ? chat?.resource : undefined, repository).read(reader)
					: undefined;
			});
		});
	}

	getConfigurationObservable(session: ISession, chat?: IChat, repository?: URI): IObservable<ISessionAgentMergeConfiguration | undefined> {
		return this._getOrCreate(this._configurations, session, chat, repository, () => {
			const configurationService = this.configurationService;
			const provider = this._observeProvider(session);
			const state = this.getStateObservable(session, chat, repository);
			const artifactIntegrationsEnabled = observableConfigValue(ArtifactIntegrationsSettingId, false, configurationService);
			const globalConfiguration = observableFromEvent(
				Event.filter(configurationService.onDidChangeConfiguration, event => Object.values(AgentMergeSettingId).some(settingId => event.affectsConfiguration(settingId))),
				() => getGlobalAgentMergeConfiguration(configurationService));
			return derivedOpts<ISessionAgentMergeConfiguration | undefined>({
				owner: session,
				equalsFn: structuralEquals,
			}, reader => {
				const current = provider.read(reader);
				if (!current || !isAgentHostProvider(current)) {
					return undefined;
				}
				const sessionState = state.read(reader);
				return {
					enabled: sessionState?.enabled === true && !artifactIntegrationsEnabled.read(reader),
					actions: resolveAgentMergeConfiguration(globalConfiguration.read(reader), sessionState?.overrides),
				};
			});
		});
	}

	/** The cached value of a session's chat (`undefined` for the session folder's) and repository, created on first use. */
	private _getOrCreate<T>(cache: WeakMap<ISession, Map<string, T>>, session: ISession, chat: IChat | undefined, repository: URI | undefined, create: () => T): T {
		const key = `${this._chatKey(session, chat)}\u0001${repository ? extUriBiasedIgnorePathCase.getComparisonKey(repository) : ''}`;
		let byChat = cache.get(session);
		if (!byChat) {
			byChat = new Map();
			cache.set(session, byChat);
		}
		let value = byChat.get(key);
		if (value === undefined) {
			value = create();
			byChat.set(key, value);
		}
		return value;
	}

	/** The main chat works in the session folder, so it shares the session folder's cache entry. */
	private _chatKey(session: ISession, chat: IChat | undefined): string {
		return !chat || chat === session.mainChat.get() ? '' : chat.resource.toString();
	}

	private _observeProvider(session: ISession) {
		const providers = this.sessionsProvidersService;
		const providersChanged = observableSignalFromEvent(session, providers.onDidChangeProviders);
		return derived(reader => {
			providersChanged.read(reader);
			const provider = providers.getProvider(session.providerId);
			if (!provider) {
				return constObservable(undefined);
			}
			const sessionsChanged = Event.filter(provider.onDidChangeSessions, event =>
				event.added.some(value => value.sessionId === session.sessionId)
				|| event.changed.some(value => value.sessionId === session.sessionId)
				|| event.removed.some(value => value.sessionId === session.sessionId));
			const changed = Event.any(
				Event.signal(sessionsChanged),
				isAgentHostProvider(provider) ? Event.signal(Event.filter(provider.onDidChangeSessionConfig, id => id === session.sessionId)) : Event.None,
			);
			return observableFromEvent(session, changed, () => providers.getProvider(session.providerId, session.sessionId));
		}).flatten();
	}
}

registerSingleton(ISessionAgentMergeService, SessionAgentMergeService, InstantiationType.Delayed);

/** Hides pull-request blockers that an enabled Agent Merge session owns. */
export function getAgentMergeAwarePullRequestIcon(icon: ThemeIcon, agentMerge: ISessionAgentMergeConfiguration | undefined, blockers?: { readonly hasFailingChecks?: boolean; readonly hasMergeConflicts?: boolean; readonly hasUnresolvedComments?: boolean }): ThemeIcon {
	if (!agentMerge?.enabled) {
		return icon;
	}
	if (icon.id === Codicon.gitPullRequestComment.id) {
		return agentMerge.actions.addressReviews ? openPullRequestIcon : icon;
	}
	if (icon.id === Codicon.gitPullRequestError.id) {
		const hasKnownBlocker = blockers?.hasFailingChecks === true || blockers?.hasMergeConflicts === true || blockers?.hasUnresolvedComments === true;
		if (blockers && !hasKnownBlocker) {
			return icon;
		}
		const handlesBlockers = blockers
			? (!blockers.hasFailingChecks || agentMerge.actions.fixCI)
			&& (!blockers.hasMergeConflicts || agentMerge.actions.resolveConflicts)
			&& (!blockers.hasUnresolvedComments || agentMerge.actions.addressReviews)
			: agentMerge.actions.fixCI && agentMerge.actions.resolveConflicts && agentMerge.actions.addressReviews;
		return handlesBlockers ? openPullRequestIcon : icon;
	}
	return icon;
}

/** Whether the pull-request icon represents blockers Agent Merge can own. */
export function isAgentMergePullRequestIcon(icon: ThemeIcon): boolean {
	return icon.id === Codicon.gitPullRequestError.id || icon.id === Codicon.gitPullRequestComment.id;
}

/**
 * The icon of the completed state of `session`, such as of its pull request, with the blockers Agent Merge owns hidden:
 * what its status icon shows once the session is done, in its row of the sessions list and wherever else its status shows.
 */
export function getSessionCompletedStateIcon(session: ISession, reader: IReader, agentMergeConfiguration: () => IObservable<ISessionAgentMergeConfiguration | undefined>): ThemeIcon | undefined {
	// A provider icon is authoritative: the workspace's pull requests may belong to other chats.
	const pullRequestIcon = session.completedStateIcon
		? session.completedStateIcon.read(reader)
		: getHighestPriorityPullRequestIcon(getGitHubPullRequestRefs(session.workspace.read(reader)?.folders[0]?.gitRepository?.gitHubInfo.read(reader)).map(pullRequest => pullRequest.icon));
	return pullRequestIcon && isAgentMergePullRequestIcon(pullRequestIcon)
		? getAgentMergeAwarePullRequestIcon(pullRequestIcon, agentMergeConfiguration().read(reader))
		: pullRequestIcon;
}

/**
 * The icon of the completed state of `chat`, such as of its pull request, with the blockers Agent Merge owns hidden: what
 * its status icon shows once the chat is done, beside it in the sessions list and wherever else its status shows.
 */
export function getChatCompletedStateIcon(session: ISession, chat: IChat, reader: IReader, agentMergeConfiguration: () => IObservable<ISessionAgentMergeConfiguration | undefined>): ThemeIcon | undefined {
	const pullRequestIcon = chat.completedStateIcon
		? chat.completedStateIcon.read(reader)
		// Without provider attribution, only a multi-folder session's chats have pull requests of their own.
		: (session.workspace.read(reader)?.folders.length ?? 0) > 1
			? getHighestPriorityPullRequestIcon(
				chat.workspace.read(reader)?.folders.flatMap(folder =>
					getGitHubPullRequestRefs(folder.gitRepository?.gitHubInfo.read(reader)).map(pullRequest => pullRequest.icon)
				) ?? []
			)
			: undefined;
	return pullRequestIcon && isAgentMergePullRequestIcon(pullRequestIcon)
		? getAgentMergeAwarePullRequestIcon(pullRequestIcon, agentMergeConfiguration().read(reader))
		: pullRequestIcon;
}

/** Reads the effective global Agent Merge configuration. */
export function getGlobalAgentMergeConfiguration(configurationService: IConfigurationService): AgentMergeConfiguration {
	const mergePullRequest = configurationService.getValue<unknown>(AgentMergeSettingId.MergePullRequest);
	return {
		addressReviews: configurationService.getValue<boolean>(AgentMergeSettingId.AddressReviews) ?? defaultAgentMergeConfiguration.addressReviews,
		fixCI: configurationService.getValue<boolean>(AgentMergeSettingId.FixCI) ?? defaultAgentMergeConfiguration.fixCI,
		resolveConflicts: configurationService.getValue<boolean>(AgentMergeSettingId.ResolveConflicts) ?? defaultAgentMergeConfiguration.resolveConflicts,
		// Tolerate the retired boolean form until every profile has run its migration.
		mergePullRequest: isAgentMergeMergePullRequest(mergePullRequest)
			? mergePullRequest
			: typeof mergePullRequest === 'boolean'
				? (mergePullRequest ? 'always' : 'never')
				: defaultAgentMergeConfiguration.mergePullRequest,
		mergeMethod: configurationService.getValue<AgentMergeConfiguration['mergeMethod']>(AgentMergeSettingId.MergeMethod) ?? defaultAgentMergeConfiguration.mergeMethod,
		replyAttribution: configurationService.getValue<boolean>(AgentMergeSettingId.ReplyAttribution) ?? defaultAgentMergeConfiguration.replyAttribution,
	};
}
