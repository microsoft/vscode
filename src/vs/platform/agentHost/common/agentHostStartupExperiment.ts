/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { env } from '../../../base/common/process.js';

/** Startup experiments may initialize native components before send; restrict them to isolated dummy-auth automation. */
export function getAgentHostStartupExperiment(environment: Readonly<Record<string, string | undefined>> = env): 'overlap' | 'prewarm' | 'prewarm-tools' | undefined {
	if (environment.IS_SCENARIO_AUTOMATION !== '1' || environment.EVAL_AHP_DUMMY_AUTH !== '1') {
		return undefined;
	}
	const mode = environment.VSCODE_AGENT_HOST_STARTUP_EXPERIMENT;
	return mode === 'overlap' || mode === 'prewarm' || mode === 'prewarm-tools' ? mode : undefined;
}
