/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISandboxConfiguration } from '../../../base/parts/sandbox/common/sandboxTypes.js';
import { PerformanceInfo, SystemInfo } from '../../diagnostics/common/diagnostics.js';
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

export interface ProcessExplorerStyles extends WindowStyles {
	listHoverBackground?: string;
	listHoverForeground?: string;
	listFocusBackground?: string;
	listFocusForeground?: string;
	listFocusOutline?: string;
	listActiveSelectionBackground?: string;
	listActiveSelectionForeground?: string;
	listHoverOutline?: string;
	scrollbarShadowColor?: string;
	scrollbarSliderBackgroundColor?: string;
	scrollbarSliderHoverBackgroundColor?: string;
	scrollbarSliderActiveBackgroundColor?: string;
}

export interface ProcessExplorerData extends WindowData {
	pid: number;
	styles: ProcessExplorerStyles;
	platform: string;
	applicationName: string;
}

export interface ProcessExplorerWindowConfiguration extends ISandboxConfiguration {
	data: ProcessExplorerData;
}

export const IProcessMainService = createDecorator<IProcessMainService>('processService');

export interface IProcessMainService {
	readonly _serviceBrand: undefined;
	getSystemStatus(): Promise<string>;
	stopTracing(): Promise<void>;
	openProcessExplorer(data: ProcessExplorerData): Promise<void>;

	// Used by the process explorer
	$getSystemInfo(): Promise<SystemInfo>;
	$getPerformanceInfo(): Promise<PerformanceInfo>;
}
