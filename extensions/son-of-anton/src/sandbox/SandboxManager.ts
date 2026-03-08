/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface SandboxConfig {
	image: string;
	workspaceMount: string;
	timeoutMs: number;
	memoryLimitMb: number;
	networkEnabled: boolean;
}

export interface SandboxResult {
	exitCode: number;
	stdout: string;
	stderr: string;
	timedOut: boolean;
}

/**
 * Manages Docker sandbox containers for agent code execution.
 * Phase 1 stub — will be connected to Docker for isolated execution.
 */
export class SandboxManager {
	/**
	 * Execute a command inside a sandboxed container.
	 */
	async execute(_config: SandboxConfig, _command: string): Promise<SandboxResult> {
		// Stub: will be replaced with Docker container execution
		return {
			exitCode: 0,
			stdout: 'Sandbox execution stub — Docker integration pending.',
			stderr: '',
			timedOut: false,
		};
	}
}
