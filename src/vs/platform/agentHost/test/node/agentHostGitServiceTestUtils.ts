/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IFileService } from '../../../files/common/files.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { AgentHostGitCoalesceReadsConfigKey } from '../../common/agentHostSchema.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';

export interface IGitServiceTestOptions {
	/** Whether the host shares identical read-only git commands and caps how many run at once. Defaults to on. */
	readonly coalesceReads?: boolean;
	readonly telemetryService?: ITelemetryService;
}

/** The constructor arguments of an `AgentHostGitService`, with a real configuration service holding the given arm of the setting. */
export function gitServiceArguments(store: Pick<DisposableStore, 'add'>, fileService: IFileService, environmentService: INativeEnvironmentService, logService: ILogService, options?: IGitServiceTestOptions): [IFileService, INativeEnvironmentService, ILogService, AgentConfigurationService, ITelemetryService] {
	// A separate logger keeps the configuration service's own traces out of the git service's captured log.
	const configurationLogService = new NullLogService();
	const configurationService = store.add(new AgentConfigurationService(store.add(new AgentHostStateManager(configurationLogService)), configurationLogService));
	configurationService.updateRootConfig({ [AgentHostGitCoalesceReadsConfigKey]: options?.coalesceReads ?? true });
	return [fileService, environmentService, logService, configurationService, options?.telemetryService ?? NullTelemetryService];
}
