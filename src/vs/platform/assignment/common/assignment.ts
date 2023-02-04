/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as platform from 'vs/base/common/platform';
import { IExperimentationFilterProvider } from 'tas-client-umd';

export const ASSIGNMENT_STORAGE_KEY = 'VSCode.ABExp.FeatureData';
export const ASSIGNMENT_REFETCH_INTERVAL = 0; // no polling

export interface IAssignmentService {
	readonly _serviceBrand: undefined;
	getTreatment<T extends string | number | boolean>(name: string): Promise<T | undefined>;
}

export enum TargetPopulation {
	Team = 'team',
	Internal = 'internal',
	Insiders = 'insider',
	Public = 'public',
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
"X-VSCode-Language": "language"
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
}

export class AssignmentFilterProvider implements IExperimentationFilterProvider {
	constructor(
		private version: string,
		private appName: string,
		private machineId: string,
		private targetPopulation: TargetPopulation
	) { }

	getFilterValue(filter: string): string | null {
		switch (filter) {
			case Filters.ApplicationVersion:
				return this.version; // productService.version
			case Filters.Build:
				return this.appName; // productService.nameLong
			case Filters.ClientId:
				return this.machineId;
			case Filters.Language:
				return platform.language;
			case Filters.ExtensionName:
				return 'vscode-core'; // always return vscode-core for exp service
			case Filters.ExtensionVersion:
				return '999999.0'; // always return a very large number for cross-extension experimentation
			case Filters.TargetPopulation:
				return this.targetPopulation;
			default:
				return '';
		}
	}

	getFilters(): Map<string, any> {
		const filters: Map<string, any> = new Map<string, any>();
		const filterValues = Object.values(Filters);
		for (const value of filterValues) {
			filters.set(value, this.getFilterValue(value));
		}

		return filters;
	}
}
