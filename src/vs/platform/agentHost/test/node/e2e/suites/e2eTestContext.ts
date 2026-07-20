/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { TestProtocolClient } from '../../serverIntegrationTestHelpers.js';
import type { IAgentHostE2EProviderConfig } from '../harness/agentHostE2ETestHarness.js';

export interface IAgentHostE2ETestContext {
	readonly config: IAgentHostE2EProviderConfig;
	readonly client: TestProtocolClient;
	readonly createdSessions: string[];
	readonly tempDirs: string[];
	readonly shellToolReplayEnabled: boolean;
	readonly stableNewScenarioResponse: boolean;
	readonly isWindows: boolean;
	readonly runRecordOnlyTests: boolean;
}
