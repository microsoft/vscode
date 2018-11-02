/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILocalExtension } from 'vs/platform/extensionManagement/common/extensionManagement';

export const IIssueService = createDecorator<IIssueService>('issueService');

// Since data sent through the service is serialized to JSON, functions will be lost, so Color objects
// should not be sent as their 'toString' method will be stripped. Instead convert to strings before sending.
export interface WindowStyles {
	backgroundColor: string;
	color: string;
}
export interface WindowData {
	styles: WindowStyles;
	zoomLevel: number;
}

export const enum IssueType {
	Bug,
	PerformanceIssue,
	FeatureRequest,
	SettingsSearchIssue
}

export interface IssueReporterStyles extends WindowStyles {
	textLinkColor: string;
	textLinkActiveForeground: string;
	inputBackground: string;
	inputForeground: string;
	inputBorder: string;
	inputErrorBorder: string;
	inputActiveBorder: string;
	buttonBackground: string;
	buttonForeground: string;
	buttonHoverBackground: string;
	sliderBackgroundColor: string;
	sliderHoverColor: string;
	sliderActiveColor: string;
}

export interface IssueReporterData extends WindowData {
	styles: IssueReporterStyles;
	enabledExtensions: ILocalExtension[];
	issueType?: IssueType;
}

export interface ISettingSearchResult {
	extensionId: string;
	key: string;
	score: number;
}

export interface ISettingsSearchIssueReporterData extends IssueReporterData {
	issueType: IssueType.SettingsSearchIssue;
	actualSearchResults: ISettingSearchResult[];
	query: string;
	filterResultCount: number;
}

export interface IssueReporterFeatures {
}

export interface ProcessExplorerStyles extends WindowStyles {
	hoverBackground: string;
	hoverForeground: string;
	highlightForeground: string;
}

export interface ProcessExplorerData extends WindowData {
	pid: number;
	styles: ProcessExplorerStyles;
}

export interface IIssueService {
	_serviceBrand: any;
	openReporter(data: IssueReporterData): TPromise<void>;
	openProcessExplorer(data: ProcessExplorerData): TPromise<void>;
}
