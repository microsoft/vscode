/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Registers `IAgentHostService` for the desktop workbench. When the window
// is attached to a remote authority, the renderer talks to the agent host
// running on the remote (via `VSCodeRemoteAgentHostServiceClient`);
// otherwise it uses the local utility-process agent host
// (`LocalAgentHostServiceClient`).

import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IAgentHostService } from '../../../../platform/agentHost/common/agentService.js';
import { LocalAgentHostServiceClient } from '../../../../platform/agentHost/electron-browser/localAgentHostService.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { EditorRemoteAgentHostServiceClient } from '../browser/editorRemoteAgentHostServiceClient.js';

/**
 * DI shim: picks between the local utility-process agent host and the
 * remote bridge based on `remoteAuthority`, and returns the chosen inner
 * directly from the constructor (a JS-level pattern where the value
 * returned from `new` replaces `this`). The class itself exists only to
 * carry the `@inject`ed parameters needed by `registerSingleton`.
 */
class WorkbenchAgentHostService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
	) {
		const inner = environmentService.remoteAuthority
			? instantiationService.createInstance(EditorRemoteAgentHostServiceClient)
			: instantiationService.createInstance(LocalAgentHostServiceClient);
		return inner as unknown as WorkbenchAgentHostService;
	}
}

registerSingleton(
	IAgentHostService,
	WorkbenchAgentHostService as unknown as { new(...args: unknown[]): IAgentHostService },
	InstantiationType.Delayed,
);
