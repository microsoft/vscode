/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../base/common/codicons.js';
import { structuralEquals } from '../../base/common/equals.js';
import { Event } from '../../base/common/event.js';
import { constObservable, derivedOpts, IObservable, observableFromEvent } from '../../base/common/observable.js';
import { themeColorFromId, ThemeIcon } from '../../base/common/themables.js';
import { AgentMergeConfiguration, AgentMergeSettingId, defaultAgentMergeConfiguration, isAgentMergeMergePullRequest, resolveAgentMergeConfiguration } from '../../platform/agentHost/common/agentMerge.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { IAgentMergeClientState, isAgentHostProvider } from '../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../services/sessions/browser/sessionsProvidersService.js';
import { IChat, ISession } from '../services/sessions/common/session.js';

const noAgentMergeConfiguration = constObservable<ISessionAgentMergeConfiguration | undefined>(undefined);
/** Cached per session, then per chat (`''` for the session folder). */
const agentMergeSessionStateBySession = new WeakMap<ISession, Map<string, IObservable<IAgentMergeClientState | undefined>>>();
const agentMergeConfigurationBySession = new WeakMap<ISession, Map<string, IObservable<ISessionAgentMergeConfiguration | undefined>>>();

function getCached<T>(cache: WeakMap<ISession, Map<string, T>>, session: ISession, chat: IChat | undefined): T | undefined {
	return cache.get(session)?.get(chatCacheKey(session, chat));
}

function setCached<T>(cache: WeakMap<ISession, Map<string, T>>, session: ISession, chat: IChat | undefined, value: T): void {
	let byChat = cache.get(session);
	if (!byChat) {
		byChat = new Map();
		cache.set(session, byChat);
	}
	byChat.set(chatCacheKey(session, chat), value);
}

/** The main chat works in the session folder, so it shares the session folder's cache entry. */
function chatCacheKey(session: ISession, chat: IChat | undefined): string {
	return !chat || chat === session.mainChat.get() ? '' : chat.resource.toString();
}
const openPullRequestIcon = { ...Codicon.gitPullRequest, color: themeColorFromId('charts.green') };

/** Effective Agent Merge state used by client presentation. */
export interface ISessionAgentMergeConfiguration {
	readonly enabled: boolean;
	readonly actions: AgentMergeConfiguration;
}

/**
 * Returns the Agent Merge state observable of a session's folder. Each folder a
 * chat works in has its own Agent Merge: pass `chat` for the folder it works
 * in, or omit it for the session folder (the main chat's), which session-wide
 * surfaces use alongside the session folder's pull request.
 */
export function getSessionAgentMergeStateObservable(session: ISession, sessionsProvidersService: ISessionsProvidersService, chat?: IChat): IObservable<IAgentMergeClientState | undefined> {
	const cached = getCached(agentMergeSessionStateBySession, session, chat);
	if (cached) {
		return cached;
	}
	const provider = sessionsProvidersService.getProvider(session.providerId);
	if (!provider || !isAgentHostProvider(provider)) {
		return constObservable(undefined);
	}
	const observable = provider.getAgentMergeClientStateObservable(session.sessionId, chatCacheKey(session, chat) ? chat?.resource : undefined);
	setCached(agentMergeSessionStateBySession, session, chat, observable);
	return observable;
}

/** Returns effective Agent Merge actions of a session's folder; see {@link getSessionAgentMergeStateObservable}. */
export function getSessionAgentMergeConfigurationObservable(session: ISession, sessionsProvidersService: ISessionsProvidersService, configurationService: IConfigurationService, chat?: IChat): IObservable<ISessionAgentMergeConfiguration | undefined> {
	const cached = getCached(agentMergeConfigurationBySession, session, chat);
	if (cached) {
		return cached;
	}
	const provider = sessionsProvidersService.getProvider(session.providerId);
	if (!provider || !isAgentHostProvider(provider)) {
		return noAgentMergeConfiguration;
	}
	const state = getSessionAgentMergeStateObservable(session, sessionsProvidersService, chat);
	const globalConfiguration = observableFromEvent(
		Event.filter(configurationService.onDidChangeConfiguration, event => Object.values(AgentMergeSettingId).some(settingId => event.affectsConfiguration(settingId))),
		() => getGlobalAgentMergeConfiguration(configurationService));
	const observable = derivedOpts<ISessionAgentMergeConfiguration>({
		owner: session,
		equalsFn: structuralEquals,
	}, reader => {
		const sessionState = state.read(reader);
		return {
			enabled: sessionState?.enabled === true,
			actions: resolveAgentMergeConfiguration(globalConfiguration.read(reader), sessionState?.overrides),
		};
	});
	setCached(agentMergeConfigurationBySession, session, chat, observable);
	return observable;
}

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
