/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILocalExtension } from 'vs/platform/extensionManagement/common/extensionManagement';

export const IIssueService = createDecorator<IIssueService>('issueService');

export enum IssueType {
	Bug,
	PerformanceIssue,
	FeatureRequest,
	SettingsSearchIssue
}

export interface IssueReporterStyles {
	backgroundColor: string;
	color: string;
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

export interface IssueReporterData {
	styles: IssueReporterStyles;
	zoomLevel: number;
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

export interface IIssueService {
	_serviceBrand: any;
	openReporter(data: IssueReporterData): TPromise<void>;
}
