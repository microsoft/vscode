/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { logSessionsInteraction } from '../../../common/sessionsTelemetry.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { IRemoteAgentHostService } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { CopilotCLISessionType } from '../../../services/sessions/common/session.js';
import { AGENT_HOST_SCHEME, fromAgentHostUri } from '../../../../platform/agentHost/common/agentHostUri.js';
import { OpenSessionWorktreeInVSCodeAction, resolveRemoteAuthority } from '../browser/chat.contribution.js';

/**
 * Desktop override for {@link OpenSessionWorktreeInVSCodeAction}.
 *
 * Launches the host VS Code app via {@link INativeHostService.launchSiblingApp}
 */
registerAction2(class extends OpenSessionWorktreeInVSCodeAction {

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
