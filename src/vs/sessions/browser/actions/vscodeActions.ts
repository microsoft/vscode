/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../base/common/codicons.js';
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
import { ISessionsService } from '../../services/sessions/browser/sessionsService.js';
import { ISessionsProvidersService } from '../../services/sessions/browser/sessionsProvidersService.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IActionViewItemService } from '../../../platform/actions/browser/actionViewItemService.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../workbench/common/contributions.js';
import { getOpenInVSCodeUri, getVSCodeProtocolScheme, resolveRemoteAuthority } from '../openInVSCodeUtils.js';
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
				id: Menus.TitleBarCenterRight,
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
		const sessionsService = accessor.get(ISessionsService);
		const sessionsProvidersService = accessor.get(ISessionsProvidersService);
		const remoteAgentHostService = accessor.get(IRemoteAgentHostService);
		const scheme = getVSCodeProtocolScheme(productService);

		const activeSession = sessionsService.activeSession.get();
		if (!activeSession) {
			await openerService.open(getOpenInVSCodeUri(scheme, undefined, undefined, undefined), { openExternal: true });
			return;
		}

		const workspace = activeSession.workspace.get();
		const folder = workspace?.folders[0];
		const rawFolderUri = workspace?.isVirtualWorkspace ? undefined : folder?.workingDirectory;

		if (!rawFolderUri) {
			await openerService.open(getOpenInVSCodeUri(scheme, undefined, undefined, undefined), { openExternal: true });
			return;
		}

		const folderUri = rawFolderUri.scheme === AGENT_HOST_SCHEME ? fromAgentHostUri(rawFolderUri) : rawFolderUri;
		const remoteAuthority = resolveRemoteAuthority(
			activeSession.providerId, sessionsProvidersService, remoteAgentHostService);

		await openerService.open(getOpenInVSCodeUri(scheme, folderUri, remoteAuthority, activeSession.resource), { openExternal: true });
	}
}


export class OpenInVSCodeWidgetContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.openInVSCode.widget';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._register(actionViewItemService.register(Menus.TitleBarCenterRight, OpenInVSCodeAction.ID, (action, options) => {
			return instantiationService.createInstance(OpenInVSCodeTitleBarWidget, action, options, OpenInVSCodeAction.ID);
		}, undefined));
	}
}
