/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon, getAllCodicons } from '../../../base/common/codicons.js';
import { IJSONSchema, IJSONSchemaMap } from '../../../base/common/jsonSchema.js';
import { OperatingSystem, Platform, PlatformToString } from '../../../base/common/platform.js';
import { localize } from '../../../nls.js';
import { ConfigurationScope, Extensions, IConfigurationNode, IConfigurationRegistry } from '../../configuration/common/configurationRegistry.js';
import { Registry } from '../../registry/common/platform.js';
import { IExtensionTerminalProfile, ITerminalProfile, TerminalSettingId } from './terminal.js';
import { createProfileSchemaEnums } from './terminalProfiles.js';

export const terminalColorSchema: IJSONSchema = {
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
};

export const terminalIconSchema: IJSONSchema = {
	type: 'string',
	enum: Array.from(getAllCodicons(), icon => icon.id),
	markdownEnumDescriptions: Array.from(getAllCodicons(), icon => `$(${icon.id})`),
};

export const terminalProfileBaseProperties: IJSONSchemaMap = {
	args: {
		description: localize('terminalProfile.args', 'An optional set of arguments to run the shell executable with.'),
		type: 'array',
		items: {
			type: 'string'
		}
	},
	icon: {
		description: localize('terminalProfile.icon', 'A codicon ID to associate with the terminal icon.'),
		...terminalIconSchema
	},
	color: {
		description: localize('terminalProfile.color', 'A theme color ID to associate with the terminal icon.'),
		...terminalColorSchema
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
		overrideName: {
			description: localize('terminalProfile.overrideName', 'Whether or not to replace the dynamic terminal title that detects what program is running with the static profile name.'),
			type: 'boolean'
		},
		...terminalProfileBaseProperties
	}
};

const terminalAutomationProfileSchema: IJSONSchema = {
	type: 'object',
	required: ['path'],
	properties: {
		path: {
			description: localize('terminalAutomationProfile.path', 'A path to a shell executable.'),
			type: ['string'],
			items: {
				type: 'string'
			}
		},
		...terminalProfileBaseProperties
	}
};

function createTerminalProfileMarkdownDescription(platform: Platform.Linux | Platform.Mac | Platform.Windows): string {
	const key = platform === Platform.Linux ? 'linux' : platform === Platform.Mac ? 'osx' : 'windows';
	return localize(
		{
			key: 'terminal.integrated.profile',
			comment: ['{0} is the platform, {1} is a code block, {2} and {3} are a link start and end']
		},
		"A set of terminal profile customizations for {0} which allows adding, removing or changing how terminals are launched. Profiles are made up of a mandatory path, optional arguments and other presentation options.\n\nTo override an existing profile use its profile name as the key, for example:\n\n{1}\n\n{2}Read more about configuring profiles{3}.",
		PlatformToString(platform),
		'```json\n"terminal.integrated.profile.' + key + '": {\n  "bash": null\n}\n```',
		'[',
		'](https://code.visualstudio.com/docs/terminal/profiles)'
	);
}

const terminalPlatformConfiguration: IConfigurationNode = {
	id: 'terminal',
	order: 100,
	title: localize('terminalIntegratedConfigurationTitle', "Integrated Terminal"),
	type: 'object',
	properties: {
		[TerminalSettingId.AutomationProfileLinux]: {
			restricted: true,
			markdownDescription: localize('terminal.integrated.automationProfile.linux', "The terminal profile to use on Linux for automation-related terminal usage like tasks and debug."),
			type: ['object', 'null'],
			default: null,
			'anyOf': [
				{ type: 'null' },
				terminalAutomationProfileSchema
			],
			defaultSnippets: [
				{
					body: {
						path: '${1}',
						icon: '${2}'
					}
				}
			]
		},
		[TerminalSettingId.AutomationProfileMacOs]: {
			restricted: true,
			markdownDescription: localize('terminal.integrated.automationProfile.osx', "The terminal profile to use on macOS for automation-related terminal usage like tasks and debug."),
			type: ['object', 'null'],
			default: null,
			'anyOf': [
				{ type: 'null' },
				terminalAutomationProfileSchema
			],
			defaultSnippets: [
				{
					body: {
						path: '${1}',
						icon: '${2}'
					}
				}
			]
		},
		[TerminalSettingId.AutomationProfileWindows]: {
			restricted: true,
			markdownDescription: localize('terminal.integrated.automationProfile.windows', "The terminal profile to use for automation-related terminal usage like tasks and debug. This setting will currently be ignored if {0} (now deprecated) is set.", '`terminal.integrated.automationShell.windows`'),
			type: ['object', 'null'],
			default: null,
			'anyOf': [
				{ type: 'null' },
				terminalAutomationProfileSchema
			],
			defaultSnippets: [
				{
					body: {
						path: '${1}',
						icon: '${2}'
					}
				}
			]
		},
		[TerminalSettingId.ProfilesWindows]: {
			restricted: true,
			markdownDescription: createTerminalProfileMarkdownDescription(Platform.Windows),
			type: 'object',
			default: {
				'PowerShell': {
					source: 'PowerShell',
					icon: Codicon.terminalPowershell.id,
				},
				'Command Prompt': {
					path: [
						'${env:windir}\\Sysnative\\cmd.exe',
						'${env:windir}\\System32\\cmd.exe'
					],
					args: [],
					icon: Codicon.terminalCmd,
				},
				'Git Bash': {
					source: 'Git Bash',
					icon: Codicon.terminalGitBash.id,
				}
			},
			additionalProperties: {
				'anyOf': [
					{
						type: 'object',
						required: ['source'],
						properties: {
							source: {
								description: localize('terminalProfile.windowsSource', 'A profile source that will auto detect the paths to the shell. Note that non-standard executable locations are not supported and must be created manually in a new profile.'),
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
			markdownDescription: createTerminalProfileMarkdownDescription(Platform.Mac),
			type: 'object',
			default: {
				'bash': {
					path: 'bash',
					args: ['-l'],
					icon: Codicon.terminalBash.id
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
					icon: Codicon.terminalTmux.id
				},
				'pwsh': {
					path: 'pwsh',
					icon: Codicon.terminalPowershell.id
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
			markdownDescription: createTerminalProfileMarkdownDescription(Platform.Linux),
			type: 'object',
			default: {
				'bash': {
					path: 'bash',
					icon: Codicon.terminalBash.id
				},
				'zsh': {
					path: 'zsh'
				},
				'fish': {
					path: 'fish'
				},
				'tmux': {
					path: 'tmux',
					icon: Codicon.terminalTmux.id
				},
				'pwsh': {
					path: 'pwsh',
					icon: Codicon.terminalPowershell.id
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
		[TerminalSettingId.ShowLinkHover]: {
			scope: ConfigurationScope.APPLICATION,
			description: localize('terminal.integrated.showLinkHover', "Whether to show hovers for links in the terminal output."),
			type: 'boolean',
			default: true
		},
		[TerminalSettingId.IgnoreProcessNames]: {
			markdownDescription: localize('terminal.integrated.confirmIgnoreProcesses', "A set of process names to ignore when using the {0} setting.", '`#terminal.integrated.confirmOnKill#`'),
			type: 'array',
			items: {
				type: 'string',
				uniqueItems: true
			},
			default: [
				// Popular prompt programs, these should not count as child processes
				'starship',
				'oh-my-posh',
				// Git bash may runs a subprocess of itself (bin\bash.exe -> usr\bin\bash.exe)
				'bash',
				'zsh',
			]
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

let defaultProfilesConfiguration: IConfigurationNode | undefined;
export function registerTerminalDefaultProfileConfiguration(detectedProfiles?: { os: OperatingSystem; profiles: ITerminalProfile[] }, extensionContributedProfiles?: readonly IExtensionTerminalProfile[]) {
	const registry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
	let profileEnum;
	if (detectedProfiles) {
		profileEnum = createProfileSchemaEnums(detectedProfiles?.profiles, extensionContributedProfiles);
	}
	const oldDefaultProfilesConfiguration = defaultProfilesConfiguration;
	defaultProfilesConfiguration = {
		id: 'terminal',
		order: 100,
		title: localize('terminalIntegratedConfigurationTitle', "Integrated Terminal"),
		type: 'object',
		properties: {
			[TerminalSettingId.DefaultProfileLinux]: {
				restricted: true,
				markdownDescription: localize('terminal.integrated.defaultProfile.linux', "The default terminal profile on Linux."),
				type: ['string', 'null'],
				default: null,
				enum: detectedProfiles?.os === OperatingSystem.Linux ? profileEnum?.values : undefined,
				markdownEnumDescriptions: detectedProfiles?.os === OperatingSystem.Linux ? profileEnum?.markdownDescriptions : undefined
			},
			[TerminalSettingId.DefaultProfileMacOs]: {
				restricted: true,
				markdownDescription: localize('terminal.integrated.defaultProfile.osx', "The default terminal profile on macOS."),
				type: ['string', 'null'],
				default: null,
				enum: detectedProfiles?.os === OperatingSystem.Macintosh ? profileEnum?.values : undefined,
				markdownEnumDescriptions: detectedProfiles?.os === OperatingSystem.Macintosh ? profileEnum?.markdownDescriptions : undefined
			},
			[TerminalSettingId.DefaultProfileWindows]: {
				restricted: true,
				markdownDescription: localize('terminal.integrated.defaultProfile.windows', "The default terminal profile on Windows."),
				type: ['string', 'null'],
				default: null,
				enum: detectedProfiles?.os === OperatingSystem.Windows ? profileEnum?.values : undefined,
				markdownEnumDescriptions: detectedProfiles?.os === OperatingSystem.Windows ? profileEnum?.markdownDescriptions : undefined
			},
		}
	};
	registry.updateConfigurations({ add: [defaultProfilesConfiguration], remove: oldDefaultProfilesConfiguration ? [oldDefaultProfilesConfiguration] : [] });
}
