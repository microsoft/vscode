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
import { CopilotCliVSCodeAssignmentContextKey } from '../../../../platform/agentHost/common/copilotCliConfig.js';
import { ActionType } from '../../../../platform/agentHost/common/state/sessionActions.js';
import { ROOT_STATE_URI } from '../../../../platform/agentHost/common/state/sessionState.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IWorkbenchAssignmentService } from '../../assignment/common/assignmentService.js';
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

class AgentHostPrewarmer extends Disposable {

	private _assignmentContextRequest = 0;

	constructor(
		@IAgentHostService private readonly agentHostService: IAgentHostService,
		@IWorkbenchAssignmentService private readonly assignmentService: IWorkbenchAssignmentService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this._register(this.agentHostService.onAgentHostStart(() => this.updateAssignmentContext()));
		this._register(this.assignmentService.onDidRefetchAssignments(() => this.updateAssignmentContext()));
		this.agentHostService.startAgentHost();
		this.updateAssignmentContext();
	}

	private updateAssignmentContext(): void {
		void this.doUpdateAssignmentContext().catch(error => this.logService.error('Failed to forward Agent Host assignment context', error));
	}

	private async doUpdateAssignmentContext(): Promise<void> {
		const request = ++this._assignmentContextRequest;
		const context = (await this.assignmentService.getCurrentExperiments())?.join(';') ?? '';
		if (request !== this._assignmentContextRequest) {
			return;
		}
		this.agentHostService.dispatch(ROOT_STATE_URI, {
			type: ActionType.RootConfigChanged,
			config: { [CopilotCliVSCodeAssignmentContextKey]: context },
		});
	}
}

export class AgentHostPrewarmContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentHostPrewarm';
	private prewarmer: AgentHostPrewarmer | undefined;

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
		this.prewarmer ??= this._register(this.instantiationService.createInstance(AgentHostPrewarmer));
	}
}

registerSingleton(
	IAgentHostService,
	WorkbenchAgentHostService as unknown as { new(...args: unknown[]): IAgentHostService },
	InstantiationType.Delayed,
);

registerWorkbenchContribution2(AgentHostPrewarmContribution.ID, AgentHostPrewarmContribution, WorkbenchPhase.BlockRestore);
