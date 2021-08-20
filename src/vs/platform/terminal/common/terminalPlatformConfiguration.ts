/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { iconRegistry } from 'vs/base/common/codicons';
import { IJSONSchema, IJSONSchemaMap } from 'vs/base/common/jsonSchema';
import { OperatingSystem } from 'vs/base/common/platform';
import { localize } from 'vs/nls';
import { ConfigurationScope, Extensions, IConfigurationNode, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { IExtensionTerminalProfile, ITerminalProfile, TerminalSettingId } from 'vs/platform/terminal/common/terminal';
import { createProfileSchemaEnums } from 'vs/platform/terminal/common/terminalProfiles';

const terminalProfileBaseProperties: IJSONSchemaMap = {
	args: {
		description: localize('terminalProfile.args', 'An optional set of arguments to run the shell executable with.'),
		type: 'array',
		items: {
			type: 'string'
		}
	},
	overrideName: {
		description: localize('terminalProfile.overrideName', 'Controls whether or not the profile name overrides the auto detected one.'),
		type: 'boolean'
	},
	icon: {
		description: localize('terminalProfile.icon', 'A codicon ID to associate with this terminal.'),
		type: 'string',
		enum: Array.from(iconRegistry.all, icon => icon.id),
		markdownEnumDescriptions: Array.from(iconRegistry.all, icon => `$(${icon.id})`),
	},
	color: {
		description: localize('terminalProfile.color', 'A theme color ID to associate with this terminal.'),
		type: ['string', 'null'],
		enum: [
			'terminal.ansiBlack',
			'terminal.ansiRed',
			'terminal.ansiGreen',
			'terminal.ansiYellow',
			'terminal.ansiBlue',
			'terminal.ansiMagenta',
			'terminal.ansiCyan',
			'terminal.ansiWhite'
		],
		default: null
	},
	env: {
		markdownDescription: localize('terminalProfile.env', "An object with environment variables that will be added to the terminal profile process. Set to `null` to delete environment variables from the base environment."),
		type: 'object',
		additionalProperties: {
			type: ['string', 'null']
		},
		default: {}
	}
};

const terminalProfileSchema: IJSONSchema = {
	type: 'object',
	required: ['path'],
	properties: {
		path: {
			description: localize('terminalProfile.path', 'A single path to a shell executable or an array of paths that will be used as fallbacks when one fails.'),
			type: ['string', 'array'],
			items: {
				type: 'string'
			}
		},
		...terminalProfileBaseProperties
	}
};

const shellDeprecationMessageLinux = localize('terminal.integrated.shell.linux.deprecation', "This is deprecated, the new recommended way to configure your default shell is by creating a terminal profile in {0} and setting its profile name as the default in {1}. This will currently take priority over the new profiles settings but that will change in the future.", '`#terminal.integrated.profiles.linux#`', '`#terminal.integrated.defaultProfile.linux#`');
const shellDeprecationMessageOsx = localize('terminal.integrated.shell.osx.deprecation', "This is deprecated, the new recommended way to configure your default shell is by creating a terminal profile in {0} and setting its profile name as the default in {1}. This will currently take priority over the new profiles settings but that will change in the future.", '`#terminal.integrated.profiles.osx#`', '`#terminal.integrated.defaultProfile.osx#`');
const shellDeprecationMessageWindows = localize('terminal.integrated.shell.windows.deprecation', "This is deprecated, the new recommended way to configure your default shell is by creating a terminal profile in {0} and setting its profile name as the default in {1}. This will currently take priority over the new profiles settings but that will change in the future.", '`#terminal.integrated.profiles.windows#`', '`#terminal.integrated.defaultProfile.windows#`');

const terminalPlatformConfiguration: IConfigurationNode = {
	id: 'terminal',
	order: 100,
	title: localize('terminalIntegratedConfigurationTitle', "Integrated Terminal"),
	type: 'object',
	properties: {
		[TerminalSettingId.AutomationShellLinux]: {
			restricted: true,
			markdownDescription: localize({
				key: 'terminal.integrated.automationShell.linux',
				comment: ['{0} and {1} are the `shell` and `shellArgs` settings keys']
			}, "A path that when set will override {0} and ignore {1} values for automation-related terminal usage like tasks and debug.", '`terminal.integrated.shell.linux`', '`shellArgs`'),
			type: ['string', 'null'],
			default: null
		},
		[TerminalSettingId.AutomationShellMacOs]: {
			restricted: true,
			markdownDescription: localize({
				key: 'terminal.integrated.automationShell.osx',
				comment: ['{0} and {1} are the `shell` and `shellArgs` settings keys']
			}, "A path that when set will override {0} and ignore {1} values for automation-related terminal usage like tasks and debug.", '`terminal.integrated.shell.osx`', '`shellArgs`'),
			type: ['string', 'null'],
			default: null
		},
		[TerminalSettingId.AutomationShellWindows]: {
			restricted: true,
			markdownDescription: localize({
				key: 'terminal.integrated.automationShell.windows',
				comment: ['{0} and {1} are the `shell` and `shellArgs` settings keys']
			}, "A path that when set will override {0} and ignore {1} values for automation-related terminal usage like tasks and debug.", '`terminal.integrated.shell.windows`', '`shellArgs`'),
			type: ['string', 'null'],
			default: null
		},
		[TerminalSettingId.ShellLinux]: {
			restricted: true,
			markdownDescription: localize('terminal.integrated.shell.linux', "The path of the shell that the terminal uses on Linux. [Read more about configuring the shell](https://code.visualstudio.com/docs/editor/integrated-terminal#_terminal-profiles)."),
			type: ['string', 'null'],
			default: null,
			markdownDeprecationMessage: shellDeprecationMessageLinux
		},
		[TerminalSettingId.ShellMacOs]: {
			restricted: true,
			markdownDescription: localize('terminal.integrated.shell.osx', "The path of the shell that the terminal uses on macOS. [Read more about configuring the shell](https://code.visualstudio.com/docs/editor/integrated-terminal#_terminal-profiles)."),
			type: ['string', 'null'],
			default: null,
			markdownDeprecationMessage: shellDeprecationMessageOsx
		},
		[TerminalSettingId.ShellWindows]: {
			restricted: true,
			markdownDescription: localize('terminal.integrated.shell.windows', "The path of the shell that the terminal uses on Windows. [Read more about configuring the shell](https://code.visualstudio.com/docs/editor/integrated-terminal#_terminal-profiles)."),
			type: ['string', 'null'],
			default: null,
			markdownDeprecationMessage: shellDeprecationMessageWindows
		},
		[TerminalSettingId.ShellArgsLinux]: {
			restricted: true,
			markdownDescription: localize('terminal.integrated.shellArgs.linux', "The command line arguments to use when on the Linux terminal. [Read more about configuring the shell](https://code.visualstudio.com/docs/editor/integrated-terminal#_terminal-profiles)."),
			type: 'array',
			items: {
				type: 'string'
			},
			default: [],
			markdownDeprecationMessage: shellDeprecationMessageLinux
		},
		[TerminalSettingId.ShellArgsMacOs]: {
			restricted: true,
			markdownDescription: localize('terminal.integrated.shellArgs.osx', "The command line arguments to use when on the macOS terminal. [Read more about configuring the shell](https://code.visualstudio.com/docs/editor/integrated-terminal#_terminal-profiles)."),
			type: 'array',
			items: {
				type: 'string'
			},
			// Unlike on Linux, ~/.profile is not sourced when logging into a macOS session. This
			// is the reason terminals on macOS typically run login shells by default which set up
			// the environment. See http://unix.stackexchange.com/a/119675/115410
			default: ['-l'],
			markdownDeprecationMessage: shellDeprecationMessageOsx
		},
		[TerminalSettingId.ShellArgsWindows]: {
			restricted: true,
			markdownDescription: localize('terminal.integrated.shellArgs.windows', "The command line arguments to use when on the Windows terminal. [Read more about configuring the shell](https://code.visualstudio.com/docs/editor/integrated-terminal#_terminal-profiles)."),
			'anyOf': [
				{
					type: 'array',
					items: {
						type: 'string',
						markdownDescription: localize('terminal.integrated.shellArgs.windows', "The command line arguments to use when on the Windows terminal. [Read more about configuring the shell](https://code.visualstudio.com/docs/editor/integrated-terminal#_terminal-profiles).")
					},
				},
				{
					type: 'string',
					markdownDescription: localize('terminal.integrated.shellArgs.windows.string', "The command line arguments in [command-line format](https://msdn.microsoft.com/en-au/08dfcab2-eb6e-49a4-80eb-87d4076c98c6) to use when on the Windows terminal. [Read more about configuring the shell](https://code.visualstudio.com/docs/editor/integrated-terminal#_terminal-profiles).")
				}
			],
			default: [],
			markdownDeprecationMessage: shellDeprecationMessageWindows
		},
		[TerminalSettingId.ProfilesWindows]: {
			restricted: true,
			markdownDescription: localize(
				{
					key: 'terminal.integrated.profiles.windows',
					comment: ['{0}, {1}, and {2} are the `source`, `path` and optional `args` settings keys']
				},
				"The Windows profiles to present when creating a new terminal via the terminal dropdown. Set to null to exclude them, use the {0} property to use the default detected configuration. Or, set the {1} and optional {2}", '`source`', '`path`', '`args`.'
			),
			type: 'object',
			default: {
				'PowerShell': {
					source: 'PowerShell',
					icon: 'terminal-powershell'
				},
				'Command Prompt': {
					path: [
						'${env:windir}\\Sysnative\\cmd.exe',
						'${env:windir}\\System32\\cmd.exe'
					],
					args: [],
					icon: 'terminal-cmd'
				},
				'Git Bash': {
					source: 'Git Bash'
				}
			},
			additionalProperties: {
				'anyOf': [
					{
						type: 'object',
						required: ['source'],
						properties: {
							source: {
								description: localize('terminalProfile.windowsSource', 'A profile source that will auto detect the paths to the shell.'),
								enum: ['PowerShell', 'Git Bash']
							},
							...terminalProfileBaseProperties
						}
					},
					{
						type: 'object',
						required: ['extensionIdentifier', 'id', 'title'],
						properties: {
							extensionIdentifier: {
								description: localize('terminalProfile.windowsExtensionIdentifier', 'The extension that contributed this profile.'),
								type: 'string'
							},
							id: {
								description: localize('terminalProfile.windowsExtensionId', 'The id of the extension terminal'),
								type: 'string'
							},
							title: {
								description: localize('terminalProfile.windowsExtensionTitle', 'The name of the extension terminal'),
								type: 'string'
							},
							...terminalProfileBaseProperties
						}
					},
					{ type: 'null' },
					terminalProfileSchema
				]
			}
		},
		[TerminalSettingId.ProfilesMacOs]: {
			restricted: true,
			markdownDescription: localize(
				{
					key: 'terminal.integrated.profile.osx',
					comment: ['{0} and {1} are the `path` and optional `args` settings keys']
				},
				"The macOS profiles to present when creating a new terminal via the terminal dropdown. When set, these will override the default detected profiles. They are comprised of a {0} and optional {1}", '`path`', '`args`.'
			),
			type: 'object',
			default: {
				'bash': {
					path: 'bash',
					args: ['-l'],
					icon: 'terminal-bash'
				},
				'zsh': {
					path: 'zsh',
					args: ['-l']
				},
				'fish': {
					path: 'fish',
					args: ['-l']
				},
				'tmux': {
					path: 'tmux',
					icon: 'terminal-tmux'
				},
				'pwsh': {
					path: 'pwsh',
					icon: 'terminal-powershell'
				}
			},
			additionalProperties: {
				'anyOf': [
					{
						type: 'object',
						required: ['extensionIdentifier', 'id', 'title'],
						properties: {
							extensionIdentifier: {
								description: localize('terminalProfile.osxExtensionIdentifier', 'The extension that contributed this profile.'),
								type: 'string'
							},
							id: {
								description: localize('terminalProfile.osxExtensionId', 'The id of the extension terminal'),
								type: 'string'
							},
							title: {
								description: localize('terminalProfile.osxExtensionTitle', 'The name of the extension terminal'),
								type: 'string'
							},
							...terminalProfileBaseProperties
						}
					},
					{ type: 'null' },
					terminalProfileSchema
				]
			}
		},
		[TerminalSettingId.ProfilesLinux]: {
			restricted: true,
			markdownDescription: localize(
				{
					key: 'terminal.integrated.profile.linux',
					comment: ['{0} and {1} are the `path` and optional `args` settings keys']
				},
				"The Linux profiles to present when creating a new terminal via the terminal dropdown. When set, these will override the default detected profiles. They are comprised of a {0} and optional {1}", '`path`', '`args`.'
			),
			type: 'object',
			default: {
				'bash': {
					path: 'bash',
					icon: 'terminal-bash'
				},
				'zsh': {
					path: 'zsh'
				},
				'fish': {
					path: 'fish'
				},
				'tmux': {
					path: 'tmux',
					icon: 'terminal-tmux'
				},
				'pwsh': {
					path: 'pwsh',
					icon: 'terminal-powershell'
				}
			},
			additionalProperties: {
				'anyOf': [
					{
						type: 'object',
						required: ['extensionIdentifier', 'id', 'title'],
						properties: {
							extensionIdentifier: {
								description: localize('terminalProfile.linuxExtensionIdentifier', 'The extension that contributed this profile.'),
								type: 'string'
							},
							id: {
								description: localize('terminalProfile.linuxExtensionId', 'The id of the extension terminal'),
								type: 'string'
							},
							title: {
								description: localize('terminalProfile.linuxExtensionTitle', 'The name of the extension terminal'),
								type: 'string'
							},
							...terminalProfileBaseProperties
						}
					},
					{ type: 'null' },
					terminalProfileSchema
				]
			}
		},
		[TerminalSettingId.UseWslProfiles]: {
			description: localize('terminal.integrated.useWslProfiles', 'Controls whether or not WSL distros are shown in the terminal dropdown'),
			type: 'boolean',
			default: true
		},
		[TerminalSettingId.InheritEnv]: {
			scope: ConfigurationScope.APPLICATION,
			description: localize('terminal.integrated.inheritEnv', "Whether new shells should inherit their environment from VS Code, which may source a login shell to ensure $PATH and other development variables are initialized. This has no effect on Windows."),
			type: 'boolean',
			default: true
		},
		[TerminalSettingId.PersistentSessionScrollback]: {
			scope: ConfigurationScope.APPLICATION,
			markdownDescription: localize('terminal.integrated.persistentSessionScrollback', "Controls the maximum amount of lines that will be restored when reconnecting to a persistent terminal session. Increasing this will restore more lines of scrollback at the cost of more memory and increase the time it takes to connect to terminals on start up. This setting requires a restart to take effect and should be set to a value less than or equal to `#terminal.integrated.scrollback#`."),
			type: 'number',
			default: 100
		},
		[TerminalSettingId.PersistentSessionExperimentalSerializer]: {
			scope: ConfigurationScope.APPLICATION,
			description: localize('terminal.integrated.persistentSessionExperimentalSerializer', "Whether to use a more efficient experimental approach for restoring the terminal's buffer. This setting requires a restart to take effect."),
			type: 'boolean',
			default: true
		},
		[TerminalSettingId.ShowLinkHover]: {
			scope: ConfigurationScope.APPLICATION,
			description: localize('terminal.integrated.showLinkHover', "Whether to show hovers for links in the terminal output."),
			type: 'boolean',
			default: true
		}
	}
};

/**
 * Registers terminal configurations required by shared process and remote server.
 */
export function registerTerminalPlatformConfiguration() {
	Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration(terminalPlatformConfiguration);
	registerTerminalDefaultProfileConfiguration();
}

let lastDefaultProfilesConfiguration: IConfigurationNode | undefined;
export function registerTerminalDefaultProfileConfiguration(detectedProfiles?: { os: OperatingSystem, profiles: ITerminalProfile[] }, extensionContributedProfiles?: readonly IExtensionTerminalProfile[]) {
	const registry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
	if (lastDefaultProfilesConfiguration) {
		registry.deregisterConfigurations([lastDefaultProfilesConfiguration]);
	}
	let profileEnum;
	if (detectedProfiles) {
		profileEnum = createProfileSchemaEnums(detectedProfiles?.profiles, extensionContributedProfiles);
	}
	lastDefaultProfilesConfiguration = {
		id: 'terminal',
		order: 100,
		title: localize('terminalIntegratedConfigurationTitle', "Integrated Terminal"),
		type: 'object',
		properties: {
			[TerminalSettingId.DefaultProfileLinux]: {
				restricted: true,
				markdownDescription: localize('terminal.integrated.defaultProfile.linux', "The default profile used on Linux. This setting will currently be ignored if either {0} or {1} are set.", '`terminal.integrated.shell.linux`', '`terminal.integrated.shellArgs.linux`'),
				type: ['string', 'null'],
				default: null,
				enum: detectedProfiles?.os === OperatingSystem.Linux ? profileEnum?.values : undefined,
				markdownEnumDescriptions: detectedProfiles?.os === OperatingSystem.Linux ? profileEnum?.markdownDescriptions : undefined
			},
			[TerminalSettingId.DefaultProfileMacOs]: {
				restricted: true,
				markdownDescription: localize('terminal.integrated.defaultProfile.osx', "The default profile used on macOS. This setting will currently be ignored if either {0} or {1} are set.", '`terminal.integrated.shell.osx`', '`terminal.integrated.shellArgs.osx`'),
				type: ['string', 'null'],
				default: null,
				enum: detectedProfiles?.os === OperatingSystem.Macintosh ? profileEnum?.values : undefined,
				markdownEnumDescriptions: detectedProfiles?.os === OperatingSystem.Macintosh ? profileEnum?.markdownDescriptions : undefined
			},
			[TerminalSettingId.DefaultProfileWindows]: {
				restricted: true,
				markdownDescription: localize('terminal.integrated.defaultProfile.windows', "The default profile used on Windows. This setting will currently be ignored if either {0} or {1} are set.", '`terminal.integrated.shell.windows`', '`terminal.integrated.shellArgs.windows`'),
				type: ['string', 'null'],
				default: null,
				enum: detectedProfiles?.os === OperatingSystem.Windows ? profileEnum?.values : undefined,
				markdownEnumDescriptions: detectedProfiles?.os === OperatingSystem.Windows ? profileEnum?.markdownDescriptions : undefined
			},
		}
	};
	registry.registerConfiguration(lastDefaultProfilesConfiguration);
}
