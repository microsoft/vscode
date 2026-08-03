/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Registers `IAgentHostService` for the desktop workbench. When the window
// is attached to a remote authority, the renderer talks to the agent host
// running on the remote (via `EditorRemoteAgentHostServiceClient`);
// otherwise it uses the local utility-process agent host
// (`LocalAgentHostServiceClient`).

import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IAgentHostService } from '../../../../platform/agentHost/common/agentService.js';
import { LocalAgentHostServiceClient } from '../../../../platform/agentHost/electron-browser/localAgentHostService.js';
import { IAgentHostEnablementService } from '../../../../platform/agentHost/common/agentHostEnablementService.js';
import { agentsWindowAgentHostClientInfo, editorWindowAgentHostClientInfo } from '../../../../platform/agentHost/common/agentHostClientInfo.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
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
			: instantiationService.createInstance(
				LocalAgentHostServiceClient,
				environmentService.isSessionsWindow ? agentsWindowAgentHostClientInfo : editorWindowAgentHostClientInfo,
			);
		return inner as unknown as WorkbenchAgentHostService;
	}
}

class AgentHostPrewarmer {

	constructor(
		@IAgentHostService agentHostService: IAgentHostService,
	) {
		agentHostService.startAgentHost();
	}
}

export class AgentHostPrewarmContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentHostPrewarm';

	constructor(
		@IAgentHostEnablementService agentHostEnablementService: IAgentHostEnablementService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
	) {
		super();
		if (environmentService.remoteAuthority) {
			return;
		}
		this._register(autorun(reader => {
			if (agentHostEnablementService.enabled.read(reader)) {
				this.start();
			}
		}));
	}

	private start(): void {
		this.instantiationService.createInstance(AgentHostPrewarmer);
	}
}

registerSingleton(
	IAgentHostService,
	WorkbenchAgentHostService as unknown as { new(...args: unknown[]): IAgentHostService },
	InstantiationType.Delayed,
);

registerWorkbenchContribution2(AgentHostPrewarmContribution.ID, AgentHostPrewarmContribution, WorkbenchPhase.BlockRestore);
