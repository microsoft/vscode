/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { AGENT_HOST_SCHEME, fromAgentHostUri } from '../../../../platform/agentHost/common/agentHostUri.js';
import { IRemoteAgentHostService } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IsAuxiliaryWindowContext } from '../../../../workbench/common/contextkeys.js';
import { IsPhoneLayoutContext, SessionsWelcomeVisibleContext } from '../../../common/contextkeys.js';
import { logSessionsInteraction } from '../../../common/sessionsTelemetry.js';
import { Menus } from '../../../browser/menus.js';
import { CopilotCLISessionType } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { resolveRemoteAuthority } from '../browser/openInVSCodeUtils.js';

/**
 * Desktop version of the "Open in VS Code" action.
 *
 * Launches the host VS Code app via {@link INativeHostService.launchSiblingApp}
 * (child_process.spawn) with direct CLI arguments, bypassing protocol handlers
 * and their OS security prompts.
 */
registerAction2(class OpenSessionWorktreeInVSCodeAction extends Action2 {
	static readonly ID = 'chat.openSessionWorktreeInVSCode';

	constructor() {
		super({
			id: OpenSessionWorktreeInVSCodeAction.ID,
			title: localize2('openInVSCode', 'Open in VS Code'),
			icon: Codicon.vscodeInsiders,
			precondition: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated()),
			menu: [{
				id: Menus.TitleBarSessionMenu,
				group: 'navigation',
				order: 9,
				when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated(), IsPhoneLayoutContext.negate()),
			}]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const telemetryService = accessor.get(ITelemetryService);
		logSessionsInteraction(telemetryService, 'openInVSCode');

		const nativeHostService = accessor.get(INativeHostService);
		const productService = accessor.get(IProductService);
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const sessionsProvidersService = accessor.get(ISessionsProvidersService);
		const remoteAgentHostService = accessor.get(IRemoteAgentHostService);

		const activeSession = sessionsManagementService.activeSession.get();
		const workspace = activeSession?.workspace.get();
		const repo = workspace?.repositories[0];
		const rawFolderUri = activeSession?.sessionType === CopilotCLISessionType.id ? repo?.workingDirectory ?? repo?.uri : undefined;
		const folderUri = rawFolderUri?.scheme === AGENT_HOST_SCHEME ? fromAgentHostUri(rawFolderUri) : rawFolderUri;
		const remoteAuthority = activeSession
			? resolveRemoteAuthority(activeSession.providerId, sessionsProvidersService, remoteAgentHostService)
			: undefined;

		const args: string[] = ['--new-window'];

		if (folderUri) {
			if (remoteAuthority) {
				args.push('--folder-uri', URI.from({ scheme: Schemas.vscodeRemote, authority: remoteAuthority, path: folderUri.path }).toString());
			} else {
				args.push('--folder-uri', folderUri.toString());
			}
		}

		if (activeSession) {
			const scheme = productService.parentPolicyConfig?.urlProtocol ?? productService.urlProtocol;
			const params = new URLSearchParams();
			params.set('windowId', '_blank');
			params.set('session', activeSession.resource.toString());
			args.push('--open-url', URI.from({ scheme, query: params.toString() }).toString());
		}

		await nativeHostService.launchSiblingApp(args);
	}
});
