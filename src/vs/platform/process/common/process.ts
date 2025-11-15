/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProcessItem } from '../../../base/common/processes.js';
import { IRemoteDiagnosticError, PerformanceInfo, SystemInfo } from '../../diagnostics/common/diagnostics.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

// Since data sent through the service is serialized to JSON, functions will be lost, so Color objects
// should not be sent as their 'toString' method will be stripped. Instead convert to strings before sending.
export interface WindowStyles {
	backgroundColor?: string;
	color?: string;
}
export interface WindowData {
	styles: WindowStyles;
	zoomLevel: number;
}

export enum IssueSource {
	VSCode = 'vscode',
	Extension = 'extension',
	Marketplace = 'marketplace'
}
export interface ISettingSearchResult {
	extensionId: string;
	key: string;
	score: number;
}

export const IProcessService = createDecorator<IProcessService>('processService');

export interface IResolvedProcessInformation {
	readonly pidToNames: [number, string][];
	readonly processes: {
		readonly name: string;
		readonly rootProcess: ProcessItem | IRemoteDiagnosticError;
	}[];
}

export interface IProcessService {

	readonly _serviceBrand: undefined;

	resolveProcesses(): Promise<IResolvedProcessInformation>;

	getSystemStatus(): Promise<string>;
	getSystemInfo(): Promise<SystemInfo>;
	getPerformanceInfo(): Promise<PerformanceInfo>;
}
