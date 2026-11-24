/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { WebSocketConnectionFactory } from '../../../../../platform/agentHost/browser/webSocketConnectionFactory.js';
import { editorWindowAgentHostClientInfo } from '../../../../../platform/agentHost/common/agentHostClientInfo.js';
import { IExtensionRemoteAgentHostsService } from '../../../../../platform/agentHost/common/extensionRemoteAgentHosts.js';
import { IRemoteAgentHostService, RemoteAgentHostEntryType } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';

/**
 * Has an editor window connect to the remote agent hosts its extensions register, as it connects to
 * those its workspace lists in `chat.workspaceRemoteAgentHosts`: their agents become available in
 * Chat, and their sessions are listed there. A host the user disconnected stays disconnected. In the
 * Agents window, its WebSocket host contribution connects them, along with their session providers.
 */
export class EditorExtensionRemoteAgentHostsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.editorExtensionRemoteAgentHosts';

	constructor(
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IRemoteAgentHostService remoteAgentHostService: IRemoteAgentHostService,
		@IExtensionRemoteAgentHostsService extensionRemoteAgentHostsService: IExtensionRemoteAgentHostsService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		if (environmentService.isSessionsWindow) {
			return;
		}
		this._register(remoteAgentHostService.registerConnectionFactory(this._register(instantiationService.createInstance(
			WebSocketConnectionFactory,
			RemoteAgentHostEntryType.Extension,
			extensionRemoteAgentHostsService.connectableEntries,
			() => editorWindowAgentHostClientInfo,
		))));
	}
}
