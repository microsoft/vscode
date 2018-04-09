/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILocalExtension } from 'vs/platform/extensionManagement/common/extensionManagement';

export const IIssueService = createDecorator<IIssueService>('issueService');

export interface WindowStyles {
	backgroundColor: string;
	color: string;
}
export interface WindowData {
	styles: WindowStyles;
	zoomLevel: number;
}

export enum IssueType {
	Bug,
	PerformanceIssue,
	FeatureRequest,
	SettingsSearchIssue
}

export interface IssueReporterStyles extends WindowStyles {
	textLinkColor: string;
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
	styles: ProcessExplorerStyles;
}

export interface IIssueService {
	_serviceBrand: any;
	openReporter(data: IssueReporterData): TPromise<void>;
	openProcessExplorer(data: ProcessExplorerData): TPromise<void>;
}
