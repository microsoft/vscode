/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../../nls.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { AgentMergeAction, AgentMergeConfiguration, AgentMergeSessionOverrides, AgentMergeSettingId, defaultAgentMergeConfiguration, resolveAgentMergeConfiguration } from '../../../../../platform/agentHost/common/agentMerge.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
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

/** Whether Agent Merge is currently enabled on the active session. */
const AgentMergeSessionEnabledContext = new RawContextKey<boolean>('sessionAgentMergeEnabled', false, {
	type: 'boolean',
	description: localize('sessionAgentMergeEnabled', "True when Agent Merge is enabled for the active agent session."),
});

/**
 * Mirrors the active session's Agent Merge enablement into a context key so the
 * command palette only offers the action that actually applies.
 */
class AgentMergeContextContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.agentMergeContext';

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISessionsService sessionsService: ISessionsService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
	) {
		super();
		const enabledKey = AgentMergeSessionEnabledContext.bindTo(contextKeyService);
		const providerListener = this._register(new MutableDisposable());
		this._register(autorun(reader => {
			const session = sessionsService.activeSession.read(reader);
			const provider = session && sessionsProvidersService.getProvider(session.providerId);
			const agentHostProvider = provider && isAgentHostProvider(provider) ? provider : undefined;
			const update = () => enabledKey.set(
				!!session && !!agentHostProvider && agentHostProvider.getAgentMergeSessionState(session.sessionId)?.enabled === true,
			);
			providerListener.value = agentHostProvider?.onDidChangeSessionConfig(changed => {
				if (changed === session?.sessionId) {
					update();
				}
			});
			update();
		}));
	}
}

registerWorkbenchContribution2(AgentMergeContextContribution.ID, AgentMergeContextContribution, WorkbenchPhase.AfterRestored);

interface IAgentMergeActionPick extends IQuickPickItem {
	readonly action: AgentMergeAction;
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
			precondition: ContextKeyExpr.and(agentMergeCommandPrecondition, AgentMergeSessionEnabledContext.negate()),
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
			precondition: ContextKeyExpr.and(agentMergeCommandPrecondition, AgentMergeSessionEnabledContext),
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
		];
		const result = await pickAgentMergeActions(quickInputService, picks);
		if (!result) {
			return;
		}
		const overrides = result.reset ? undefined : toOverrides(result.actions);
		await active.provider.setAgentMergeOverrides(active.session.sessionId, overrides);
		logService.info(`[AgentMergeActions] Action overrides updated: session=${active.session.sessionId}, provider=${active.session.providerId}, reset=${result.reset}, enabledActions=${[...result.actions].sort().join(',') || 'none'}`);
		notificationService.info(result.reset
			? localize('agentMerge.action.reset.complete', "Agent Merge now follows the global action defaults for this session.")
			: localize('agentMerge.action.updated', "Agent Merge actions were updated for the active session."));
	}
});

/**
 * Selects the session's authorized actions. Reset is a title button rather than
 * a pick so it can never silently override an explicit multi-selection.
 */
function pickAgentMergeActions(
	quickInputService: IQuickInputService,
	picks: readonly IAgentMergeActionPick[],
): Promise<{ readonly reset: boolean; readonly actions: ReadonlySet<AgentMergeAction> } | undefined> {
	const store = new DisposableStore();
	return new Promise(resolve => {
		const quickPick = store.add(quickInputService.createQuickPick<IAgentMergeActionPick>());
		quickPick.title = localize('agentMerge.action.title', "Agent Merge");
		quickPick.placeholder = localize('agentMerge.action.select', "Select actions Agent Merge may perform for this session");
		quickPick.canSelectMany = true;
		quickPick.items = picks;
		quickPick.selectedItems = picks.filter(pick => pick.picked);
		quickPick.buttons = [{
			iconClass: ThemeIcon.asClassName(Codicon.discard),
			tooltip: localize('agentMerge.action.reset', "Reset to Global Defaults"),
		}];
		store.add(quickPick.onDidTriggerButton(() => {
			resolve({ reset: true, actions: new Set() });
			quickPick.hide();
		}));
		store.add(quickPick.onDidAccept(() => {
			resolve({ reset: false, actions: new Set(quickPick.selectedItems.map(item => item.action)) });
			quickPick.hide();
		}));
		store.add(quickPick.onDidHide(() => {
			resolve(undefined);
			store.dispose();
		}));
		quickPick.show();
	});
}

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
