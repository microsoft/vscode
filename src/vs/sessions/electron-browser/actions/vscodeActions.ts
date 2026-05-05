/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../base/common/codicons.js';
import { Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import { ServicesAccessor } from '../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../nls.js';
import { Action2 } from '../../../platform/actions/common/actions.js';
import { AGENT_HOST_SCHEME, fromAgentHostUri } from '../../../platform/agentHost/common/agentHostUri.js';
import { IRemoteAgentHostService } from '../../../platform/agentHost/common/remoteAgentHostService.js';
import { ContextKeyExpr } from '../../../platform/contextkey/common/contextkey.js';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry.js';
import { IsAuxiliaryWindowContext } from '../../../workbench/common/contextkeys.js';
import { IsPhoneLayoutContext, SessionsWelcomeVisibleContext } from '../../common/contextkeys.js';
import { logSessionsInteraction } from '../../common/sessionsTelemetry.js';
import { Menus } from '../../browser/menus.js';
import { ISessionsManagementService } from '../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../services/sessions/browser/sessionsProvidersService.js';
import { IWorkbenchContribution } from '../../../workbench/common/contributions.js';
import { OpenInVSCodeTitleBarWidget } from '../../browser/widget/openInVSCodeWidget.js';
import { IActionViewItemService } from '../../../platform/actions/browser/actionViewItemService.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { resolveRemoteAuthority } from '../../browser/openInVSCodeUtils.js';
import { INativeHostService } from '../../../platform/native/common/native.js';

export class OpenInVSCodeAction extends Action2 {
	static readonly ID = 'agents.openInVSCode';

	constructor() {
		super({
			id: OpenInVSCodeAction.ID,
			title: localize2('openInVSCode', 'Open in VS Code'),
			icon: Codicon.vscodeInsiders,
			precondition: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated()),
			menu: [{
				id: Menus.TitleBarSessionMenu,
				group: 'navigation',
				order: 7,
				when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated(), IsPhoneLayoutContext.negate()),
			}]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const telemetryService = accessor.get(ITelemetryService);
		logSessionsInteraction(telemetryService, 'openInVSCode');

		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const sessionsProvidersService = accessor.get(ISessionsProvidersService);
		const remoteAgentHostService = accessor.get(IRemoteAgentHostService);
		const nativeHostService = accessor.get(INativeHostService);

		const folderUri = this.getFolderUriToOpen(sessionsManagementService, sessionsProvidersService, remoteAgentHostService);
		if (!folderUri) {
			return nativeHostService.openWindow();
		}
		return nativeHostService.openWindow([{ folderUri }], { forceNewWindow: true });
	}

	private getFolderUriToOpen(sessionsManagementService: ISessionsManagementService, sessionsProvidersService: ISessionsProvidersService, remoteAgentHostService: IRemoteAgentHostService): URI | undefined {
		const activeSession = sessionsManagementService.activeSession.get();
		if (!activeSession) {
			return undefined;
		}

		const workspace = activeSession.workspace.get();
		const repo = workspace?.repositories[0];
		const rawFolderUri = repo?.workingDirectory ?? repo?.uri;
		if (!rawFolderUri) {
			return undefined;
		}

		if (rawFolderUri.scheme !== AGENT_HOST_SCHEME) {
			return rawFolderUri;
		}

		const remoteAuthority = resolveRemoteAuthority(activeSession.providerId, sessionsProvidersService, remoteAgentHostService);
		if (!remoteAuthority) {
			return rawFolderUri;
		}

		const agentHostUri = fromAgentHostUri(rawFolderUri);
		return agentHostUri.with({ authority: remoteAuthority, scheme: Schemas.vscodeRemote });
	}
}

export class OpenInVSCodeWidgetContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.openInVSCode.widget';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._register(actionViewItemService.register(Menus.TitleBarSessionMenu, OpenInVSCodeAction.ID, (action, options) => {
			return instantiationService.createInstance(OpenInVSCodeTitleBarWidget, action, options);
		}, undefined));
	}
}
