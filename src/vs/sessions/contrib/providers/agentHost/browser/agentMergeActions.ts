/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../../nls.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Action2, ISubmenuItem, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { AgentMergeMergePullRequest, AgentMergeRepairAction, AgentMergeSessionOverrides, AgentMergeSettingId, agentMergeMergePullRequestValues, AGENT_MERGE_SETTING_TAG, resolveAgentMergeConfiguration } from '../../../../../platform/agentHost/common/agentMerge.js';
import { AgentHostPullRequestOperationId } from '../../../../../platform/agentHost/common/agentHostChangesetOperationService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { IsSessionsWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IPreferencesService } from '../../../../../workbench/services/preferences/common/preferences.js';
import { ANY_AGENT_HOST_PROVIDER_RE, isAgentHostProvider } from '../../../../common/agentHostSessionsProvider.js';
import { SessionIsArchivedContext, SessionAgentMergeEnabledContext, SessionHasOpenPullRequestContext, SessionPrimaryPullRequestOperationContext, SessionProviderIdContext } from '../../../../common/contextkeys.js';
import { CHANGES_OPERATIONS_DROPDOWN_PRIMARY_GROUP } from '../../../changes/browser/changesView.js';
import { Menus } from '../../../../browser/menus.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { getGlobalAgentMergeConfiguration, getSessionAgentMergeConfigurationObservable } from '../../../../browser/sessionAgentMerge.js';

const agentMergeCommandPrecondition = ContextKeyExpr.and(
	IsSessionsWindowContext,
	ChatContextKeys.enabled,
	ContextKeyExpr.regex(SessionProviderIdContext.key, ANY_AGENT_HOST_PROVIDER_RE),
	SessionIsArchivedContext.negate(),
	ContextKeyExpr.equals(`config.${AgentMergeSettingId.Enabled}`, true),
);

/**
 * Agent Merge only has something to offer once the session's branch has an
 * open pull request.
 *
 * An advertised operation implies an open pull request, but not the reverse:
 * a blocked pull request in a repository without auto-merge has no operation
 * to offer, and that is precisely when Agent Merge's repair actions matter.
 * Both signals are accepted so neither pipeline resolving first can hide the
 * entries.
 */
const agentMergeHasPullRequest = ContextKeyExpr.or(
	SessionHasOpenPullRequestContext,
	...Object.values(AgentHostPullRequestOperationId).map(id => ContextKeyExpr.equals(SessionPrimaryPullRequestOperationContext.key, id)),
);

const agentMergeMenuPrecondition = ContextKeyExpr.and(agentMergeCommandPrecondition, agentMergeHasPullRequest);

/**
 * Agent Merge owns the primary button while an enabled draft is still waiting
 * for CI or review comments. The host advertises a distinct Mark Ready
 * operation in that state so it remains available in the dropdown; once the
 * pull request is ready, the normal Mark Ready operation takes over.
 *
 * The auto-merge states are included because Agent Merge replaces them on the
 * button: it subsumes "let this merge on its own once it is ready", and the
 * changes button bar drops those two operations entirely. Where Agent Merge is
 * unavailable — the feature is off, or the session is archived — that state
 * offers no button at all.
 */
const agentMergeOwnsPrimaryButton = ContextKeyExpr.or(
	ContextKeyExpr.equals(SessionPrimaryPullRequestOperationContext.key, AgentHostPullRequestOperationId.EnableAutoMerge),
	ContextKeyExpr.equals(SessionPrimaryPullRequestOperationContext.key, AgentHostPullRequestOperationId.DisableAutoMerge),
	ContextKeyExpr.and(
		ContextKeyExpr.equals(SessionPrimaryPullRequestOperationContext.key, AgentHostPullRequestOperationId.MarkReadyWithAgentMerge),
		SessionAgentMergeEnabledContext,
	),
	ContextKeyExpr.and(SessionHasOpenPullRequestContext, ContextKeyExpr.equals(SessionPrimaryPullRequestOperationContext.key, '')),
);

/**
 * The repair actions authorized for the active session, as a context key per
 * action so the dropdown entries can render their own checked state
 * declaratively.
 */
const AgentMergeSessionActionContexts: Record<AgentMergeRepairAction, RawContextKey<boolean>> = {
	addressReviews: new RawContextKey<boolean>('sessionAgentMergeAddressReviews', false, { type: 'boolean', description: localize('sessionAgentMergeAddressReviews', "True when Agent Merge may address reviews for the active agent session.") }),
	fixCI: new RawContextKey<boolean>('sessionAgentMergeFixCI', false, { type: 'boolean', description: localize('sessionAgentMergeFixCI', "True when Agent Merge may fix CI failures for the active agent session.") }),
	resolveConflicts: new RawContextKey<boolean>('sessionAgentMergeResolveConflicts', false, { type: 'boolean', description: localize('sessionAgentMergeResolveConflicts', "True when Agent Merge may resolve conflicts for the active agent session.") }),
};

/** When Agent Merge may merge the pull request for the active session. */
const AgentMergeSessionMergePullRequestContext = new RawContextKey<string>('sessionAgentMergeMergePullRequest', 'never', {
	type: 'string',
	description: localize('sessionAgentMergeMergePullRequest', "When Agent Merge may merge the pull request for the active agent session ('always', 'ifUnchanged' or 'never')."),
});

const agentMergeActionLabels: Record<AgentMergeRepairAction, string> = {
	addressReviews: localize('agentMerge.action.addressReviews', "Address Reviews"),
	fixCI: localize('agentMerge.action.fixCI', "Fix CI Failures"),
	resolveConflicts: localize('agentMerge.action.resolveConflicts', "Resolve Conflicts and Behind Branches"),
};

const agentMergeRepairActions = Object.keys(agentMergeActionLabels) as readonly AgentMergeRepairAction[];

/** Labels for the merge choice, short enough to read inside the submenu title. */
const agentMergeMergePullRequestLabels: Record<AgentMergeMergePullRequest, string> = {
	always: localize('agentMerge.merge.always', "Always"),
	ifUnchanged: localize('agentMerge.merge.ifUnchanged', "Only if Agent Merge Made No Changes"),
	never: localize('agentMerge.merge.never', "Never"),
};

const agentMergeMergePullRequestDescriptions: Record<AgentMergeMergePullRequest, string> = {
	always: localize('agentMerge.merge.always.description', "Merge the pull request whenever it is ready."),
	ifUnchanged: localize('agentMerge.merge.ifUnchanged.description', "Merge the pull request only while Agent Merge has not changed it. Once a repair turn lands a commit this switches itself to Never."),
	never: localize('agentMerge.merge.never.description', "Never merge the pull request automatically."),
};

/**
 * Mirrors the active session's Agent Merge enablement and authorized actions
 * into context keys so the command palette only offers the action that
 * actually applies, and the button bar dropdown can render check marks.
 */
class AgentMergeContextContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.agentMergeContext';

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService,
		@ISessionsService sessionsService: ISessionsService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@ILogService logService: ILogService,
	) {
		super();
		const enabledKey = SessionAgentMergeEnabledContext.bindTo(contextKeyService);
		const actionKeys = new Map(agentMergeRepairActions.map(action => [action, AgentMergeSessionActionContexts[action].bindTo(contextKeyService)]));
		const mergePullRequestKey = AgentMergeSessionMergePullRequestContext.bindTo(contextKeyService);
		let lastLogged: string | undefined;
		this._register(autorun(reader => {
			const session = sessionsService.activeSession.read(reader);
			const state = session ? getSessionAgentMergeConfigurationObservable(session, sessionsProvidersService, configurationService).read(reader) : undefined;
			const enabled = state?.enabled === true;
			const effective = state?.actions ?? getGlobalAgentMergeConfiguration(configurationService);
			enabledKey.set(enabled);
			for (const [action, key] of actionKeys) {
				key.set(effective[action]);
			}
			mergePullRequestKey.set(effective.mergePullRequest);
			const authorized = agentMergeRepairActions.filter(action => effective[action]);
			const signature = `${session?.sessionId ?? 'none'}|${enabled}|${authorized.join(',')}|${effective.mergePullRequest}`;
			if (lastLogged !== signature) {
				lastLogged = signature;
				logService.info(`[AgentMergeActions] Session state: session=${session?.sessionId ?? 'none'}, enabled=${enabled}, authorizedActions=[${authorized.join(', ') || 'none'}], mergePullRequest=${effective.mergePullRequest}`);
			}
		}));
	}
}

registerWorkbenchContribution2(AgentMergeContextContribution.ID, AgentMergeContextContribution, WorkbenchPhase.AfterRestored);

interface IAgentMergeActionPick extends IQuickPickItem {
	readonly action: AgentMergeRepairAction;
}

abstract class AgentMergeActionBase extends Action2 {

	protected getActiveSession(accessor: ServicesAccessor) {
		const session = accessor.get(ISessionsService).activeSession.get();
		const provider = session && accessor.get(ISessionsProvidersService).getProvider(session.providerId);
		return session && provider && isAgentHostProvider(provider) ? { session, provider } : undefined;
	}

	/**
	 * Writes the session's overrides with every value the user could see,
	 * not just the changed one, so the session keeps what was on screen rather
	 * than silently picking up a later change to the global defaults.
	 */
	protected async updateOverrides(accessor: ServicesAccessor, patch: Partial<AgentMergeSessionOverrides>): Promise<void> {
		const active = this.getActiveSession(accessor);
		if (!active) {
			return;
		}
		const configurationService = accessor.get(IConfigurationService);
		const logService = accessor.get(ILogService);
		const state = active.provider.getAgentMergeSessionState(active.session.sessionId);
		const effective = resolveAgentMergeConfiguration(getGlobalAgentMergeConfiguration(configurationService), state?.overrides);
		const overrides: AgentMergeSessionOverrides = {
			addressReviews: effective.addressReviews,
			fixCI: effective.fixCI,
			resolveConflicts: effective.resolveConflicts,
			mergePullRequest: effective.mergePullRequest,
			...patch,
		};
		await active.provider.setAgentMergeOverrides(active.session.sessionId, overrides);
		logService.info(`[AgentMergeActions] Overrides updated: session=${active.session.sessionId}, change=${JSON.stringify(patch)}`);
	}
}

// The primary button only names the Agent Merge actions, so it is contributed
// as a submenu: its first entry is the primary invocation, while the button's
// dropdown also carries the remaining pull request operations.
//
// Deliberately not gated on Agent Merge being enabled for the session: the
// button stands in for the auto-merge operations either way, and enabling it is
// one of the entries the submenu offers.
MenuRegistry.appendMenuItem(Menus.ChangesOperationsDropdown, {
	submenu: Menus.ChangesAgentMerge,
	title: localize2('agentMerge.primary', "Agent Merge"),
	// The same icon Agent Merge wears elsewhere, and the one the auto-merge
	// operations it stands in for carried on this button.
	icon: Codicon.gitMerge,
	group: CHANGES_OPERATIONS_DROPDOWN_PRIMARY_GROUP,
	order: 1,
	when: ContextKeyExpr.and(agentMergeMenuPrecondition, agentMergeOwnsPrimaryButton),
});

/** Menus the top-level Agent Merge entries appear on: the operations dropdown, and their own context menu. */
const agentMergeTopLevelMenus = [Menus.ChangesOperationsDropdown, Menus.ChangesAgentMerge];

registerAction2(class EnableAgentMergeInSessionAction extends AgentMergeActionBase {
	constructor() {
		super({
			id: 'sessions.agentHost.agentMerge.enableInSession',
			// Deliberately not a toggle: the label already says which way it
			// goes, so a check mark next to "Enable" would only be ambiguous.
			title: localize2('agentMerge.enableInSession', "Enable Agent Merge"),
			f1: false,
			menu: agentMergeTopLevelMenus.map(id => ({
				id,
				group: '1_agentMerge',
				order: 1,
				when: ContextKeyExpr.and(agentMergeMenuPrecondition, SessionAgentMergeEnabledContext.negate()),
			})),
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const active = this.getActiveSession(accessor);
		const logService = accessor.get(ILogService);
		if (!active) {
			return;
		}
		await active.provider.setAgentMergeEnabled(active.session.sessionId, true);
		logService.info(`[AgentMergeActions] Enabled from the title bar: session=${active.session.sessionId}`);
	}
});

registerAction2(class DisableAgentMergeInSessionAction extends AgentMergeActionBase {
	constructor() {
		super({
			id: 'sessions.agentHost.agentMerge.disableInSession',
			title: localize2('agentMerge.disableInSession', "Disable Agent Merge"),
			f1: false,
			menu: agentMergeTopLevelMenus.map(id => ({
				id,
				group: '1_agentMerge',
				order: 1,
				when: ContextKeyExpr.and(agentMergeMenuPrecondition, SessionAgentMergeEnabledContext),
			})),
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const active = this.getActiveSession(accessor);
		const logService = accessor.get(ILogService);
		if (!active) {
			return;
		}
		await active.provider.setAgentMergeEnabled(active.session.sessionId, false);
		logService.info(`[AgentMergeActions] Disabled from the title bar: session=${active.session.sessionId}`);
	}
});

for (const id of agentMergeTopLevelMenus) {
	MenuRegistry.appendMenuItem(id, {
		submenu: Menus.ChangesAgentMergeConfigure,
		title: localize2('agentMerge.configure.submenu', "Configure Agent Merge"),
		group: '1_agentMerge',
		order: 2,
		when: agentMergeMenuPrecondition,
	});
}

for (const [index, action] of agentMergeRepairActions.entries()) {
	registerAction2(class ToggleAgentMergeRepairAction extends AgentMergeActionBase {
		constructor() {
			super({
				id: `sessions.agentHost.agentMerge.toggle.${action}`,
				title: { value: agentMergeActionLabels[action], original: agentMergeActionLabels[action] },
				toggled: AgentMergeSessionActionContexts[action],
				f1: false,
				menu: [{
					id: Menus.ChangesAgentMergeConfigure,
					group: '1_agentMergeActions',
					order: index,
					when: agentMergeMenuPrecondition,
				}],
			});
		}

		async run(accessor: ServicesAccessor): Promise<void> {
			const active = this.getActiveSession(accessor);
			if (!active) {
				return;
			}
			const state = active.provider.getAgentMergeSessionState(active.session.sessionId);
			const effective = resolveAgentMergeConfiguration(getGlobalAgentMergeConfiguration(accessor.get(IConfigurationService)), state?.overrides);
			await this.updateOverrides(accessor, { [action]: !effective[action] });
		}
	});
}

// One submenu entry per value, so the title can name the current choice without
// the user having to open it. Exactly one is ever visible.
for (const value of agentMergeMergePullRequestValues) {
	MenuRegistry.appendMenuItem(Menus.ChangesAgentMergeConfigure, mergePullRequestSubmenuItem(value));
}

function mergePullRequestSubmenuItem(value: AgentMergeMergePullRequest): ISubmenuItem {
	const title = localize('agentMerge.merge.submenu', "Merge Pull Request ({0})", agentMergeMergePullRequestLabels[value]);
	return {
		submenu: Menus.ChangesAgentMergeMergePullRequest,
		title: { value: title, original: title },
		group: '1_agentMergeActions',
		order: agentMergeRepairActions.length,
		when: ContextKeyExpr.and(agentMergeMenuPrecondition, AgentMergeSessionMergePullRequestContext.isEqualTo(value)),
	};
}

for (const [index, value] of agentMergeMergePullRequestValues.entries()) {
	registerAction2(class SetAgentMergeMergePullRequestAction extends AgentMergeActionBase {
		constructor() {
			super({
				id: `sessions.agentHost.agentMerge.mergePullRequest.${value}`,
				title: { value: agentMergeMergePullRequestLabels[value], original: agentMergeMergePullRequestLabels[value] },
				tooltip: agentMergeMergePullRequestDescriptions[value],
				toggled: AgentMergeSessionMergePullRequestContext.isEqualTo(value),
				f1: false,
				menu: [{
					id: Menus.ChangesAgentMergeMergePullRequest,
					group: 'navigation',
					order: index,
				}],
			});
		}

		async run(accessor: ServicesAccessor): Promise<void> {
			await this.updateOverrides(accessor, { mergePullRequest: value });
		}
	});
}

registerAction2(class OpenAgentMergeDefaultsAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.agentHost.agentMerge.openDefaults',
			title: localize2('agentMerge.openDefaults', "Agent Merge Defaults"),
			f1: false,
			menu: [{
				id: Menus.ChangesAgentMergeConfigure,
				group: '2_agentMergeDefaults',
				order: 1,
				when: agentMergeMenuPrecondition,
			}],
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const preferencesService = accessor.get(IPreferencesService);
		const logService = accessor.get(ILogService);
		await preferencesService.openSettings({ jsonEditor: false, query: `@tag:${AGENT_MERGE_SETTING_TAG}` });
		logService.trace(`[AgentMergeActions] Opened Agent Merge defaults in the settings editor`);
	}
});

registerAction2(class EnableAgentMergeAction extends AgentMergeActionBase {
	constructor() {
		super({
			id: 'sessions.agentHost.agentMerge.enable',
			title: localize2('agentMerge.enable', "Enable Agent Merge for Active Session"),
			f1: true,
			precondition: ContextKeyExpr.and(agentMergeCommandPrecondition, SessionAgentMergeEnabledContext.negate()),
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
			precondition: ContextKeyExpr.and(agentMergeCommandPrecondition, SessionAgentMergeEnabledContext),
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
		const defaults = getGlobalAgentMergeConfiguration(configurationService);
		const current = active.provider.getAgentMergeSessionState(active.session.sessionId);
		const effective = resolveAgentMergeConfiguration(defaults, current?.overrides);
		const picks: IAgentMergeActionPick[] = agentMergeRepairActions.map(action => ({
			action,
			label: agentMergeActionLabels[action],
			picked: effective[action],
		}));
		const result = await pickAgentMergeActions(quickInputService, picks);
		if (!result) {
			return;
		}
		// The merge choice is an enum rather than a checkbox, so it is carried
		// through untouched instead of being reset by this multi-select.
		const overrides = result.reset ? undefined : toOverrides(result.actions, effective.mergePullRequest);
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
): Promise<{ readonly reset: boolean; readonly actions: ReadonlySet<AgentMergeRepairAction> } | undefined> {
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

function toOverrides(selected: ReadonlySet<AgentMergeRepairAction>, mergePullRequest: AgentMergeMergePullRequest): AgentMergeSessionOverrides {
	const overrides: Record<string, unknown> = { mergePullRequest };
	for (const action of agentMergeRepairActions) {
		overrides[action] = selected.has(action);
	}
	return overrides as AgentMergeSessionOverrides;
}
