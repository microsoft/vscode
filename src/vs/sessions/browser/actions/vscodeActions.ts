/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IsAuxiliaryWindowContext, LayoutModeContext } from '../../../workbench/common/contextkeys.js';
import { Codicon } from '../../../base/common/codicons.js';
import { Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import { ServicesAccessor } from '../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../nls.js';
import { Action2 } from '../../../platform/actions/common/actions.js';
import { AGENT_HOST_SCHEME, fromAgentHostUri } from '../../../platform/agentHost/common/agentHostUri.js';
import { IRemoteAgentHostService } from '../../../platform/agentHost/common/remoteAgentHostService.js';
import { IAgentHostConnectionsService } from '../../../platform/agentHost/common/agentHostConnectionsService.js';
import { ITunnelAgentHostService } from '../../../platform/agentHost/common/tunnelAgentHost.js';
import { INotificationService } from '../../../platform/notification/common/notification.js';
import { ContextKeyExpr } from '../../../platform/contextkey/common/contextkey.js';
import { IOpenerService } from '../../../platform/opener/common/opener.js';
import { IProductService } from '../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry.js';
import { IsPhoneLayoutContext, SessionsWelcomeVisibleContext } from '../../../workbench/contrib/sessions/common/contextkeys.js';
import { logSessionsInteraction } from '../../../workbench/contrib/sessions/common/sessionsTelemetry.js';
import { AgentsWindowMenus } from '../agentsWindowMenus.js';
import { resolveSessionCommandTarget } from '../../../workbench/contrib/sessions/browser/sessionCommandTarget.js';
import { ISessionsProvidersService } from '../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IActionViewItemService } from '../../../platform/actions/browser/actionViewItemService.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../workbench/common/contributions.js';
import { getEditorWindowSessionResource, notifyEditorWindowSessionUnsupported, resolveRemoteAuthority, resolveRemoteFolderUri } from '../../../workbench/contrib/sessions/browser/openInVSCodeUtils.js';
import { OpenInVSCodeTitleBarWidget } from '../widget/openInVSCodeWidget.js';
import { IChat, ISession } from '../../../workbench/services/sessions/common/session.js';

export class OpenInVSCodeAction extends Action2 {
	static readonly ID = 'sessions.openInVSCode';

	constructor() {
		super({
			id: OpenInVSCodeAction.ID,
			title: localize2('openInVSCode', 'Open in Editor'),
			icon: Codicon.vscodeInsiders,
			precondition: ContextKeyExpr.and(ContextKeyExpr.or(IsAuxiliaryWindowContext.toNegated(), LayoutModeContext)!, SessionsWelcomeVisibleContext.toNegated()),
			menu: [{
				id: AgentsWindowMenus.TitleBarCenterRight,
				group: 'navigation',
				order: 7,
				when: ContextKeyExpr.and(ContextKeyExpr.or(IsAuxiliaryWindowContext.toNegated(), LayoutModeContext)!, SessionsWelcomeVisibleContext.toNegated(), IsPhoneLayoutContext.negate()),
			}]
		});
	}

	override async run(accessor: ServicesAccessor, context?: { readonly session: ISession; readonly chat: IChat }): Promise<void> {
		const telemetryService = accessor.get(ITelemetryService);
		logSessionsInteraction(telemetryService, 'openInVSCode');

		const openerService = accessor.get(IOpenerService);
		const productService = accessor.get(IProductService);
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

		const target = context?.session ? context : resolveSessionCommandTarget(accessor, []);
		const activeSession = target?.session;
		if (!activeSession) {
			await openerService.open(URI.from({ scheme, query: params.toString() }), { openExternal: true });
			return;
		}

		const chat = target?.chat ?? activeSession.mainChat.get();
		const workspace = chat?.workspace.get();
		const folder = workspace?.folders[0];
		const rawFolderUri = workspace?.isVirtualWorkspace ? undefined : folder?.workingDirectory;

		if (!rawFolderUri || !resolveRemoteFolderUri(rawFolderUri, activeSession.providerId, sessionsProvidersService, remoteAgentHostService)) {
			await openerService.open(URI.from({ scheme, query: params.toString() }), { openExternal: true });
			return;
		}

		// eslint-disable-next-line local/code-agent-host-uri-mapping -- opens the remote folder in a new window from its wrapped host URI
		const folderUri = rawFolderUri.scheme === AGENT_HOST_SCHEME ? fromAgentHostUri(rawFolderUri) : rawFolderUri;
		const remoteAuthority = resolveRemoteAuthority(
			activeSession.providerId, sessionsProvidersService, remoteAgentHostService);

		const chatSession = getEditorWindowSessionResource(context?.chat.resource ?? activeSession.resource, activeSession.providerId, sessionsProvidersService, remoteAgentHostService, accessor.get(IAgentHostConnectionsService), accessor.get(ITunnelAgentHostService));
		if (URI.isUri(chatSession)) {
			params.set('session', chatSession.toString());
		} else {
			notifyEditorWindowSessionUnsupported(accessor.get(INotificationService), chatSession);
		}

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
		this._register(actionViewItemService.register(AgentsWindowMenus.TitleBarCenterRight, OpenInVSCodeAction.ID, (action, options) => {
			return instantiationService.createInstance(OpenInVSCodeTitleBarWidget, action, options, OpenInVSCodeAction.ID);
		}, undefined));
	}
}
