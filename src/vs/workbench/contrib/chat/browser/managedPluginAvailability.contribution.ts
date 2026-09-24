/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveElement, isHTMLElement } from '../../../../base/browser/dom.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableFromEvent } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ChatAIDisabledSettingId } from '../../../../platform/chat/common/chatSettings.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { FocusedViewContext, IsSessionsWindowContext } from '../../../common/contextkeys.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IBannerService } from '../../../services/banner/browser/bannerService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { AccountPolicyGateState, IAccountPolicyGateService } from '../../../services/policies/common/accountPolicyService.js';
import { getManagedPluginBlockInfo, IManagedPluginAvailabilityService, MANAGED_PLUGINS_VIEW_ID, ManagedPluginsUnavailableContext } from '../common/plugins/managedPluginAvailability.js';
import { ChatConfiguration } from '../common/constants.js';

export class ManagedPluginAvailabilityContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.managedPluginAvailability';

	constructor(
		@IManagedPluginAvailabilityService availabilityService: IManagedPluginAvailabilityService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IBannerService bannerService: IBannerService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IAccountPolicyGateService gateService: IAccountPolicyGateService,
	) {
		super();
		const context = ManagedPluginsUnavailableContext.bindTo(contextKeyService);
		const hidden = observableConfigValue<boolean>(ChatAIDisabledSettingId, false, configurationService);
		const agentEnabled = observableConfigValue<boolean>(ChatConfiguration.AgentEnabled, true, configurationService);
		const restricted = observableFromEvent(this, gateService.onDidChangeGateInfo, () => gateService.gateInfo.state === AccountPolicyGateState.Restricted);
		let dismissed = false;
		let lastMessage: string | undefined;
		this._register(toDisposable(() => {
			context.reset();
			if (!environmentService.isSessionsWindow) {
				bannerService.hide(ManagedPluginAvailabilityContribution.ID);
			}
		}));
		this._register(autorun(reader => {
			const state = availabilityService.state.read(reader);
			const visible = !!state && !hidden.read(reader) && !restricted.read(reader)
				&& (!environmentService.isSessionsWindow || agentEnabled.read(reader));
			context.set(visible);
			if (environmentService.isSessionsWindow) {
				return;
			}
			if (!visible) {
				dismissed = false;
				lastMessage = undefined;
				bannerService.hide(ManagedPluginAvailabilityContribution.ID);
				return;
			}
			const info = getManagedPluginBlockInfo(state);
			const announcement = `${info.title}. ${info.message} ${info.detail}`;
			if (lastMessage !== announcement) {
				status(announcement);
				lastMessage = announcement;
			}
			if (!dismissed) {
				bannerService.show({
					id: ManagedPluginAvailabilityContribution.ID,
					icon: Codicon.info,
					message: info.message,
					ariaLabel: announcement,
					actions: info.action ? [info.action] : [],
					priority: -2,
					neutral: true,
					onClose: () => { dismissed = true; },
				});
			}
		}));
	}
}

registerWorkbenchContribution2(ManagedPluginAvailabilityContribution.ID, ManagedPluginAvailabilityContribution, WorkbenchPhase.AfterRestored);

AccessibleViewRegistry.register({
	priority: 126,
	name: 'managedPluginsUnavailable',
	type: AccessibleViewType.Help,
	when: ContextKeyExpr.and(ManagedPluginsUnavailableContext, ContextKeyExpr.or(FocusedViewContext.isEqualTo(MANAGED_PLUGINS_VIEW_ID), IsSessionsWindowContext)),
	getProvider: accessor => {
		const state = accessor.get(IManagedPluginAvailabilityService).state.get();
		if (!state) {
			return undefined;
		}
		const info = getManagedPluginBlockInfo(state);
		const previousFocus = getActiveElement();
		const isSessionsWindow = accessor.get(IWorkbenchEnvironmentService).isSessionsWindow;
		return new AccessibleContentProvider(
			AccessibleViewProviderId.PanelChat,
			{ type: AccessibleViewType.Help },
			() => [
				info.title, info.message, info.detail,
				isSessionsWindow
					? localize('managedPlugins.agentsHelp', "The Agents window is blocked while required organization plugins are unavailable.")
					: localize('managedPlugins.chatHelp', "Chat is read-only while required organization plugins are unavailable."),
				localize('managedPlugins.actionsHelp', "Use Tab or Shift+Tab to move between available actions, then press Enter or Space to activate one."),
				info.action ? localize('managedPlugins.retryHelp', "Retry checks the current policy and tries to install the missing required plugins again.") : undefined,
				isSessionsWindow
					? localize('managedPlugins.editorHelp', "Open Editor Window opens a new editor window.")
					: localize('managedPlugins.bannerHelp', "The Focus Banner command moves to the window banner. Closing the banner does not dismiss the Chat explanation or remove the plugin requirement."),
			].filter(Boolean).join('\n'),
			() => { if (isHTMLElement(previousFocus) && previousFocus.isConnected) { previousFocus.focus(); } },
			'accessibility.verbosity.chat',
		);
	},
});

AccessibleViewRegistry.register({
	priority: 126,
	name: 'managedPluginsUnavailableView',
	type: AccessibleViewType.View,
	when: ContextKeyExpr.and(ManagedPluginsUnavailableContext, ContextKeyExpr.or(FocusedViewContext.isEqualTo(MANAGED_PLUGINS_VIEW_ID), IsSessionsWindowContext)),
	getProvider: accessor => {
		const state = accessor.get(IManagedPluginAvailabilityService).state.get();
		if (!state) {
			return undefined;
		}
		const info = getManagedPluginBlockInfo(state);
		const previousFocus = getActiveElement();
		return new AccessibleContentProvider(
			AccessibleViewProviderId.PanelChat,
			{ type: AccessibleViewType.View },
			() => [info.title, info.message, info.detail].join('\n\n'),
			() => { if (isHTMLElement(previousFocus) && previousFocus.isConnected) { previousFocus.focus(); } },
			'accessibility.verbosity.chat',
		);
	},
});
