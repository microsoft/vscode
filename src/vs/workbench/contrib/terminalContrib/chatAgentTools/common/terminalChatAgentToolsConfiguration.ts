/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IStringDictionary } from '../../../../../base/common/collections.js';
import type { IJSONSchema } from '../../../../../base/common/jsonSchema.js';
import { localize } from '../../../../../nls.js';
import { type IConfigurationPropertySchema } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { AgentSandboxEnabledValue, AgentSandboxSettingId, IAgentSandboxUserConfiguredPaths } from '../../../../../platform/sandbox/common/settings.js';
import { SandboxSettingsResolutionHelper } from '../../../../../platform/sandbox/common/sandboxSettingsResolutionHelper.js';
import { COPILOT_SANDBOX_ALLOW_BYPASS_KEY, COPILOT_SANDBOX_ALLOW_DEV_TOOL_ACCESS_KEY, COPILOT_SANDBOX_ALLOW_LOCAL_NETWORK_KEY, COPILOT_SANDBOX_ALLOW_OUTBOUND_KEY, COPILOT_SANDBOX_AUTH_GH_KEY, COPILOT_SANDBOX_AUTH_GIT_KEY, COPILOT_SANDBOX_DENIED_PATHS_KEY, COPILOT_SANDBOX_ENABLED_KEY, COPILOT_SANDBOX_LSP_SERVERS_KEY, COPILOT_SANDBOX_MCP_SERVERS_KEY, COPILOT_SANDBOX_READONLY_PATHS_KEY, COPILOT_SANDBOX_READWRITE_PATHS_KEY } from '../../../../../platform/policy/common/copilotManagedSettings.js';
import { isStringArray } from '../../../../../base/common/types.js';
import { defaultTerminalAutoApproveRules } from '../../../../../platform/terminal/common/autoApprove/defaultAutoApproveRules.js';
import { TerminalSettingId } from '../../../../../platform/terminal/common/terminal.js';
import { terminalProfileBaseProperties } from '../../../../../platform/terminal/common/terminalPlatformConfiguration.js';
import { PolicyCategory } from '../../../../../base/common/policy.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { ConfigurationMigration, Extensions as WorkbenchExtensions, IConfigurationMigrationRegistry } from '../../../../common/configuration.js';

export const sandboxAllowNetworkMigration: ConfigurationMigration = {
	key: 'chat.agent.sandbox.allowNetwork',
	migrateFn: (value, accessor) => {
		if (typeof value !== 'boolean') {
			return [];
		}
		return accessor(AgentSandboxSettingId.AgentSandboxAllowNetwork) === undefined ? [
			[AgentSandboxSettingId.AgentSandboxAllowNetwork, { value }],
			['chat.agent.sandbox.allowNetwork', { value: undefined }],
		] : [['chat.agent.sandbox.allowNetwork', { value: undefined }]];
	},
};

Registry.as<IConfigurationMigrationRegistry>(WorkbenchExtensions.ConfigurationMigration)
	.registerConfigurationMigrations([sandboxAllowNetworkMigration]);

/**
 * Default idle silence timeout in milliseconds. Used as both the configuration
 * default and the runtime fallback when the setting is unavailable.
 */
export const DEFAULT_IDLE_SILENCE_TIMEOUT_MS = 300_000; // 5 minutes

export const enum TerminalChatAgentToolsSettingId {
	EnableAutoApprove = 'chat.tools.terminal.enableAutoApprove',
	AutoApprove = 'chat.tools.terminal.autoApprove',
	AutoApproveWorkspaceNpmScripts = 'chat.tools.terminal.autoApproveWorkspaceNpmScripts',
	IgnoreDefaultAutoApproveRules = 'chat.tools.terminal.ignoreDefaultAutoApproveRules',
	BlockDetectedFileWrites = 'chat.tools.terminal.blockDetectedFileWrites',
	ShellIntegrationTimeout = 'chat.tools.terminal.shellIntegrationTimeout',
	OutputLocation = 'chat.tools.terminal.outputLocation',
	AgentSandboxLinuxFileSystem = 'chat.agent.sandbox.fileSystem.linux',
	AgentSandboxMacFileSystem = 'chat.agent.sandbox.fileSystem.mac',
	AgentSandboxAdvancedRuntime = 'chat.agent.sandbox.advanced.runtime',
	PreventShellHistory = 'chat.tools.terminal.preventShellHistory',
	EnforceTimeoutFromModel = 'chat.tools.terminal.enforceTimeoutFromModel',
	IdleSilenceTimeoutMs = 'chat.tools.terminal.idleSilenceTimeoutMs',
	DetachBackgroundProcesses = 'chat.tools.terminal.detachBackgroundProcesses',
	BackgroundNotifications = 'chat.tools.terminal.backgroundNotifications',
	OutputDeltas = 'chat.tools.terminal.outputDeltas',
	OutputCompaction = 'chat.tools.terminal.outputCompaction',
	IdlePollInterval = 'chat.tools.terminal.idlePollInterval',

	TerminalProfileLinux = 'chat.tools.terminal.terminalProfile.linux',
	TerminalProfileMacOs = 'chat.tools.terminal.terminalProfile.osx',
	TerminalProfileWindows = 'chat.tools.terminal.terminalProfile.windows',

	DeprecatedAutoApproveCompatible = 'chat.agent.terminal.autoApprove',
	DeprecatedAutoApprove1 = 'chat.agent.terminal.allowList',
	DeprecatedAutoApprove2 = 'chat.agent.terminal.denyList',
	DeprecatedAutoApprove3 = 'github.copilot.chat.agent.terminal.allowList',
	DeprecatedAutoApprove4 = 'github.copilot.chat.agent.terminal.denyList',
}

export interface ITerminalChatAgentToolsConfiguration {
	autoApprove: { [key: string]: boolean };
	commandReportingAllowList: { [key: string]: boolean };
	shellIntegrationTimeout: number;
}

const autoApproveBoolean: IJSONSchema = {
	type: 'boolean',
	enum: [
		true,
		false,
	],
	enumDescriptions: [
		localize('autoApprove.true', "Automatically approve the pattern."),
		localize('autoApprove.false', "Require explicit approval for the pattern."),
	],
	description: localize('autoApprove.key', "The start of a command to match against. A regular expression can be provided by wrapping the string in `/` characters."),
};

const terminalChatAgentProfileSchema: IJSONSchema = {
	type: 'object',
	required: ['path'],
	properties: {
		path: {
			description: localize('terminalChatAgentProfile.path', "A path to a shell executable."),
			type: 'string',
		},
		...terminalProfileBaseProperties,
	}
};

export const terminalChatAgentToolsConfiguration: IStringDictionary<IConfigurationPropertySchema> = {
	[TerminalChatAgentToolsSettingId.EnableAutoApprove]: {
		restricted: true,
		tags: ['chatPermissions'],
		description: localize('autoApproveMode.description', "Controls whether to allow auto approval in the run in terminal tool."),
		type: 'boolean',
		default: true,
		policy: {
			name: 'ChatToolsTerminalEnableAutoApprove',
			category: PolicyCategory.IntegratedTerminal,
			minimumVersion: '1.104',
			localization: {
				description: {
					key: 'autoApproveMode.description',
					value: localize('autoApproveMode.description', "Controls whether to allow auto approval in the run in terminal tool."),
				}
			}
		},
		agentsWindow: { default: true },
	},
	[TerminalChatAgentToolsSettingId.AutoApprove]: {
		restricted: true,
		tags: ['chatPermissions'],
		markdownDescription: [
			localize('autoApprove.description.intro', "A list of commands or regular expressions that control whether the run in terminal tool commands require explicit approval. These will be matched against the start of a command. A regular expression can be provided by wrapping the string in {0} characters followed by optional flags such as {1} for case-insensitivity.", '`/`', '`i`'),
			localize('autoApprove.description.values', "Set to {0} to automatically approve commands, {1} to always require explicit approval or {2} to unset the value.", '`true`', '`false`', '`null`'),
			localize('autoApprove.description.subCommands', "Note that these commands and regular expressions are evaluated for every _sub-command_ within the full _command line_, so {0} for example will need both {1} and {2} to match a {3} entry and must not match a {4} entry in order to auto approve. Inline commands such as {5} (process substitution) should also be detected.", '`foo && bar`', '`foo`', '`bar`', '`true`', '`false`', '`<(foo)`'),
			localize('autoApprove.description.commandLine', "An object can be used to match against the full command line instead of matching sub-commands and inline commands, for example {0}. In order to be auto approved _both_ the sub-command and command line must not be explicitly denied, then _either_ all sub-commands or command line needs to be approved.", '`{ approve: false, matchCommandLine: true }`'),
			localize('autoApprove.defaults', "Note that there's a default set of rules to allow and also deny commands. Consider setting {0} to {1} to ignore all default rules to ensure there are no conflicts with your own rules. Do this at your own risk, the default denial rules are designed to protect you against running dangerous commands.", `\`#${TerminalChatAgentToolsSettingId.IgnoreDefaultAutoApproveRules}#\``, '`true`'),
			[
				localize('autoApprove.description.examples.title', 'Examples:'),
				`|${localize('autoApprove.description.examples.value', "Value")}|${localize('autoApprove.description.examples.description', "Description")}|`,
				'|---|---|',
				'| `\"mkdir\": true` | ' + localize('autoApprove.description.examples.mkdir', "Allow all commands starting with {0}", '`mkdir`'),
				'| `\"npm run build\": true` | ' + localize('autoApprove.description.examples.npmRunBuild', "Allow all commands starting with {0}", '`npm run build`'),
				'| `\"bin/test.sh\": true` | ' + localize('autoApprove.description.examples.binTest', "Allow all commands that match the path {0} ({1}, {2}, etc.)", '`bin/test.sh`', '`bin\\test.sh`', '`./bin/test.sh`'),
				'| `\"/^git (status\\|show\\\\b.*)$/\": true` | ' + localize('autoApprove.description.examples.regexGit', "Allow {0} and all commands starting with {1}", '`git status`', '`git show`'),
				'| `\"/^Get-ChildItem\\\\b/i\": true` | ' + localize('autoApprove.description.examples.regexCase', "will allow {0} commands regardless of casing", '`Get-ChildItem`'),
				'| `\"/.*/\": true` | ' + localize('autoApprove.description.examples.regexAll', "Allow all commands (denied commands still require approval)"),
				'| `\"rm\": false` | ' + localize('autoApprove.description.examples.rm', "Require explicit approval for all commands starting with {0}", '`rm`'),
				'| `\"/\\\\.ps1/i\": { approve: false, matchCommandLine: true }` | ' + localize('autoApprove.description.examples.ps1', "Require explicit approval for any _command line_ that contains {0} regardless of casing", '`".ps1"`'),
				'| `\"rm\": null` | ' + localize('autoApprove.description.examples.rmUnset', "Unset the default {0} value for {1}", '`false`', '`rm`'),
			].join('\n'),
		].join('\n\n'),
		type: 'object',
		additionalProperties: {
			anyOf: [
				autoApproveBoolean,
				{
					type: 'object',
					properties: {
						approve: autoApproveBoolean,
						matchCommandLine: {
							type: 'boolean',
							enum: [
								true,
								false,
							],
							enumDescriptions: [
								localize('autoApprove.matchCommandLine.true', "Match against the full command line, eg. `foo && bar`."),
								localize('autoApprove.matchCommandLine.false', "Match against sub-commands and inline commands, eg. `foo && bar` will need both `foo` and `bar` to match."),
							],
							description: localize('autoApprove.matchCommandLine', "Whether to match against the full command line, as opposed to splitting by sub-commands and inline commands."),
						}
					},
					required: ['approve']
				},
				{
					type: 'null',
					description: localize('autoApprove.null', "Ignore the pattern, this is useful for unsetting the same pattern set at a higher scope."),
				},
			]
		},
		default: defaultTerminalAutoApproveRules,
	},
	[TerminalChatAgentToolsSettingId.IgnoreDefaultAutoApproveRules]: {
		restricted: true,
		type: 'boolean',
		default: false,
		tags: ['experimental', 'chatPermissions'],
		markdownDescription: localize('ignoreDefaultAutoApproveRules.description', "Whether to ignore the built-in default auto-approve rules used by the run in terminal tool as defined in {0}. When this setting is enabled, the run in terminal tool will ignore any rule that comes from the default set but still follow rules defined in the user, remote and workspace settings. Use this setting at your own risk; the default auto-approve rules are designed to protect you against running dangerous commands.", `\`#${TerminalChatAgentToolsSettingId.AutoApprove}#\``),
	},
	[TerminalChatAgentToolsSettingId.AutoApproveWorkspaceNpmScripts]: {
		restricted: true,
		type: 'boolean',
		// In order to use agent mode the workspace must be trusted, this plus the fact that
		// modifying package.json is protected means this is safe to enable by default.
		default: true,
		tags: ['experimental', 'chatPermissions'],
		markdownDescription: localize('autoApproveWorkspaceNpmScripts.description', "Whether to automatically approve npm, yarn, and pnpm run commands when the script is defined in a workspace package.json file. Since the workspace is trusted, scripts defined in package.json are considered safe to run without explicit approval."),
	},
	[TerminalChatAgentToolsSettingId.BlockDetectedFileWrites]: {
		restricted: true,
		type: 'string',
		enum: ['never', 'outsideWorkspace', 'all'],
		enumDescriptions: [
			localize('blockFileWrites.never', "Allow all detected file writes."),
			localize('blockFileWrites.outsideWorkspace', "Block file writes detected outside the workspace. This depends on the shell integration feature working correctly to determine the current working directory of the terminal."),
			localize('blockFileWrites.all', "Block all detected file writes."),
		],
		default: 'outsideWorkspace',
		tags: ['experimental', 'chatPermissions'],
		markdownDescription: localize('blockFileWrites.description', "Controls whether detected file write operations are blocked in the run in terminal tool. When detected, this will require explicit approval regardless of whether the command would normally be auto approved. Note that this cannot detect all possible methods of writing files, this is what is currently detected:\n\n- File redirection (detected via the bash or PowerShell tree sitter grammar)\n- `sed` in-place editing (`-i`, `-I`, `--in-place`)"),
	},
	[TerminalChatAgentToolsSettingId.ShellIntegrationTimeout]: {
		markdownDescription: localize('shellIntegrationTimeout.description', "Configures the duration in milliseconds to wait for shell integration to be detected when the run in terminal tool launches a new terminal. Set to `0` to skip the wait entirely, the default value `-1` uses a variable wait time based on the value of {0} and whether it's a remote window. A large value can be useful if your shell starts very slowly.", `\`#${TerminalSettingId.ShellIntegrationEnabled}#\``),
		type: 'integer',
		minimum: -1,
		maximum: 60000,
		default: -1,
		markdownDeprecationMessage: localize('shellIntegrationTimeout.deprecated', 'Use {0} instead', `\`#${TerminalSettingId.ShellIntegrationTimeout}#\``)
	},
	[TerminalChatAgentToolsSettingId.IdlePollInterval]: {
		markdownDescription: localize('idlePollInterval.description', "Configures the idle poll interval in milliseconds used by the run in terminal tool to detect when commands have finished executing. Lower values make command detection faster but may cause false positives on slow systems. This primarily affects terminals without shell integration where idle detection is used instead of shell integration events."),
		type: 'integer',
		minimum: 50,
		maximum: 10000,
		default: 1000,
	},
	[TerminalChatAgentToolsSettingId.TerminalProfileLinux]: {
		restricted: true,
		markdownDescription: localize('terminalChatAgentProfile.linux', "The terminal profile to use on Linux for chat agent's run in terminal tool."),
		type: ['object', 'null'],
		default: null,
		'anyOf': [
			{ type: 'null' },
			terminalChatAgentProfileSchema
		],
		defaultSnippets: [
			{
				body: {
					path: '${1}'
				}
			}
		]
	},
	[TerminalChatAgentToolsSettingId.TerminalProfileMacOs]: {
		restricted: true,
		markdownDescription: localize('terminalChatAgentProfile.osx', "The terminal profile to use on macOS for chat agent's run in terminal tool."),
		type: ['object', 'null'],
		default: null,
		'anyOf': [
			{ type: 'null' },
			terminalChatAgentProfileSchema
		],
		defaultSnippets: [
			{
				body: {
					path: '${1}'
				}
			}
		]
	},
	[TerminalChatAgentToolsSettingId.TerminalProfileWindows]: {
		restricted: true,
		markdownDescription: localize('terminalChatAgentProfile.windows', "The terminal profile to use on Windows for chat agent's run in terminal tool."),
		type: ['object', 'null'],
		default: null,
		'anyOf': [
			{ type: 'null' },
			terminalChatAgentProfileSchema
		],
		defaultSnippets: [
			{
				body: {
					path: '${1}'
				}
			}
		]
	},
	[TerminalChatAgentToolsSettingId.OutputLocation]: {
		markdownDescription: localize('outputLocation.description', "Where to show the output from the run in terminal tool."),
		type: 'string',
		enum: ['terminal', 'chat'],
		enumDescriptions: [
			localize('outputLocation.terminal', "Reveal the terminal in the panel or editor in addition to chat."),
			localize('outputLocation.chat', "Reveal the terminal output within chat only."),
		],
		default: 'chat',
		tags: ['experimental'],
		experiment: {
			mode: 'auto'
		}
	},
	[AgentSandboxSettingId.AgentSandboxEnabled]: {
		managedSettingsPresentation: read => SandboxSettingsResolutionHelper.resolveEnabled(undefined, read(COPILOT_SANDBOX_ENABLED_KEY) === true),
		order: 10,
		keywords: ['Sandbox', 'sandboxing'],
		tags: ['chatPermissions'],
		markdownDescription: localize('agentSandbox.enabledSetting2', "Controls whether agent mode uses sandboxing to restrict what tools can do. When enabled, tools like the terminal are run in a sandboxed environment to limit access to the system. The Local harness supports sandboxing on Linux and macOS only. The Copilot Agent Host harness uses the SDK runtime's sandbox, including on supported Windows hosts."),
		type: 'string',
		enum: [AgentSandboxEnabledValue.Off, AgentSandboxEnabledValue.On],
		enumDescriptions: [
			localize('agentSandbox.enabledSetting.offDescription', 'Disable sandboxing for agent mode tools.'),
			localize('agentSandbox.enabledSetting.onDescription', 'Enable sandboxing for agent mode tools.'),
		],
		default: AgentSandboxEnabledValue.Off,
		restricted: true,
		experiment: {
			mode: 'auto'
		},
		policy: {
			name: 'ChatAgentSandboxEnabled',
			category: PolicyCategory.IntegratedTerminal,
			minimumVersion: '1.116',
			localization: {
				description: {
					key: 'agentSandbox.enabledPolicy',
					value: localize('agentSandbox.enabledPolicy', "Deprecated. Controls whether the Local agent uses sandboxing to restrict what tools can do. In Copilot Agent Host, this legacy policy supplies an overridable sandbox default, not a mandatory requirement. Use the runtime-native sandbox.enabled managed setting to require sandboxing in Copilot Agent Host."),
				},
				enumDescriptions: [
					{
						key: 'agentSandbox.enabledSetting.offDescription',
						value: localize('agentSandbox.enabledSetting.offDescription', 'Disable sandboxing for agent mode tools.'),
					},
					{
						key: 'agentSandbox.enabledSetting.onDescription',
						value: localize('agentSandbox.enabledSetting.onDescription', 'Enable sandboxing for agent mode tools.'),
					},
				]
			}
		}
	},
	[AgentSandboxSettingId.AgentSandboxAllowNetwork]: {
		managedSettingsPresentation: read => SandboxSettingsResolutionHelper.resolveAllowAccess(undefined, read(COPILOT_SANDBOX_ALLOW_OUTBOUND_KEY) !== false),
		order: 20,
		keywords: ['Sandbox', 'sandboxing'],
		tags: ['chatPermissions'],
		markdownDescription: localize('agentSandbox.allowNetwork2', "Allow outbound network access in the sandbox (`allowOutbound` in the SDK). Configured allowed and denied network domains still restrict destinations. When disabled, outbound network access is blocked, including for the integrated browser."),
		type: 'boolean',
		default: true,
		restricted: true,
		policy: {
			name: 'ChatAgentSandboxAllowNetwork',
			category: PolicyCategory.IntegratedTerminal,
			minimumVersion: '1.127',
			localization: {
				description: {
					key: 'agentSandbox.allowNetworkPolicy',
					value: localize('agentSandbox.allowNetworkPolicy', "Deprecated. Controls whether the Local agent sandbox allows outbound connections to all network domains while preserving file system restrictions. Use the sandbox.userPolicy.network.allowOutbound managed setting to enforce outbound network restrictions in Copilot Agent Host."),
				}
			}
		}
	},
	[AgentSandboxSettingId.AgentSandboxAllowLocalNetwork]: {
		managedSettingsPresentation: read => SandboxSettingsResolutionHelper.resolveAllowAccess(undefined, read(COPILOT_SANDBOX_ALLOW_LOCAL_NETWORK_KEY) !== false),
		order: 25,
		keywords: ['Sandbox', 'sandboxing'],
		tags: ['chatPermissions'],
		markdownDescription: localize('agentSandbox.allowLocalNetwork', "Allow the sandboxed process to reach hosts on the local network. Windows needs this on when a proxy, host rules, or credential masking is used: it reaches the local listener over host loopback, and a sandboxed command will not launch without it. The local proxy checks destination addresses for direct connections. An upstream proxy resolves its own destinations."),
		type: 'boolean',
		default: false,
		restricted: true,
	},
	[AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands]: {
		managedSettingsPresentation: read => {
			const allowBypass = read(COPILOT_SANDBOX_ALLOW_BYPASS_KEY);
			return SandboxSettingsResolutionHelper.resolveAllowBypass(undefined, typeof allowBypass === 'boolean' ? allowBypass : undefined, read(COPILOT_SANDBOX_ENABLED_KEY) === true);
		},
		order: 30,
		keywords: ['Sandbox', 'sandboxing'],
		tags: ['chatPermissions'],
		markdownDescription: localize('agentSandbox.allowUnsandboxedCommands2', "Controls whether agent mode terminal commands can run outside the sandbox after user confirmation when a sandboxed command fails or when sandbox restrictions would block the command."),
		type: 'boolean',
		default: true,
		restricted: true,
		policy: {
			name: 'ChatAgentSandboxAllowUnsandboxedCommands',
			category: PolicyCategory.IntegratedTerminal,
			minimumVersion: '1.116',
			localization: {
				description: {
					key: 'agentSandbox.allowUnsandboxedCommandsPolicy',
					value: localize('agentSandbox.allowUnsandboxedCommandsPolicy', "Deprecated. Controls whether Local agent terminal commands can run outside the sandbox after user confirmation when sandbox restrictions would block the command. Use the sandbox.allowBypass managed setting to control sandbox bypass in Copilot Agent Host."),
				}
			}
		}
	},
	[AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests]: {
		markdownDescription: localize('agentSandbox.retryWithAllowNetworkRequests', "Controls whether agent mode terminal commands can retry in the sandbox with unrestricted network access after user confirmation. This applies only when {0} is enabled and preserves file system sandboxing while relaxing network restrictions for an approved command.", `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``),
		markdownDeprecationMessage: localize('agentSandbox.retryWithAllowNetworkRequests.deprecated', "This setting will be deprecated soon. It does not apply to the Copilot Agent Host sandbox."),
		deprecationMessageShowInSettings: true,
		type: 'boolean',
		default: true,
		tags: ['preview', 'chatPermissions'],
		restricted: true
	},
	[AgentSandboxSettingId.AgentSandboxMcpServers]: {
		managedSettingsPresentation: read => SandboxSettingsResolutionHelper.resolveSandboxServers(undefined, read(COPILOT_SANDBOX_MCP_SERVERS_KEY) === true),
		order: 40,
		keywords: ['Sandbox', 'sandboxing'],
		tags: ['chatPermissions'],
		markdownDescription: localize('agentSandbox.mcpServers', "Controls whether MCP servers run in the sandbox when sandboxing is enabled."),
		type: 'boolean',
		default: true,
		restricted: true,
	},
	[AgentSandboxSettingId.AgentSandboxLspServers]: {
		managedSettingsPresentation: read => SandboxSettingsResolutionHelper.resolveSandboxServers(undefined, read(COPILOT_SANDBOX_LSP_SERVERS_KEY) === true),
		order: 50,
		keywords: ['Sandbox', 'sandboxing'],
		tags: ['chatPermissions'],
		markdownDescription: localize('agentSandbox.lspServers', "Controls whether LSP servers run in the sandbox when sandboxing is enabled."),
		type: 'boolean',
		default: true,
		restricted: true,
	},
	[AgentSandboxSettingId.AgentSandboxAuthenticateGit]: {
		managedSettingsPresentation: read => SandboxSettingsResolutionHelper.resolveAllowAccess(undefined, read(COPILOT_SANDBOX_AUTH_GIT_KEY) !== false),
		order: 51,
		keywords: ['Sandbox', 'sandboxing'],
		tags: ['chatPermissions'],
		markdownDescription: localize('agentSandbox.authenticateGit', "Use your credentials for HTTPS git operations inside the sandbox. Applies only to the Copilot Agent Host harness."),
		type: 'boolean',
		default: true,
		restricted: true,
	},
	[AgentSandboxSettingId.AgentSandboxAuthenticateGh]: {
		managedSettingsPresentation: read => SandboxSettingsResolutionHelper.resolveAllowAccess(undefined, read(COPILOT_SANDBOX_AUTH_GH_KEY) !== false),
		order: 52,
		keywords: ['Sandbox', 'sandboxing'],
		tags: ['chatPermissions'],
		markdownDescription: localize('agentSandbox.authenticateGh', "Use your GitHub account for gh commands inside the sandbox. Applies only to the Copilot Agent Host harness."),
		type: 'boolean',
		default: true,
		restricted: true,
	},
	[AgentSandboxSettingId.AgentSandboxAllowDevToolAccess]: {
		managedSettingsPresentation: read => SandboxSettingsResolutionHelper.resolveAllowAccess(undefined, read(COPILOT_SANDBOX_ALLOW_DEV_TOOL_ACCESS_KEY) !== false),
		order: 60,
		keywords: ['Sandbox', 'sandboxing'],
		tags: ['chatPermissions'],
		markdownDescription: localize('agentSandbox.allowDevToolAccess', "Grant read access to the tool directories found on PATH, in toolchain env vars (CARGO_HOME, GOROOT, and similar) and under your user profile, plus dev-tool config and caches (including registry tokens), and read-write to shared build caches."),
		type: 'boolean',
		default: true,
		restricted: true,
	},
	[AgentSandboxSettingId.AgentSandboxUserConfiguredPaths]: {
		tags: ['chatPermissions'],
		managedSettingsPresentation: (read, localValue) => {
			const managed: IAgentSandboxUserConfiguredPaths = {};
			for (const [property, key] of [
				['readwritePaths', COPILOT_SANDBOX_READWRITE_PATHS_KEY],
				['readonlyPaths', COPILOT_SANDBOX_READONLY_PATHS_KEY],
				['deniedPaths', COPILOT_SANDBOX_DENIED_PATHS_KEY],
			] as const) {
				const value = read(key);
				if (value === undefined) {
					continue;
				}
				let paths: unknown = value;
				if (typeof value === 'string') {
					try {
						paths = JSON.parse(value);
					} catch {
						console.warn('Failed to parse managed sandbox filesystem paths; ignoring the presentation override.');
						return undefined;
					}
				}
				if (!isStringArray(paths)) {
					console.warn('Managed sandbox filesystem paths must be a string array; ignoring the presentation override.');
					return undefined;
				}
				managed[property] = paths;
			}
			if (!Object.keys(managed).length) {
				return undefined;
			}
			const local: IAgentSandboxUserConfiguredPaths = {};
			if (localValue && typeof localValue === 'object') {
				for (const [property, paths] of Object.entries(localValue)) {
					if ((property === 'readwritePaths' || property === 'readonlyPaths' || property === 'deniedPaths') && isStringArray(paths)) {
						local[property] = paths;
					}
				}
			}
			const resolved = SandboxSettingsResolutionHelper.resolveFileSystemPaths(local, managed);
			return {
				readwritePaths: resolved.readwritePaths ?? [],
				readonlyPaths: resolved.readonlyPaths ?? [],
				deniedPaths: resolved.deniedPaths ?? [],
			} satisfies Readonly<Record<string, readonly string[]>>;
		},
		order: 65,
		keywords: ['Sandbox', 'sandboxing'],
		markdownDescription: localize('agentSandbox.userConfiguredPaths', "Customize file path permissions in the sandbox."),
		type: ['object'],
		properties: {
			readwritePaths: {
				type: 'array',
				description: localize('agentSandbox.userConfiguredPaths.readwritePaths', "Read/Write: paths the Copilot Agent Host sandbox can read and write."),
				items: { type: 'string' },
				default: [],
			},
			readonlyPaths: {
				type: 'array',
				description: localize('agentSandbox.userConfiguredPaths.readonlyPaths', "Read-Only: paths the Copilot Agent Host sandbox can read but not write."),
				items: { type: 'string' },
				default: [],
			},
			deniedPaths: {
				type: 'array',
				description: localize('agentSandbox.userConfiguredPaths.deniedPaths', "Denied: paths the Copilot Agent Host sandbox cannot access."),
				items: { type: 'string' },
				default: [],
			},
		},
		additionalProperties: false,
		default: { readwritePaths: [], readonlyPaths: [], deniedPaths: [] },
		restricted: true,
	},
	[TerminalChatAgentToolsSettingId.AgentSandboxLinuxFileSystem]: {
		order: 70,
		keywords: ['Sandbox', 'sandboxing'],
		markdownDeprecationMessage: localize('agentSandbox.fileSystem.deprecated', "This setting will be deprecated soon. For the Copilot Agent Host sandbox, use {0} instead.", `\`#${AgentSandboxSettingId.AgentSandboxUserConfiguredPaths}#\``),
		deprecationMessageShowInSettings: true,
		markdownDescription: localize('agentSandbox.linuxFileSystemSetting', "Note: this setting is applicable only when {0} is enabled. Controls file system access in sandbox on Linux. Paths do not support glob patterns, only literal paths (ex: ./src/, ~/.ssh, .env). **bubblewrap** and **socat** should be installed for this setting to work.", `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``),
		type: 'object',
		properties: {
			denyRead: {
				type: 'array',
				description: localize('agentSandbox.linuxFileSystemSetting.denyRead', "Array of paths to deny read access. Leave empty to allow reading all paths."),
				items: { type: 'string' },
				default: []
			},
			allowRead: {
				type: 'array',
				description: localize('agentSandbox.linuxFileSystemSetting.allowRead', "Array of paths to re-allow read access within denied regions. Takes precedence over denyRead."),
				items: { type: 'string' },
				default: []
			},
			allowWrite: {
				type: 'array',
				description: localize('agentSandbox.linuxFileSystemSetting.allowWrite', "Array of additional paths to allow write access. Leave empty to disallow writes outside the workspace folders, workspace storage folder, and sandbox temp directory."),
				items: { type: 'string' },
				default: []
			},
			denyWrite: {
				type: 'array',
				description: localize('agentSandbox.linuxFileSystemSetting.denyWrite', "Array of paths to deny write access within allowed paths (takes precedence over allowWrite)."),
				items: { type: 'string' },
				default: []
			}
		},
		default: {
			denyRead: [],
			allowRead: [],
			allowWrite: [],
			denyWrite: []
		},
		tags: ['preview', 'chatPermissions'],
		restricted: true,
	},
	[TerminalChatAgentToolsSettingId.AgentSandboxMacFileSystem]: {
		order: 80,
		keywords: ['Sandbox', 'sandboxing'],
		markdownDeprecationMessage: localize('agentSandbox.fileSystem.deprecated', "This setting will be deprecated soon. For the Copilot Agent Host sandbox, use {0} instead.", `\`#${AgentSandboxSettingId.AgentSandboxUserConfiguredPaths}#\``),
		deprecationMessageShowInSettings: true,
		markdownDescription: localize('agentSandbox.macFileSystemSetting', "Note: this setting is applicable only when {0} is enabled. Controls file system access in sandbox on macOS. Paths also support git-style glob patterns(ex: *.ts, ./src, ./src/**/*.ts, file?.txt).", `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``),
		type: 'object',
		properties: {
			denyRead: {
				type: 'array',
				description: localize('agentSandbox.macFileSystemSetting.denyRead', "Array of paths to deny read access. Leave empty to allow reading all paths."),
				items: { type: 'string' },
				default: []
			},
			allowRead: {
				type: 'array',
				description: localize('agentSandbox.macFileSystemSetting.allowRead', "Array of paths to re-allow read access within denied regions. Takes precedence over denyRead."),
				items: { type: 'string' },
				default: []
			},
			allowWrite: {
				type: 'array',
				description: localize('agentSandbox.macFileSystemSetting.allowWrite', "Array of additional paths to allow write access. Leave empty to disallow writes outside the workspace folders, workspace storage folder, and sandbox temp directory."),
				items: { type: 'string' },
				default: []
			},
			denyWrite: {
				type: 'array',
				description: localize('agentSandbox.macFileSystemSetting.denyWrite', "Array of paths to deny write access within allowed paths (takes precedence over allowWrite)."),
				items: { type: 'string' },
				default: []
			}
		},
		default: {
			denyRead: [],
			allowRead: [],
			allowWrite: [],
			denyWrite: []
		},
		tags: ['preview', 'chatPermissions'],
		restricted: true,
	},
	[TerminalChatAgentToolsSettingId.AgentSandboxAdvancedRuntime]: {
		markdownDescription: localize('agentSandbox.runtimeSetting', "Note: this setting is applicable only when {0} is enabled. Key/value pairs are passed through to the root of the sandbox runtime configuration.", `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``),
		markdownDeprecationMessage: localize('agentSandbox.runtimeSetting.deprecated', "This setting will be deprecated soon. It does not apply to the Copilot Agent Host sandbox."),
		deprecationMessageShowInSettings: true,
		type: 'object',
		default: {
			enableWeakerNestedSandbox: false
		},
		additionalProperties: true,
		tags: ['preview', 'chatPermissions'],
		restricted: true,
	},
	[TerminalChatAgentToolsSettingId.PreventShellHistory]: {
		type: 'boolean',
		default: true,
		markdownDescription: [
			localize('preventShellHistory.description', "Whether to exclude commands run by the terminal tool from the shell history. See below for the supported shells and the method used for each:"),
			`- \`bash\`: ${localize('preventShellHistory.description.bash', "Sets `HISTCONTROL=ignorespace` and prepends the command with space")}`,
			`- \`zsh\`: ${localize('preventShellHistory.description.zsh', "Sets `HIST_IGNORE_SPACE` option and prepends the command with space")}`,
			`- \`fish\`: ${localize('preventShellHistory.description.fish', "Sets `fish_private_mode` to prevent any command from entering history")}`,
			`- \`pwsh\`: ${localize('preventShellHistory.description.pwsh', "Sets a custom history handler via PSReadLine's `AddToHistoryHandler` to prevent any command from entering history")}`,
		].join('\n'),
	},
	[TerminalChatAgentToolsSettingId.EnforceTimeoutFromModel]: {
		restricted: true,
		type: 'boolean',
		default: true,
		tags: ['experimental'],
		experiment: {
			mode: 'auto'
		},
		markdownDescription: localize('enforceTimeoutFromModel.description', "Whether to enforce the timeout value provided by the model in the run in terminal tool. When enabled, if the model provides a timeout parameter, the tool will stop tracking the command after that duration and return the output collected so far."),
	},
	[TerminalChatAgentToolsSettingId.IdleSilenceTimeoutMs]: {
		restricted: true,
		type: 'number',
		default: DEFAULT_IDLE_SILENCE_TIMEOUT_MS,
		minimum: 0,
		tags: ['experimental'],
		experiment: {
			mode: 'auto'
		},
		markdownDescription: localize('idleSilenceTimeoutMs.description', "Number of milliseconds the run in terminal tool will wait for new output from a synchronous command before moving it to a background terminal and returning what was collected so far. The process is not killed — the tool returns the terminal ID so the model can poll, send input, or kill it. Set to {0} to disable.", '`0`'),
	},
	[TerminalChatAgentToolsSettingId.DetachBackgroundProcesses]: {
		included: false,
		restricted: true,
		type: 'boolean',
		default: false,
		tags: ['experimental'],
		markdownDescription: localize('detachBackgroundProcesses.description', "Whether to detach persistent terminal processes so they survive when VS Code exits. When enabled, commands started with `mode: \"async\"` (legacy: `isBackground: true`) are wrapped with `nohup` (POSIX) or `Start-Process` (Windows) so the process continues running after the terminal is disposed."),
	},
	[TerminalChatAgentToolsSettingId.BackgroundNotifications]: {
		restricted: true,
		type: 'boolean',
		default: true,
		tags: ['experimental'],
		deprecated: true,
		markdownDeprecationMessage: localize('backgroundNotifications.deprecated', "This setting is deprecated. Terminal completion and input-needed notifications are now always enabled."),
		markdownDescription: localize('backgroundNotifications.description', "This setting is deprecated and no longer has any effect. Terminal completion and input-needed notifications are now always enabled for any command that continues running after the tool returns."),
	},
	[TerminalChatAgentToolsSettingId.OutputDeltas]: {
		restricted: true,
		type: 'boolean',
		default: false,
		tags: ['experimental'],
		experiment: {
			mode: 'auto'
		},
		markdownDescription: localize('outputDeltas.description', "When enabled, repeated get terminal output tool calls return only output added since the previous poll for the same terminal execution, or a short unchanged-output message when there is no new output."),
	},
	[TerminalChatAgentToolsSettingId.OutputCompaction]: {
		restricted: true,
		type: 'boolean',
		default: false,
		tags: ['experimental'],
		experiment: {
			mode: 'auto'
		},
		markdownDescription: localize('outputCompaction.description', "When enabled, the output of commands run by the run in terminal tool is compacted before being returned to the model, reducing the number of tokens spent on noisy output (for example progress bars or repeated log lines) while preserving the important information."),
	}
};

for (const id of [
	TerminalChatAgentToolsSettingId.DeprecatedAutoApprove1,
	TerminalChatAgentToolsSettingId.DeprecatedAutoApprove2,
	TerminalChatAgentToolsSettingId.DeprecatedAutoApprove3,
	TerminalChatAgentToolsSettingId.DeprecatedAutoApprove4,
	TerminalChatAgentToolsSettingId.DeprecatedAutoApproveCompatible,
]) {
	terminalChatAgentToolsConfiguration[id] = {
		...(id === TerminalChatAgentToolsSettingId.DeprecatedAutoApproveCompatible ? { restricted: true } : {}),
		deprecated: true,
		markdownDeprecationMessage: localize('autoApprove.deprecated', 'Use {0} instead', `\`#${TerminalChatAgentToolsSettingId.AutoApprove}#\``)
	};
}
