/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { ISandboxConfiguration } from 'vs/base/parts/sandbox/common/sandboxTypes';
import { PerformanceInfo, SystemInfo } from 'vs/platform/diagnostics/common/diagnostics';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

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

export const enum IssueType {
	Bug,
	PerformanceIssue,
	FeatureRequest
}

export interface IssueReporterStyles extends WindowStyles {
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

export interface IssueReporterExtensionData {
	name: string;
	publisher: string | undefined;
	version: string;
	id: string;
	isTheme: boolean;
	isBuiltin: boolean;
	displayName: string | undefined;
	repositoryUrl: string | undefined;
	bugsUrl: string | undefined;
	hasIssueUriRequestHandler?: boolean;
}

export interface IssueReporterData extends WindowData {
	styles: IssueReporterStyles;
	enabledExtensions: IssueReporterExtensionData[];
	issueType?: IssueType;
	extensionId?: string;
	experiments?: string;
	restrictedMode: boolean;
	isUnsupported: boolean;
	githubAccessToken: string;
	readonly issueTitle?: string;
	readonly issueBody?: string;
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

export interface IssueReporterWindowConfiguration extends ISandboxConfiguration {
	disableExtensions: boolean;
	data: IssueReporterData;
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
	stopTracing(): Promise<void>;
	openReporter(data: IssueReporterData): Promise<void>;
	openProcessExplorer(data: ProcessExplorerData): Promise<void>;
	getSystemStatus(): Promise<string>;

	// Used by the issue reporter

	$getSystemInfo(): Promise<SystemInfo>;
	$getPerformanceInfo(): Promise<PerformanceInfo>;
	$reloadWithExtensionsDisabled(): Promise<void>;
	$showConfirmCloseDialog(): Promise<void>;
	$showClipboardDialog(): Promise<boolean>;
	$getIssueReporterUri(extensionId: string): Promise<URI>;
	$closeReporter(): Promise<void>;
}
