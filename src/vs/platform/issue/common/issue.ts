/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UriComponents } from '../../../base/common/uri.js';
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

export const enum OldIssueType {
	Bug,
	PerformanceIssue,
	FeatureRequest
}

export enum IssueSource {
	VSCode = 'vscode',
	Extension = 'extension',
	Marketplace = 'marketplace'
}

export interface OldIssueReporterStyles extends WindowStyles {
	textLinkColor?: string;
	textLinkActiveForeground?: string;
	inputBackground?: string;
	inputForeground?: string;
	inputBorder?: string;
	inputErrorBorder?: string;
	inputErrorBackground?: string;
	inputErrorForeground?: string;
	inputActiveBorder?: string;
	buttonBackground?: string;
	buttonForeground?: string;
	buttonHoverBackground?: string;
	sliderBackgroundColor?: string;
	sliderHoverColor?: string;
	sliderActiveColor?: string;
}

export interface OldIssueReporterExtensionData {
	name: string;
	publisher: string | undefined;
	version: string;
	id: string;
	isTheme: boolean;
	isBuiltin: boolean;
	displayName: string | undefined;
	repositoryUrl: string | undefined;
	bugsUrl: string | undefined;
	extensionData?: string;
	extensionTemplate?: string;
	data?: string;
	uri?: UriComponents;
}

export interface OldIssueReporterData extends WindowData {
	styles: OldIssueReporterStyles;
	enabledExtensions: OldIssueReporterExtensionData[];
	issueType?: OldIssueType;
	issueSource?: IssueSource;
	extensionId?: string;
	experiments?: string;
	restrictedMode: boolean;
	isUnsupported: boolean;
	githubAccessToken: string;
	issueTitle?: string;
	issueBody?: string;
	data?: string;
	uri?: UriComponents;
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

export interface OldIssueReporterWindowConfiguration extends ISandboxConfiguration {
	disableExtensions: boolean;
	data: OldIssueReporterData;
	os: {
		type: string;
		arch: string;
		release: string;
	};
}

export interface ProcessExplorerWindowConfiguration extends ISandboxConfiguration {
	data: ProcessExplorerData;
}

export const IIssueMainService = createDecorator<IIssueMainService>('issueService');

export interface IIssueMainService {
	readonly _serviceBrand: undefined;
	// Used by the issue reporter
	openReporter(data: OldIssueReporterData): Promise<void>;
	$reloadWithExtensionsDisabled(): Promise<void>;
	$showConfirmCloseDialog(): Promise<void>;
	$showClipboardDialog(): Promise<boolean>;
	$sendReporterMenu(extensionId: string, extensionName: string): Promise<OldIssueReporterData | undefined>;
	$closeReporter(): Promise<void>;
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
