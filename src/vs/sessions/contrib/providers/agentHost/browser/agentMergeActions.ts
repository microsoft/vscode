/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { AgentMergeAction, AgentMergeConfiguration, AgentMergeSessionOverrides, AgentMergeSettingId, defaultAgentMergeConfiguration, resolveAgentMergeConfiguration } from '../../../../../platform/agentHost/common/agentMerge.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IsSessionsWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ANY_AGENT_HOST_PROVIDER_RE, isAgentHostProvider } from '../../../../common/agentHostSessionsProvider.js';
import { SessionIsArchivedContext, SessionProviderIdContext } from '../../../../common/contextkeys.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';

const agentMergeCommandPrecondition = ContextKeyExpr.and(
	IsSessionsWindowContext,
	ChatContextKeys.enabled,
	ContextKeyExpr.regex(SessionProviderIdContext.key, ANY_AGENT_HOST_PROVIDER_RE),
	SessionIsArchivedContext.negate(),
	ContextKeyExpr.equals(`config.${AgentMergeSettingId.Enabled}`, true),
);

interface IAgentMergeActionPick extends IQuickPickItem {
	readonly action?: AgentMergeAction;
	readonly reset?: boolean;
}

abstract class AgentMergeActionBase extends Action2 {

	protected getActiveSession(accessor: ServicesAccessor) {
		const session = accessor.get(ISessionsService).activeSession.get();
		const provider = session && accessor.get(ISessionsProvidersService).getProvider(session.providerId);
		return session && provider && isAgentHostProvider(provider) ? { session, provider } : undefined;
	}
}

registerAction2(class EnableAgentMergeAction extends AgentMergeActionBase {
	constructor() {
		super({
			id: 'sessions.agentHost.agentMerge.enable',
			title: localize2('agentMerge.enable', "Enable Agent Merge for Active Session"),
			f1: true,
			precondition: agentMergeCommandPrecondition,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const active = this.getActiveSession(accessor);
		if (!active) {
			return;
		}
		const logService = accessor.get(ILogService);
		const notificationService = accessor.get(INotificationService);
		await active.provider.setAgentMergeEnabled(active.session.sessionId, true);
		logService.info(`[AgentMergeActions] Enable requested: session=${active.session.sessionId}, provider=${active.session.providerId}`);
		notificationService.info(localize('agentMerge.enabled', "Agent Merge is enabled for the active session."));
	}
});

registerAction2(class DisableAgentMergeAction extends AgentMergeActionBase {
	constructor() {
		super({
			id: 'sessions.agentHost.agentMerge.disable',
			title: localize2('agentMerge.disable', "Disable Agent Merge for Active Session"),
			f1: true,
			precondition: agentMergeCommandPrecondition,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const active = this.getActiveSession(accessor);
		if (!active) {
			return;
		}
		const logService = accessor.get(ILogService);
		const notificationService = accessor.get(INotificationService);
		await active.provider.setAgentMergeEnabled(active.session.sessionId, false);
		logService.info(`[AgentMergeActions] Disable requested: session=${active.session.sessionId}, provider=${active.session.providerId}`);
		notificationService.info(localize('agentMerge.disabled', "Agent Merge is disabled for the active session."));
	}
});

registerAction2(class ConfigureAgentMergeAction extends AgentMergeActionBase {
	constructor() {
		super({
			id: 'sessions.agentHost.agentMerge.configure',
			title: localize2('agentMerge.configure', "Configure Agent Merge for Active Session"),
			f1: true,
			precondition: agentMergeCommandPrecondition,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const active = this.getActiveSession(accessor);
		if (!active) {
			return;
		}
		const configurationService = accessor.get(IConfigurationService);
		const quickInputService = accessor.get(IQuickInputService);
		const logService = accessor.get(ILogService);
		const notificationService = accessor.get(INotificationService);
		const defaults = getGlobalConfiguration(configurationService);
		const current = active.provider.getAgentMergeSessionState(active.session.sessionId);
		const effective = resolveAgentMergeConfiguration(defaults, current?.overrides);
		const picks: IAgentMergeActionPick[] = [
			{ action: 'addressReviews', label: localize('agentMerge.action.addressReviews', "Address Reviews"), picked: effective.addressReviews },
			{ action: 'fixCI', label: localize('agentMerge.action.fixCI', "Fix CI Failures"), picked: effective.fixCI },
			{ action: 'resolveConflicts', label: localize('agentMerge.action.resolveConflicts', "Resolve Conflicts and Behind Branches"), picked: effective.resolveConflicts },
			{ action: 'mergePullRequest', label: localize('agentMerge.action.mergePullRequest', "Automatically Merge When Ready"), picked: effective.mergePullRequest },
			{ reset: true, label: localize('agentMerge.action.reset', "Reset to Global Defaults"), description: localize('agentMerge.action.reset.description', "Remove all action overrides for this session") },
		];
		const selected = await quickInputService.pick(picks, {
			canPickMany: true,
			placeHolder: localize('agentMerge.action.select', "Select actions Agent Merge may perform for this session"),
		});
		if (!selected) {
			return;
		}
		const reset = selected.some(item => item.reset);
		const selectedActions = new Set(selected.flatMap(item => item.action ? [item.action] : []));
		const overrides = reset ? undefined : toOverrides(selectedActions);
		await active.provider.setAgentMergeOverrides(active.session.sessionId, overrides);
		logService.info(`[AgentMergeActions] Action overrides updated: session=${active.session.sessionId}, provider=${active.session.providerId}, reset=${reset}, enabledActions=${[...selectedActions].sort().join(',') || 'none'}`);
		notificationService.info(reset
			? localize('agentMerge.action.reset.complete', "Agent Merge now follows the global action defaults for this session.")
			: localize('agentMerge.action.updated', "Agent Merge actions were updated for the active session."));
	}
});

function getGlobalConfiguration(configurationService: IConfigurationService): AgentMergeConfiguration {
	return {
		addressReviews: configurationService.getValue<boolean>(AgentMergeSettingId.AddressReviews) ?? defaultAgentMergeConfiguration.addressReviews,
		fixCI: configurationService.getValue<boolean>(AgentMergeSettingId.FixCI) ?? defaultAgentMergeConfiguration.fixCI,
		resolveConflicts: configurationService.getValue<boolean>(AgentMergeSettingId.ResolveConflicts) ?? defaultAgentMergeConfiguration.resolveConflicts,
		mergePullRequest: configurationService.getValue<boolean>(AgentMergeSettingId.MergePullRequest) ?? defaultAgentMergeConfiguration.mergePullRequest,
		mergeMethod: configurationService.getValue<AgentMergeConfiguration['mergeMethod']>(AgentMergeSettingId.MergeMethod) ?? defaultAgentMergeConfiguration.mergeMethod,
		replyAttribution: configurationService.getValue<boolean>(AgentMergeSettingId.ReplyAttribution) ?? defaultAgentMergeConfiguration.replyAttribution,
	};
}

function toOverrides(selected: ReadonlySet<AgentMergeAction>): AgentMergeSessionOverrides {
	const overrides: Record<string, boolean> = {};
	for (const action of ['addressReviews', 'fixCI', 'resolveConflicts', 'mergePullRequest'] as const) {
		overrides[action] = selected.has(action);
	}
	return overrides;
}
