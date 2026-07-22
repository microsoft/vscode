/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TelemetryData } from '../telemetry';

/** The prefix used for related plugin version headers. */
const CopilotRelatedPluginVersionPrefix = 'X-Copilot-RelatedPluginVersion-';

/** The filter headers that ExP knows about. */
export enum Filter {
	// Default VSCode filters

	ExtensionRelease = 'X-VSCode-ExtensionRelease',

	// Copilot-specific filters

	/** The machine ID concatenated with a 1-hour bucket. */
	CopilotClientTimeBucket = 'X-Copilot-ClientTimeBucket',
	/** The model currently in use. Not included in fallback filters */
	CopilotEngine = 'X-Copilot-Engine',
	/** The engine override value from settings, if present. */
	CopilotOverrideEngine = 'X-Copilot-OverrideEngine',
	/** Git repo info. Not included in fallback filters */
	CopilotRepository = 'X-Copilot-Repository',
	/** Language of the file on which a given request is being made. Not included in fallback filters */
	CopilotFileType = 'X-Copilot-FileType', // Wired to languageId
	/** The organization the user belongs to. Not included in fallback filters */
	CopilotUserKind = 'X-Copilot-UserKind',
	/** Declare experiment dogfood program if any. Not included in fallback filters */
	CopilotDogfood = 'X-Copilot-Dogfood',
	/** For custom Model Alpha. Not included in fallback filters */
	CopilotCustomModel = 'X-Copilot-CustomModel',
	/** Organizations. */
	CopilotOrgs = 'X-Copilot-Orgs',
	/** Identifiers for Custom Model(s) */
	CopilotCustomModelNames = 'X-Copilot-CustomModelNames',
	/** Copilot Tracking ID */
	CopilotTrackingId = 'X-Copilot-CopilotTrackingId',
	/** The Copilot Client Version */
	CopilotClientVersion = 'X-Copilot-ClientVersion',

	CopilotRelatedPluginVersionCppTools = CopilotRelatedPluginVersionPrefix + 'msvscodecpptools',
	CopilotRelatedPluginVersionCMakeTools = CopilotRelatedPluginVersionPrefix + 'msvscodecmaketools',
	CopilotRelatedPluginVersionMakefileTools = CopilotRelatedPluginVersionPrefix + 'msvscodemakefiletools',
	CopilotRelatedPluginVersionCSharpDevKit = CopilotRelatedPluginVersionPrefix + 'msdotnettoolscsdevkit',
	CopilotRelatedPluginVersionPython = CopilotRelatedPluginVersionPrefix + 'mspythonpython',
	CopilotRelatedPluginVersionPylance = CopilotRelatedPluginVersionPrefix + 'mspythonvscodepylance',
	CopilotRelatedPluginVersionJavaPack = CopilotRelatedPluginVersionPrefix + 'vscjavavscodejavapack',
	CopilotRelatedPluginVersionJavaManager = CopilotRelatedPluginVersionPrefix + 'vscjavavscodejavadependency',
	CopilotRelatedPluginVersionTypescript = CopilotRelatedPluginVersionPrefix + 'vscodetypescriptlanguagefeatures',
	CopilotRelatedPluginVersionTypescriptNext = CopilotRelatedPluginVersionPrefix + 'msvscodevscodetypescriptnext',
	CopilotRelatedPluginVersionCSharp = CopilotRelatedPluginVersionPrefix + 'msdotnettoolscsharp',
	CopilotRelatedPluginVersionGithubCopilotChat = CopilotRelatedPluginVersionPrefix + 'githubcopilotchat',
	CopilotRelatedPluginVersionGithubCopilot = CopilotRelatedPluginVersionPrefix + 'githubcopilot',
}

export enum Release {
	Stable = 'stable',
	Nightly = 'nightly',
}

const telmetryNames: Partial<Record<Filter, string>> = {
	[Filter.CopilotClientTimeBucket]: 'timeBucket',
	[Filter.CopilotOverrideEngine]: 'engine',
	[Filter.CopilotRepository]: 'repo',
	[Filter.CopilotFileType]: 'fileType',
	[Filter.CopilotUserKind]: 'userKind',
};

/**
 * The class FilterSettings holds the variables that were used to filter
 * experiment groups.
 */
export class FilterSettings {
	constructor(private readonly filters: Partial<Record<Filter, string>>) {
		// empyt string is equivalent to absent, so remove it
		for (const [filter, value] of Object.entries(this.filters)) {
			if (value === '') {
				delete this.filters[filter as Filter];
			}
		}
	}

	/**
	 * Extends the telemetry Data with the current filter variables.
	 * @param telemetryData Extended in place.
	 */
	addToTelemetry(telemetryData: TelemetryData) {
		// add all values:
		for (const [filter, value] of Object.entries(this.filters)) {
			const telemetryName = telmetryNames[filter as Filter];
			if (telemetryName === undefined) {
				continue;
			}
			telemetryData.properties[telemetryName] = value;
		}
	}

	/** Returns a copy of the filters. */
	toHeaders(): Partial<Record<Filter, string>> {
		return { ...this.filters };
	}
}
