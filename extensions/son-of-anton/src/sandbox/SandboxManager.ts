/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { classifyCommand, ClassificationResult, NETWORK_ALLOWLIST } from './CommandClassifier';
import { SandboxTerminal } from './SandboxTerminal';

/**
 * Configuration for creating a sandbox container.
 */
export interface SandboxConfig {
	/** Docker image to use. Defaults to 'son-of-anton-sandbox:latest'. */
	image: string;
	/** Host path to mount as /workspace. */
	workspaceMount: string;
	/** Max execution time per command in ms. Default: 300000 (5 min). */
	timeoutMs: number;
	/** Memory limit in MB. Default: 2048. */
	memoryLimitMb: number;
	/** CPU core quota. Default: 2. */
	cpuQuota: number;
	/** Network domains to allow. Uses NETWORK_ALLOWLIST by default. */
	networkAllowlist: string[];
}

/**
 * Result of executing a command inside the sandbox.
 */
export interface SandboxResult {
	exitCode: number;
	stdout: string;
	stderr: string;
	timedOut: boolean;
	durationMs: number;
	classification: ClassificationResult;
}

/**
 * Docker container info.
 */
interface ContainerInfo {
	id: string;
	created: number;
}

/**
 * Callback for confirming commands that require user approval.
 */
export type ConfirmCallback = (command: string, reason: string) => Promise<boolean>;

/**
 * Default sandbox configuration.
 */
export function defaultSandboxConfig(workspacePath: string): SandboxConfig {
	return {
		image: 'son-of-anton-sandbox:latest',
		workspaceMount: workspacePath,
		timeoutMs: 300_000,
		memoryLimitMb: 2048,
		cpuQuota: 2,
		networkAllowlist: [...NETWORK_ALLOWLIST],
	};
}

/**
 * Linux capabilities to drop from sandbox containers.
 * We keep only what's needed for basic development tasks.
 */
const DROPPED_CAPABILITIES: string[] = [
	'CAP_NET_RAW',
	'CAP_SYS_ADMIN',
	'CAP_SYS_PTRACE',
	'CAP_SYS_MODULE',
	'CAP_SYS_RAWIO',
	'CAP_SYS_BOOT',
	'CAP_SYS_NICE',
	'CAP_SYS_RESOURCE',
	'CAP_SYS_TIME',
	'CAP_MKNOD',
	'CAP_AUDIT_WRITE',
	'CAP_AUDIT_CONTROL',
	'CAP_NET_ADMIN',
	'CAP_NET_BIND_SERVICE',
];

/**
 * Manages Docker sandbox containers for agent code execution.
 * All agent commands are classified, optionally confirmed, and executed
 * inside isolated Docker containers with resource limits.
 */
export class SandboxManager {
	private readonly config: SandboxConfig;
	private readonly terminal: SandboxTerminal;
	private container: ContainerInfo | undefined;
	private confirmCallback: ConfirmCallback | undefined;

	/** Docker SDK instance — injected for testability. */
	private docker: DockerApi | undefined;

	constructor(config: SandboxConfig, terminal: SandboxTerminal) {
		this.config = config;
		this.terminal = terminal;
	}

	/**
	 * Set the Docker API implementation.
	 * In production this wraps dockerode; in tests it can be a stub.
	 */
	setDockerApi(docker: DockerApi): void {
		this.docker = docker;
	}

	/**
	 * Set the callback used for confirming 'confirm'-level commands.
	 */
	setConfirmCallback(callback: ConfirmCallback): void {
		this.confirmCallback = callback;
	}

	/**
	 * Execute a command inside a sandboxed container.
	 * 1. Classify the command (allowed / confirm / blocked).
	 * 2. If blocked, reject immediately.
	 * 3. If confirm, call the confirm callback.
	 * 4. If allowed (or confirmed), run in Docker.
	 */
	async execute(command: string): Promise<SandboxResult> {
		const classification = classifyCommand(command);

		// Blocked commands are never executed
		if (classification.level === 'blocked') {
			this.terminal.showBlocked(command, classification.reason);
			return {
				exitCode: 1,
				stdout: '',
				stderr: `Command blocked: ${classification.reason}`,
				timedOut: false,
				durationMs: 0,
				classification,
			};
		}

		// Commands requiring confirmation
		if (classification.level === 'confirm') {
			if (!this.confirmCallback) {
				this.terminal.showBlocked(command, 'No confirmation handler registered');
				return {
					exitCode: 1,
					stdout: '',
					stderr: 'Command requires confirmation but no handler is registered.',
					timedOut: false,
					durationMs: 0,
					classification,
				};
			}

			const confirmed = await this.confirmCallback(command, classification.reason);
			if (!confirmed) {
				this.terminal.showBlocked(command, 'User denied');
				return {
					exitCode: 1,
					stdout: '',
					stderr: 'Command denied by user.',
					timedOut: false,
					durationMs: 0,
					classification,
				};
			}
		}

		// Display command in terminal
		this.terminal.showCommand(command, classification.level);

		// Execute in Docker container
		const startTime = Date.now();
		try {
			await this.ensureContainer();
			const result = await this.runInContainer(command);
			const durationMs = Date.now() - startTime;

			if (result.stdout) {
				this.terminal.showStdout(result.stdout);
			}
			if (result.stderr) {
				this.terminal.showStderr(result.stderr);
			}
			this.terminal.showExitCode(result.exitCode, durationMs);

			return {
				...result,
				durationMs,
				classification,
			};
		} catch (err) {
			const durationMs = Date.now() - startTime;
			const message = err instanceof Error ? err.message : String(err);
			this.terminal.showStderr(message);
			this.terminal.showExitCode(1, durationMs);

			return {
				exitCode: 1,
				stdout: '',
				stderr: message,
				timedOut: false,
				durationMs,
				classification,
			};
		}
	}

	/**
	 * Ensure a sandbox container exists. Create one if needed.
	 */
	private async ensureContainer(): Promise<void> {
		if (this.container) {
			return;
		}

		if (!this.docker) {
			throw new Error('Docker API not initialised. Call setDockerApi() first.');
		}

		const id = await this.docker.createContainer({
			image: this.config.image,
			workspaceMount: this.config.workspaceMount,
			memoryLimitBytes: this.config.memoryLimitMb * 1024 * 1024,
			cpuQuota: this.config.cpuQuota,
			dropCapabilities: DROPPED_CAPABILITIES,
			networkAllowlist: this.config.networkAllowlist,
			seccompProfile: 'default',
		});

		this.container = { id, created: Date.now() };
	}

	/**
	 * Run a command inside the active container with timeout handling.
	 */
	private async runInContainer(command: string): Promise<{ exitCode: number; stdout: string; stderr: string; timedOut: boolean }> {
		if (!this.docker || !this.container) {
			throw new Error('No active container.');
		}

		const result = await Promise.race([
			this.docker.exec(this.container.id, command),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error('Command timed out')), this.config.timeoutMs)
			),
		]).catch(err => {
			if (err instanceof Error && err.message === 'Command timed out') {
				return { exitCode: 137, stdout: '', stderr: 'Execution timed out.', timedOut: true };
			}
			throw err;
		});

		return result as { exitCode: number; stdout: string; stderr: string; timedOut: boolean };
	}

	/**
	 * Destroy the sandbox container (e.g. at session end).
	 */
	async destroy(): Promise<void> {
		if (this.docker && this.container) {
			await this.docker.removeContainer(this.container.id);
			this.container = undefined;
		}
	}

	/**
	 * Get the current sandbox configuration.
	 */
	getConfig(): Readonly<SandboxConfig> {
		return this.config;
	}
}

/**
 * Abstract Docker API interface for testability.
 * Production implementation wraps dockerode; tests can provide stubs.
 */
export interface DockerApi {
	createContainer(options: DockerCreateOptions): Promise<string>;
	exec(containerId: string, command: string): Promise<{ exitCode: number; stdout: string; stderr: string; timedOut: boolean }>;
	removeContainer(containerId: string): Promise<void>;
}

/**
 * Options for creating a Docker container.
 */
export interface DockerCreateOptions {
	image: string;
	workspaceMount: string;
	memoryLimitBytes: number;
	cpuQuota: number;
	dropCapabilities: string[];
	networkAllowlist: string[];
	seccompProfile: string;
}
