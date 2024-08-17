/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UriComponents } from 'vs/base/common/uri';
import { ISandboxConfiguration } from 'vs/base/parts/sandbox/common/sandboxTypes';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { OldIssueReporterData } from 'vs/platform/issue/common/issue';

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

export enum IssueSource {
	VSCode = 'vscode',
	Extension = 'extension',
	Marketplace = 'marketplace'
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
	extensionData?: string;
	extensionTemplate?: string;
	data?: string;
	uri?: UriComponents;
}

export interface IssueReporterData extends WindowData {
	styles: IssueReporterStyles;
	enabledExtensions: IssueReporterExtensionData[];
	issueType?: IssueType;
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

export interface IssueReporterWindowConfiguration extends ISandboxConfiguration {
	disableExtensions: boolean;
	data: IssueReporterData | OldIssueReporterData;
	os: {
		type: string;
		arch: string;
		release: string;
	};
}

export interface ProcessExplorerWindowConfiguration extends ISandboxConfiguration {
	data: ProcessExplorerData;
}

export const IIssueFormService = createDecorator<IIssueFormService>('issueFormService');

export interface IIssueFormService {
	readonly _serviceBrand: undefined;

	// Used by the issue reporter
	openReporter(data: IssueReporterData): Promise<void>;
	reloadWithExtensionsDisabled(): Promise<void>;
	showConfirmCloseDialog(): Promise<void>;
	showClipboardDialog(): Promise<boolean>;
	sendReporterMenu(extensionId: string): Promise<IssueReporterData | undefined>;
	closeReporter(): Promise<void>;
}

export const IWorkbenchIssueService = createDecorator<IWorkbenchIssueService>('workbenchIssueService');

export interface IWorkbenchIssueService {
	readonly _serviceBrand: undefined;
	openReporter(dataOverrides?: Partial<IssueReporterData>): Promise<void>;
}

export const IWorkbenchProcessService = createDecorator<IWorkbenchProcessService>('workbenchProcessService');

export interface IWorkbenchProcessService {
	readonly _serviceBrand: undefined;
	openProcessExplorer(): Promise<void>;
}

