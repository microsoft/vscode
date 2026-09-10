/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import * as platform from '../../../base/common/platform.js';
import type { IExperimentationFilterProvider } from 'tas-client';

export const ASSIGNMENT_STORAGE_KEY = 'VSCode.ABExp.FeatureData';
export const ASSIGNMENT_REFETCH_INTERVAL = 60 * 60 * 1000; // 1 hour

export interface IAssignmentService {
	readonly _serviceBrand: undefined;

	readonly onDidRefetchAssignments: Event<void>;
	getTreatment<T extends string | number | boolean>(name: string): Promise<T | undefined>;
}

export enum TargetPopulation {
	Insiders = 'insider',
	Public = 'public',
	Exploration = 'exploration'
}

/*
Based upon the official VSCode currently existing filters in the
ExP backend for the VSCode cluster.
https://experimentation.visualstudio.com/Analysis%20and%20Experimentation/_git/AnE.ExP.TAS.TachyonHost.Configuration?path=%2FConfigurations%2Fvscode%2Fvscode.json&version=GBmaster
"X-MSEdge-Market": "detection.market",
"X-FD-Corpnet": "detection.corpnet",
"X-VSCode-AppVersion": "appversion",
"X-VSCode-Build": "build",
"X-MSEdge-ClientId": "clientid",
"X-VSCode-ExtensionName": "extensionname",
"X-VSCode-ExtensionVersion": "extensionversion",
"X-VSCode-TargetPopulation": "targetpopulation",
"X-VSCode-Language": "language",
"X-VSCode-Platform": "platform",
"X-VSCode-ReleaseDate": "releasedate",
"X-VSCode-WindowKind": "windowkind"
*/
export enum Filters {
	/**
	 * The market in which the extension is distributed.
	 */
	Market = 'X-MSEdge-Market',

	/**
	 * The corporation network.
	 */
	CorpNet = 'X-FD-Corpnet',

	/**
	 * Version of the application which uses experimentation service.
	 */
	ApplicationVersion = 'X-VSCode-AppVersion',

	/**
	 * Insiders vs Stable.
	 */
	Build = 'X-VSCode-Build',

	/**
	 * Client Id which is used as primary unit for the experimentation.
	 */
	ClientId = 'X-MSEdge-ClientId',

	/**
	 * Developer Device Id which can be used as an alternate unit for experimentation.
	 */
	DeveloperDeviceId = 'X-VSCode-DevDeviceId',

	/**
	 * Extension header.
	 */
	ExtensionName = 'X-VSCode-ExtensionName',

	/**
	 * The version of the extension.
	 */
	ExtensionVersion = 'X-VSCode-ExtensionVersion',

	/**
	 * The language in use by VS Code
	 */
	Language = 'X-VSCode-Language',

	/**
	 * The target population.
	 * This is used to separate internal, early preview, GA, etc.
	 */
	TargetPopulation = 'X-VSCode-TargetPopulation',

	/**
	 * The platform (OS) on which VS Code is running.
	 */
	Platform = 'X-VSCode-Platform',

	/**
	 * The release/build date of VS Code (UTC) in the format yyyymmddHH.
	 */
	ReleaseDate = 'X-VSCode-ReleaseDate',

	/**
	 * The kind of window VS Code is running in (`editor` or `agents`).
	 */
	WindowKind = 'X-VSCode-WindowKind',
}

export const enum WindowKind {
	Editor = 'editor',
	Agents = 'agents',
}

export class AssignmentFilterProvider implements IExperimentationFilterProvider {
	constructor(
		private version: string,
		private appName: string,
		private machineId: string,
		private devDeviceId: string,
		private targetPopulation: TargetPopulation,
		private releaseDate: string,
		private windowKind: WindowKind
	) { }

	getFilterValue(filter: string): string | null {
		switch (filter) {
			case Filters.ApplicationVersion:
				return trimVersionSuffix(this.version); // productService.version
			case Filters.Build:
				return this.appName; // productService.nameLong
			case Filters.ClientId:
				return this.machineId;
			case Filters.DeveloperDeviceId:
				return this.devDeviceId;
			case Filters.Language:
				return platform.language;
			case Filters.ExtensionName:
				return 'vscode-core'; // always return vscode-core for exp service
			case Filters.ExtensionVersion:
				return '999999.0'; // always return a very large number for cross-extension experimentation
			case Filters.TargetPopulation:
				return this.targetPopulation;
			case Filters.Platform:
				return platform.PlatformToString(platform.platform);
			case Filters.ReleaseDate:
				return formatReleaseDate(this.releaseDate);
			case Filters.WindowKind:
				return this.windowKind;
			default:
				return '';
		}
	}

	getFilters(): Map<string, unknown> {
		const filters: Map<string, unknown> = new Map<string, unknown>();
		const filterValues = Object.values(Filters);
		for (const value of filterValues) {
			filters.set(value, this.getFilterValue(value));
		}

		return filters;
	}
}

/**
 * Trims a TAS-incompatible version suffix (e.g. `-insider`) so the value can be parsed
 * into a .NET Build object by the experimentation backend.
 */
function trimVersionSuffix(version: string): string {
	return version.split(/\-[a-zA-Z0-9]+$/)[0];
}

/**
 * Formats an ISO release date into the `yyyymmddHH` form the experimentation backend
 * expects (10 digits: yyyymmddHH). Returns an empty string when unavailable.
 */
function formatReleaseDate(iso: string): string {
	if (!iso) {
		return '';
	}
	const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2})/.exec(iso);
	if (!match) {
		return '';
	}
	return match.slice(1, 5).join('');
}

/**
 * userParam names for the new TAS assignments API (POST /api/v1/assignments), emitted by
 * {@link VSCodeCoreAssignmentsFilterProvider}. These replace the legacy header keys and
 * are sent only to the new endpoint.
 */
export enum AssignmentsFilters {
	ApplicationVersion = 'vscode_core_appversion',
	Build = 'vscode_core_build',
	DeveloperDeviceId = 'devdeviceid',
	ExtensionName = 'vscode_core_extensionname',
	ExtensionNameShort = 'extensionname',
	TargetPopulation = 'vscode_core_targetpopulation',
	Platform = 'vscode_core_platform',
	ReleaseDate = 'vscode_core_releasedate',
	WindowKind = 'vscode_core_windowkind',
}

/**
 * Emits the generic VS Code core filters for the new TAS assignments API using the new
 * userParam key names, so the assignments endpoint never receives the legacy header keys.
 */
export class VSCodeCoreAssignmentsFilterProvider implements IExperimentationFilterProvider {
	constructor(
		private version: string,
		private appName: string,
		private devDeviceId: string,
		private targetPopulation: TargetPopulation,
		private releaseDate: string,
		private windowKind: WindowKind
	) { }

	getFilterValue(filter: string): string | null {
		switch (filter) {
			case AssignmentsFilters.ApplicationVersion:
				return trimVersionSuffix(this.version);
			case AssignmentsFilters.Build:
				return this.appName;
			case AssignmentsFilters.DeveloperDeviceId:
				return this.devDeviceId;
			case AssignmentsFilters.ExtensionName:
			case AssignmentsFilters.ExtensionNameShort:
				return 'vscode-core';
			case AssignmentsFilters.TargetPopulation:
				return this.targetPopulation;
			case AssignmentsFilters.Platform:
				return platform.PlatformToString(platform.platform);
			case AssignmentsFilters.ReleaseDate:
				return formatReleaseDate(this.releaseDate);
			case AssignmentsFilters.WindowKind:
				return this.windowKind;
			default:
				return null;
		}
	}

	getFilters(): Map<string, unknown> {
		const filters: Map<string, unknown> = new Map<string, unknown>();
		for (const value of Object.values(AssignmentsFilters)) {
			filters.set(value, this.getFilterValue(value));
		}

		return filters;
	}
}

export function getInternalOrg(organisations: readonly string[] | undefined): 'vscode' | 'github' | 'microsoft' | undefined {
	const isVSCodeInternal = organisations?.includes('Visual-Studio-Code');
	const isGitHubInternal = organisations?.includes('github');
	const isMicrosoftInternal = organisations?.includes('microsoft') || organisations?.includes('ms-copilot') || organisations?.includes('MicrosoftCopilot');
	return isVSCodeInternal ? 'vscode' : isGitHubInternal ? 'github' : isMicrosoftInternal ? 'microsoft' : undefined;
}

/** Whether the account is staff or belongs to an internal org; the machine half is `verifyMicrosoftInternalDomain`. */
export function isInternalAccount(isStaff: boolean | undefined, organisations: readonly string[] | undefined): boolean {
	return isStaff === true || getInternalOrg(organisations) !== undefined;
}
