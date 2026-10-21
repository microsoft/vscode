/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { derived } from '../../../../../base/common/observable.js';
import { OS } from '../../../../../base/common/platform.js';
import { localize } from '../../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry, IAccessibleViewImplementation } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { DEV_CONTAINER_AGENT_HOST_CHANNEL, IDiscoveredDevContainer } from '../../../../../platform/agentHost/common/devContainerAgentHost.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ISharedProcessService } from '../../../../../platform/ipc/electron-browser/services.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { AccessibilityVerbositySettingId } from '../../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { AICustomizationManagementSection } from '../../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_EDITOR, CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_SECTION } from '../../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagement.js';
import { AICustomizationManagementEditor } from '../../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.js';
import { aiCustomizationManagementSectionRegistry } from '../../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementSectionRegistry.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { createEnabledRemotesCount, RemotesModel } from '../browser/remotesModel.js';
import { RemotesWidget } from '../browser/remotesWidget.js';

class RemotesCustomizationContribution extends Disposable {
	static readonly ID = 'sessions.contrib.remotesCustomization';

	constructor(
		@ISharedProcessService sharedProcessService: ISharedProcessService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		const channel = sharedProcessService.getChannel(DEV_CONTAINER_AGENT_HOST_CHANNEL);
		const remotesEnabled = observableConfigValue(RemoteAgentHostsEnabledSettingId, false, configurationService);
		const aiDisabled = observableConfigValue('chat.disableAIFeatures', false, configurationService);
		const count = createEnabledRemotesCount(
			derived(reader => remotesEnabled.read(reader) && !aiDisabled.read(reader)),
			() => instantiationService.createInstance(RemotesModel, token => channel.call<readonly IDiscoveredDevContainer[]>('listDevContainers', undefined, token)),
			OS,
		);
		this._register(aiCustomizationManagementSectionRegistry.register({
			id: AICustomizationManagementSection.Remotes,
			label: localize('remotes.navigationLabel', "Remotes"),
			icon: Codicon.remote,
			description: localize('remotes.navigationDescription', "Manage the remotes available in the New Session location picker."),
			count,
			enablementSettings: [RemoteAgentHostsEnabledSettingId],
			supportsHarness: () => true,
			create: (widgetInstantiationService, container) => {
				const model = widgetInstantiationService.createInstance(RemotesModel, token => channel.call<readonly IDiscoveredDevContainer[]>('listDevContainers', undefined, token));
				return widgetInstantiationService.createInstance(RemotesWidget, container, model, OS);
			},
		}));
	}
}

registerWorkbenchContribution2(RemotesCustomizationContribution.ID, RemotesCustomizationContribution, WorkbenchPhase.BlockStartup);

class RemotesAccessibleView implements IAccessibleViewImplementation {
	readonly priority = 125;
	readonly name = 'remotes';
	readonly when = ContextKeyExpr.and(ChatContextKeys.enabled, CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_EDITOR, CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_SECTION.isEqualTo(AICustomizationManagementSection.Remotes));

	constructor(readonly type: AccessibleViewType) { }

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider | undefined {
		const editor = accessor.get(IEditorService).activeEditorPane;
		const widget = editor instanceof AICustomizationManagementEditor ? editor.getActiveSectionWidget() : undefined;
		if (!(widget instanceof RemotesWidget)) {
			return undefined;
		}
		const focused = dom.getActiveElement();
		return new AccessibleContentProvider(
			AccessibleViewProviderId.Remotes,
			{ type: this.type },
			() => this.type === AccessibleViewType.Help ? [
				localize('remotes.help.overview', "Remotes groups known SSH hosts, tunnels, and Dev Containers in a tree. WSL distributions are also available on Windows."),
				localize('remotes.help.navigation', "Type in Search to filter remotes. Use Down Arrow from Search to enter the tree. Use Up and Down Arrow to navigate, and Left and Right Arrow to collapse or expand groups. On a remote, press Tab to reach its switch, then Space to show or hide it."),
				localize('remotes.help.toggle', "Remotes with their switch on appear in the New Session location picker. Switching off removes the remote and may disconnect it. Switching on registers it without explicitly connecting; existing automatic connection settings still apply."),
				localize('remotes.help.discovery', "Refresh looks for remotes without connecting or starting containers. A warning icon on a group means its locations could not be refreshed. The tooltip and group label explain the problem; the Window log contains diagnostic details. Known locations remain available, and Refresh retries discovery. Containers without a local source folder cannot currently be added."),
			].join('\n\n') : widget.getAccessibilityContent(),
			() => dom.isHTMLElement(focused) && focused.isConnected ? focused.focus() : widget.focus(),
			AccessibilityVerbositySettingId.Remotes,
		);
	}
}

AccessibleViewRegistry.register(new RemotesAccessibleView(AccessibleViewType.Help));
AccessibleViewRegistry.register(new RemotesAccessibleView(AccessibleViewType.View));
