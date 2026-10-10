/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './managedSettingsUpdateService.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { getActiveElement, isHTMLElement } from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { ChatAIDisabledSettingId } from '../../../../platform/chat/common/chatSettings.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { FocusedViewContext, IsSessionsWindowContext } from '../../../common/contextkeys.js';
import { localize } from '../../../../nls.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IBannerService } from '../../banner/browser/bannerService.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { IManagedSettingsUpdateService, MANAGED_SETTINGS_UPDATE_VIEW_ID, ManagedSettingsUpdateRequiredContext } from '../common/managedSettingsUpdate.js';

export class ManagedSettingsUpdateContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.managedSettingsUpdate';

	constructor(
		@IManagedSettingsUpdateService updateService: IManagedSettingsUpdateService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IBannerService bannerService: IBannerService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
	) {
		super();
		const context = ManagedSettingsUpdateRequiredContext.bindTo(contextKeyService);
		const hidden = observableConfigValue<boolean>(ChatAIDisabledSettingId, false, configurationService);
		let dismissed = false;
		let lastMessage: string | undefined;
		this._register(toDisposable(() => {
			context.reset();
			if (!environmentService.isSessionsWindow) {
				bannerService.hide(ManagedSettingsUpdateContribution.ID);
			}
		}));
		this._register(autorun(reader => {
			const info = updateService.updateInfo.read(reader);
			const visible = !!info && !hidden.read(reader);
			context.set(visible);
			if (environmentService.isSessionsWindow) {
				return;
			}
			if (!visible) {
				dismissed = false;
				lastMessage = undefined;
				bannerService.hide(ManagedSettingsUpdateContribution.ID);
				return;
			}
			if (lastMessage !== info.message) {
				status(info.message);
				lastMessage = info.message;
			}
			if (!dismissed) {
				bannerService.show({
					id: ManagedSettingsUpdateContribution.ID,
					icon: Codicon.info,
					message: info.updateStatus ? localize('managedSettingsUpdate.bannerWithStatus', "{0} {1}", info.message, info.updateStatus) : info.message,
					ariaLabel: [info.title, info.message, info.detail, info.updateStatus].filter(Boolean).join(' '),
					actions: info.action ? [info.action] : [],
					priority: -1,
					neutral: true,
					onClose: () => { dismissed = true; },
				});
			}
		}));
	}
}

registerWorkbenchContribution2(ManagedSettingsUpdateContribution.ID, ManagedSettingsUpdateContribution, WorkbenchPhase.AfterRestored);

AccessibleViewRegistry.register({
	priority: 125,
	name: 'managedSettingsUpdate',
	type: AccessibleViewType.Help,
	when: ContextKeyExpr.and(ManagedSettingsUpdateRequiredContext, ContextKeyExpr.or(FocusedViewContext.isEqualTo(MANAGED_SETTINGS_UPDATE_VIEW_ID), IsSessionsWindowContext)),
	getProvider: accessor => {
		const info = accessor.get(IManagedSettingsUpdateService).updateInfo.get();
		if (!info) {
			return undefined;
		}
		const previousFocus = getActiveElement();
		const isSessionsWindow = accessor.get(IWorkbenchEnvironmentService).isSessionsWindow;
		return new AccessibleContentProvider(
			AccessibleViewProviderId.PanelChat,
			{ type: AccessibleViewType.Help },
			() => [
				info.title, info.message, info.detail, info.updateStatus,
				isSessionsWindow
					? localize('managedSettingsUpdate.agentsHelp', "The Agents window is blocked by your organization's minimum-version requirement. The overlay explains the required update.")
					: localize('managedSettingsUpdate.help', "Chat is read-only while this requirement is active."),
				localize('managedSettingsUpdate.availableActionsHelp', "Use Tab or Shift+Tab to move between available actions, then press Enter or Space to activate one."),
				info.action ? localize('managedSettingsUpdate.actionHelp', "The available update action is {0}.", info.action.label) : undefined,
				isSessionsWindow ? localize('managedSettingsUpdate.editorWindowHelp', "Use Tab or Shift+Tab to reach Open Editor Window, then press Enter or Space. This opens a new editor window.") : undefined,
				!isSessionsWindow ? localize('managedSettingsUpdate.bannerHelp', "The window banner is also available with the Focus Banner command. In the banner, use the arrow keys to reach its actions. Closing the banner does not dismiss the explanation in Chat or change your organization's requirement.") : undefined,
			].filter(Boolean).join('\n'),
			() => { if (isHTMLElement(previousFocus) && previousFocus.isConnected) { previousFocus.focus(); } },
			'accessibility.verbosity.chat',
		);
	},
});
