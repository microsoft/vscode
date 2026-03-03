/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { FileAccess } from '../../../../base/common/network.js';
import { dirname, posix, win32 } from '../../../../base/common/path.js';
import { OperatingSystem, OS } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ConfigurationTarget, ConfigurationTargetToString } from '../../../../platform/configuration/common/configuration.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IMcpResourceScannerService, McpResourceTarget } from '../../../../platform/mcp/common/mcpResourceScannerService.js';
import { IRemoteAgentEnvironment } from '../../../../platform/remote/common/remoteAgentEnvironment.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { IMcpSandboxConfiguration, IMcpStdioServerConfiguration, McpServerType } from '../../../../platform/mcp/common/mcpPlatformTypes.js';
import { IMcpPotentialSandboxBlock, McpServerDefinition, McpServerLaunch, McpServerTransportType } from './mcpTypes.js';
import { Mutable } from '../../../../base/common/types.js';

export const IMcpSandboxService = createDecorator<IMcpSandboxService>('mcpSandboxService');

export interface IMcpSandboxService {
	readonly _serviceBrand: undefined;
	launchInSandboxIfEnabled(serverDef: McpServerDefinition, launch: McpServerLaunch, remoteAuthority: string | undefined, configTarget: ConfigurationTarget): Promise<McpServerLaunch>;
	isEnabled(serverDef: McpServerDefinition, serverLabel?: string): Promise<boolean>;
	getSandboxConfigSuggestionMessage(serverLabel: string, potentialBlocks: readonly IMcpPotentialSandboxBlock[], existingSandboxConfig?: IMcpSandboxConfiguration): SandboxConfigSuggestionResult | undefined;
	applySandboxConfigSuggestion(serverDef: McpServerDefinition, mcpResource: URI, configTarget: ConfigurationTarget, potentialBlocks: readonly IMcpPotentialSandboxBlock[], suggestedSandboxConfig?: IMcpSandboxConfiguration): Promise<boolean>;
}

type SandboxConfigSuggestions = {
	allowWrite: readonly string[];
	allowedDomains: readonly string[];
};

type SandboxConfigSuggestionResult = {
	message: string;
	sandboxConfig: IMcpSandboxConfiguration;
};

type SandboxLaunchDetails = {
	execPath: string | undefined;
	srtPath: string | undefined;
	sandboxConfigPath: string | undefined;
	tempDir: URI | undefined;
};

export class McpSandboxService extends Disposable implements IMcpSandboxService {
	readonly _serviceBrand: undefined;

	private _sandboxSettingsId: string | undefined;
	private _remoteEnvDetailsPromise: Promise<IRemoteAgentEnvironment | null>;
	private readonly _defaultAllowedDomains: readonly string[] = ['registry.npmjs.org']; // Default allowed domains that are commonly needed for MCP servers, even if the user doesn't specify them in their sandbox config
	private _sandboxConfigPerConfigurationTarget: Map<string, string> = new Map();

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@ILogService private readonly _logService: ILogService,
		@IMcpResourceScannerService private readonly _mcpResourceScannerService: IMcpResourceScannerService,
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
	) {
		super();
		this._sandboxSettingsId = generateUuid();
		this._remoteEnvDetailsPromise = this._remoteAgentService.getEnvironment();

	}

	public async isEnabled(serverDef: McpServerDefinition, remoteAuthority?: string): Promise<boolean> {
		const os = await this._getOperatingSystem(remoteAuthority);
		if (os === OperatingSystem.Windows) {
			return false;
		}
		return !!serverDef.sandboxEnabled;
	}

	public async launchInSandboxIfEnabled(serverDef: McpServerDefinition, launch: McpServerLaunch, remoteAuthority: string | undefined, configTarget: ConfigurationTarget): Promise<McpServerLaunch> {
		if (launch.type !== McpServerTransportType.Stdio) {
			return launch;
		}
		if (await this.isEnabled(serverDef, remoteAuthority)) {
			this._logService.trace(`McpSandboxService: Launching with config target ${configTarget}`);
			const launchDetails = await this._resolveSandboxLaunchDetails(configTarget, remoteAuthority, serverDef.sandbox, launch.cwd);
			const sandboxArgs = this._getSandboxCommandArgs(launch.command, launch.args, launchDetails.sandboxConfigPath);
			const sandboxEnv = this._getSandboxEnvVariables(launchDetails.tempDir, remoteAuthority);
			if (launchDetails.srtPath) {
				const envWithSandbox = sandboxEnv ? { ...launch.env, ...sandboxEnv } : launch.env;
				if (launchDetails.execPath) {
					return {
						...launch,
						command: launchDetails.execPath,
						args: [launchDetails.srtPath, ...sandboxArgs],
						env: envWithSandbox,
						type: McpServerTransportType.Stdio,
					};
				} else {
					return {
						...launch,
						command: launchDetails.srtPath,
						args: sandboxArgs,
						env: envWithSandbox,
						type: McpServerTransportType.Stdio,
					};
				}
			}
			if (!launchDetails.execPath) {
				this._logService.warn('McpSandboxService: execPath is unavailable, launching without sandbox runtime wrapper');
			}
			this._logService.debug(`McpSandboxService: launch details for server ${serverDef.label} - command: ${launch.command}, args: ${launch.args.join(' ')}`);
		}
		return launch;
	}

	public getSandboxConfigSuggestionMessage(serverLabel: string, potentialBlocks: readonly IMcpPotentialSandboxBlock[], existingSandboxConfig?: IMcpSandboxConfiguration): SandboxConfigSuggestionResult | undefined {
		const suggestions = this._getSandboxConfigSuggestions(potentialBlocks, existingSandboxConfig);
		if (!suggestions) {
			return undefined;
		}

		const allowWriteList = suggestions.allowWrite;
		const allowedDomainsList = suggestions.allowedDomains;
		const suggestionLines: string[] = [];

		if (allowedDomainsList.length) {
			const shown = allowedDomainsList.map(domain => `"${domain}"`).join(', ');
			suggestionLines.push(localize('mcpSandboxSuggestion.allowedDomains', "Add to `sandbox.network.allowedDomains`: {0}", shown));
		}

		if (allowWriteList.length) {
			const shown = allowWriteList.map(path => `"${path}"`).join(', ');
			suggestionLines.push(localize('mcpSandboxSuggestion.allowWrite', "Add to `sandbox.filesystem.allowWrite`: {0}", shown));
		}

		const sandboxConfig: IMcpSandboxConfiguration = {};
		if (allowedDomainsList.length) {
			sandboxConfig.network = { allowedDomains: [...allowedDomainsList] };
		}
		if (allowWriteList.length) {
			sandboxConfig.filesystem = { allowWrite: [...allowWriteList] };
		}

		return {
			message: localize(
				'mcpSandboxSuggestion.message',
				"The MCP server {0} reported potential sandbox blocks. VS Code found possible sandbox configuration updates:\n{1}",
				serverLabel,
				suggestionLines.join('\n')
			),
			sandboxConfig,
		};
	}

	public async applySandboxConfigSuggestion(serverDef: McpServerDefinition, mcpResource: URI, configTarget: ConfigurationTarget, potentialBlocks: readonly IMcpPotentialSandboxBlock[], suggestedSandboxConfig?: IMcpSandboxConfiguration): Promise<boolean> {
		const scanTarget = this._toMcpResourceTarget(configTarget);
		let didChange = false;

		await this._mcpResourceScannerService.updateSandboxConfig(data => {
			const existingSandbox = data.sandbox ?? serverDef.sandbox;
			const suggestedAllowedDomains = suggestedSandboxConfig?.network?.allowedDomains ?? [];
			const suggestedAllowWrite = suggestedSandboxConfig?.filesystem?.allowWrite ?? [];

			const currentAllowedDomains = new Set(existingSandbox?.network?.allowedDomains ?? []);
			for (const domain of suggestedAllowedDomains) {
				if (domain && !currentAllowedDomains.has(domain)) {
					currentAllowedDomains.add(domain);
				}
			}

			const currentAllowWrite = new Set(existingSandbox?.filesystem?.allowWrite ?? []);
			for (const path of suggestedAllowWrite) {
				if (path && !currentAllowWrite.has(path)) {
					currentAllowWrite.add(path);
				}
			}

			didChange = currentAllowedDomains.size !== (existingSandbox?.network?.allowedDomains?.length ?? 0)
				|| currentAllowWrite.size !== (existingSandbox?.filesystem?.allowWrite?.length ?? 0);

			if (!didChange) {
				return data;
			}

			const nextSandboxConfig: IMcpSandboxConfiguration = {
				...existingSandbox,
			};

			if (currentAllowedDomains.size > 0 || existingSandbox?.network?.deniedDomains?.length) {
				nextSandboxConfig.network = {
					...existingSandbox?.network,
					allowedDomains: [...currentAllowedDomains],
				};
			}

			if (currentAllowWrite.size > 0 || existingSandbox?.filesystem?.denyRead?.length || existingSandbox?.filesystem?.denyWrite?.length) {
				nextSandboxConfig.filesystem = {
					...existingSandbox?.filesystem,
					allowWrite: [...currentAllowWrite],
				};
			}

			//always remove sandbox at server level when writing back, it should only exist at the top level. This is to sanitize any old or malformed configs that may have sandbox defined at the server level.
			if (data.servers) {
				for (const serverName in data.servers) {
					const serverConfig = data.servers[serverName];
					if (serverConfig.type === McpServerType.LOCAL) {
						delete (serverConfig as Mutable<IMcpStdioServerConfiguration>).sandbox;
					}
				}
			}

			return {
				...data,
				sandbox: nextSandboxConfig,
			};
		}, mcpResource, scanTarget);

		return didChange;
	}

	private _getSandboxConfigSuggestions(potentialBlocks: readonly IMcpPotentialSandboxBlock[], existingSandboxConfig?: IMcpSandboxConfiguration): SandboxConfigSuggestions | undefined {
		if (!potentialBlocks.length) {
			return undefined;
		}

		const allowWrite = new Set<string>();
		const allowedDomains = new Set<string>();
		const existingAllowWrite = new Set(existingSandboxConfig?.filesystem?.allowWrite ?? []);
		const existingAllowedDomains = new Set(existingSandboxConfig?.network?.allowedDomains ?? []);

		for (const block of potentialBlocks) {
			if (block.kind === 'network' && block.host && !existingAllowedDomains.has(block.host)) {
				allowedDomains.add(block.host);
			}

			if (block.kind === 'filesystem' && block.path && !existingAllowWrite.has(block.path)) {
				allowWrite.add(block.path);
			}
		}

		if (!allowWrite.size && !allowedDomains.size) {
			return undefined;
		}

		return {
			allowWrite: [...allowWrite],
			allowedDomains: [...allowedDomains],
		};
	}

	private _toMcpResourceTarget(configTarget: ConfigurationTarget): McpResourceTarget {
		switch (configTarget) {
			case ConfigurationTarget.USER:
			case ConfigurationTarget.USER_LOCAL:
			case ConfigurationTarget.USER_REMOTE:
				return ConfigurationTarget.USER;
			case ConfigurationTarget.WORKSPACE:
				return ConfigurationTarget.WORKSPACE;
			case ConfigurationTarget.WORKSPACE_FOLDER:
				return ConfigurationTarget.WORKSPACE_FOLDER;
			default:
				return ConfigurationTarget.USER;
		}
	}

	private async _resolveSandboxLaunchDetails(configTarget: ConfigurationTarget, remoteAuthority?: string, sandboxConfig?: IMcpSandboxConfiguration, launchCwd?: string): Promise<SandboxLaunchDetails> {
		const os = await this._getOperatingSystem(remoteAuthority);
		if (os === OperatingSystem.Windows) {
			return { execPath: undefined, srtPath: undefined, sandboxConfigPath: undefined, tempDir: undefined };
		}

		const appRoot = await this._getAppRoot(remoteAuthority);
		const execPath = await this._getExecPath(os, appRoot, remoteAuthority);
		const tempDir = await this._getTempDir(remoteAuthority);
		const srtPath = this._pathJoin(os, appRoot, 'node_modules', '@anthropic-ai', 'sandbox-runtime', 'dist', 'cli.js');
		const sandboxConfigPath = tempDir ? await this._updateSandboxConfig(tempDir, configTarget, sandboxConfig, launchCwd) : undefined;
		this._logService.debug(`McpSandboxService: Updated sandbox config path: ${sandboxConfigPath}`);
		return { execPath, srtPath, sandboxConfigPath, tempDir };
	}

	private async _getExecPath(os: OperatingSystem, appRoot: string, remoteAuthority?: string): Promise<string | undefined> {
		if (remoteAuthority) {
			return this._pathJoin(os, appRoot, 'node');
		}
		return undefined; // Use Electron executable as the default exec path for local development, which will run the sandbox runtime wrapper with Electron in node mode. For remote, we need to specify the node executable to ensure it runs with Node.js.
	}

	private _getSandboxEnvVariables(tempDir: URI | undefined, remoteAuthority?: string): Record<string, string | null> | undefined {
		let env: Record<string, string | null> = {};
		if (tempDir) {
			env = { TMPDIR: tempDir.path, SRT_DEBUG: 'true' };
		}
		if (!remoteAuthority) {
			// Add any remote-specific environment variables here
			env = { ...env, ELECTRON_RUN_AS_NODE: '1' };
		}
		// Ensure VSCODE_INSPECTOR_OPTIONS is not inherited by the sandboxed process, as it can cause issues with sandboxing.
		env['VSCODE_INSPECTOR_OPTIONS'] = null;
		return env;
	}

	private _getSandboxCommandArgs(command: string, args: readonly string[], sandboxConfigPath: string | undefined): string[] {
		const result: string[] = [];
		if (sandboxConfigPath) {
			result.push('--settings', sandboxConfigPath);
		}
		result.push(command, ...args);
		return result;
	}

	private async _getRemoteEnv(remoteAuthority?: string): Promise<IRemoteAgentEnvironment | null> {
		if (!remoteAuthority) {
			return null;
		}
		return this._remoteEnvDetailsPromise;
	}

	private async _getOperatingSystem(remoteAuthority?: string): Promise<OperatingSystem> {
		const remoteEnv = await this._getRemoteEnv(remoteAuthority);
		if (remoteEnv) {
			return remoteEnv.os;
		}
		return OS;
	}

	private async _getAppRoot(remoteAuthority?: string): Promise<string> {
		const remoteEnv = await this._getRemoteEnv(remoteAuthority);
		if (remoteEnv) {
			return remoteEnv.appRoot.path;
		}
		return dirname(FileAccess.asFileUri('').path);
	}

	private async _getTempDir(remoteAuthority?: string): Promise<URI | undefined> {
		const remoteEnv = await this._getRemoteEnv(remoteAuthority);
		if (remoteEnv) {
			return remoteEnv.tmpDir;
		}
		const environmentService = this._environmentService as IEnvironmentService & { tmpDir?: URI };
		const tempDir = environmentService.tmpDir;
		if (!tempDir) {
			this._logService.warn('McpSandboxService: Cannot create sandbox settings file because no tmpDir is available in this environment');
		}
		return tempDir;
	}

	private async _updateSandboxConfig(tempDir: URI, configTarget: ConfigurationTarget, sandboxConfig?: IMcpSandboxConfiguration, launchCwd?: string): Promise<string> {
		const normalizedSandboxConfig = this._withDefaultSandboxConfig(sandboxConfig, launchCwd);
		let configFileUri: URI;
		const configTargetKey = ConfigurationTargetToString(configTarget);
		if (this._sandboxConfigPerConfigurationTarget.has(configTargetKey)) {
			configFileUri = URI.parse(this._sandboxConfigPerConfigurationTarget.get(configTargetKey)!);
		} else {
			configFileUri = URI.joinPath(tempDir, `vscode-${configTargetKey}-mcp-sandbox-settings-${this._sandboxSettingsId}.json`);
			this._sandboxConfigPerConfigurationTarget.set(configTargetKey, configFileUri.toString());
		}
		await this._fileService.createFile(configFileUri, VSBuffer.fromString(JSON.stringify(normalizedSandboxConfig, null, '\t')), { overwrite: true });
		return configFileUri.path;
	}

	// this method merges the default allowWrite paths and allowedDomains with the ones provided in the sandbox config, to ensure that the default necessary paths and domains are always included in the sandbox config used for launching,
	//  even if they are not explicitly specified in the config provided by the user or the MCP server config.
	private _withDefaultSandboxConfig(sandboxConfig?: IMcpSandboxConfiguration, launchCwd?: string): IMcpSandboxConfiguration {
		const mergedAllowWrite = new Set(sandboxConfig?.filesystem?.allowWrite ?? []);
		for (const defaultAllowWrite of this._getDefaultAllowWrite(launchCwd ? [launchCwd] : undefined)) {
			if (defaultAllowWrite) {
				mergedAllowWrite.add(defaultAllowWrite);
			}
		}

		const mergedAllowedDomains = new Set(sandboxConfig?.network?.allowedDomains ?? []);
		for (const defaultAllowedDomain of this._defaultAllowedDomains) {
			if (defaultAllowedDomain) {
				mergedAllowedDomains.add(defaultAllowedDomain);
			}
		}

		return {
			...sandboxConfig,
			network: {
				allowedDomains: [...mergedAllowedDomains],
				deniedDomains: sandboxConfig?.network?.deniedDomains ?? [],
			},
			filesystem: {
				allowWrite: [...mergedAllowWrite],
				denyRead: sandboxConfig?.filesystem?.denyRead ?? [],
				denyWrite: sandboxConfig?.filesystem?.denyWrite ?? [],
			},
		};
	}

	private _getDefaultAllowWrite(directories?: string[]): readonly string[] {
		const defaultAllowWrite: string[] = ['~/.npm'];
		for (const launchCwd of directories ?? []) {
			const trimmed = launchCwd.trim();
			if (trimmed) {
				defaultAllowWrite.push(trimmed);
			}
		}
		return defaultAllowWrite;
	}

	private _pathJoin = (os: OperatingSystem, ...segments: string[]) => {
		const path = os === OperatingSystem.Windows ? win32 : posix;
		return path.join(...segments);
	};

}
