/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IStringDictionary } from '../../../../../base/common/collections.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationPropertySchema, IConfigurationNode, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import product from '../../../../../platform/product/common/product.js';
import { TerminalSettingId } from '../../../../../platform/terminal/common/terminal.js';

export const enum TerminalSuggestSettingId {
	Enabled = 'terminal.integrated.suggest.enabled',
	QuickSuggestions = 'terminal.integrated.suggest.quickSuggestions',
	SuggestOnTriggerCharacters = 'terminal.integrated.suggest.suggestOnTriggerCharacters',
	RunOnEnter = 'terminal.integrated.suggest.runOnEnter',
	WindowsExecutableExtensions = 'terminal.integrated.suggest.windowsExecutableExtensions',
	Providers = 'terminal.integrated.suggest.providers',
	ShowStatusBar = 'terminal.integrated.suggest.showStatusBar',
	CdPath = 'terminal.integrated.suggest.cdPath',
	InlineSuggestion = 'terminal.integrated.suggest.inlineSuggestion',
	UpArrowNavigatesHistory = 'terminal.integrated.suggest.upArrowNavigatesHistory',
	SelectionMode = 'terminal.integrated.suggest.selectionMode',
	InsertTrailingSpace = 'terminal.integrated.suggest.insertTrailingSpace',
}

export const windowsDefaultExecutableExtensions: string[] = [
	'exe',   // Executable file
	'bat',   // Batch file
	'cmd',   // Command script
	'com',   // Command file

	'msi',   // Windows Installer package

	'ps1',   // PowerShell script

	'vbs',   // VBScript file
	'js',    // JScript file
	'jar',   // Java Archive (requires Java runtime)
	'py',    // Python script (requires Python interpreter)
	'rb',    // Ruby script (requires Ruby interpreter)
	'pl',    // Perl script (requires Perl interpreter)
	'sh',    // Shell script (via WSL or third-party tools)
];

export const terminalSuggestConfigSection = 'terminal.integrated.suggest';

export interface ITerminalSuggestConfiguration {
	enabled: boolean;
	quickSuggestions: {
		commands: 'off' | 'on';
		arguments: 'off' | 'on';
		unknown: 'off' | 'on';
	};
	suggestOnTriggerCharacters: boolean;
	runOnEnter: 'never' | 'exactMatch' | 'exactMatchIgnoreExtension' | 'always';
	windowsExecutableExtensions: { [key: string]: boolean };
	providers: { [key: string]: boolean };
	showStatusBar: boolean;
	cdPath: 'off' | 'relative' | 'absolute';
	inlineSuggestion: 'off' | 'alwaysOnTopExceptExactMatch' | 'alwaysOnTop';
	insertTrailingSpace: boolean;
}

export const terminalSuggestConfiguration: IStringDictionary<IConfigurationPropertySchema> = {
	[TerminalSuggestSettingId.Enabled]: {
		restricted: true,
		markdownDescription: localize('suggest.enabled', "Enables terminal intellisense suggestions (preview) for supported shells ({0}) when {1} is set to {2}.", 'PowerShell v7+, zsh, bash, fish', `\`#${TerminalSettingId.ShellIntegrationEnabled}#\``, '`true`'),
		type: 'boolean',
		default: product.quality !== 'stable',
		experiment: {
			mode: 'auto',
		},
	},
	[TerminalSuggestSettingId.Providers]: {
		restricted: true,
		markdownDescription: localize('suggest.providers', "Providers are enabled by default. Omit them by setting the id of the provider to `false`."),
		type: 'object',
		properties: {},
	},
	[TerminalSuggestSettingId.QuickSuggestions]: {
		restricted: true,
		markdownDescription: localize('suggest.quickSuggestions', "Controls whether suggestions should automatically show up while typing. Also be aware of the {0}-setting which controls if suggestions are triggered by special characters.", `\`#${TerminalSuggestSettingId.SuggestOnTriggerCharacters}#\``),
		type: 'object',
		properties: {
			commands: {
				description: localize('suggest.quickSuggestions.commands', 'Enable quick suggestions for commands, the first word in a command line input.'),
				type: 'string',
				enum: ['off', 'on'],
			},
			arguments: {
				description: localize('suggest.quickSuggestions.arguments', 'Enable quick suggestions for arguments, anything after the first word in a command line input.'),
				type: 'string',
				enum: ['off', 'on'],
			},
			unknown: {
				description: localize('suggest.quickSuggestions.unknown', 'Enable quick suggestions when it\'s unclear what the best suggestion is, if this is on files and folders will be suggested as a fallback.'),
				type: 'string',
				enum: ['off', 'on'],
			},
		},
		default: {
			commands: 'on',
			arguments: 'on',
			unknown: 'off',
		},
	},
	[TerminalSuggestSettingId.SuggestOnTriggerCharacters]: {
		restricted: true,
		markdownDescription: localize('suggest.suggestOnTriggerCharacters', "Controls whether suggestions should automatically show up when typing trigger characters."),
		type: 'boolean',
		default: true,
	},
	[TerminalSuggestSettingId.RunOnEnter]: {
		restricted: true,
		markdownDescription: localize('suggest.runOnEnter', "Controls whether suggestions should run immediately when `Enter` (not `Tab`) is used to accept the result."),
		enum: ['never', 'exactMatch', 'exactMatchIgnoreExtension', 'always'],
		markdownEnumDescriptions: [
			localize('runOnEnter.never', "Never run on `Enter`."),
			localize('runOnEnter.exactMatch', "Run on `Enter` when the suggestion is typed in its entirety."),
			localize('runOnEnter.exactMatchIgnoreExtension', "Run on `Enter` when the suggestion is typed in its entirety or when a file is typed without its extension included."),
			localize('runOnEnter.always', "Always run on `Enter`.")
		],
		default: 'never',
	},
	[TerminalSuggestSettingId.SelectionMode]: {
		markdownDescription: localize('terminal.integrated.selectionMode', "Controls how suggestion selection works in the integrated terminal."),
		type: 'string',
		enum: ['partial', 'always', 'never'],
		markdownEnumDescriptions: [
			localize('terminal.integrated.selectionMode.partial', "Partially select a suggestion when automatically triggering IntelliSense. `Tab` can be used to accept the first suggestion, only after navigating the suggestions via `Down` will `Enter` also accept the active suggestion."),
			localize('terminal.integrated.selectionMode.always', "Always select a suggestion when automatically triggering IntelliSense. `Enter` or `Tab` can be used to accept the first suggestion."),
			localize('terminal.integrated.selectionMode.never', "Never select a suggestion when automatically triggering IntelliSense. The list must be navigated via `Down` before `Enter` or `Tab` can be used to accept the active suggestion."),
		],
		default: 'partial',
	},
	[TerminalSuggestSettingId.WindowsExecutableExtensions]: {
		restricted: true,
		markdownDescription: localize("terminalWindowsExecutableSuggestionSetting", "A set of windows command executable extensions that will be included as suggestions in the terminal.\n\nMany executables are included by default, listed below:\n\n{0}.\n\nTo exclude an extension, set it to `false`\n\n. To include one not in the list, add it and set it to `true`.",
			windowsDefaultExecutableExtensions.sort().map(extension => `- ${extension}`).join('\n'),
		),
		type: 'object',
		default: {},
	},
	[TerminalSuggestSettingId.ShowStatusBar]: {
		restricted: true,
		markdownDescription: localize('suggest.showStatusBar', "Controls whether the terminal suggestions status bar should be shown."),
		type: 'boolean',
		default: true,
	},
	[TerminalSuggestSettingId.CdPath]: {
		restricted: true,
		markdownDescription: localize('suggest.cdPath', "Controls whether to enable $CDPATH support which exposes children of the folders in the $CDPATH variable regardless of the current working directory. $CDPATH is expected to be semi colon-separated on Windows and colon-separated on other platforms."),
		type: 'string',
		enum: ['off', 'relative', 'absolute'],
		markdownEnumDescriptions: [
			localize('suggest.cdPath.off', "Disable the feature."),
			localize('suggest.cdPath.relative', "Enable the feature and use relative paths."),
			localize('suggest.cdPath.absolute', "Enable the feature and use absolute paths. This is useful when the shell doesn't natively support `$CDPATH`."),
		],
		default: 'absolute',
	},
	[TerminalSuggestSettingId.InlineSuggestion]: {
		restricted: true,
		markdownDescription: localize('suggest.inlineSuggestion', "Controls whether the shell's inline suggestion should be detected and how it is scored."),
		type: 'string',
		enum: ['off', 'alwaysOnTopExceptExactMatch', 'alwaysOnTop'],
		markdownEnumDescriptions: [
			localize('suggest.inlineSuggestion.off', "Disable the feature."),
			localize('suggest.inlineSuggestion.alwaysOnTopExceptExactMatch', "Enable the feature and sort the inline suggestion without forcing it to be on top. This means that exact matches will be will be above the inline suggestion."),
			localize('suggest.inlineSuggestion.alwaysOnTop', "Enable the feature and always put the inline suggestion on top."),
		],
		default: 'alwaysOnTop',
	},
	[TerminalSuggestSettingId.UpArrowNavigatesHistory]: {
		restricted: true,
		markdownDescription: localize('suggest.upArrowNavigatesHistory', "Determines whether the up arrow key navigates the command history when focus is on the first suggestion and navigation has not yet occurred. When set to false, the up arrow will move focus to the last suggestion instead."),
		type: 'boolean',
		default: true,
	},
	[TerminalSuggestSettingId.InsertTrailingSpace]: {
		restricted: true,
		markdownDescription: localize('suggest.insertTrailingSpace', "Controls whether a space is automatically inserted after accepting a suggestion and re-trigger suggestions. Folders and symbolic link folders will never have a trailing space added."),
		type: 'boolean',
		default: false,
	},

};

export interface ITerminalSuggestProviderInfo {
	id: string;
	description?: string;
}

let terminalSuggestProvidersConfiguration: IConfigurationNode | undefined;

export function registerTerminalSuggestProvidersConfiguration(providers?: Map<string, ITerminalSuggestProviderInfo>) {
	const oldProvidersConfiguration = terminalSuggestProvidersConfiguration;

	providers ??= new Map();
	if (!providers.has('lsp')) {
		providers.set('lsp', {
			id: 'lsp',
			description: localize('suggest.provider.lsp.description', 'Show suggestions from language servers.')
		});
	}

	const providersProperties: IStringDictionary<IConfigurationPropertySchema> = {};
	for (const id of Array.from(providers.keys()).sort()) {
		providersProperties[id] = {
			type: 'boolean',
			default: true,
			description:
				providers.get(id)?.description ??
				localize('suggest.provider.title', "Show suggestions from {0}.", id)
		};
	}

	const defaultValue: IStringDictionary<boolean> = {};
	for (const key in providersProperties) {
		defaultValue[key] = providersProperties[key].default as boolean;
	}

	terminalSuggestProvidersConfiguration = {
		id: 'terminalSuggestProviders',
		order: 100,
		title: localize('terminalSuggestProvidersConfigurationTitle', "Terminal Suggest Providers"),
		type: 'object',
		properties: {
			[TerminalSuggestSettingId.Providers]: {
				restricted: true,
				markdownDescription: localize('suggest.providersEnabledByDefault', "Controls which suggestions automatically show up while typing. Suggestion providers are enabled by default."),
				type: 'object',
				properties: providersProperties,
				default: defaultValue,
				tags: ['preview'],
				additionalProperties: false
			}
		}
	};

	const registry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
	registry.updateConfigurations({
		add: [terminalSuggestProvidersConfiguration],
		remove: oldProvidersConfiguration ? [oldProvidersConfiguration] : []
	});
}

registerTerminalSuggestProvidersConfiguration();
