/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../../../../util/common/services';

type RuntimeFlag = 'debug' | 'verboseLogging' | 'testMode' | 'simulation';

export const ICompletionsRuntimeModeService = createServiceIdentifier<ICompletionsRuntimeModeService>('completionsRuntimeModeService');
export interface ICompletionsRuntimeModeService {
	readonly _serviceBrand: undefined;

	readonly flags: Record<RuntimeFlag, boolean>;
	isRunningInTest(): boolean;
	shouldFailForDebugPurposes(): boolean;
	isDebugEnabled(): boolean;
	isVerboseLoggingEnabled(): boolean;
	isRunningInSimulation(): boolean;
}

export class RuntimeMode implements ICompletionsRuntimeModeService {
	declare _serviceBrand: undefined;
	constructor(readonly flags: Record<RuntimeFlag, boolean>) { }

	static fromEnvironment(isRunningInTest: boolean, argv = process.argv, env = process.env): RuntimeMode {
		return new RuntimeMode({
			debug: determineDebugFlag(argv, env),
			verboseLogging: determineVerboseLoggingEnabled(argv, env),
			testMode: isRunningInTest,
			simulation: determineSimulationFlag(env),
		});
	}

	isRunningInTest(): boolean {
		return this.flags.testMode;
	}

	shouldFailForDebugPurposes(): boolean {
		return this.isRunningInTest();
	}

	isDebugEnabled(): boolean {
		return this.flags.debug;
	}

	isVerboseLoggingEnabled(): boolean {
		return this.flags.verboseLogging;
	}

	isRunningInSimulation(): boolean {
		return this.flags.simulation;
	}
}

function determineDebugFlag(argv: string[], env: NodeJS.ProcessEnv): boolean {
	return argv.includes('--debug') || determineEnvFlagEnabled(env, 'DEBUG');
}

function determineSimulationFlag(env: NodeJS.ProcessEnv): boolean {
	return determineEnvFlagEnabled(env, 'SIMULATION');
}

function determineVerboseLoggingEnabled(argv: string[], env: NodeJS.ProcessEnv): boolean {
	return (
		env['COPILOT_AGENT_VERBOSE'] === '1' ||
		env['COPILOT_AGENT_VERBOSE']?.toLowerCase() === 'true' ||
		determineEnvFlagEnabled(env, 'VERBOSE') ||
		determineDebugFlag(argv, env)
	);
}

function determineEnvFlagEnabled(env: NodeJS.ProcessEnv, name: string): boolean {
	for (const prefix of ['GH_COPILOT_', 'GITHUB_COPILOT_']) {
		const val = env[`${prefix}${name}`];
		if (val) {
			return val === '1' || val?.toLowerCase() === 'true';
		}
	}
	return false;
}
