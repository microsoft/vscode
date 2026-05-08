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
import { IOpenerService } from '../../../platform/opener/common/opener.js';
import { IProductService } from '../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry.js';
import { IsAuxiliaryWindowContext } from '../../../workbench/common/contextkeys.js';
import { IsPhoneLayoutContext, SessionsWelcomeVisibleContext } from '../../common/contextkeys.js';
import { logSessionsInteraction } from '../../common/sessionsTelemetry.js';
import { Menus } from '../../browser/menus.js';
import { isWorkspaceAgentSessionType } from '../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../services/sessions/browser/sessionsProvidersService.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IActionViewItemService } from '../../../platform/actions/browser/actionViewItemService.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../workbench/common/contributions.js';
import { resolveRemoteAuthority } from '../openInVSCodeUtils.js';
import { OpenInVSCodeTitleBarWidget } from '../widget/openInVSCodeWidget.js';

export class OpenInVSCodeAction extends Action2 {
	static readonly ID = 'sessions.openInVSCode';

	constructor() {
		super({
			id: OpenInVSCodeAction.ID,
			title: localize2('openInVSCode', 'Open in Editor'),
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

		const openerService = accessor.get(IOpenerService);
		const productService = accessor.get(IProductService);
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const sessionsProvidersService = accessor.get(ISessionsProvidersService);
		const remoteAgentHostService = accessor.get(IRemoteAgentHostService);

		const scheme = productService.quality === 'stable'
			? 'vscode'
			: productService.quality === 'exploration'
				? 'vscode-exploration'
				: productService.quality === 'insider'
					? 'vscode-insiders'
					: productService.urlProtocol;

		const params = new URLSearchParams();
		params.set('windowId', '_blank');

		const activeSession = sessionsManagementService.activeSession.get();
		if (!activeSession) {
			await openerService.open(URI.from({ scheme, query: params.toString() }), { openExternal: true });
			return;
		}

		const workspace = activeSession.workspace.get();
		const repo = workspace?.repositories[0];
		const rawFolderUri = isWorkspaceAgentSessionType(activeSession.sessionType) ? repo?.workingDirectory ?? repo?.uri : undefined;

		if (!rawFolderUri) {
			await openerService.open(URI.from({ scheme, query: params.toString() }), { openExternal: true });
			return;
		}

		const folderUri = rawFolderUri.scheme === AGENT_HOST_SCHEME ? fromAgentHostUri(rawFolderUri) : rawFolderUri;
		const remoteAuthority = resolveRemoteAuthority(
			activeSession.providerId, sessionsProvidersService, remoteAgentHostService);

		params.set('session', activeSession.resource.toString());

		if (remoteAuthority) {
			await openerService.open(URI.from({
				scheme,
				authority: Schemas.vscodeRemote,
				path: `/${remoteAuthority}${folderUri.path}`,
				query: params.toString(),
			}), { openExternal: true });
		} else {
			await openerService.open(URI.from({
				scheme,
				authority: Schemas.file,
				path: folderUri.path,
				query: params.toString(),
			}), { openExternal: true });
		}
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
